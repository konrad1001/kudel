// The only place in the front end that talks to Tauri.
import { Channel, convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { SampleFolder } from "../samples/sampleMap";
import { packWrite } from "../waveform/wavFile";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { message, open, save } from "@tauri-apps/plugin-dialog";

const STRUDEL = { name: "Strudel", extensions: ["strudel"] };
const JAVASCRIPT = { name: "JavaScript", extensions: ["js"] };
const TITLE = "Strudel Studio";

// Mirrors DirEntry in src-tauri/src/commands/files.rs.
export interface DirEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export async function pickFileToOpen(): Promise<string | null> {
  return open({ filters: [{ name: "Strudel or JavaScript", extensions: ["strudel", "js"] }] });
}

export async function pickFolder(defaultPath?: string): Promise<string | null> {
  return open({ directory: true, defaultPath });
}

// Windows adds the selected filter's extension when the name has none.
export async function pickSavePath(defaultPath?: string): Promise<string | null> {
  return save({ defaultPath, filters: [STRUDEL, JAVASCRIPT] });
}

export function readTextFile(path: string): Promise<string> {
  return invoke("read_text_file", { path });
}

export function writeTextFile(path: string, contents: string): Promise<void> {
  return invoke("write_text_file", { path, contents });
}

export function listDir(path: string): Promise<DirEntry[]> {
  return invoke("list_dir", { path });
}

// Fails if the name is not a plain file name or the file already exists.
export function createFile(dir: string, name: string): Promise<string> {
  return invoke("create_file", { dir, name });
}

// Renames within the same folder; resolves to the new path. Fails if the name is not a
// plain file name or is taken (a change of case only is fine).
export function renamePath(path: string, name: string): Promise<string> {
  return invoke("rename_path", { path, name });
}

// Moves a file or folder to the Recycle Bin.
export function trashPath(path: string): Promise<void> {
  return invoke("trash_path", { path });
}

const TRASH = "Move to Recycle Bin";

// True to go ahead. `unsaved`: an open tab inside it has changes that would be lost.
export async function askToTrash(name: string, isDir: boolean, unsaved: boolean): Promise<boolean> {
  const what = isDir ? `the folder ${name} and everything in it` : name;
  const warning = unsaved ? "\n\nAn open tab in it has unsaved changes, which will be lost." : "";
  const choice = await message(`Move ${what} to the Recycle Bin?${warning}`, {
    title: TITLE,
    kind: "warning",
    buttons: { ok: TRASH, cancel: "Cancel" },
  });
  return choice === TRASH || choice === "Ok";
}

// Resolves `relative` against `base`, lists its audio, and lets the asset protocol
// serve that folder. Rejects with a message naming the folder.
export function scanSampleFolder(base: string, relative: string): Promise<SampleFolder> {
  return invoke("scan_sample_folder", { base, relative });
}

// Writes `file` (a whole .wav) as `name`.wav in `dir`, or name_2.wav etc. if that's
// taken; never replaces a file. Resolves to the path written.
export function writeWav(dir: string, name: string, file: Uint8Array): Promise<string> {
  return invoke("write_wav", packWrite({ dir, name }, file));
}

// Lets the asset protocol serve a folder (recursively), e.g. for previews.
export function allowAssetFolder(path: string): Promise<void> {
  return invoke("allow_asset_folder", { path });
}

// The URL the WebView fetches a local file from. Only works inside allowed folders.
export function assetUrl(path: string): string {
  return convertFileSrc(path);
}

// Mirrors ImportTools in src-tauri/src/commands/import.rs: the first line each prints
// about its version, null when it isn't on PATH.
export interface ImportTools {
  ytDlp: string | null;
  ffmpeg: string | null;
}

export function importTools(): Promise<ImportTools> {
  return invoke("import_tools");
}

// Downloads `url` with yt-dlp as a .wav in a temporary folder, calling `onLine` with
// each line it prints. `from` and `to` (seconds, null for the start or end) keep only
// that part. Resolves to the .wav; rejects with "cancelled" after cancelImport.
export function importUrl(
  id: number,
  url: string,
  clip: { from: number | null; to: number | null } | null,
  onLine: (line: string) => void,
): Promise<string> {
  return invoke("import_url", {
    id,
    url,
    from: clip?.from ?? null,
    to: clip?.to ?? null,
    onLine: new Channel<string>(onLine),
  });
}

export function cancelImport(id: number): Promise<void> {
  return invoke("cancel_import", { id });
}

// Moves a downloaded file to `relative` inside `base` as `name`.wav (name_2.wav, ...
// if taken). Mirrors PlacedImport in import.rs.
export function placeImport(
  from: string,
  base: string,
  relative: string,
  name: string,
): Promise<{ path: string; bytes: number }> {
  return invoke("place_import", { from, base, relative, name });
}

// Runs `yt-dlp -U`; resolves or rejects with what it printed.
export function updateYtDlp(): Promise<string> {
  return invoke("update_yt_dlp");
}

// The session file in the app data folder; null on first run.
export function loadSession(): Promise<string | null> {
  return invoke("load_session");
}

export function saveSession(contents: string): Promise<void> {
  return invoke("save_session", { contents });
}

// Runs `beforeClose` when the window is asked to close; the window then closes
// unless it resolved false. Returns a function that stops listening.
export function onWindowClose(beforeClose: () => Promise<boolean>): () => void {
  let stopped = false;
  let unlisten: (() => void) | null = null;
  // Async, so that a missing window (outside Tauri) rejects instead of throwing here.
  (async () =>
    getCurrentWindow().onCloseRequested(async (event) => {
      if (!(await beforeClose())) event.preventDefault();
    }))()
    .then((fn) => (stopped ? fn() : (unlisten = fn)))
    .catch(() => {});
  return () => {
    stopped = true;
    unlisten?.();
  };
}

// True to close anyway after the session couldn't be saved.
export async function askCloseAnyway(problem: string): Promise<boolean> {
  const choice = await message(`${problem}\n\nUnsaved changes may be lost if you close now.`, {
    title: TITLE,
    kind: "warning",
    buttons: { ok: "Close Anyway", cancel: "Cancel" },
  });
  return choice === "Close Anyway" || choice === "Ok";
}

export async function setWindowTitle(title: string): Promise<void> {
  await getCurrentWindow().setTitle(title);
}

export async function showError(text: string): Promise<void> {
  await message(text, { title: TITLE, kind: "error" });
}

const SAVE = "Save";
const DISCARD = "Don't Save";

// Windows returns the label of the clicked button; closing the box counts as cancel.
export async function askToSave(name: string): Promise<"save" | "discard" | "cancel"> {
  const choice = await message(`Do you want to save the changes you made to ${name}?`, {
    title: TITLE,
    kind: "warning",
    buttons: { yes: SAVE, no: DISCARD, cancel: "Cancel" },
  });
  if (choice === SAVE) return "save";
  if (choice === DISCARD) return "discard";
  return "cancel";
}
