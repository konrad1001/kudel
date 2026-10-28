use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

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
fn write_atomic(path: &Path, contents: &str) -> io::Result<()> {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("strudel-studio-{}-{name}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
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
    fn reading_a_missing_file_names_it() {
        let dir = temp_dir("missing");
        let path = dir.join("nope.strudel");
        let err = tauri::async_runtime::block_on(read_text_file(path)).unwrap_err();
        assert!(err.contains("nope.strudel"), "{err}");
        fs::remove_dir_all(dir).unwrap();
    }
}
