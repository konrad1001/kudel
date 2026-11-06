use std::fs;
use std::io;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use super::files::write_atomic;

// A file of the app's own in the app data directory
// (%APPDATA%\dev.konrad.strudel-studio\<name>), never next to the user's files.
fn app_file(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("No app data folder: {err}"))?;
    Ok(dir.join(name))
}

// None if the file isn't there yet (first run).
fn read_app_file(app: &AppHandle, name: &str) -> Result<Option<String>, String> {
    let path = app_file(app, name)?;
    match fs::read_to_string(&path) {
        Ok(text) => Ok(Some(text)),
        Err(err) if err.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(format!("Could not read {}: {err}", path.display())),
    }
}

fn write_app_file(app: &AppHandle, name: &str, contents: &str) -> Result<(), String> {
    let path = app_file(app, name)?;
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|err| format!("Could not create {}: {err}", dir.display()))?;
    }
    write_atomic(&path, contents).map_err(|err| format!("Could not write {}: {err}", path.display()))
}

// What was open when the app last closed (folder, tabs, unsaved text, recents), as
// JSON the front end writes and reads.
#[tauri::command]
pub async fn load_session(app: AppHandle) -> Result<Option<String>, String> {
    read_app_file(&app, "session.json")
}

#[tauri::command]
pub async fn save_session(app: AppHandle, contents: String) -> Result<(), String> {
    write_app_file(&app, "session.json", &contents)
}

// The Synth view's patch being edited and its saved sounds, as JSON. Kept for the app,
// not per project.
#[tauri::command]
pub async fn load_synths(app: AppHandle) -> Result<Option<String>, String> {
    read_app_file(&app, "synths.json")
}

#[tauri::command]
pub async fn save_synths(app: AppHandle, contents: String) -> Result<(), String> {
    write_app_file(&app, "synths.json", &contents)
}
