import * as engine from "../engine";
import type { Command } from "../commands/commands";
import * as explorer from "./explorerStore";
import { stopPreview, usePreview } from "../samples/preview";
import { closeSampleWithin, followSampleMove } from "../waveform/waveformStore";
import {
  askToSave,
  askToTrash,
  createFile as createFileOnDisk,
  listDir,
  pickFileToOpen,
  pickFolder,
  pickSavePath,
  readTextFile,
  renamePath as renameOnDisk,
  showError,
  trashPath,
  writeTextFile,
} from "./native";
import { baseName, isWithin, movedPath, samePath, withDefaultExtension } from "./paths";
import { addRecentFile, addRecentFolder, forgetRecent, forgetRecentWithin, moveRecent } from "./recentStore";
import { activeAfterClose, cycleTab, insertIndex, nextUntitled, tabTitle, type Tab } from "./tabs";
import { selectActiveTab, updateTab, useTabs } from "./tabsStore";
import { decodeFile, encodeFile, type LineEnding } from "./text";

let busy = false;

// One file operation at a time (a held Ctrl+S must not stack dialogs); errors go to
// a message box, and the editor gets focus back afterwards (unless `refocus` is
// false: the explorer's rename and delete leave focus in the explorer).
function fileAction<A extends unknown[]>(run: (...args: A) => Promise<unknown>, { refocus = true } = {}) {
  return async (...args: A): Promise<void> => {
    if (busy) return;
    busy = true;
    try {
      await run(...args);
    } catch (err) {
      await showError(String(err));
    } finally {
      busy = false;
      if (refocus) engine.focusEditor();
    }
  };
}

function activate(id: string | null): void {
  engine.showDoc(id);
  useTabs.setState({ activeId: id });
}

interface OpenTabOptions {
  // The text as last saved, when it differs from `code` (a restored unsaved tab).
  savedCode?: string;
  untitled?: number | null;
  selection?: engine.DocSelection;
  // Restoring adds tabs at the end without switching to each one.
  restoring?: boolean;
}

// Returns the new tab's id.
function openTab(code: string, filePath: string | null, lineEnding: LineEnding, options: OpenTabOptions = {}): string {
  // Random rather than counted, so ids stay unique even if this module is hot-reloaded
  // while tabs are open. Ids last for the session only; a tab's file is its filePath.
  const id = `tab-${crypto.randomUUID()}`;
  engine.openDoc(id, code, options.selection);
  const { tabs, activeId } = useTabs.getState();
  const savedCode = options.savedCode ?? code;
  const tab: Tab = {
    id,
    filePath,
    untitled: filePath ? null : (options.untitled ?? nextUntitled(tabs)),
    lineEnding,
    savedCode,
    dirty: code !== savedCode,
  };
  const at = options.restoring
    ? tabs.length
    : insertIndex(
        tabs.map((t) => t.id),
        activeId,
      );
  useTabs.setState({ tabs: [...tabs.slice(0, at), tab, ...tabs.slice(at)] });
  if (!options.restoring) activate(id);
  return id;
}

// For src/session: reopens a tab as it was when the app closed.
export function openRestoredTab(code: string, filePath: string | null, lineEnding: LineEnding, options: OpenTabOptions): string {
  return openTab(code, filePath, lineEnding, { ...options, restoring: true });
}

// Opens `path` in a new tab, or switches to the tab that already has it.
async function load(path: string): Promise<void> {
  const open = useTabs.getState().tabs.find((tab) => samePath(tab.filePath, path));
  if (open) {
    activate(open.id);
  } else {
    const { code, lineEnding } = decodeFile(await readTextFile(path));
    openTab(code, path, lineEnding);
  }
  addRecentFile(path);
}

// Saves to `path`, or to the tab's own file, asking for one if it has none.
// Resolves to false when there was nowhere to save (the dialog was cancelled).
async function save(tab: Tab, path?: string | null): Promise<boolean> {
  const target = path ?? tab.filePath ?? (await pickSavePath(`${tabTitle(tab)}.strudel`));
  if (!target) return false;
  const code = engine.getDocCode(tab.id);
  await writeTextFile(target, encodeFile(code, tab.lineEnding));
  updateTab(tab.id, { filePath: target, untitled: null, savedCode: code, dirty: false });
  addRecentFile(target);
  await explorer.refresh();
  return true;
}

// Resolves to false when the tab stays open (the user cancelled).
async function close(id: string): Promise<boolean> {
  const tab = useTabs.getState().tabs.find((t) => t.id === id);
  if (!tab) return true;
  if (tab.dirty) {
    const choice = await askToSave(tabTitle(tab));
    if (choice === "cancel") return false;
    if (choice === "save" && !(await save(tab))) return false;
  }
  removeTab(id);
  return true;
}

// Closes a tab without asking (its file is gone, and the user already said so).
function removeTab(id: string): void {
  const { tabs, activeId } = useTabs.getState();
  const nextActive = activeAfterClose(
    tabs.map((t) => t.id),
    id,
    activeId,
  );
  engine.closeDoc(id);
  useTabs.setState({ tabs: tabs.filter((t) => t.id !== id) });
  if (nextActive !== activeId || activeId === id) activate(nextActive);
}

