import { create } from "zustand";
import { allowAssetFolder, listDir, type DirEntry } from "./native";

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
  rootMissing: boolean;
  visible: boolean;
  width: number;
}

export const useExplorer = create<ExplorerState>(() => ({
  root: null,
  children: {},
  expanded: {},
  targetDir: null,
  creatingIn: null,
  rootMissing: false,
  visible: true,
  width: 240,
}));

const set = useExplorer.setState;
const get = useExplorer.getState;

export const MIN_WIDTH = 160;
export const MAX_WIDTH = 600;

export async function setRoot(root: string): Promise<void> {
  set({
    root,
    children: {},
    expanded: { [root]: true },
    targetDir: root,
    creatingIn: null,
    rootMissing: false,
    visible: true,
  });
  // So audio files in the folder can be previewed. A refusal only disables previews.
  allowAssetFolder(root).catch(() => {});
  await refresh();
}

export function closeFolder(): void {
  set({
    root: null,
    children: {},
    expanded: {},
    targetDir: null,
    creatingIn: null,
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
  set({ targetDir: dir });
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

export function selectFile(parentDir: string): void {
  set({ targetDir: parentDir });
}

export function collapseAll(): void {
  const { root } = get();
  if (root) set({ expanded: { [root]: true } });
}

export async function startNewFile(): Promise<void> {
  const { root, targetDir, expanded } = get();
  const dir = targetDir ?? root;
  if (!dir) return;
  set({ creatingIn: dir, visible: true });
  if (!expanded[dir]) await expandDir(dir);
}

export function cancelNewFile(): void {
  set({ creatingIn: null });
}

export function toggleExplorer(): void {
  set((s) => ({ visible: !s.visible }));
}

export function setWidth(width: number): void {
  set({ width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width))) });
}
