use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use super::files::read_dir_sorted;

// What WebView2 can decode. Keep in step with isAudioFile in src/files/paths.ts.
const AUDIO_EXTENSIONS: &[&str] = &["wav", "mp3", "ogg", "flac", "m4a"];

// The audio in a folder handed to samples(): each subfolder holding audio files is
// one sound with those files as its variants, and each loose audio file is a sound
// of its own. Names are the raw folder and file names; the front end turns them
// into sound names. Everything is sorted as the explorer shows it.
#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SampleFolder {
    path: PathBuf,
    folders: Vec<SoundFolder>,
    files: Vec<PathBuf>,
}

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SoundFolder {
    name: String,
    path: PathBuf,
    files: Vec<PathBuf>,
}

// Resolves `relative` against `base`, lists its audio, and lets the asset protocol
// serve that folder so Strudel can fetch the files.
#[tauri::command]
pub async fn scan_sample_folder(
    app: AppHandle,
    base: PathBuf,
    relative: String,
) -> Result<SampleFolder, String> {
    let (canonical, dir) = resolve_dir(&base, &relative)?;
    let folder = scan(&dir).map_err(|err| format!("Could not read {}: {err}", dir.display()))?;
    allow_assets(&app, &canonical)?;
    Ok(folder)
}

// Lets the asset protocol serve a folder, so the explorer can preview its audio.
#[tauri::command]
pub async fn allow_asset_folder(app: AppHandle, path: PathBuf) -> Result<(), String> {
    let canonical = fs::canonicalize(&path)
        .map_err(|err| format!("Could not open {}: {err}", path.display()))?;
    allow_assets(&app, &canonical)
}

// Tauri canonicalises every requested path before checking the scope, so the
// scope gets the canonical (\\?\C:\...) form; it adds the plain C:\... form itself.
fn allow_assets(app: &AppHandle, canonical: &Path) -> Result<(), String> {
    app.asset_protocol_scope()
        .allow_directory(canonical, true)
        .map_err(|err| format!("Could not allow {}: {err}", canonical.display()))
}

// Returns the folder's canonical path and the same path without Windows' \\?\ prefix,
// which is what asset URLs and the explorer use.
fn resolve_dir(base: &Path, relative: &str) -> Result<(PathBuf, PathBuf), String> {
    let joined = base.join(relative);
    let canonical =
        fs::canonicalize(&joined).map_err(|_| format!("No sample folder at {}", joined.display()))?;
    if !canonical.is_dir() {
        return Err(format!("{} is not a folder", joined.display()));
    }
    let plain = strip_verbatim(&canonical);
    Ok((canonical, plain))
}

fn scan(dir: &Path) -> io::Result<SampleFolder> {
    let mut folders = Vec::new();
    let mut files = Vec::new();
    for entry in read_dir_sorted(dir)? {
        if !entry.is_dir {
            if is_audio(&entry.path) {
                files.push(entry.path);
            }
            continue;
        }
        // An unreadable subfolder just contributes no sound.
        let Ok(inner) = read_dir_sorted(&entry.path) else {
            continue;
        };
        let audio: Vec<PathBuf> = inner
            .into_iter()
            .filter(|e| !e.is_dir && is_audio(&e.path))
            .map(|e| e.path)
            .collect();
        if !audio.is_empty() {
            folders.push(SoundFolder { name: entry.name, path: entry.path, files: audio });
        }
    }
    Ok(SampleFolder { path: dir.to_path_buf(), folders, files })
}

fn is_audio(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .is_some_and(|ext| AUDIO_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str()))
}

#[cfg(windows)]
fn strip_verbatim(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        PathBuf::from(format!(r"\\{rest}"))
    } else if let Some(rest) = text.strip_prefix(r"\\?\") {
        PathBuf::from(rest)
    } else {
        path.to_path_buf()
    }
}

#[cfg(not(windows))]
fn strip_verbatim(path: &Path) -> PathBuf {
    path.to_path_buf()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("strudel-studio-samples-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        // Compare against the same form the commands produce.
        strip_verbatim(&fs::canonicalize(&dir).unwrap())
    }

    fn names(paths: &[PathBuf]) -> Vec<String> {
        paths.iter().map(|p| p.file_name().unwrap().to_string_lossy().into_owned()).collect()
    }

    #[test]
    fn scans_sound_folders_and_loose_files() {
        let dir = temp_dir("scan");
        fs::create_dir(dir.join("Kick")).unwrap();
        fs::write(dir.join("Kick").join("b.WAV"), "").unwrap();
        fs::write(dir.join("Kick").join("a.wav"), "").unwrap();
        fs::write(dir.join("Kick").join("notes.txt"), "").unwrap();
        fs::create_dir(dir.join("Kick").join("nested")).unwrap();
        fs::create_dir(dir.join("empty")).unwrap();
        fs::create_dir(dir.join(".hidden")).unwrap();
        fs::write(dir.join(".hidden").join("x.wav"), "").unwrap();
        fs::write(dir.join("snare.mp3"), "").unwrap();
        fs::write(dir.join("song.strudel"), "").unwrap();

        let folder = scan(&dir).unwrap();
        assert_eq!(folder.folders.len(), 1);
        assert_eq!(folder.folders[0].name, "Kick");
        assert_eq!(names(&folder.folders[0].files), ["a.wav", "b.WAV"]);
        assert_eq!(names(&folder.files), ["snare.mp3"]);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn resolves_paths_relative_to_the_base() {
        let dir = temp_dir("resolve");
        fs::create_dir_all(dir.join("songs")).unwrap();
        fs::create_dir_all(dir.join("samples").join("drums")).unwrap();
        let (_, plain) = resolve_dir(&dir.join("songs"), "../samples/drums").unwrap();
        assert_eq!(plain, dir.join("samples").join("drums"));
        let (_, same) = resolve_dir(&dir, "./").unwrap();
        assert_eq!(same, dir);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn rejects_missing_folders_and_files() {
        let dir = temp_dir("reject");
        fs::write(dir.join("kick.wav"), "").unwrap();
        assert!(resolve_dir(&dir, "./nope").unwrap_err().contains("No sample folder"));
        assert!(resolve_dir(&dir, "./kick.wav").unwrap_err().contains("is not a folder"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn recognises_audio_extensions_in_any_case() {
        assert!(is_audio(Path::new("a.WAV")));
        assert!(is_audio(Path::new("a.flac")));
        assert!(!is_audio(Path::new("a.aif")));
        assert!(!is_audio(Path::new("wav")));
    }

    #[cfg(windows)]
    #[test]
    fn strips_the_verbatim_prefix() {
        assert_eq!(strip_verbatim(Path::new(r"\\?\C:\music")), PathBuf::from(r"C:\music"));
        assert_eq!(strip_verbatim(Path::new(r"\\?\UNC\nas\share")), PathBuf::from(r"\\nas\share"));
        assert_eq!(strip_verbatim(Path::new(r"C:\music")), PathBuf::from(r"C:\music"));
    }
}
