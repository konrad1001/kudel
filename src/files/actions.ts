import * as engine from "../engine";
import type { Action } from "../shortcuts";
import { useDocument } from "./documentStore";
import { pickFileToOpen, pickSavePath, readTextFile, showError, writeTextFile } from "./native";
import { decodeFile, encodeFile } from "./text";

let busy = false;

// One file operation at a time (a held Ctrl+S must not stack dialogs); errors go to
// a message box, and the editor gets focus back afterwards.
function fileAction(run: () => Promise<void>): () => Promise<void> {
  return async () => {
    if (busy) return;
    busy = true;
    try {
      await run();
    } catch (err) {
      await showError(String(err));
    } finally {
      busy = false;
      engine.focusEditor();
    }
  };
}

async function writeTo(path: string): Promise<void> {
  await writeTextFile(path, encodeFile(engine.getCode(), useDocument.getState().lineEnding));
  useDocument.setState({ filePath: path });
}

export const openFile = fileAction(async () => {
  const path = await pickFileToOpen();
  if (!path) return;
  const { code, lineEnding } = decodeFile(await readTextFile(path));
  engine.loadCode(code);
  useDocument.setState({ filePath: path, lineEnding });
});

export const saveFileAs = fileAction(async () => {
  const path = await pickSavePath(useDocument.getState().filePath ?? "untitled.strudel");
  if (path) await writeTo(path);
});

export const saveFile = fileAction(async () => {
  const { filePath } = useDocument.getState();
  const path = filePath ?? (await pickSavePath("untitled.strudel"));
  if (path) await writeTo(path);
});

export const FILE_ACTIONS: Action[] = [
  { label: "Open…", shortcut: "Ctrl+O", run: openFile },
  { label: "Save", shortcut: "Ctrl+S", run: saveFile },
  { label: "Save As…", shortcut: "Ctrl+Shift+S", run: saveFileAs },
];
