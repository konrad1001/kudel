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

// A file name without its extension.
export function stem(path: string): string {
  return baseName(path).replace(/\.[^.]+$/, "");
}

// Windows paths: case-insensitive, either separator, no trailing separator.
export function samePath(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const normal = (p: string) => p.replace(/\//g, "\\").replace(/\\+$/, "").toLowerCase();
  return normal(a) === normal(b);
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
