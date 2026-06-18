//! Live tailing via the `notify` crate.
//!
//! When the watched file grows, only the *newly appended* bytes are read and
//! split into complete lines, which are emitted to the frontend through the
//! `log-appended` event. The line index is extended so go-to-line keeps working.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::channel;
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use notify::{EventKind, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::log_file::LogFile;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogAppended {
    pub file_id: String,
    pub new_lines: Vec<String>,
    pub total_lines: u64,
}

/// Handle to an active tailing session; dropping it stops the worker.
pub struct Tailer {
    stop: Arc<AtomicBool>,
}

impl Tailer {
    pub fn stop(&self) {
        self.stop.store(true, Ordering::Release);
    }
}

impl Drop for Tailer {
    fn drop(&mut self) {
        self.stop();
    }
}

/// Begin tailing `file`. Returns a `Tailer` whose drop/stop ends the session.
pub fn start(app: AppHandle, file_id: String, file: Arc<LogFile>) -> Result<Tailer, String> {
    let stop = Arc::new(AtomicBool::new(false));
    let stop_thread = stop.clone();
    let path = file.path.clone();

    thread::spawn(move || {
        let (tx, rx) = channel();
        let mut watcher = match notify::recommended_watcher(move |res| {
            let _ = tx.send(res);
        }) {
            Ok(w) => w,
            Err(e) => {
                let _ = app.emit("tail-error", format!("watch init failed: {e}"));
                return;
            }
        };

        // Watch the parent directory: more reliable across platforms than
        // watching the file node directly (handles rotation/replace better).
        let watch_target = path.parent().map(|p| p.to_path_buf()).unwrap_or(path.clone());
        if let Err(e) = watcher.watch(&watch_target, RecursiveMode::NonRecursive) {
            let _ = app.emit("tail-error", format!("watch failed: {e}"));
            return;
        }

        // Bytes up to which we've already emitted (start at current EOF).
        let mut tailed_bytes = file.size();

        loop {
            if stop_thread.load(Ordering::Acquire) {
                break;
            }
            match rx.recv_timeout(Duration::from_millis(300)) {
                Ok(Ok(event)) => {
                    let relevant = matches!(
                        event.kind,
                        EventKind::Modify(_) | EventKind::Create(_) | EventKind::Any
                    ) && event.paths.iter().any(|p| p == &path);
                    if relevant {
                        pump(&app, &file_id, &file, &mut tailed_bytes);
                    }
                }
                Ok(Err(_)) => { /* watcher error; keep going */ }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    // Periodic poll as a safety net for missed FS events.
                    pump(&app, &file_id, &file, &mut tailed_bytes);
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    });

    Ok(Tailer { stop })
}

/// Read newly appended complete lines and emit them.
fn pump(app: &AppHandle, file_id: &str, file: &Arc<LogFile>, tailed_bytes: &mut u64) {
    // Re-map to pick up the grown size; ignore if it didn't grow.
    let new_size = match file.remap() {
        Ok(_) => file.size(),
        Err(_) => return,
    };
    if new_size <= *tailed_bytes {
        return;
    }

    let start = *tailed_bytes;
    let (new_lines, new_starts, consumed) = file.with_bytes(|bytes| {
        let len = bytes.len() as u64;
        let end = new_size.min(len);
        if start >= end {
            return (Vec::new(), Vec::new(), 0u64);
        }
        let slice = &bytes[start as usize..end as usize];

        let mut lines = Vec::new();
        let mut starts = Vec::new();
        let mut line_begin = 0usize; // offset within slice
        let mut consumed = 0usize;

        for (i, b) in slice.iter().enumerate() {
            if *b == b'\n' {
                let mut line = &slice[line_begin..i];
                if line.last() == Some(&b'\r') {
                    line = &line[..line.len() - 1];
                }
                lines.push(String::from_utf8_lossy(line).into_owned());
                // Absolute offset of the line that begins after this newline.
                let next_abs = start + (i as u64) + 1;
                if next_abs < end {
                    starts.push(next_abs);
                }
                line_begin = i + 1;
                consumed = i + 1;
            }
        }
        (lines, starts, consumed as u64)
    });

    if new_lines.is_empty() {
        return;
    }

    file.extend_index(&new_starts, start + consumed);
    *tailed_bytes = start + consumed;

    let _ = app.emit(
        "log-appended",
        LogAppended {
            file_id: file_id.to_string(),
            new_lines,
            total_lines: file.line_count(),
        },
    );
}
