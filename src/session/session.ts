import { samePath } from "../files/paths";
import type { LineEnding } from "../files/text";
import { DEFAULT_KEYS_SETTINGS, parseKeysSettings, type KeysSettings } from "../keys/notes";
import { DEFAULT_LAYOUT, parseRegion, type Layout } from "../layout/layout";

// What was open when the app last closed, so the next start picks up where it left
// off (VS Code's "hot exit"). Kept in the app data folder; the user's own files are
// only ever written by Save.

export interface Selection {
  anchor: number;
  head: number;
}

export interface SessionTab {
  filePath: string | null;
  untitled: number | null;
  lineEnding: LineEnding;
  // The editor text, kept only when it differs from the file (or there is no file).
  code: string | null;
  selection: Selection;
}

export interface Session {
  folder: string | null;
  expanded: string[];
  layout: Layout;
  tabs: SessionTab[];
  active: number | null;
  recentFiles: string[];
  recentFolders: string[];
  keys: KeysSettings;
}

export const EMPTY_SESSION: Session = {
  folder: null,
  expanded: [],
  layout: DEFAULT_LAYOUT,
  tabs: [],
  active: null,
  recentFiles: [],
  recentFolders: [],
  keys: DEFAULT_KEYS_SETTINGS,
};

const VERSION = 1;
export const MAX_RECENT = 10;

export function serializeSession(session: Session): string {
  return JSON.stringify({ version: VERSION, ...session }, null, 2);
}

const isString = (v: unknown): v is string => typeof v === "string";
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter(isString) : []);
const nat = (v: unknown, fallback: number) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : fallback);

function parseTab(raw: unknown): SessionTab | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const filePath = isString(t.filePath) ? t.filePath : null;
  const code = isString(t.code) ? t.code : null;
  if (filePath === null && code === null) return null;
  const sel = (t.selection ?? {}) as Record<string, unknown>;
  const anchor = nat(sel.anchor, 0);
  return {
    filePath,
    untitled: filePath === null ? nat(t.untitled, 1) || 1 : null,
    lineEnding: t.lineEnding === "\r\n" ? "\r\n" : "\n",
    code,
    selection: { anchor, head: nat(sel.head, anchor) },
  };
}

// Reads a session file, keeping whatever parts are usable. Missing, corrupt or
// unknown-version files give an empty session rather than an error.
export function parseSession(text: string | null): Session {
  if (!text) return EMPTY_SESSION;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text);
  } catch {
    return EMPTY_SESSION;
  }
  if (!raw || typeof raw !== "object" || raw.version !== VERSION) return EMPTY_SESSION;
  const tabs = Array.isArray(raw.tabs) ? raw.tabs.map(parseTab).filter((t) => t !== null) : [];
  const active = nat(raw.active, -1);
  const layout = (raw.layout ?? {}) as Record<string, unknown>;
  return {
    folder: isString(raw.folder) ? raw.folder : null,
    expanded: strings(raw.expanded),
    layout: {
      // Sessions from before the layout kept only the explorer's visibility and width.
      sidebar: parseRegion("sidebar", layout.sidebar ?? { visible: raw.explorerVisible, size: raw.explorerWidth }),
      panel: parseRegion("panel", layout.panel),
    },
    tabs,
    active: active >= 0 && active < tabs.length ? active : tabs.length > 0 ? 0 : null,
    recentFiles: strings(raw.recentFiles).slice(0, MAX_RECENT),
    recentFolders: strings(raw.recentFolders).slice(0, MAX_RECENT),
    keys: parseKeysSettings(raw.keys),
  };
}

// How a saved tab comes back, given its file as it is on disk now (null if it can't
// be read). The tab is dirty when `code` differs from `savedCode`. null: drop it.
//   file still there      -> its text, or the unsaved text kept for it
//   file gone             -> the unsaved text, still dirty, so Save recreates it;
//                            dropped if there was none (nothing to lose)
//   untitled              -> its text; dropped if empty
export function restoreTab(
  tab: SessionTab,
  disk: { code: string; lineEnding: LineEnding } | null,
): { code: string; savedCode: string; lineEnding: LineEnding } | null {
  if (tab.filePath !== null && disk) {
    return { code: tab.code ?? disk.code, savedCode: disk.code, lineEnding: disk.lineEnding };
  }
  if (tab.code === null || tab.code === "") return null;
  return { code: tab.code, savedCode: "", lineEnding: tab.lineEnding };
}

// Most recent first, no duplicates (Windows paths compare without case), capped.
export function pushRecent(list: string[], path: string, max = MAX_RECENT): string[] {
  return [path, ...list.filter((p) => !samePath(p, path))].slice(0, max);
}

export function withoutPath(list: string[], path: string): string[] {
  return list.filter((p) => !samePath(p, path));
}
