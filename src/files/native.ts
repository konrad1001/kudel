// The only place in the front end that talks to Tauri.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { SampleFolder } from "../samples/sampleMap";
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

export async function pickFolder(): Promise<string | null> {
  return open({ directory: true });
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

// Resolves `relative` against `base`, lists its audio, and lets the asset protocol
// serve that folder. Rejects with a message naming the folder.
export function scanSampleFolder(base: string, relative: string): Promise<SampleFolder> {
  return invoke("scan_sample_folder", { base, relative });
}

// Lets the asset protocol serve a folder (recursively), e.g. for previews.
export function allowAssetFolder(path: string): Promise<void> {
  return invoke("allow_asset_folder", { path });
}

// The URL the WebView fetches a local file from. Only works inside allowed folders.
export function assetUrl(path: string): string {
  return convertFileSrc(path);
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
