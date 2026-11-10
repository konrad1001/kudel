import { byLine } from "./codeLayout";
import {
  DEFAULT_SETTINGS,
  normalize,
  PARAMS,
  patchEntries,
  type Settings,
  type Value,
} from "./controls";

// A named sound from the Synth view: its settings, by param id.
export interface Patch {
  name: string;
  settings: Settings;
}

export const DEFAULT_NAME = "synth";

export function defaultPatch(name = DEFAULT_NAME): Patch {
  return { name, settings: { ...DEFAULT_SETTINGS } };
}

// A name usable as a JavaScript const: letters, digits, _ and $, not starting with a digit.
// "my bass!" → "my_bass_", "808" → "_808", "" → "synth".
export function identifierFor(name: string): string {
  const id = name.trim().replace(/[^\w$]/g, "_");
  if (!id) return DEFAULT_NAME;
  return /^\d/.test(id) ? `_${id}` : id;
}

// Words a const can't be called.
const RESERVED = new Set(
  (
    "break case catch class const continue debugger default delete do else export extends false finally for " +
    "function if import in instanceof let new null return super switch this throw true try typeof var void " +
    "while with yield await enum implements interface package private protected public static"
  ).split(" "),
);

export function isReserved(id: string): boolean {
  return RESERVED.has(id);
}

// Single quotes: Strudel's transpiler turns double-quoted strings into mini-notation
// patterns, and .set() needs plain values.
export function literal(value: Value): string {
  if (Array.isArray(value)) return `[${value.join(", ")}]`;
  return typeof value === "number" ? String(value) : `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

// The code for a patch: a const object of Strudel controls, one line per category
// (codeLayout.ts), used as note("…").set(name).
//
//   const bass = {
//     s: 'supersaw', unison: 5, detune: 0.18, spread: 0.6,
//     cutoff: 800, resonance: 6,
//     attack: 0.005, decay: 0.3, sustain: 0.7, release: 0.2,
//   }
export function patchCode(patch: Patch): string {
  const lines = byLine(patchEntries(patch.settings), (entry) => entry.control);
  const body = lines.map((line) => `  ${line.map(({ control, value }) => `${control}: ${literal(value)}`).join(", ")},`).join("\n");
  return `const ${identifierFor(patch.name)} = {\n${body}\n}\n`;
}

// Settings read from a saved file: every param present and usable, whatever was missing,
// unknown or out of range replaced by its default.
export function parseSettings(raw: unknown): Settings {
  const r = migrateFilter(raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {});
  return Object.fromEntries(PARAMS.map((p) => [p.id, p.id in r ? normalize(p, r[p.id]) : p.default]));
}

// Patches saved before the lowpass and highpass were separate had one filter with a
// mode (filter: "lp" | "hp" | "bp") and settings named freq, q, fenv, fattack, ...
// A lowpass or bandpass becomes the lowpass (with its envelope), a highpass the highpass.
function migrateFilter(r: Record<string, unknown>): Record<string, unknown> {
  if (!("filter" in r)) return r;
  const { filter, freq, q, fenv, fattack, fdecay, fsustain, frelease, ...rest } = r;
  if (filter === "lp" || filter === "bp") {
    return { ...rest, lp: "on", cutoff: freq, resonance: q, lpenv: fenv, lpattack: fattack, lpdecay: fdecay, lpsustain: fsustain, lprelease: frelease };
  }
  if (filter === "hp") return { ...rest, hp: "on", hcutoff: freq, hresonance: q };
  return rest;
}

export function parsePatch(raw: unknown): Patch | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || !r.name.trim()) return null;
  return { name: r.name, settings: parseSettings(r.settings) };
}

// What synths.json in the app data folder holds: the patch being edited and the saved
// ones, by name (a later one with the same name wins).
export interface SynthFile {
  current: Patch;
  saved: Patch[];
}

export function parseSynthFile(text: string | null): SynthFile {
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = text ? JSON.parse(text) : {};
    if (parsed && typeof parsed === "object") raw = parsed as Record<string, unknown>;
  } catch {
    // A broken file starts over, like a missing one.
  }
  const saved = new Map<string, Patch>();
  for (const item of Array.isArray(raw.saved) ? raw.saved : []) {
    const patch = parsePatch(item);
    if (patch) saved.set(patch.name, patch);
  }
  return { current: parsePatch(raw.current) ?? defaultPatch(), saved: [...saved.values()] };
}

export function serializeSynthFile(file: SynthFile): string {
  return JSON.stringify({ version: 1, ...file }, null, 2);
}

// Adds a patch to the saved list, replacing one of the same name in place.
export function savePatch(saved: Patch[], patch: Patch): Patch[] {
  const copy = { name: patch.name, settings: { ...patch.settings } };
  const at = saved.findIndex((p) => p.name === patch.name);
  if (at === -1) return [...saved, copy];
  return saved.map((p, i) => (i === at ? copy : p));
}

// A note an octave or more up or down: "c3" +1 → "c4", "a#" (octave 3 implied) -1 →
// "a#2", MIDI 60 +1 → 72. Anything else is left as it is.
export function shiftOctave(note: string, step: number): string {
  if (/^\d+$/.test(note.trim())) return String(Math.min(127, Math.max(0, Number(note) + 12 * step)));
  const match = /^([a-g](?:#|b|s|f)*)(-?\d+)?$/i.exec(note.trim());
  if (!match) return note;
  const octave = Math.min(9, Math.max(0, Number(match[2] ?? 3) + step));
  return `${match[1]}${octave}`;
}

// Separators between a chord's notes: spaces, commas, and mini-notation's brackets.
const CHORD_SEPARATORS = /[\s,[\]]+/;

// The notes a field lists, to play together: "c3 e3 g3", "c3,e3,g3" or "[c3,e3,g3]".
// MIDI numbers come back as numbers. Empty means c3.
export function parseChord(text: string): (string | number)[] {
  const notes = text.split(CHORD_SEPARATORS).filter(Boolean);
  if (notes.length === 0) return ["c3"];
  return notes.map((note) => (/^\d+$/.test(note) ? Number(note) : note));
}

// The octave the note field is in, for the letter keys: the first note's, from its name
// ("c3", "eb2") or its MIDI number (60 is octave 4). 3 when there's none.
export function chordOctave(text: string): number {
  const first = parseChord(text)[0];
  if (typeof first === "number") return Math.floor(first / 12) - 1;
  const match = /^[a-g](?:#|b|s|f)*(-?\d+)$/i.exec(first);
  return match ? Number(match[1]) : 3;
}

// Every note of a chord an octave or more up or down, keeping how it was written.
export function shiftChord(text: string, step: number): string {
  return text
    .split(/([\s,[\]]+)/)
    .map((part) => (part && !CHORD_SEPARATORS.test(part) ? shiftOctave(part, step) : part))
    .join("");
}
