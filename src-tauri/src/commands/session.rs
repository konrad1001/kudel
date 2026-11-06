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

// The panels' own files (the Synth view's sounds, the Drums view's loops), as JSON the
// front end writes and reads. Kept for the app, not per project. Only these names, so
// the front end can't reach other files through it.
const APP_DATA_FILES: [&str; 2] = ["synths.json", "drums.json"];

fn app_data_name(name: &str) -> Result<&str, String> {
    APP_DATA_FILES
        .iter()
        .find(|known| **known == name)
        .copied()
        .ok_or_else(|| format!("Not an app data file: {name}"))
}

#[tauri::command]
pub async fn load_app_data(app: AppHandle, name: String) -> Result<Option<String>, String> {
    read_app_file(&app, app_data_name(&name)?)
}

#[tauri::command]
pub async fn save_app_data(app: AppHandle, name: String, contents: String) -> Result<(), String> {
    write_app_file(&app, app_data_name(&name)?, &contents)
}

#[cfg(test)]
mod tests {
    use super::app_data_name;

    #[test]
    fn only_known_files() {
        assert_eq!(app_data_name("drums.json"), Ok("drums.json"));
        assert!(app_data_name("session.json").is_err());
        assert!(app_data_name("../settings.json").is_err());
    }
}
