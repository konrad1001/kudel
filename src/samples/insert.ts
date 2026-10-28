import * as engine from "../engine";
import { sampleInsertChanges } from "../editor/sampleCode";
import type { DraggedSample, DropTarget } from "../editor/sampleDrop";
import { dropPointUnchanged } from "../editor/sampleCode";
import { scanSampleFolder, showError } from "../files/native";
import { baseName, dirName, relativePath, samePath } from "../files/paths";
import { useTabs } from "../files/tabsStore";
import { sampleBaseDir } from "./resolve";
import { soundsInFolder } from "./sampleMap";

// What a dragged item means in code: the folder to pass to samples(), and the sound
// to write (null for a folder).
//   folder     -> samples(the folder): its files and sound folders become its sounds
//   audio file -> samples(its folder), and the file's sound name
async function soundFor(
  item: DraggedSample,
): Promise<{ bank: string; name: string | null }> {
  if (item.isDir) {
    const folder = await scanSampleFolder(item.path, ".");
    if (folder.files.length === 0 && folder.folders.length === 0) {
      throw new Error(`No audio files in ${baseName(item.path)}.`);
    }
    return { bank: folder.path, name: null };
  }
  // Scan the folder so the name matches what samples() will register (clashes included).
  const bank = await scanSampleFolder(dirName(item.path), ".");
  const name =
    soundsInFolder(bank).find((s) => samePath(s.source, item.path))?.name ??
    null;
  return { bank: bank.path, name };
}

// Writes samples('./…') (if missing) and the sound name where the item was dropped.
// Called straight from the drop event, so the active tab is the one dropped on; it is
// pinned before the folder scans, in case the tab changes while they run.
export async function insertDroppedSample(
  item: DraggedSample,
  target: DropTarget,
): Promise<void> {
  const docId = useTabs.getState().activeId;
  if (docId === null) return;
  const codeAtDrop = engine.getDocCode(docId);
  try {
    const base = sampleBaseDir(docId);
    if (!base)
      throw new Error(
        "Save this file or open a folder first: sample paths start from the file's folder.",
      );
    const { bank, name } = await soundFor(item);
    const samplesPath = relativePath(base, bank);
    if (!samplesPath)
      throw new Error(
        `${bank} is on a different drive from this file, so it has no relative path.`,
      );
    if (!useTabs.getState().tabs.some((t) => t.id === docId)) return;
    const code = engine.getDocCode(docId);
    // Edits after the drop point don't move it; edits before it do.
    if (!dropPointUnchanged(codeAtDrop, code, target.pos)) {
      throw new Error("The code changed while the sample was loading. Drop it again.");
    }
    const { changes, cursor } = sampleInsertChanges(code, {
      samplesPath,
      name,
      ...target,
    });
    engine.dispatchChanges(docId, changes, cursor);
    if (useTabs.getState().activeId === docId) engine.focusEditor();
  } catch (err) {
    await showError(err instanceof Error ? err.message : String(err));
  }
}
