import * as engine from "../engine";
import { activateTab, openRestoredTab } from "../files/actions";
import { restoreExplorer, useExplorer } from "../files/explorerStore";
import { askCloseAnyway, loadSession, onWindowClose, readTextFile, saveSession } from "../files/native";
import { useRecent } from "../files/recentStore";
import { useTabs } from "../files/tabsStore";
import { decodeFile } from "../files/text";
import { setImportDir, useImport } from "../importer/importStore";
import { useKeys } from "../keys/keysStore";
import { useLayout } from "../layout/layoutStore";
import { flushSynths } from "../synth/synthStore";
import { parseSession, restoreTab, serializeSession, type Session } from "./session";

// Saving shortly after changes means a crash or a killed process loses at most this much.
const SAVE_DELAY_MS = 1000;

function currentSession(): Session {
  const { tabs, activeId } = useTabs.getState();
  const activeIndex = tabs.findIndex((tab) => tab.id === activeId);
  const explorer = useExplorer.getState();
  const { files, folders } = useRecent.getState();
  const { octave, sound, length } = useKeys.getState();
  return {
    folder: explorer.root,
    expanded: explorer.root ? Object.keys(explorer.expanded).filter((dir) => dir !== explorer.root) : [],
    layout: useLayout.getState(),
    tabs: tabs.map((tab) => {
      const code = engine.getDocCode(tab.id);
      return {
        filePath: tab.filePath,
        untitled: tab.untitled,
        lineEnding: tab.lineEnding,
        // A saved file is read back from disk; only unsaved text needs keeping.
        code: tab.filePath === null || code !== tab.savedCode ? code : null,
        selection: engine.getDocSelection(tab.id),
      };
    }),
    active: activeIndex === -1 ? null : activeIndex,
    recentFiles: files,
    recentFolders: folders,
    keys: { octave, sound, length },
    importDir: useImport.getState().dir,
  };
}

async function restore(): Promise<void> {
  // Never over open work: after a hot reload the stores may still hold it.
  if (useTabs.getState().tabs.length > 0 || useExplorer.getState().root) return;
  const session = parseSession(await loadSession().catch(() => null));
  useRecent.setState({ files: session.recentFiles, folders: session.recentFolders });
  useLayout.setState(session.layout);
  useKeys.setState(session.keys);
  setImportDir(session.importDir);
  await restoreExplorer({ root: session.folder, expanded: session.expanded });
  let activeId: string | null = null;
  let lastId: string | null = null;
  for (const [index, tab] of session.tabs.entries()) {
    const disk = tab.filePath
      ? await readTextFile(tab.filePath).then(decodeFile, () => null)
      : null;
    const restored = restoreTab(tab, disk);
    if (!restored) continue;
    lastId = openRestoredTab(restored.code, tab.filePath, restored.lineEnding, {
      savedCode: restored.savedCode,
      untitled: tab.untitled,
      selection: tab.selection,
    });
    if (index === session.active) activeId = lastId;
  }
  const show = activeId ?? lastId;
  if (show) {
    activateTab(show);
    engine.revealCursor();
  }
}

// Once per page load: StrictMode runs effects twice, and the second run must not
// open everything again.
let restoring: Promise<void> | null = null;
export function restoreSessionOnce(): Promise<void> {
  restoring ??= restore().catch((err) => console.error("Could not restore the session", err));
  return restoring;
}

// Saves the session a moment after anything in it changes, and once more when the
// window closes. Returns a function that stops (for effect cleanup and hot reload).
export function persistSession(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => saveSession(serializeSession(currentSession()));
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void save().catch((err) => console.error("Could not save the session", err)), SAVE_DELAY_MS);
  };
  const stops = [
    useTabs.subscribe(schedule),
    useExplorer.subscribe(schedule),
    useRecent.subscribe(schedule),
    useLayout.subscribe(schedule),
    // Only the settings: playing notes changes the rest many times a second.
    useKeys.subscribe((s, prev) => {
      if (s.octave !== prev.octave || s.sound !== prev.sound || s.length !== prev.length) schedule();
    }),
    // Only the destination: progress changes many times a second.
    useImport.subscribe((s, prev) => {
      if (s.dir !== prev.dir) schedule();
    }),
    engine.onCodeChange(schedule),
    onWindowClose(async () => {
      clearTimeout(timer);
      // The Synth view's file has no close handler of its own: two would race to close.
      await flushSynths().catch((err) => console.error("Could not save the synths", err));
      try {
        await save();
        return true;
      } catch (err) {
        return askCloseAnyway(`Could not save the session: ${String(err)}`);
      }
    }),
  ];
  return () => {
    clearTimeout(timer);
    stops.forEach((stop) => stop());
  };
}
