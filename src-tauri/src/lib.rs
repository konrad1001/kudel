mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(commands::import::Imports::default())
        .invoke_handler(tauri::generate_handler![
            commands::files::read_text_file,
            commands::files::write_text_file,
            commands::files::list_dir,
            commands::files::create_file,
            commands::files::rename_path,
            commands::files::trash_path,
            commands::samples::scan_sample_folder,
            commands::samples::allow_asset_folder,
            commands::samples::write_wav,
            commands::session::load_session,
            commands::session::save_session,
            commands::session::load_synths,
            commands::session::save_synths,
            commands::import::import_tools,
            commands::import::import_url,
            commands::import::cancel_import,
            commands::import::place_import,
            commands::import::update_yt_dlp,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
