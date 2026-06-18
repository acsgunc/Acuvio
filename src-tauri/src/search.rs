//! Search & filter over the memory-mapped file using the ripgrep engine
//! (`grep-searcher` + `grep-regex`). Runs on the caller's worker thread (a
//! Tauri command thread), never on the UI thread.

use std::io;

use grep_matcher::Matcher;
use grep_regex::{RegexMatcher, RegexMatcherBuilder};
use grep_searcher::{Searcher, SearcherBuilder, Sink, SinkMatch};
use serde::Serialize;

use crate::log_file::LogFile;

/// A single search hit. `line` is 1-based; `start`/`end` are byte offsets
/// within that line.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    pub line: u64,
    pub start: u32,
    pub end: u32,
    pub preview: String,
}

const PREVIEW_MAX: usize = 400;

fn build_matcher(query: &str, is_regex: bool, case_sensitive: bool) -> Result<RegexMatcher, String> {
    let pattern = if is_regex {
        query.to_string()
    } else {
        escape_regex(query)
    };
    RegexMatcherBuilder::new()
        .case_insensitive(!case_sensitive)
        .build(&pattern)
        .map_err(|e| format!("invalid pattern: {e}"))
}

/// Find all matches (capped at `max_results`).
pub fn search(
    file: &LogFile,
    query: &str,
    is_regex: bool,
    case_sensitive: bool,
    max_results: usize,
) -> Result<Vec<SearchMatch>, String> {
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let matcher = build_matcher(query, is_regex, case_sensitive)?;

    let results = file.with_bytes(|bytes| {
        let mut sink = MatchSink {
            matcher: &matcher,
            results: Vec::new(),
            max_results,
        };
        let mut searcher = SearcherBuilder::new().line_number(true).build();
        let _ = searcher.search_slice(&matcher, bytes, &mut sink);
        sink.results
    });

    Ok(results)
}

/// Return the (0-based) line numbers that pass an include/exclude filter.
pub fn filter_lines(
    file: &LogFile,
    query: &str,
    is_regex: bool,
    case_sensitive: bool,
    exclude: bool,
    max_results: usize,
) -> Result<Vec<u64>, String> {
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let matcher = build_matcher(query, is_regex, case_sensitive)?;

    // Collect the set of matching (1-based) lines first.
    let matched: Vec<u64> = file.with_bytes(|bytes| {
        let mut sink = LineSink {
            lines: Vec::new(),
            max_results: usize::MAX,
        };
        let mut searcher = SearcherBuilder::new().line_number(true).build();
        let _ = searcher.search_slice(&matcher, bytes, &mut sink);
        sink.lines
    });

    if !exclude {
        // Include: just the matched lines (converted to 0-based), capped.
        Ok(matched.into_iter().take(max_results).map(|l| l - 1).collect())
    } else {
        // Exclude: every line NOT in the matched set, up to the line count.
        let total = file.line_count();
        let mut matched_iter = matched.into_iter().peekable();
        let mut out = Vec::new();
        for line0 in 0..total {
            let line1 = line0 + 1;
            while matched_iter.peek().map_or(false, |&m| m < line1) {
                matched_iter.next();
            }
            if matched_iter.peek() == Some(&line1) {
                matched_iter.next();
                continue;
            }
            out.push(line0);
            if out.len() >= max_results {
                break;
            }
        }
        Ok(out)
    }
}

/// Sink that records every match with its in-line byte range.
struct MatchSink<'m> {
    matcher: &'m RegexMatcher,
    results: Vec<SearchMatch>,
    max_results: usize,
}

impl<'m> Sink for MatchSink<'m> {
    type Error = io::Error;

    fn matched(&mut self, _searcher: &Searcher, mat: &SinkMatch<'_>) -> Result<bool, io::Error> {
        let line_no = mat.line_number().unwrap_or(0);
        let line_bytes = mat.bytes();

        // A single SinkMatch may correspond to one or more line slices; find the
        // precise column ranges by re-matching within these bytes.
        let mut start_search = 0;
        while start_search <= line_bytes.len() {
            match self
                .matcher
                .find_at(line_bytes, start_search)
                .map_err(io::Error::other)?
            {
                Some(m) => {
                    self.results.push(SearchMatch {
                        line: line_no,
                        start: m.start() as u32,
                        end: m.end() as u32,
                        preview: make_preview(line_bytes),
                    });
                    if self.results.len() >= self.max_results {
                        return Ok(false);
                    }
                    // Advance past this match; guard against zero-width matches.
                    start_search = if m.end() > m.start() { m.end() } else { m.end() + 1 };
                }
                None => break,
            }
        }
        Ok(true)
    }
}

/// Sink that records only the (1-based) line numbers of matches.
struct LineSink {
    lines: Vec<u64>,
    max_results: usize,
}

