// Path helpers for display and comparison. Paths themselves are always built by
// Rust or the native dialogs, never joined here.

export function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

// The folder a file is in: everything before the last separator.
export function dirName(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const cut = Math.max(trimmed.lastIndexOf("\\"), trimmed.lastIndexOf("/"));
  if (cut === -1) return trimmed;
  // Keep the separator of a drive root, so "C:\kick.wav" gives "C:\".
  return cut === 2 && trimmed[1] === ":" ? trimmed.slice(0, 3) : trimmed.slice(0, cut);
}

// How code in `fromDir` names `to`: "./drums", "../shared/drums", or "./" for the
// folder itself, always with forward slashes. null when they are on different drives.
export function relativePath(fromDir: string, to: string): string | null {
  const parts = (p: string) => p.split(/[\\/]+/).filter(Boolean);
  const from = parts(fromDir);
  const target = parts(to);
  if (from[0]?.toLowerCase() !== target[0]?.toLowerCase()) return null;
  let shared = 0;
  while (
    shared < from.length &&
    shared < target.length &&
    from[shared].toLowerCase() === target[shared].toLowerCase()
  ) {
    shared++;
  }
  const up = from.length - shared;
  const down = target.slice(shared).join("/");
  if (up === 0) return `./${down}`;
  return "../".repeat(up) + down;
}

// A file name without its extension.
export function stem(path: string): string {
  return baseName(path).replace(/\.[^.]+$/, "");
}

// Windows paths: case-insensitive, either separator, no trailing separator.
const normal = (p: string) => p.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();

export function samePath(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return normal(a) === normal(b);
}

// Whether `path` is `dir` itself or anything inside it.
export function isWithin(path: string | null, dir: string): boolean {
  if (!path) return false;
  const p = normal(path);
  const d = normal(dir);
  return p === d || p.startsWith(`${d}\\`);
}

// Where `path` is after `from` (a file or folder) was renamed to `to`: `to` itself, the
// same place inside `to`, or unchanged when it wasn't in `from`.
export function movedPath(path: string, from: string, to: string): string {
  if (!isWithin(path, from)) return path;
  const rest = path.replace(/\//g, "\\").slice(normal(from).length);
  return to.replace(/[\\/]+$/, "") + rest;
}

// The part of a name a rename box selects at first: the name without its extension
// (as in VS Code), or all of it for a folder or a name without one.
export function renameSelection(name: string, isDir: boolean): [number, number] {
  const dot = name.lastIndexOf(".");
  return isDir || dot <= 0 ? [0, name.length] : [0, dot];
}

// Files the editor opens; the explorer shows everything else dimmed.
export function isCodeFile(name: string): boolean {
  return /\.(strudel|js)$/i.test(name);
}

// What WebView2 can decode. Keep in step with AUDIO_EXTENSIONS in
// src-tauri/src/commands/samples.rs.
export function isAudioFile(name: string): boolean {
  return /\.(wav|mp3|ogg|flac|m4a)$/i.test(name);
}

// A new file typed without an extension becomes a .strudel file.
export function withDefaultExtension(name: string): string {
  const trimmed = name.trim();
  return /\.[^.]+$/.test(trimmed) ? trimmed : `${trimmed}.strudel`;
}

// `name` is the active tab's title, or null when no editor is open.
export function windowTitle(name: string | null, dirty: boolean): string {
  if (name === null) return "Strudel Studio";
  return `${dirty ? "● " : ""}${name} - Strudel Studio`;
}
