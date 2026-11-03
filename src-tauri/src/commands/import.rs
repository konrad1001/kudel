use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{self, BufRead, BufReader, Read};
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;

use serde::Serialize;
use tauri::State;
use tauri::async_runtime::spawn_blocking;
use tauri::ipc::Channel;

use super::files::{check_file_name, free_path};

// Importing audio from a link: yt-dlp downloads it and has ffmpeg convert it to .wav
// in a temporary folder, then the front end names it and place_import moves it into
// the open folder. Both programs are found on PATH, never bundled.

// One line of progress per update, in a form the front end parses (src/importer/importer.ts).
// Fields yt-dlp doesn't know print as NA.
const PROGRESS_TEMPLATE: &str = "download:[progress] %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s %(progress.speed)s %(progress.eta)s";

// Running imports by the id the front end gave them, so they can be cancelled.
#[derive(Default, Clone)]
pub struct Imports {
    running: Arc<Mutex<HashMap<u32, u32>>>,
    cancelled: Arc<Mutex<HashSet<u32>>>,
}

// The first line each program prints about its version; None when it isn't on PATH.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportTools {
    yt_dlp: Option<String>,
    ffmpeg: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlacedImport {
    path: PathBuf,
    bytes: u64,
}

#[tauri::command]
pub async fn import_tools() -> Result<ImportTools, String> {
    spawn_blocking(|| ImportTools {
        yt_dlp: first_line("yt-dlp", "--version"),
        ffmpeg: first_line("ffmpeg", "-version"),
    })
    .await
    .map_err(|err| err.to_string())
}

// Downloads `url` as a .wav into a temporary folder, sending each line yt-dlp prints
// to `on_line`. `from` and `to` (seconds, either or both) keep only that part. Resolves
// to the .wav; fails with "cancelled" after cancel_import.
#[tauri::command]
pub async fn import_url(
    imports: State<'_, Imports>,
    id: u32,
    url: String,
    from: Option<f64>,
    to: Option<f64>,
    on_line: Channel<String>,
) -> Result<PathBuf, String> {
    let imports = imports.inner().clone();
    let cut = cut_args(from, to)?;
    spawn_blocking(move || download(&imports, id, &url, cut.as_deref(), &on_line))
        .await
        .map_err(|err| err.to_string())?
}

// Stops a running import, with the processes yt-dlp started (ffmpeg, and the one its
// Windows build unpacks itself into).
#[tauri::command]
pub async fn cancel_import(imports: State<'_, Imports>, id: u32) -> Result<(), String> {
    imports.cancelled.lock().unwrap().insert(id);
    let pid = imports.running.lock().unwrap().get(&id).copied();
    if let Some(pid) = pid {
        kill_tree(pid);
    }
    Ok(())
}

// Moves a downloaded file into `relative` (inside `base`, created if missing) as
// `name`.wav, or name_2.wav and so on if that's taken, and removes its temporary folder.
#[tauri::command]
pub async fn place_import(
    from: PathBuf,
    base: PathBuf,
    relative: String,
    name: String,
) -> Result<PlacedImport, String> {
    let dir = inside(&base, &relative)?;
    let stem = check_file_name(&name)?;
    fs::create_dir_all(&dir).map_err(|err| format!("Could not create {}: {err}", dir.display()))?;
    let to = free_path(&dir, stem, "wav");
    move_file(&from, &to).map_err(|err| format!("Could not move the file to {}: {err}", to.display()))?;
    if let Some(job_dir) = from.parent().filter(|dir| dir.starts_with(temp_root())) {
        let _ = fs::remove_dir_all(job_dir);
    }
    let bytes = fs::metadata(&to).map(|m| m.len()).unwrap_or(0);
    Ok(PlacedImport { path: to, bytes })
}

// Runs `yt-dlp -U` and returns what it printed.
#[tauri::command]
pub async fn update_yt_dlp() -> Result<String, String> {
    spawn_blocking(|| {
        let mut cmd = Command::new("yt-dlp");
        cmd.arg("-U").stdin(Stdio::null());
        hide_window(&mut cmd);
        let output = cmd.output().map_err(|err| not_found("yt-dlp", err))?;
        let text = format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        if output.status.success() { Ok(text) } else { Err(text) }
    })
    .await
    .map_err(|err| err.to_string())?
}

