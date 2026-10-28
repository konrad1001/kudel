import * as engine from "../engine";
import type { Action } from "../shortcuts";
import { useDocument } from "./documentStore";
import * as explorer from "./explorerStore";
import {
  askToSave,
  createFile as createFileOnDisk,
  pickFileToOpen,
  pickFolder,
  pickSavePath,
  readTextFile,
  showError,
  writeTextFile,
} from "./native";
import { baseName, samePath, withDefaultExtension } from "./paths";
import { decodeFile, encodeFile } from "./text";

let busy = false;

// One file operation at a time (a held Ctrl+S must not stack dialogs); errors go to
// a message box, and the editor gets focus back afterwards.
function fileAction<A extends unknown[]>(run: (...args: A) => Promise<void>) {
  return async (...args: A): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      await run(...args);
    } catch (err) {
      await showError(String(err));
    } finally {
      busy = false;
      engine.focusEditor();
    }
  };
}

async function writeTo(path: string): Promise<void> {
  const code = engine.getCode();
  await writeTextFile(path, encodeFile(code, useDocument.getState().lineEnding));
  useDocument.setState({ filePath: path, savedCode: code, dirty: false });
  await explorer.refresh();
}

// Resolves to false when there was nowhere to save (the dialog was cancelled).
async function save(): Promise<boolean> {
  const { filePath } = useDocument.getState();
  const path = filePath ?? (await pickSavePath("untitled.strudel"));
  if (!path) return false;
  await writeTo(path);
  return true;
}

// Before the editor text is replaced: true to go ahead, false to keep the current text.
async function confirmDiscard(): Promise<boolean> {
  const { dirty, filePath } = useDocument.getState();
  if (!dirty) return true;
  const choice = await askToSave(filePath ? baseName(filePath) : "Untitled");
  if (choice === "save") return save();
  return choice === "discard";
}

function replaceDocument(code: string, filePath: string | null, lineEnding: "\n" | "\r\n"): void {
  useDocument.setState({ filePath, lineEnding, savedCode: code, dirty: false });
  engine.loadCode(code);
}

async function load(path: string): Promise<void> {
  if (samePath(path, useDocument.getState().filePath)) return;
  if (!(await confirmDiscard())) return;
  const { code, lineEnding } = decodeFile(await readTextFile(path));
  replaceDocument(code, path, lineEnding);
}

export const openPath = fileAction(load);

export const newFile = fileAction(async () => {
  if (await confirmDiscard()) replaceDocument("", null, "\n");
});

export const openFile = fileAction(async () => {
  const path = await pickFileToOpen();
  if (path) await load(path);
});

export const openFolder = fileAction(async () => {
  const path = await pickFolder();
  if (path) await explorer.setRoot(path);
});

// Creates the file in `dir` and opens it.
export const createFileIn = fileAction(async (dir: string, name: string) => {
  const path = await createFileOnDisk(dir, withDefaultExtension(name));
  await explorer.refresh();
  await load(path);
});

export const saveFile = fileAction(async () => {
  await save();
});

export const saveFileAs = fileAction(async () => {
  const path = await pickSavePath(useDocument.getState().filePath ?? "untitled.strudel");
  if (path) await writeTo(path);
});

export const FILE_ACTIONS: Action[][] = [
  [
    { label: "New File", shortcut: "Ctrl+N", run: newFile },
    { label: "Open File…", shortcut: "Ctrl+O", run: openFile },
    { label: "Open Folder…", shortcut: "Ctrl+Shift+O", run: openFolder },
  ],
  [
    { label: "Save", shortcut: "Ctrl+S", run: saveFile },
    { label: "Save As…", shortcut: "Ctrl+Shift+S", run: saveFileAs },
  ],
  [{ label: "Close Folder", run: explorer.closeFolder }],
];

export const VIEW_ACTIONS: Action[][] = [
  [{ label: "Toggle Explorer", shortcut: "Ctrl+B", run: explorer.toggleExplorer }],
];
