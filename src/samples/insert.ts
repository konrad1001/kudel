import * as engine from "../engine";
import { sampleInsertChanges } from "../editor/sampleCode";
import type { DraggedSample, DropTarget } from "../editor/sampleDrop";
import { scanSampleFolder, showError } from "../files/native";
import { baseName, dirName, relativePath, samePath } from "../files/paths";
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
export async function insertDroppedSample(
  item: DraggedSample,
  target: DropTarget,
): Promise<void> {
  try {
    const base = sampleBaseDir();
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
    const { changes, cursor } = sampleInsertChanges(engine.getCode(), {
      samplesPath,
      name,
      ...target,
    });
    engine.dispatchChanges(changes, cursor);
    engine.focusEditor();
  } catch (err) {
    await showError(err instanceof Error ? err.message : String(err));
  }
}