function withActiveTab(run: (tab: Tab) => Promise<unknown>) {
  return fileAction(async () => {
    const tab = selectActiveTab(useTabs.getState());
    if (tab) await run(tab);
  });
}

export const openPath = fileAction(load);
export const closeTab = fileAction(close);

// Exported for src/session, which picks the restored active tab.
export function activateTab(id: string): void {
  activate(id);
  engine.focusEditor();
}

function cycle(step: 1 | -1): void {
  const { tabs, activeId } = useTabs.getState();
  const next = cycleTab(
    tabs.map((t) => t.id),
    activeId,
    step,
  );
  if (next) activateTab(next);
}

export const newFile = fileAction(async () => openTab("", null, "\n"));

// A new untitled tab holding `code` (an example from the reference, say).
export const newFileWithCode = fileAction(async (code: string) => openTab(code, null, "\n"));

export const openFile = fileAction(async () => {
  const path = await pickFileToOpen();
  if (path) await load(path);
});

async function openFolderPath(path: string): Promise<void> {
  await explorer.setRoot(path);
  addRecentFolder(path);
}

export const openFolder = fileAction(async () => {
  const path = await pickFolder();
  if (path) await openFolderPath(path);
});

// From the recent lists. An entry that no longer opens drops off the list.
export const openRecentFile = fileAction(async (path: string) => {
  try {
    await load(path);
  } catch (err) {
    forgetRecent(path);
    throw err;
  }
});

export const openRecentFolder = fileAction(async (path: string) => {
  try {
    await listDir(path);
  } catch (err) {
    forgetRecent(path);
    throw err;
  }
  await openFolderPath(path);
});

// Creates the file in `dir` and opens it.
export const createFileIn = fileAction(async (dir: string, name: string) => {
  const path = await createFileOnDisk(dir, withDefaultExtension(name));
  await explorer.refresh();
  await load(path);
});

// Renames a file or folder in place. Open tabs, recents, the explorer and the Sample
// view follow the new path, including everything inside a renamed folder. Code that
// refers to it (samples('./old')) is not rewritten.
export const renameEntry = fileAction(
  async (path: string, name: string) => {
    const to = await renameOnDisk(path, name);
    useTabs.setState((s) => ({
      tabs: s.tabs.map((tab) =>
        tab.filePath && isWithin(tab.filePath, path) ? { ...tab, filePath: movedPath(tab.filePath, path, to) } : tab,
      ),
    }));
    moveRecent(path, to);
    explorer.followMove(path, to);
    followSampleMove(path, to);
    if (isWithin(usePreview.getState().path, path)) stopPreview();
    await explorer.refresh();
  },
  { refocus: false },
);

// Moves a file or folder to the Recycle Bin, after asking. Its open tabs close (the
// question says if any have unsaved changes), and nothing else keeps pointing at it.
export const deleteEntry = fileAction(
  async (path: string, isDir: boolean) => {
    const inside = useTabs.getState().tabs.filter((tab) => isWithin(tab.filePath, path));
    if (!(await askToTrash(baseName(path), isDir, inside.some((tab) => tab.dirty)))) return;
    await trashPath(path);
    inside.forEach((tab) => removeTab(tab.id));
    forgetRecentWithin(path);
    explorer.forgetWithin(path);
    closeSampleWithin(path);
    if (isWithin(usePreview.getState().path, path)) stopPreview();
    await explorer.refresh();
  },
  { refocus: false },
);

// For F2 and Delete in the explorer, and its right-click menu: the selected entry.
function selectedEntry(): { path: string; isDir: boolean } | null {
  const { selected, children } = explorer.useExplorer.getState();
  if (!selected) return null;
  const entry = Object.values(children)
    .flat()
    .find((e) => samePath(e.path, selected));
  return entry ? { path: entry.path, isDir: entry.isDir } : null;
}

export const saveFile = withActiveTab((tab) => save(tab));

export const saveFileAs = withActiveTab(async (tab) => {
  const path = await pickSavePath(tab.filePath ?? `${tabTitle(tab)}.strudel`);
  if (path) await save(tab, path);
});

export const closeActiveTab = withActiveTab((tab) => close(tab.id));

// Keys for these are in src/commands/keybindings.ts.
export const FILE_COMMANDS: Command[] = [
  { id: "file.new", label: "New File", run: newFile },
  { id: "file.open", label: "Open File…", run: openFile },
  { id: "file.openFolder", label: "Open Folder…", run: openFolder },
  { id: "file.save", label: "Save", run: saveFile },
  { id: "file.saveAs", label: "Save As…", run: saveFileAs },
  { id: "file.closeEditor", label: "Close Editor", run: closeActiveTab },
  { id: "file.closeFolder", label: "Close Folder", run: explorer.closeFolder },
  { id: "editor.next", label: "Next Editor", run: () => cycle(1) },
  { id: "editor.previous", label: "Previous Editor", run: () => cycle(-1) },
  {
    id: "explorer.rename",
    label: "Rename",
    run: () => {
      const entry = selectedEntry();
      if (entry) explorer.startRename(entry.path);
    },
  },
  {
    id: "explorer.delete",
    label: "Delete",
    run: () => {
      const entry = selectedEntry();
      if (entry) void deleteEntry(entry.path, entry.isDir);
    },
  },
];
