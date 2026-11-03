use std::cmp::Ordering;
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use serde::Serialize;

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DirEntry {
    pub(crate) name: String,
    pub(crate) path: PathBuf,
    pub(crate) is_dir: bool,
}

// One level of a folder for the explorer: folders first, then files, each sorted
// case-insensitively. Dot entries and entries Windows marks hidden are left out.
#[tauri::command]
pub async fn list_dir(path: PathBuf) -> Result<Vec<DirEntry>, String> {
    read_dir_sorted(&path).map_err(|err| format!("Could not list {}: {err}", path.display()))
}

// Creates an empty file, refusing to replace one that already exists.
#[tauri::command]
pub async fn create_file(dir: PathBuf, name: String) -> Result<PathBuf, String> {
    let path = dir.join(check_file_name(&name)?);
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&path)
        .map_err(|err| match err.kind() {
            io::ErrorKind::AlreadyExists => format!("{name} already exists"),
            _ => format!("Could not create {}: {err}", path.display()),
        })?;
    Ok(path)
}

// Renames a file or folder within its own folder; resolves to the new path. Refuses a
// name that's taken (fs::rename would replace a file there), except a change of case
// only: Windows names ignore case, so then the "taken" name is this same entry.
#[tauri::command]
pub async fn rename_path(path: PathBuf, name: String) -> Result<PathBuf, String> {
    let name = check_file_name(&name)?;
    let parent = path.parent().ok_or_else(|| format!("{} can't be renamed", path.display()))?;
    let target = parent.join(name);
    if target == path {
        return Ok(target);
    }
    let case_only = target.to_string_lossy().to_lowercase() == path.to_string_lossy().to_lowercase();
    if target.exists() && !case_only {
        return Err(format!("{name} already exists"));
    }
    fs::rename(&path, &target).map_err(|err| format!("Could not rename {}: {err}", path.display()))?;
    Ok(target)
}

// Moves a file or folder to the Recycle Bin, so a delete can be undone from there.
#[tauri::command]
pub async fn trash_path(path: PathBuf) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("{} doesn't exist", path.display()));
    }
    trash::delete(&path).map_err(|err| format!("Could not move {} to the Recycle Bin: {err}", path.display()))
}

#[tauri::command]
pub async fn read_text_file(path: PathBuf) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|err| format!("Could not read {}: {err}", path.display()))
}

#[tauri::command]
pub async fn write_text_file(path: PathBuf, contents: String) -> Result<(), String> {
    write_atomic(&path, &contents)
        .map_err(|err| format!("Could not write {}: {err}", path.display()))
}

