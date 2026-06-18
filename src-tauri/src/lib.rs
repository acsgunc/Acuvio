//! Acuvio backend library entry point.

mod commands;
mod indexer;
mod log_file;
mod search;
mod state;
mod tailer;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::open_log,
            commands::close_log,
            commands::get_line_count,
            commands::read_lines,
            commands::search,
            commands::filter_lines,
            commands::start_tailing,
            commands::stop_tailing,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Acuvio");
}
