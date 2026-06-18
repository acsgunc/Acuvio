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
const EMIT_EVERY_LINES: usize = 50_000;
/// Flush discovered offsets into the shared index in batches of this size.
const FLUSH_BATCH: usize = 50_000;

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
        let mut batch: Vec<u64> = Vec::with_capacity(FLUSH_BATCH);
        let mut discovered: u64 = 1; // line 0 already known
        let mut last_emit: usize = 0;
        let mut pos: usize = 0;

        while pos < len {
            // memchr-style scan for the next newline.
            match find_newline(&bytes[pos..]) {
                Some(rel) => {
                    let nl = pos + rel;
                    let next_start = (nl + 1) as u64;
                    if (nl + 1) < len {
                        batch.push(next_start);
                        discovered += 1;
                    }
                    pos = nl + 1;
                }
                None => break,
            }

            if batch.len() >= FLUSH_BATCH {
                file.extend_index(&batch, pos as u64);
                batch.clear();
            }

            if (discovered as usize) - last_emit >= EMIT_EVERY_LINES {
                last_emit = discovered as usize;
                emit(app, file_id, discovered, false);
            }
        }

        if !batch.is_empty() {
            file.extend_index(&batch, len as u64);
        } else {
            // Ensure indexed_bytes reflects a full scan even with no trailing data.
            file.extend_index(&[], len as u64);
        }
        discovered
    });

    file.mark_indexed();
    emit(app, file_id, total_lines, true);
}

#[inline]
fn find_newline(bytes: &[u8]) -> Option<usize> {
    bytes.iter().position(|&b| b == b'\n')
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
