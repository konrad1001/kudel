// Notes for the Keys view: which letter plays what, how notes are named in
// mini-notation, and the settings the view keeps between sessions. Pure, no audio.

// The computer-keyboard letters for C up to the next C, in the usual DAW layout: the
// home row plays the white keys, the row above it the black ones. Index = semitone.
export const KEY_LETTERS = ["A", "W", "S", "E", "D", "F", "T", "G", "Y", "H", "U", "J", "K"] as const;

const NAMES = ["c", "c#", "d", "d#", "e", "f", "f#", "g", "g#", "a", "a#", "b"];

export const MIN_OCTAVE = 1;
export const MAX_OCTAVE = 7;

export const isBlackKey = (semitone: number): boolean => [1, 3, 6, 8, 10].includes(semitone % 12);

// The mini-notation name of the note `semitone` steps above C in `octave`, lowercase
// with sharps as "#": noteName(4, 1) is "c#4". Steps past B carry into the next octave.
export function noteName(octave: number, semitone: number): string {
  return NAMES[semitone % 12] + (octave + Math.floor(semitone / 12));
}

// The MIDI number Strudel's noteToMidi gives for that name (c4 is 60).
export function noteMidi(octave: number, semitone: number): number {
  return (octave + 1) * 12 + semitone;
}

export function shiftOctave(octave: number, step: number): number {
  return Math.min(MAX_OCTAVE, Math.max(MIN_OCTAVE, octave + step));
}

// The buffer of played notes, as the line to paste between the quotes of note("…").
export const REST = "~";

export function formatBuffer(tokens: string[]): string {
  return tokens.join(" ");
}

// What the Keys view remembers between sessions (the buffer itself is not kept).
export interface KeysSettings {
  octave: number;
  // Any loaded sound or sample name.
  sound: string;
  // Seconds each note sounds.
  length: number;
}

export const DEFAULT_KEYS_SETTINGS: KeysSettings = { octave: 4, sound: "piano", length: 0.5 };

const MIN_LENGTH = 0.05;
const MAX_LENGTH = 10;

export function clampLength(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_KEYS_SETTINGS.length;
  return Math.min(MAX_LENGTH, Math.max(MIN_LENGTH, seconds));
}

// The sound a note plays with: the field's text, or the default when it's empty.
export function soundName(sound: string): string {
  return sound.trim() || DEFAULT_KEYS_SETTINGS.sound;
}

// Reads the settings from a session file, keeping whatever is usable.
export function parseKeysSettings(raw: unknown): KeysSettings {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_KEYS_SETTINGS;
  return {
    octave: Number.isInteger(r.octave) ? shiftOctave(r.octave as number, 0) : d.octave,
    sound: typeof r.sound === "string" && r.sound.trim() ? r.sound.trim() : d.sound,
    length: typeof r.length === "number" ? clampLength(r.length) : d.length,
  };
}
