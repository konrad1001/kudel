import { relativePath, stem } from "../files/paths";
import { soundName } from "../samples/sampleMap";

// Importing audio from a link: reading what yt-dlp prints, naming the file, and
// describing progress. Pure; the store and the Rust command do the work.

export type Phase = "fetching" | "downloading" | "converting";

export interface Progress {
  phase: Phase;
  // 0 to 1, when the size is known.
  fraction: number | null;
  // Bytes per second.
  speed: number | null;
  // Seconds left.
  eta: number | null;
  // The video's title, once yt-dlp names the file it downloads.
  title: string | null;
  // The last ERROR line, which says why a failed import failed.
  error: string | null;
}

export const START: Progress = { phase: "fetching", fraction: null, speed: null, eta: null, title: null, error: null };

const num = (text: string | undefined): number | null => {
  const n = Number(text);
  return text !== undefined && text !== "NA" && Number.isFinite(n) ? n : null;
};

// What a line of yt-dlp's output changes. Progress lines come from the template in
// src-tauri/src/commands/import.rs ("[progress] downloaded total estimate speed eta").
// Fields yt-dlp doesn't know print as NA, which leaves the bar out.
export function readLine(progress: Progress, line: string): Progress {
  const template = /^\[progress\] (\S+) (\S+) (\S+) (\S+) (\S+)/.exec(line);
  if (template) {
    const [, done, total, estimate, speed, eta] = template;
    const size = num(total) ?? num(estimate);
    const got = num(done);
    return {
      ...progress,
      phase: "downloading",
      fraction: got !== null && size ? Math.min(1, got / size) : progress.fraction,
      speed: num(speed),
      eta: num(eta),
    };
  }
  const destination = /^\[download\] Destination: (.+)$/.exec(line);
  if (destination) return { ...progress, phase: "downloading", title: stem(destination[1]) };
  if (/^\[ExtractAudio\]/.test(line)) return { ...progress, phase: "converting", fraction: null, speed: null, eta: null };
  if (line.startsWith("ERROR:")) return { ...progress, error: line.slice("ERROR:".length).trim() };
  return progress;
}

const MAX_NAME = 48;

// The file name (without .wav) for a downloaded title: its sound name, so s("…") works,
// tidied a little since titles are long. "Amen Break (Original) - The Winstons" gives
// "amen_break_original-the_winstons". A clip adds its start: "amen_break-1m30s".
export function importName(title: string, clip: Clip | null = null): string {
  let name = soundName(title)
    .replace(/[-_]*-[-_]*/g, "-")
    .replace(/_{2,}/g, "_");
  if (name.length > MAX_NAME) {
    const cut = name.slice(0, MAX_NAME);
    const at = Math.max(cut.lastIndexOf("-"), cut.lastIndexOf("_"));
    name = at > MAX_NAME / 2 ? cut.slice(0, at) : cut;
  }
  return soundName(name) + clipSuffix(clip);
}

export const DEFAULT_IMPORT_DIR = "./imported";

// How the destination is kept: relative to the open folder ("./imported"). null when
// `picked` is outside it.
export function importDir(root: string, picked: string): string | null {
  const relative = relativePath(root, picked);
  return relative === null || relative.startsWith("../") ? null : relative;
}

// "./imported" shown as "./imported/".
export function dirLabel(dir: string): string {
  return dir.endsWith("/") ? dir : `${dir}/`;
}

// "[##########..........]" at `width` characters inside the brackets.
export function progressBar(fraction: number, width = 20): string {
  const filled = Math.round(Math.min(1, Math.max(0, fraction)) * width);
  return `[${"#".repeat(filled)}${".".repeat(width - filled)}]`;
}

export function percentText(fraction: number): string {
  return `${Math.floor(fraction * 100)}%`;
}

const UNITS = ["B", "KB", "MB", "GB"];