// Writes to a temporary file beside the target, then renames it over the target,
// so a crash mid-write leaves the previous version intact.
pub(crate) fn write_atomic(path: &Path, contents: &str) -> io::Result<()> {
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    let result = (|| {
        let mut file = File::create(&tmp)?;
        file.write_all(contents.as_bytes())?;
        file.sync_all()?;
        drop(file);
        fs::rename(&tmp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

pub(crate) fn read_dir_sorted(path: &Path) -> io::Result<Vec<DirEntry>> {
    let mut entries = Vec::new();
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        // Follows symlinks, so a linked folder shows as a folder.
        let Ok(metadata) = fs::metadata(entry.path()) else {
            continue;
        };
        if name.starts_with('.') || is_hidden(&metadata) {
            continue;
        }
        entries.push(DirEntry { name, path: entry.path(), is_dir: metadata.is_dir() });
    }
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => Ordering::Less,
        (false, true) => Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(entries)
}

#[cfg(windows)]
fn is_hidden(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
    metadata.file_attributes() & FILE_ATTRIBUTE_HIDDEN != 0
}

#[cfg(not(windows))]
fn is_hidden(_metadata: &fs::Metadata) -> bool {
    false
}

// dir/stem.ext, or dir/stem_2.ext, stem_3.ext, ... for the first that doesn't exist.
// "_2" is how soundsInFolder (src/samples/sampleMap.ts) tells sounds apart too.
pub(crate) fn free_path(dir: &Path, stem: &str, ext: &str) -> PathBuf {
    let mut path = dir.join(format!("{stem}.{ext}"));
    let mut n = 2;
    while path.exists() {
        path = dir.join(format!("{stem}_{n}.{ext}"));
        n += 1;
    }
    path
}

// A plain name for a new entry inside a folder, never a path.
pub(crate) fn check_file_name(name: &str) -> Result<&str, String> {
    let name = name.trim();
    if name.is_empty() || name == "." || name == ".." {
        return Err("A file name is required".into());
    }
    if let Some(c) = name.chars().find(|c| r#"\/:*?"<>|"#.contains(*c) || c.is_control()) {
        return Err(format!("A file name can't contain {c:?}"));
    }
    if name.ends_with('.') {
        return Err("A file name can't end with a dot".into());
    }
    Ok(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("strudel-studio-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn rename(path: &Path, name: &str) -> Result<PathBuf, String> {
        tauri::async_runtime::block_on(rename_path(path.to_path_buf(), name.into()))
    }

    #[test]
    fn renames_files_and_folders_in_place() {
        let dir = temp_dir("rename");
        fs::write(dir.join("a.strudel"), "x").unwrap();
        fs::create_dir(dir.join("drums")).unwrap();
        fs::write(dir.join("drums").join("kick.wav"), "").unwrap();

        assert_eq!(rename(&dir.join("a.strudel"), " b.strudel ").unwrap(), dir.join("b.strudel"));
        assert_eq!(fs::read_to_string(dir.join("b.strudel")).unwrap(), "x");
        assert_eq!(rename(&dir.join("drums"), "perc").unwrap(), dir.join("perc"));
        assert!(dir.join("perc").join("kick.wav").exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn refuses_a_taken_name_but_allows_a_case_change() {
        let dir = temp_dir("rename-taken");
        fs::write(dir.join("a.strudel"), "a").unwrap();
        fs::write(dir.join("b.strudel"), "b").unwrap();

        assert!(rename(&dir.join("a.strudel"), "b.strudel").unwrap_err().contains("already exists"));
        assert_eq!(fs::read_to_string(dir.join("b.strudel")).unwrap(), "b");
        assert!(rename(&dir.join("a.strudel"), "x/y").is_err());

        let renamed = rename(&dir.join("a.strudel"), "A.strudel").unwrap();
        assert_eq!(renamed.file_name().unwrap(), "A.strudel");
        let names: Vec<_> = fs::read_dir(&dir).unwrap().map(|e| e.unwrap().file_name()).collect();
        assert!(names.iter().any(|n| n == "A.strudel"), "{names:?}");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn trashing_a_missing_path_fails_without_touching_anything() {
        let dir = temp_dir("trash-missing");
        let err = tauri::async_runtime::block_on(trash_path(dir.join("nope.wav"))).unwrap_err();
        assert!(err.contains("doesn't exist"), "{err}");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn writes_and_reads_back() {
        let dir = temp_dir("roundtrip");
        let path = dir.join("song.strudel");
        tauri::async_runtime::block_on(async {
            write_text_file(path.clone(), "s(\"bd sd\")\r\n".into()).await.unwrap();
            assert_eq!(read_text_file(path.clone()).await.unwrap(), "s(\"bd sd\")\r\n");
        });
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn overwrites_and_leaves_no_temp_file() {
        let dir = temp_dir("overwrite");
        let path = dir.join("song.strudel");
        fs::write(&path, "old").unwrap();
        write_atomic(&path, "new").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "new");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn failed_write_keeps_the_target_and_cleans_up() {
        let dir = temp_dir("failed");
        // Renaming a file over a directory fails, after the temp file was written.
        let path = dir.join("taken");
        fs::create_dir(&path).unwrap();
        assert!(write_atomic(&path, "new").is_err());
        assert!(path.is_dir());
        assert!(!dir.join("taken.tmp").exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn lists_folders_first_then_files_case_insensitively() {
        let dir = temp_dir("list");
        fs::write(dir.join("beta.strudel"), "").unwrap();
        fs::write(dir.join("Alpha.js"), "").unwrap();
        fs::write(dir.join(".hidden"), "").unwrap();
        fs::create_dir(dir.join("songs")).unwrap();
        fs::create_dir(dir.join(".git")).unwrap();
        let names: Vec<(String, bool)> = read_dir_sorted(&dir)
            .unwrap()
            .into_iter()
            .map(|e| (e.name, e.is_dir))
            .collect();
        assert_eq!(
            names,
            [("songs".into(), true), ("Alpha.js".into(), false), ("beta.strudel".into(), false)]
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn creates_a_file_once() {
        let dir = temp_dir("create");
        let create = |name: &str| tauri::async_runtime::block_on(create_file(dir.clone(), name.into()));
        let path = create(" song.strudel ").unwrap();
        assert_eq!(path, dir.join("song.strudel"));
        assert_eq!(fs::read_to_string(&path).unwrap(), "");
        fs::write(&path, "keep me").unwrap();
        assert!(create("song.strudel").unwrap_err().contains("already exists"));
        assert_eq!(fs::read_to_string(&path).unwrap(), "keep me");
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn numbers_names_that_are_taken() {
        let dir = temp_dir("free");
        assert_eq!(free_path(&dir, "amen", "wav"), dir.join("amen.wav"));
        fs::write(dir.join("amen.wav"), b"").unwrap();
        fs::write(dir.join("amen_2.wav"), b"").unwrap();
        assert_eq!(free_path(&dir, "amen", "wav"), dir.join("amen_3.wav"));
    }

    #[test]
    fn rejects_names_that_are_paths() {
        for name in ["", "  ", ".", "..", "a/b", r"a\b", "..\\x", "c:x", "what?", "end."] {
            assert!(check_file_name(name).is_err(), "{name:?} should be rejected");
        }
        assert_eq!(check_file_name("my song.strudel"), Ok("my song.strudel"));
    }

    #[test]
    fn reading_a_missing_file_names_it() {
        let dir = temp_dir("missing");
        let path = dir.join("nope.strudel");
        let err = tauri::async_runtime::block_on(read_text_file(path)).unwrap_err();
        assert!(err.contains("nope.strudel"), "{err}");
        fs::remove_dir_all(dir).unwrap();
    }
}
