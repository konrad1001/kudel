import { create } from "zustand";
import { pushRecent, withoutPath } from "../session/session";
import { isWithin, movedPath } from "./paths";

// Recently opened files and folders, most recent first. Saved with the session.
export const useRecent = create<{ files: string[]; folders: string[] }>(() => ({
  files: [],
  folders: [],
}));

export function addRecentFile(path: string): void {
  useRecent.setState((s) => ({ files: pushRecent(s.files, path) }));
}

export function addRecentFolder(path: string): void {
  useRecent.setState((s) => ({ folders: pushRecent(s.folders, path) }));
}

// For entries that no longer open (moved or deleted).
export function forgetRecent(path: string): void {
  useRecent.setState((s) => ({ files: withoutPath(s.files, path), folders: withoutPath(s.folders, path) }));
}

// After a rename: entries at or inside `from` follow it to `to`.
export function moveRecent(from: string, to: string): void {
  const move = (list: string[]) => list.map((p) => movedPath(p, from, to));
  useRecent.setState((s) => ({ files: move(s.files), folders: move(s.folders) }));
}

// After a delete: entries at or inside `path` go.
export function forgetRecentWithin(path: string): void {
  const keep = (list: string[]) => list.filter((p) => !isWithin(p, path));
  useRecent.setState((s) => ({ files: keep(s.files), folders: keep(s.folders) }));
}
