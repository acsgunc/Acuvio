//! Acuvio backend library entry point.

mod commands;
mod indexer;
mod log_file;
mod search;
mod state;
mod tailer;
mod text_file;

use state::AppState;

/// Pick the first command-line argument that is an existing file path.
///
/// Skips the executable name (argv[0]) and any flag-like tokens, so launching
/// `acuvio.exe "C:\logs\app.log"` (as the context-menu entry does) yields the
/// file path while ordinary flags are ignored.
fn file_arg_from<I: IntoIterator<Item = String>>(args: I) -> Option<String> {
    args.into_iter()
        .skip(1)
        .find(|a| !a.starts_with('-') && std::path::Path::new(a).is_file())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Keep a single instance: when the user opens another file via the
        // context menu while Acuvio is already running, forward its path to
        // the existing window instead of launching a second process.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            use tauri::{Emitter, Manager};
            if let Some(path) = file_arg_from(argv) {
                let _ = app.emit("open-file", path);
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(|app| {
            use tauri::Manager;
            // A file path passed on the command line at first launch.
            if let Some(path) = file_arg_from(std::env::args()) {
                app.state::<AppState>().set_startup_file(path);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::open_log,
            commands::close_log,
            commands::get_startup_file,
            commands::get_line_count,
            commands::read_lines,
            commands::search,
            commands::filter_lines,
            commands::start_tailing,
            commands::stop_tailing,
            commands::max_edit_bytes,
            commands::open_text,
            commands::save_text,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Acuvio");
}
