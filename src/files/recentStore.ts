import { create } from "zustand";
import { pushRecent, withoutPath } from "../session/session";

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
