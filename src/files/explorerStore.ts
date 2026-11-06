import { create } from "zustand";
import { isTextField, registerContextKey } from "../commands/when";
import { showView } from "../layout/layoutStore";
import { allowAssetFolder, listDir, type DirEntry } from "./native";
import { dirName, isWithin, movedPath } from "./paths";

// The explorer sidebar: the open folder and how it is expanded. UI-only state.
interface ExplorerState {
  root: string | null;
  // Folder path to its entries, for the root and every expanded folder.
  children: Record<string, DirEntry[]>;
  expanded: Record<string, true>;
  // Where New File creates its file: the last clicked folder, or the folder of the
  // last clicked file.
  targetDir: string | null;
  // The folder showing the new-file name box, if any.
  creatingIn: string | null;
  // The last clicked entry: what F2 renames and Delete deletes.
  selected: string | null;
  // The entry showing the rename box, if any.
  renaming: string | null;
  rootMissing: boolean;
}

export const useExplorer = create<ExplorerState>(() => ({
  root: null,
  children: {},
  expanded: {},
  targetDir: null,
  creatingIn: null,
  selected: null,
  renaming: null,
  rootMissing: false,
}));

const set = useExplorer.setState;
const get = useExplorer.getState;

// Focus is in the explorer's tree, but not in a name box: F2 and Delete act on the selection.
registerContextKey("explorerFocus", () => {
  const el = document.activeElement;
  return !!el?.closest(".explorer") && !isTextField(el);
});

export async function setRoot(root: string): Promise<void> {
  set({
    root,
    children: {},
    expanded: { [root]: true },
    targetDir: root,
    creatingIn: null,
    rootMissing: false,
  });
  showView("explorer");
  // So audio files in the folder can be previewed. A refusal only disables previews.
  allowAssetFolder(root).catch(() => {});
  await refresh();
}

// Puts the explorer back as a session left it. A folder that is gone isn't opened.
export async function restoreExplorer(view: { root: string | null; expanded: string[] }): Promise<void> {
  if (!view.root) return;
  set({
    root: view.root,
    children: {},
    expanded: Object.fromEntries([view.root, ...view.expanded].map((dir) => [dir, true as const])),
    targetDir: view.root,
    creatingIn: null,
    rootMissing: false,
  });
  allowAssetFolder(view.root).catch(() => {});
  await refresh();
  if (get().rootMissing) closeFolder();
}

export function closeFolder(): void {
  set({
    root: null,
    children: {},
    expanded: {},
    targetDir: null,
    creatingIn: null,
    selected: null,
    renaming: null,
    rootMissing: false,
  });
}

// Re-reads the root and every expanded folder. Folders that disappeared collapse.
export async function refresh(): Promise<void> {
  const { root, expanded } = get();
  if (!root) return;
  const dirs = Object.keys(expanded);
  const listed = await Promise.all(
    dirs.map((dir) => listDir(dir).catch(() => null)),
  );
  if (get().root !== root) return;
  const children: Record<string, DirEntry[]> = {};
  const stillExpanded: Record<string, true> = { [root]: true };
  dirs.forEach((dir, i) => {
    const entries = listed[i];
    if (!entries) return;
    children[dir] = entries;
    stillExpanded[dir] = true;
  });
  set({ children, expanded: stillExpanded, rootMissing: !children[root] });
}

export async function toggleDir(dir: string): Promise<void> {
  const { expanded } = get();
  set({ targetDir: dir, selected: dir });
  if (expanded[dir]) {
    const { [dir]: _collapsed, ...rest } = expanded;
    set({ expanded: rest });
    return;
  }
  await expandDir(dir);
}

async function expandDir(dir: string): Promise<void> {
  set((s) => ({ expanded: { ...s.expanded, [dir]: true } }));
  try {
    const entries = await listDir(dir);
    set((s) => ({ children: { ...s.children, [dir]: entries } }));
  } catch {
    const { [dir]: _failed, ...rest } = get().expanded;
    set({ expanded: rest });
  }
}

export function selectFile(parentDir: string, path?: string): void {
  set({ targetDir: parentDir, ...(path && { selected: path }) });
}

export function startRename(path: string): void {
  set({ renaming: path, selected: path, creatingIn: null });
}

export function cancelRename(): void {
  set({ renaming: null });
}

// After a rename on disk: expanded folders, the selection and New File's target follow
// it. Call refresh() afterwards to list the new names.
export function followMove(from: string, to: string): void {
  const { expanded, targetDir, selected, children } = get();
  const move = (path: string) => movedPath(path, from, to);
  set({
    expanded: Object.fromEntries(Object.keys(expanded).map((dir) => [move(dir), true as const])),
    children: Object.fromEntries(Object.entries(children).map(([dir, entries]) => [move(dir), entries])),
    targetDir: targetDir && move(targetDir),
    selected: selected && move(selected),
    renaming: null,
  });
}

// After a delete: nothing points at it or inside it any more.
export function forgetWithin(path: string): void {
  const { targetDir, selected } = get();
  set({
    targetDir: isWithin(targetDir, path) ? dirName(path) : targetDir,
    selected: isWithin(selected, path) ? null : selected,
    renaming: null,
  });
}

export function collapseAll(): void {
  const { root } = get();
  if (root) set({ expanded: { [root]: true } });
}

export async function startNewFile(): Promise<void> {
  const { root, targetDir, expanded } = get();
  const dir = targetDir ?? root;
  if (!dir) return;
  set({ creatingIn: dir });
  showView("explorer");
  if (!expanded[dir]) await expandDir(dir);
}

export function cancelNewFile(): void {
  set({ creatingIn: null });
}
