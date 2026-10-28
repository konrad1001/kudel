import { baseName } from "./paths";
import type { LineEnding } from "./text";

// An open editor. Its text lives in the engine under the same id.
export interface Tab {
  id: string;
  // null until the text has been opened from or saved to a file.
  filePath: string | null;
  // The n of "Untitled-n" while there is no file.
  untitled: number | null;
  lineEnding: LineEnding;
  // The text as last opened or saved; the tab is dirty when the editor text differs.
  savedCode: string;
  dirty: boolean;
}

export function tabTitle(tab: Pick<Tab, "filePath" | "untitled">): string {
  return tab.filePath ? baseName(tab.filePath) : `Untitled-${tab.untitled ?? 1}`;
}

// The lowest Untitled number not in use, as VS Code numbers new files.
export function nextUntitled(tabs: Pick<Tab, "untitled">[]): number {
  const used = new Set(tabs.map((t) => t.untitled));
  let n = 1;
  while (used.has(n)) n++;
  return n;
}

// Where a new tab goes: right after the active one, or at the end.
export function insertIndex(ids: string[], activeId: string | null): number {
  const active = activeId === null ? -1 : ids.indexOf(activeId);
  return active === -1 ? ids.length : active + 1;
}

// Which tab is active after `closing` closes: unchanged unless it was the active
// one, then its right neighbour, else its left, else none.
export function activeAfterClose(ids: string[], closing: string, activeId: string | null): string | null {
  if (closing !== activeId) return activeId;
  const i = ids.indexOf(closing);
  return ids[i + 1] ?? ids[i - 1] ?? null;
}

// The tab `step` places away from the active one, wrapping around.
export function cycleTab(ids: string[], activeId: string | null, step: 1 | -1): string | null {
  if (ids.length === 0) return null;
  const i = activeId === null ? -1 : ids.indexOf(activeId);
  if (i === -1) return ids[0];
  return ids[(i + step + ids.length) % ids.length];
}
