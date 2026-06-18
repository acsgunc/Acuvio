//! Tauri command handlers — the IPC surface the Angular frontend calls.

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::indexer;
use crate::log_file::LogFile;
use crate::search::{self, SearchMatch};
use crate::state::AppState;
use crate::tailer;

/// Metadata returned when a file is opened.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogMeta {
    pub file_id: String,
    pub path: String,
    pub size: u64,
    pub line_count: u64,
    pub encoding: String,
}

/// Files larger than this trigger a soft warning emitted to the UI.
const HUGE_FILE_WARN_BYTES: u64 = 5 * 1024 * 1024 * 1024; // 5 GiB

#[tauri::command]
pub fn open_log(app: AppHandle, state: State<AppState>, path: String) -> Result<LogMeta, String> {
    let file = LogFile::open(&path).map_err(|e| friendly_io_error(&path, &e))?;
    let size = file.size();
    let encoding = file.encoding.clone();

    let file_id = state.insert_file(file);

    if size >= HUGE_FILE_WARN_BYTES {
        use tauri::Emitter;
        let _ = app.emit(
            "huge-file",
            serde_json::json!({ "fileId": file_id, "size": size }),
        );
    }

    // Kick off background indexing; first lines become available almost
    // immediately, so the UI can paint before the full scan completes.
    if let Some(arc) = state.get_file(&file_id) {
        indexer::spawn_indexer(app, file_id.clone(), arc.clone());
    }

    Ok(LogMeta {
        file_id,
        path,
        size,
        line_count: 0,
        encoding,
    })
}

#[tauri::command]
pub fn close_log(state: State<AppState>, file_id: String) {
    state.remove_file(&file_id);
}

#[tauri::command]
pub fn get_line_count(state: State<AppState>, file_id: String) -> Result<u64, String> {
    state
        .get_file(&file_id)
        .map(|f| f.line_count())
        .ok_or_else(|| "file not open".to_string())
}

#[tauri::command]
pub fn read_lines(
    state: State<AppState>,
    file_id: String,
    start_line: u64,
    count: u64,
) -> Result<Vec<String>, String> {
    let file = state.get_file(&file_id).ok_or("file not open")?;
    Ok(file.read_lines(start_line, count))
}

#[tauri::command]
pub fn search(
    state: State<AppState>,
    file_id: String,
    query: String,
    is_regex: bool,
    case_sensitive: bool,
    max_results: usize,
) -> Result<Vec<SearchMatch>, String> {
    let file = state.get_file(&file_id).ok_or("file not open")?;
    search::search(&file, &query, is_regex, case_sensitive, max_results)
}

#[tauri::command]
pub fn filter_lines(
    state: State<AppState>,
    file_id: String,
    query: String,
    is_regex: bool,
    case_sensitive: bool,
    exclude: bool,
    max_results: usize,
) -> Result<Vec<u64>, String> {
    let file = state.get_file(&file_id).ok_or("file not open")?;
    search::filter_lines(&file, &query, is_regex, case_sensitive, exclude, max_results)
}

#[tauri::command]
pub fn start_tailing(app: AppHandle, state: State<AppState>, file_id: String) -> Result<(), String> {
    let file = state.get_file(&file_id).ok_or("file not open")?;
    let tailer = tailer::start(app, file_id.clone(), file)?;
    state.set_tailer(&file_id, tailer);
    Ok(())
}

#[tauri::command]
pub fn stop_tailing(state: State<AppState>, file_id: String) {
    state.remove_tailer(&file_id);
}

fn friendly_io_error(path: &str, e: &std::io::Error) -> String {
    use std::io::ErrorKind;
    match e.kind() {
        ErrorKind::NotFound => format!("File not found: {path}"),
        ErrorKind::PermissionDenied => format!("Permission denied: {path}"),
        _ => format!("Could not open {path}: {e}"),
    }
}