impl Sink for LineSink {
    type Error = io::Error;

    fn matched(&mut self, _searcher: &Searcher, mat: &SinkMatch<'_>) -> Result<bool, io::Error> {
        if let Some(n) = mat.line_number() {
            if self.lines.last() != Some(&n) {
                self.lines.push(n);
            }
        }
        Ok(self.lines.len() < self.max_results)
    }
}

fn make_preview(line: &[u8]) -> String {
    let trimmed = {
        let mut end = line.len();
        while end > 0 && (line[end - 1] == b'\n' || line[end - 1] == b'\r') {
            end -= 1;
        }
        &line[..end]
    };
    let slice = if trimmed.len() > PREVIEW_MAX {
        &trimmed[..PREVIEW_MAX]
    } else {
        trimmed
    };
    String::from_utf8_lossy(slice).into_owned()
}

/// Escape regex metacharacters so a literal query is matched verbatim.
fn escape_regex(s: &str) -> String {
    const SPECIAL: &[char] = &[
        '\\', '.', '+', '*', '?', '(', ')', '|', '[', ']', '{', '}', '^', '$', '#', '-', '&', '~',
    ];
    let mut out = String::with_capacity(s.len() + 8);
    for c in s.chars() {
        if SPECIAL.contains(&c) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::File;
    use std::io::Write;
    use std::path::PathBuf;

    fn temp_file(content: &[u8]) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!(
            "acuvio_search_{}.log",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let mut f = File::create(&p).unwrap();
        f.write_all(content).unwrap();
        p
    }

    fn indexed(content: &[u8]) -> (LogFile, PathBuf) {
        let p = temp_file(content);
        let lf = LogFile::open(&p).unwrap();
        let starts = lf.with_bytes(|bytes| {
            let mut s = Vec::new();
            for (i, b) in bytes.iter().enumerate() {
                if *b == b'\n' && i + 1 < bytes.len() {
                    s.push((i + 1) as u64);
                }
            }
            (s, bytes.len() as u64)
        });
        lf.extend_index(&starts.0, starts.1);
        lf.mark_indexed();
        (lf, p)
    }

    #[test]
    fn literal_search_finds_matches() {
        let (lf, p) = indexed(b"INFO start\nERROR boom\nINFO done\nERROR again\n");
        let r = search(&lf, "ERROR", false, true, 100).unwrap();
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].line, 2);
        assert_eq!(r[0].start, 0);
        assert_eq!(r[0].end, 5);
        assert_eq!(r[1].line, 4);
        std::fs::remove_file(p).ok();
    }

    #[test]
    fn case_insensitive_search() {
        let (lf, p) = indexed(b"Error one\nerror two\nERROR three\n");
        let r = search(&lf, "error", false, false, 100).unwrap();
        assert_eq!(r.len(), 3);
        std::fs::remove_file(p).ok();
    }

    #[test]
    fn regex_search_with_groups() {
        let (lf, p) = indexed(b"code=200 ok\ncode=404 missing\ncode=500 fail\n");
        let r = search(&lf, r"code=(4|5)\d{2}", true, true, 100).unwrap();
        assert_eq!(r.len(), 2);
        assert_eq!(r[0].line, 2);
        std::fs::remove_file(p).ok();
    }

    #[test]
    fn literal_query_treats_dot_literally() {
        let (lf, p) = indexed(b"a1b\na.b\naxb\n");
        let r = search(&lf, "a.b", false, true, 100).unwrap();
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].line, 2);
        std::fs::remove_file(p).ok();
    }

    #[test]
    fn filter_include_returns_zero_based_lines() {
        let (lf, p) = indexed(b"keep\ndrop\nkeep\ndrop\nkeep\n");
        let lines = filter_lines(&lf, "keep", false, true, false, 100).unwrap();
        assert_eq!(lines, vec![0, 2, 4]);
        std::fs::remove_file(p).ok();
    }

    #[test]
    fn filter_exclude_returns_complement() {
        let (lf, p) = indexed(b"keep\ndrop\nkeep\ndrop\nkeep\n");
        let lines = filter_lines(&lf, "drop", false, true, true, 100).unwrap();
        assert_eq!(lines, vec![0, 2, 4]);
        std::fs::remove_file(p).ok();
    }

    #[test]
    fn multiple_matches_per_line() {
        let (lf, p) = indexed(b"ab ab ab\n");
        let r = search(&lf, "ab", false, true, 100).unwrap();
        assert_eq!(r.len(), 3);
        assert_eq!(r[0].start, 0);
        assert_eq!(r[1].start, 3);
        assert_eq!(r[2].start, 6);
        std::fs::remove_file(p).ok();
    }
}
