//! Memory-mapped log file with an incrementally-built line-offset index.
//!
//! The file is mapped via `memmap2` so the OS pages content in on demand —
//! we never copy the whole file into RAM. A `LineIndex` records the byte
//! offset at which each line begins, enabling O(1) jumps to any line.

use std::fs::File;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::RwLock;

use memmap2::Mmap;

/// Byte offsets of the start of each line. `starts[i]` is the offset of line `i`
/// (0-based). The number of known lines is `starts.len()`.
#[derive(Default)]
pub struct LineIndex {
    pub starts: Vec<u64>,
    /// How many bytes of the file have been scanned so far.
    pub indexed_bytes: u64,
}

/// A single open log file.
pub struct LogFile {
    pub path: PathBuf,
    pub encoding: String,
    /// The active memory map. Replaced (re-mapped) when the file grows.
    mmap: RwLock<Mmap>,
    /// Current mapped size in bytes.
    size: AtomicU64,
    /// Line-offset index, grown by the background indexer / tailer.
    index: RwLock<LineIndex>,
    /// Whether the initial full index pass has completed.
    indexed: AtomicBool,
}

impl LogFile {
    /// Open and memory-map a file. Fails on missing file / permission errors.
    pub fn open(path: impl AsRef<Path>) -> io::Result<Self> {
        let path = path.as_ref().to_path_buf();
        let file = File::open(&path)?;
        let meta = file.metadata()?;
        if meta.is_dir() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "path is a directory, not a file",
            ));
        }
        let size = meta.len();

        // Mapping a zero-length file is invalid on some platforms; guard it.
        let mmap = if size == 0 {
            // Map nothing meaningful; create an empty map via a tiny safe path.
            unsafe { memmap2::MmapOptions::new().len(0).map_copy_read_only(&file)? }
        } else {
            unsafe { Mmap::map(&file)? }
        };

        let encoding = detect_encoding(&mmap);

        let mut index = LineIndex::default();
        // Line 0 always starts at byte 0 (even for an empty file).
        index.starts.push(0);

        Ok(LogFile {
            path,
            encoding,
            mmap: RwLock::new(mmap),
            size: AtomicU64::new(size),
            index: RwLock::new(index),
            indexed: AtomicBool::new(size == 0),
        })
    }

    pub fn size(&self) -> u64 {
        self.size.load(Ordering::Acquire)
    }

    pub fn mark_indexed(&self) {
        self.indexed.store(true, Ordering::Release);
    }

    /// Number of lines currently known.
    pub fn line_count(&self) -> u64 {
        let idx = self.index.read().unwrap();
        line_count_from(&idx)
    }

    /// Append a batch of newly discovered line-start offsets (used by the
    /// indexer and tailer). `scanned_to` is the byte offset reached.
    pub fn extend_index(&self, new_starts: &[u64], scanned_to: u64) {
        let mut idx = self.index.write().unwrap();
        idx.starts.extend_from_slice(new_starts);
        idx.indexed_bytes = scanned_to;
    }

    /// Snapshot of how many bytes have been indexed so far.
    #[allow(dead_code)]
    pub fn indexed_bytes(&self) -> u64 {
        self.index.read().unwrap().indexed_bytes
    }

    /// Re-map the file after it has grown (live tailing). Returns the old size.
    pub fn remap(&self) -> io::Result<u64> {
        let file = File::open(&self.path)?;
        let new_size = file.metadata()?.len();
        let old_size = self.size.load(Ordering::Acquire);
        if new_size > 0 {
            let new_map = unsafe { Mmap::map(&file)? };
            *self.mmap.write().unwrap() = new_map;
        }
        self.size.store(new_size, Ordering::Release);
        Ok(old_size)
    }

    /// Read `count` lines starting at `start_line` (0-based), returning their
    /// text with line terminators stripped. Out-of-range requests are clamped.
    pub fn read_lines(&self, start_line: u64, count: u64) -> Vec<String> {
        if count == 0 {
            return Vec::new();
        }
        let idx = self.index.read().unwrap();
        let total = line_count_from(&idx);
        if start_line >= total {
            return Vec::new();
        }
        let mmap = self.mmap.read().unwrap();
        let file_len = mmap.len() as u64;

        let end_line = (start_line + count).min(total);
        let mut out = Vec::with_capacity((end_line - start_line) as usize);

        for line in start_line..end_line {
            let from = idx.starts[line as usize];
            // The line ends just before the next line's start, or at EOF.
            let to = if (line as usize + 1) < idx.starts.len() {
                idx.starts[line as usize + 1]
            } else {
                file_len
            };
            if from >= file_len {
                out.push(String::new());
                continue;
            }
            let to = to.min(file_len);
            let mut slice = &mmap[from as usize..to as usize];
            // Strip a trailing \n and optional \r.
            if slice.last() == Some(&b'\n') {
                slice = &slice[..slice.len() - 1];
            }
            if slice.last() == Some(&b'\r') {
                slice = &slice[..slice.len() - 1];
            }
            out.push(String::from_utf8_lossy(slice).into_owned());
        }
        out
    }

    /// Access the raw mapped bytes (for the search engine). The returned guard
    /// keeps the map alive for the duration of the borrow.
    pub fn with_bytes<R>(&self, f: impl FnOnce(&[u8]) -> R) -> R {
        let mmap = self.mmap.read().unwrap();
        f(&mmap[..])
    }

    /// Translate a byte offset to a 1-based line number using the index.
    #[cfg_attr(not(test), allow(dead_code))]
    pub fn line_of_offset(&self, offset: u64) -> u64 {
        let idx = self.index.read().unwrap();
        line_of_offset_in(&idx.starts, offset)
    }
}

