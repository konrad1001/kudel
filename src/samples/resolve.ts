import { useExplorer } from "../files/explorerStore";
import { assetUrl, scanSampleFolder } from "../files/native";
import { dirName } from "../files/paths";
import { useTabs } from "../files/tabsStore";
import { buildSampleMap } from "./sampleMap";

// Paths in samples("./drums") start from the folder of the document's file, so a
// project keeps working when its folder moves. An unsaved document uses the open
// folder instead.
export function sampleBaseDir(docId: string | null): string | null {
  const tab = useTabs.getState().tabs.find((t) => t.id === docId);
  if (tab?.filePath) return dirName(tab.filePath);
  return useExplorer.getState().root;
}

// The engine's LocalSampleResolver; `docId` is the document being evaluated. Errors
// become Error objects so the error bar shows them (Tauri rejects with plain strings).
export async function resolveLocalSamples(path: string, docId: string | null): Promise<Record<string, string[]>> {
  const base = sampleBaseDir(docId);
  if (!base) {
    throw new Error(`samples("${path}"): save this file or open a folder first; ./ paths start from the file's folder`);
  }
  let folder;
  try {
    folder = await scanSampleFolder(base, path);
  } catch (err) {
    throw new Error(`samples("${path}"): ${String(err)}`);
  }
  const map = buildSampleMap(folder, assetUrl);
  if (Object.keys(map).length === 0) {
    throw new Error(`samples("${path}"): no audio files in ${folder.path}`);
  }
  return map;
}