// The ffmpeg options that keep only part of the audio, given to yt-dlp's conversion to
// .wav: "-ss 90 -to 125". They come after the input, so ffmpeg decodes and cuts at the
// exact sample. (yt-dlp's --download-sections fetches less, but cuts at the stream's
// blocks, seconds early, unless --force-keyframes-at-cuts re-encodes it lossily.)
fn cut_args(from: Option<f64>, to: Option<f64>) -> Result<Option<String>, String> {
    let valid = |t: Option<f64>| t.is_none_or(|t| t.is_finite() && t >= 0.0);
    if !valid(from) || !valid(to) {
        return Err("Clip times must be positive".into());
    }
    if let (Some(from), Some(to)) = (from, to) {
        if to <= from {
            return Err("The clip ends before it starts".into());
        }
    }
    let mut args = Vec::new();
    if let Some(from) = from.filter(|&t| t > 0.0) {
        args.push(format!("-ss {from}"));
    }
    if let Some(to) = to {
        args.push(format!("-to {to}"));
    }
    Ok((!args.is_empty()).then(|| args.join(" ")))
}

fn download(
    imports: &Imports,
    id: u32,
    url: &str,
    cut: Option<&str>,
    on_line: &Channel<String>,
) -> Result<PathBuf, String> {
    let dir = temp_root().join(format!("{}-{id}", std::process::id()));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).map_err(|err| format!("Could not create {}: {err}", dir.display()))?;
    let result = run_yt_dlp(imports, id, url, cut, &dir, on_line).and_then(|()| find_wav(&dir));
    imports.running.lock().unwrap().remove(&id);
    let cancelled = imports.cancelled.lock().unwrap().remove(&id);
    if result.is_err() || cancelled {
        let _ = fs::remove_dir_all(&dir);
    }
    if cancelled {
        return Err("cancelled".into());
    }
    result
}

fn run_yt_dlp(
    imports: &Imports,
    id: u32,
    url: &str,
    cut: Option<&str>,
    dir: &Path,
    on_line: &Channel<String>,
) -> Result<(), String> {
    let mut cmd = Command::new("yt-dlp");
    cmd.args(["-x", "--audio-format", "wav", "-f", "bestaudio/best", "--no-playlist"])
        .args(["--newline", "--progress-template", PROGRESS_TEMPLATE]);
    if let Some(cut) = cut {
        cmd.arg("--postprocessor-args").arg(format!("ExtractAudio:{cut}"));
    }
    cmd
        .args(["--windows-filenames", "--trim-filenames", "100"])
        .arg("-P")
        .arg(dir)
        .args(["-o", "%(title)s.%(ext)s", "--", url])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("PYTHONIOENCODING", "utf-8");
    hide_window(&mut cmd);
    let mut child = cmd.spawn().map_err(|err| not_found("yt-dlp", err))?;
    imports.running.lock().unwrap().insert(id, child.id());
    // Cancelled before it started.
    if imports.cancelled.lock().unwrap().contains(&id) {
        kill_tree(child.id());
    }
    let readers = [
        child.stdout.take().map(|out| forward(out, on_line.clone())),
        child.stderr.take().map(|err| forward(err, on_line.clone())),
    ];
    let status = child.wait().map_err(|err| err.to_string())?;
    for reader in readers.into_iter().flatten() {
        let _ = reader.join();
    }
    if status.success() {
        Ok(())
    } else {
        Err(match status.code() {
            Some(code) => format!("yt-dlp stopped with exit code {code}"),
            None => "yt-dlp stopped".into(),
        })
    }
}

fn forward(stream: impl Read + Send + 'static, channel: Channel<String>) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        read_lines(stream, |line| {
            let _ = channel.send(line);
        })
    })
}

// Calls `f` with each non-empty line, split at \n or \r (ffmpeg redraws with \r).
// Bytes that aren't UTF-8 are replaced rather than ending the stream.
fn read_lines(stream: impl Read, mut f: impl FnMut(String)) {
    for chunk in BufReader::new(stream).split(b'\n') {
        let Ok(chunk) = chunk else { return };
        for part in chunk.split(|&b| b == b'\r') {
            let line = String::from_utf8_lossy(part);
            let line = line.trim_end();
            if !line.is_empty() {
                f(line.to_string());
            }
        }
    }
}

fn find_wav(dir: &Path) -> Result<PathBuf, String> {
    let mut wavs: Vec<PathBuf> = fs::read_dir(dir)
        .map_err(|err| err.to_string())?
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|path| path.extension().is_some_and(|ext| ext.eq_ignore_ascii_case("wav")))
        .collect();
    wavs.sort();
    wavs.into_iter().next().ok_or_else(|| "yt-dlp finished without making a .wav".into())
}

fn temp_root() -> PathBuf {
    std::env::temp_dir().join("strudel-studio-import")
}

