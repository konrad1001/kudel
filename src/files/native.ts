// The only place in src/files that talks to Tauri.
import { invoke } from "@tauri-apps/api/core";
import { message, open, save } from "@tauri-apps/plugin-dialog";

const STRUDEL = { name: "Strudel", extensions: ["strudel"] };
const JAVASCRIPT = { name: "JavaScript", extensions: ["js"] };

export async function pickFileToOpen(): Promise<string | null> {
  return open({ filters: [{ name: "Strudel or JavaScript", extensions: ["strudel", "js"] }] });
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

export async function showError(text: string): Promise<void> {
  await message(text, { title: "Strudel Studio", kind: "error" });
}