/// Number of lines represented by an index. We push a sentinel start at byte 0,
/// so an empty file reports 0 lines and a non-empty file reports the real count.
fn line_count_from(idx: &LineIndex) -> u64 {
    // `starts` always has at least the [0] entry. If the file has content the
    // count equals the number of recorded starts; for a truly empty file we
    // report 0.
    if idx.indexed_bytes == 0 && idx.starts.len() == 1 {
        0
    } else {
        idx.starts.len() as u64
    }
}

/// Binary-search the sorted `starts` for the 1-based line containing `offset`.
#[cfg_attr(not(test), allow(dead_code))]
fn line_of_offset_in(starts: &[u64], offset: u64) -> u64 {
    match starts.binary_search(&offset) {
        Ok(i) => (i as u64) + 1,
        Err(i) => i as u64, // i is the count of starts <= offset
    }
}

/// Best-effort encoding guess from a BOM; defaults to UTF-8.
fn detect_encoding(bytes: &[u8]) -> String {
    if bytes.len() >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF {
        "UTF-8 (BOM)".into()
    } else if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        "UTF-16 LE".into()
    } else if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
        "UTF-16 BE".into()
    } else {
        "UTF-8".into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_file(content: &[u8]) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("acuvio_test_{}.log", nanos()));
        let mut f = File::create(&p).unwrap();
        f.write_all(content).unwrap();
        f.flush().unwrap();
        p
    }

    fn nanos() -> u128 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    }

    /// Build the full index synchronously for testing.
    fn full_index(lf: &LogFile) {
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
    }

    #[test]
    fn counts_and_reads_lines() {
        let p = temp_file(b"alpha\nbeta\ngamma\n");
        let lf = LogFile::open(&p).unwrap();
        full_index(&lf);
        assert_eq!(lf.line_count(), 3);
        assert_eq!(lf.read_lines(0, 3), vec!["alpha", "beta", "gamma"]);
        assert_eq!(lf.read_lines(1, 1), vec!["beta"]);
        std::fs::remove_file(p).ok();
    }

    #[test]
    fn handles_no_trailing_newline() {
        let p = temp_file(b"one\ntwo");
        let lf = LogFile::open(&p).unwrap();
        full_index(&lf);
        assert_eq!(lf.line_count(), 2);
        assert_eq!(lf.read_lines(0, 2), vec!["one", "two"]);
        std::fs::remove_file(p).ok();
    }

    #[test]
    fn strips_crlf() {
        let p = temp_file(b"win\r\nlines\r\n");
        let lf = LogFile::open(&p).unwrap();
        full_index(&lf);
        assert_eq!(lf.read_lines(0, 2), vec!["win", "lines"]);
        std::fs::remove_file(p).ok();
    }

    #[test]
    fn empty_file_reports_zero_lines() {
        let p = temp_file(b"");
        let lf = LogFile::open(&p).unwrap();
        assert_eq!(lf.line_count(), 0);
        assert_eq!(lf.read_lines(0, 10), Vec::<String>::new());
        std::fs::remove_file(p).ok();
    }

    #[test]
    fn clamps_out_of_range() {
        let p = temp_file(b"a\nb\nc\n");
        let lf = LogFile::open(&p).unwrap();
        full_index(&lf);
        assert_eq!(lf.read_lines(10, 5), Vec::<String>::new());
        assert_eq!(lf.read_lines(2, 100), vec!["c"]);
        std::fs::remove_file(p).ok();
    }

    #[test]
    fn maps_offset_to_line() {
        let p = temp_file(b"alpha\nbeta\ngamma\n");
        let lf = LogFile::open(&p).unwrap();
        full_index(&lf);
        // offset 0 -> line 1, offset 6 (start of beta) -> line 2
        assert_eq!(lf.line_of_offset(0), 1);
        assert_eq!(lf.line_of_offset(6), 2);
        assert_eq!(lf.line_of_offset(8), 2);
        std::fs::remove_file(p).ok();
    }
}
