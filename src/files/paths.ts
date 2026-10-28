// Path helpers for display and comparison. Paths themselves are always built by
// Rust or the native dialogs, never joined here.

export function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
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

// A new file typed without an extension becomes a .strudel file.
export function withDefaultExtension(name: string): string {
  const trimmed = name.trim();
  return /\.[^.]+$/.test(trimmed) ? trimmed : `${trimmed}.strudel`;
}

export function windowTitle(filePath: string | null, dirty: boolean): string {
  const name = filePath ? baseName(filePath) : "Untitled";
  return `${dirty ? "● " : ""}${name} - Strudel Studio`;
}
