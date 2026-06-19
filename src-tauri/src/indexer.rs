//! Background line-offset indexing.
//!
//! Scans the memory-mapped file for newline boundaries on a worker thread,
//! growing the file's `LineIndex` incrementally and emitting `index-progress`
//! events so the UI can show progress without blocking.

use std::sync::Arc;
use std::thread;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::log_file::LogFile;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexProgress {
    pub file_id: String,
    pub lines_indexed: u64,
    pub done: bool,
}

/// Emit progress roughly this often (in lines discovered) to avoid flooding IPC.
const EMIT_EVERY_LINES: usize = 250_000;
/// Flush discovered offsets into the shared index in batches of this size.
const FLUSH_BATCH: usize = 250_000;
/// Flush the very first batch this early so the viewer can paint immediately
/// instead of waiting for a full `FLUSH_BATCH` worth of lines.
const FIRST_FLUSH_LINES: usize = 2_000;

/// Spawn a background thread that indexes `file` end-to-end.
pub fn spawn_indexer(app: AppHandle, file_id: String, file: Arc<LogFile>) {
    thread::spawn(move || {
        index_file(&app, &file_id, &file);
    });
}

fn index_file(app: &AppHandle, file_id: &str, file: &Arc<LogFile>) {
    // Scan the currently mapped bytes. The first line start (0) is already in
    // the index from `LogFile::open`, so we only record starts *after* newlines.
    let total_lines = file.with_bytes(|bytes| {
        let len = bytes.len();
        // Pre-allocate the index based on a rough average line length so the
        // growing `starts` vector doesn't repeatedly reallocate while scanning a
        // multi-GB file. Estimate from the first 64 KiB; fall back to ~80 bytes.
        let estimate_lines = estimate_line_count(bytes);
        file.reserve_index(estimate_lines);

        let mut batch: Vec<u64> = Vec::with_capacity(FLUSH_BATCH);
        let mut discovered: u64 = 1; // line 0 already known
        let mut last_emit: usize = 0;
        let mut first_flush_done = false;

        // SIMD-accelerated newline scan (memchr). For every newline that isn't
        // the final byte, the following offset is the start of a new line.
        for nl in memchr::memchr_iter(b'\n', bytes) {
            let next_start = (nl + 1) as u64;
            if nl + 1 < len {
                batch.push(next_start);
                discovered += 1;
            }

            let flush_threshold = if first_flush_done {
                FLUSH_BATCH
            } else {
                FIRST_FLUSH_LINES
            };
            if batch.len() >= flush_threshold {
                file.extend_index(&batch, next_start);
                batch.clear();
                if !first_flush_done {
                    first_flush_done = true;
                    // Tell the UI lines are ready so it can paint immediately,
                    // long before the full scan (and the 250k-line cadence)
                    // would otherwise emit.
                    last_emit = discovered as usize;
                    emit(app, file_id, discovered, false);
                }
            }

            if (discovered as usize) - last_emit >= EMIT_EVERY_LINES {
                last_emit = discovered as usize;
                emit(app, file_id, discovered, false);
            }
        }

        // Final flush: record any tail offsets and mark the whole file scanned.
        file.extend_index(&batch, len as u64);
        discovered
    });

    file.mark_indexed();
    emit(app, file_id, total_lines, true);
}

/// Estimate the total number of lines from a sample of the leading bytes so the
/// index vector can be pre-sized. Returns at least 1.
fn estimate_line_count(bytes: &[u8]) -> usize {
    let len = bytes.len();
    if len == 0 {
        return 1;
    }
    let sample = &bytes[..len.min(64 * 1024)];
    let newlines = memchr::memchr_iter(b'\n', sample).count();
    let avg = if newlines > 0 {
        (sample.len() / newlines).max(1)
    } else {
        80
    };
    (len / avg).max(1) + 16
}

fn emit(app: &AppHandle, file_id: &str, lines: u64, done: bool) {
    let _ = app.emit(
        "index-progress",
        IndexProgress {
            file_id: file_id.to_string(),
            lines_indexed: lines,
            done,
        },
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn estimates_line_count_from_sample() {
        // 10-byte lines (9 chars + '\n') → ~100 lines for 1000 bytes.
        let data: Vec<u8> = (0..100).flat_map(|_| b"123456789\n".to_vec()).collect();
        let est = estimate_line_count(&data);
        assert!(est >= 100, "expected >= 100, got {est}");
        assert!(est <= 130, "estimate should be close, got {est}");
    }

    #[test]
    fn estimates_at_least_one_for_empty() {
        assert_eq!(estimate_line_count(&[]), 1);
    }

    #[test]
    fn estimates_for_buffer_without_newlines() {
        let data = vec![b'x'; 1000];
        // Falls back to ~80 bytes/line → 1000/80 = 12, +16.
        assert!(estimate_line_count(&data) >= 1);
    }
}

