//! Shared application state: the set of open files and active tailers.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use crate::log_file::LogFile;
use crate::tailer::Tailer;

#[derive(Default)]
pub struct AppState {
    files: Mutex<HashMap<String, Arc<LogFile>>>,
    tailers: Mutex<HashMap<String, Tailer>>,
    next_id: AtomicU64,
    /// File path passed on the command line at launch (e.g. from the Windows
    /// "Open with Acuvio" context-menu entry). Consumed once by the frontend.
    startup_file: Mutex<Option<String>>,
}

impl AppState {
    pub fn insert_file(&self, file: LogFile) -> String {
        let id = format!("file-{}", self.next_id.fetch_add(1, Ordering::Relaxed));
        self.files.lock().unwrap().insert(id.clone(), Arc::new(file));
        id
    }

    pub fn get_file(&self, file_id: &str) -> Option<Arc<LogFile>> {
        self.files.lock().unwrap().get(file_id).cloned()
    }

    pub fn remove_file(&self, file_id: &str) {
        self.tailers.lock().unwrap().remove(file_id);
        self.files.lock().unwrap().remove(file_id);
    }

    pub fn set_tailer(&self, file_id: &str, tailer: Tailer) {
        self.tailers.lock().unwrap().insert(file_id.to_string(), tailer);
    }

    pub fn remove_tailer(&self, file_id: &str) {
        // Dropping the Tailer signals its worker thread to stop.
        self.tailers.lock().unwrap().remove(file_id);
    }

    /// Record a file path requested at launch (CLI / context menu).
    pub fn set_startup_file(&self, path: String) {
        *self.startup_file.lock().unwrap() = Some(path);
    }

    /// Take the pending startup file path, if any (cleared after reading).
    pub fn take_startup_file(&self) -> Option<String> {
        self.startup_file.lock().unwrap().take()
    }
}