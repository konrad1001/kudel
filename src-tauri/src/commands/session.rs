use std::fs;
use std::io;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use super::files::write_atomic;

// What was open when the app last closed (folder, tabs, unsaved text, recents), as
// JSON the front end writes and reads. Lives in the app data directory
// (%APPDATA%\dev.konrad.strudel-studio\session.json), never next to the user's files.
fn session_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("No app data folder: {err}"))?;
    Ok(dir.join("session.json"))
}

// None on first run (no session yet).
#[tauri::command]
pub async fn load_session(app: AppHandle) -> Result<Option<String>, String> {
    let path = session_path(&app)?;
    match fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(format!("Could not read {}: {err}", path.display())),
    }
}

#[tauri::command]
pub async fn save_session(app: AppHandle, contents: String) -> Result<(), String> {
    let path = session_path(&app)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|err| format!("Could not create {}: {err}", dir.display()))?;
    }
    write_atomic(&path, &contents).map_err(|err| format!("Could not write {}: {err}", path.display()))
}