// 1950000 → "1.9 MB", in decimal units.
export function bytesText(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${UNITS[unit]}`;
}

// 75 → "1:15", 3723 → "1:02:03", 90.5 → "1:30.5".
export function clockText(seconds: number): string {
  const total = Math.max(0, Math.round(seconds * 100) / 100);
  const whole = Math.floor(total);
  const fraction = total - whole;
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, "0") + (fraction ? String(fraction.toFixed(2)).slice(1).replace(/0$/, "") : "");
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

// The part of a video to keep, in seconds. null at either end: from the start, or to the end.
export interface Clip {
  from: number | null;
  to: number | null;
}

// Seconds from "90", "1:30", "1:02:03" or "1:30.5"; null for anything else.
export function parseTime(text: string): number | null {
  const match = /^(?:(?:(\d+):)?(\d+):)?(\d+(?:\.\d+)?)$/.exec(text.trim());
  if (!match) return null;
  const [, h, m, s] = match;
  if ((h !== undefined || m !== undefined) && Number(s) >= 60) return null;
  if (h !== undefined && Number(m) >= 60) return null;
  return Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s);
}

// The clip the two fields describe: null when both are blank (the whole video), or
// why they don't describe one.
export function readClip(fromText: string, toText: string): { clip: Clip | null } | { error: string } {
  const read = (text: string) => (text.trim() ? parseTime(text) : null);
  const from = read(fromText);
  const to = read(toText);
  if (fromText.trim() && from === null) return { error: `"${fromText.trim()}" isn't a time` };
  if (toText.trim() && to === null) return { error: `"${toText.trim()}" isn't a time` };
  if (from !== null && to !== null && to <= from) return { error: '"to" is before "from"' };
  if (to === 0) return { error: '"to" is at the start' };
  return { clip: from === null && to === null ? null : { from: from || null, to } };
}

// "1:30–2:05", "1:30–end", "0:00–0:35", or "whole".
export function clipText(clip: Clip | null): string {
  if (!clip) return "whole";
  return `${clockText(clip.from ?? 0)}–${clip.to === null ? "end" : clockText(clip.to)}`;
}

// The clip's length when both ends are known: "0:35".
export function clipLength(clip: Clip | null): string | null {
  if (!clip || clip.to === null) return null;
  return clockText(clip.to - (clip.from ?? 0));
}

// A start time read from a link: YouTube's t= (90, 90s, 1m30s, 1h2m3s) in the query
// or after #, or start=. null when there is none.
export function urlStartTime(url: string): number | null {
  let params: URLSearchParams[];
  try {
    const parsed = new URL(url.trim());
    params = [parsed.searchParams, new URLSearchParams(parsed.hash.slice(1))];
  } catch {
    return null;
  }
  for (const p of params) {
    const value = p.get("t") ?? p.get("start");
    const match = value && /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s?)?$/.exec(value);
    if (!match || !value) continue;
    const [, h, m, s] = match;
    const seconds = Number(h ?? 0) * 3600 + Number(m ?? 0) * 60 + Number(s ?? 0);
    return seconds > 0 ? seconds : null;
  }
  return null;
}

// What a clip adds to the file name: its start, as "-1m30s" (or "-0s"), so clips of one
// video differ and sort by where they start. Nothing for the whole video.
export function clipSuffix(clip: Clip | null): string {
  if (!clip) return "";
  const whole = Math.floor(clip.from ?? 0);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  if (h) return `-${h}h${String(m).padStart(2, "0")}m${String(s).padStart(2, "0")}s`;
  return m ? `-${m}m${String(s).padStart(2, "0")}s` : `-${s}s`;
}

// The status bar's note while imports run: "↓ 52%", "↓ converting", or "↓ 2 imports".
export function statusText(running: Progress[]): string | null {
  if (running.length === 0) return null;
  if (running.length > 1) return `↓ ${running.length} imports`;
  const [progress] = running;
  if (progress.phase === "converting") return "↓ converting";
  return progress.fraction === null ? "↓ importing" : `↓ ${percentText(progress.fraction)}`;
}

// "ffmpeg version 7.1-full_build-www.gyan.dev Copyright ..." → "7.1-full_build-www.gyan.dev".
// yt-dlp prints only its version.
export function versionText(line: string): string {
  return /\bversion (\S+)/.exec(line)?.[1] ?? line;
}