// `relative` ("./imported", "samples/new") inside `base`, with "." parts dropped so
// the path matches the explorer's. Refuses anything that leads out of `base`.
fn inside(base: &Path, relative: &str) -> Result<PathBuf, String> {
    let mut dir = base.to_path_buf();
    for part in Path::new(relative).components() {
        match part {
            Component::CurDir => {}
            Component::Normal(name) => dir.push(name),
            _ => return Err(format!("{relative} is not inside the open folder")),
        }
    }
    Ok(dir)
}

// A rename, or a copy when the temporary folder is on another drive.
fn move_file(from: &Path, to: &Path) -> io::Result<()> {
    fs::rename(from, to).or_else(|_| {
        fs::copy(from, to)?;
        fs::remove_file(from)
    })
}

fn first_line(program: &str, arg: &str) -> Option<String> {
    let mut cmd = Command::new(program);
    cmd.arg(arg).stdin(Stdio::null());
    hide_window(&mut cmd);
    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout).lines().next().map(|line| line.trim().to_string())
}

fn not_found(program: &str, err: io::Error) -> String {
    match err.kind() {
        io::ErrorKind::NotFound => format!("{program} was not found on PATH"),
        _ => format!("Could not start {program}: {err}"),
    }
}

#[cfg(windows)]
fn kill_tree(pid: u32) {
    let mut cmd = Command::new("taskkill");
    cmd.args(["/T", "/F", "/PID", &pid.to_string()])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    hide_window(&mut cmd);
    let _ = cmd.spawn();
}

#[cfg(not(windows))]
fn kill_tree(pid: u32) {
    let _ = Command::new("kill").arg(pid.to_string()).spawn();
}

// Console programs started from the app would otherwise open a console window.
#[cfg(windows)]
fn hide_window(cmd: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    cmd.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_window(_cmd: &mut Command) {}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("strudel-studio-test-import-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn splits_lines_at_newlines_and_carriage_returns() {
        let mut lines = Vec::new();
        read_lines(Cursor::new(b"one\r\ntwo\rthree\n\n  \nfour".to_vec()), |l| lines.push(l));
        assert_eq!(lines, ["one", "two", "three", "four"]);
    }

    #[test]
    fn keeps_lines_that_are_not_utf8() {
        let mut lines = Vec::new();
        read_lines(Cursor::new(b"caf\xe9\n".to_vec()), |l| lines.push(l));
        assert_eq!(lines, ["caf\u{fffd}"]);
    }

    #[test]
    fn builds_the_cut_from_either_end() {
        assert_eq!(cut_args(None, None), Ok(None));
        assert_eq!(cut_args(Some(90.0), Some(125.5)), Ok(Some("-ss 90 -to 125.5".into())));
        assert_eq!(cut_args(Some(90.0), None), Ok(Some("-ss 90".into())));
        assert_eq!(cut_args(Some(0.0), Some(35.0)), Ok(Some("-to 35".into())));
        assert_eq!(cut_args(None, Some(35.0)), Ok(Some("-to 35".into())));
    }

    #[test]
    fn refuses_cuts_that_make_no_sense() {
        assert!(cut_args(Some(125.0), Some(90.0)).is_err());
        assert!(cut_args(Some(-1.0), None).is_err());
        assert!(cut_args(None, Some(f64::NAN)).is_err());
    }

    #[test]
    fn resolves_folders_inside_the_base_only() {
        let base = Path::new(r"C:\music");
        assert_eq!(inside(base, "./imported").unwrap(), base.join("imported"));
        assert_eq!(inside(base, "samples/new").unwrap(), base.join("samples").join("new"));
        assert_eq!(inside(base, "./").unwrap(), base.to_path_buf());
        assert!(inside(base, "../elsewhere").is_err());
        assert!(inside(base, r"D:\elsewhere").is_err());
    }

    #[test]
    fn finds_the_wav_among_other_files() {
        let dir = temp_dir("find");
        assert!(find_wav(&dir).is_err());
        fs::write(dir.join("Title.webm"), b"").unwrap();
        fs::write(dir.join("Title.WAV"), b"").unwrap();
        assert_eq!(find_wav(&dir).unwrap(), dir.join("Title.WAV"));
    }

    #[test]
    fn moves_the_file_into_a_new_folder() {
        let dir = temp_dir("move");
        let from = dir.join("Some Title.wav");
        fs::write(&from, b"RIFF").unwrap();
        let to = dir.join("imported");
        fs::create_dir_all(&to).unwrap();
        let to = free_path(&to, "some_title", "wav");
        move_file(&from, &to).unwrap();
        assert!(!from.exists());
        assert_eq!(fs::read(&to).unwrap(), b"RIFF");
    }
}
