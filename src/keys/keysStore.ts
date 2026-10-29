import { create } from "zustand";
import * as engine from "../engine";
import type { Command } from "../commands/commands";
import { isTextField, registerContextKey } from "../commands/when";
import { showView } from "../layout/layoutStore";
import {
  clampLength,
  DEFAULT_KEYS_SETTINGS,
  formatBuffer,
  KEY_LETTERS,
  noteMidi,
  noteName,
  REST,
  shiftOctave,
  soundName,
  type KeysSettings,
} from "./notes";

// The Keys view. Playing a key is an audition, like a sample preview: it never changes
// what the pattern plays. What reaches the code is the buffer, copied by hand.
interface KeysState extends KeysSettings {
  // Notes and rests in the order played. Not saved with the session.
  buffer: string[];
  // MIDI numbers of the keys sounding now.
  lit: Record<number, true>;
  // Why the last note didn't play (an unknown sound, say), until the next one does.
  error: string | null;
  // Briefly true after the buffer is copied.
  copied: boolean;
}

export const useKeys = create<KeysState>(() => ({
  ...DEFAULT_KEYS_SETTINGS,
  buffer: [],
  lit: {},
  error: null,
  copied: false,
}));

const set = useKeys.setState;
const get = useKeys.getState;

// Focus is in the Keys view, but not in one of its text fields: letters play notes.
registerContextKey("keysFocus", () => {
  const el = document.activeElement;
  return !!el?.closest(".keys") && !isTextField(el);
});

const unlightTimers = new Map<number, ReturnType<typeof setTimeout>>();

// Lights a key for as long as its note sounds. Playing it again restarts the time.
function light(midi: number, seconds: number): void {
  clearTimeout(unlightTimers.get(midi));
  set((s) => ({ lit: { ...s.lit, [midi]: true } }));
  unlightTimers.set(
    midi,
    setTimeout(() => {
      unlightTimers.delete(midi);
      set((s) => {
        const { [midi]: _off, ...lit } = s.lit;
        return { lit };
      });
    }, seconds * 1000),
  );
}

// Plays the key `semitone` steps above C in the current octave and adds it to the buffer.
export function playKey(semitone: number): void {
  const { octave, sound, length } = get();
  const note = noteName(octave, semitone);
  const duration = clampLength(length);
  append(note);
  set({ error: null });
  light(noteMidi(octave, semitone), duration);
  engine.auditionNote({ note, s: soundName(sound), duration }).catch((err: unknown) => {
    set({ error: err instanceof Error ? err.message : String(err) });
  });
}

export function addRest(): void {
  append(REST);
}

// The buffer empties itself this long after the last note or rest, so the next phrase
// starts clean.
const CLEAR_AFTER_MS = 10_000;
let clearTimer: ReturnType<typeof setTimeout> | undefined;

function append(token: string): void {
  set((s) => ({ buffer: [...s.buffer, token] }));
  clearTimeout(clearTimer);
  clearTimer = setTimeout(clearUnlessSelecting, CLEAR_AFTER_MS);
}

// Not while the buffer's field has focus: that's someone selecting part of it to copy.
function clearUnlessSelecting(): void {
  if (document.activeElement?.closest(".keys-buffer-text")) clearTimer = setTimeout(clearUnlessSelecting, CLEAR_AFTER_MS);
  else clearBuffer();
}

export function clearBuffer(): void {
  clearTimeout(clearTimer);
  set({ buffer: [] });
}

let copiedTimer: ReturnType<typeof setTimeout> | undefined;

// Copies the line to paste between the quotes of note("…").
export async function copyBuffer(): Promise<void> {
  try {
    await navigator.clipboard.writeText(formatBuffer(get().buffer));
  } catch (err) {
    set({ error: `Could not copy: ${String(err)}` });
    return;
  }
  clearTimeout(copiedTimer);
  set({ copied: true });
  copiedTimer = setTimeout(() => set({ copied: false }), 1200);
}

export function shiftOctaveBy(step: number): void {
  set((s) => ({ octave: shiftOctave(s.octave, step) }));
}

export function setSound(sound: string): void {
  set({ sound });
}

export function setLength(length: number): void {
  set({ length });
}

// Labels for KEY_LETTERS' commands: "Play C", ..., "Play C (Octave Up)".
const keyLabel = (semitone: number) => {
  const name = noteName(0, semitone).slice(0, -1).toUpperCase();
  return semitone < 12 ? `Play ${name}` : `Play ${name} (Octave Up)`;
};

// Keys for these are in src/commands/keybindings.ts, all "when": "keysFocus".
export const KEYS_COMMANDS: Command[] = [
  { id: "view.keys", label: "Show Keys", run: () => showView("keys", { focus: true }) },
  ...KEY_LETTERS.map((_, semitone) => ({
    id: `keys.play${semitone}`,
    label: keyLabel(semitone),
    run: () => playKey(semitone),
  })),
  { id: "keys.octaveDown", label: "Octave Down", run: () => shiftOctaveBy(-1) },
  { id: "keys.octaveUp", label: "Octave Up", run: () => shiftOctaveBy(1) },
  { id: "keys.rest", label: "Add Rest", run: addRest },
  { id: "keys.clear", label: "Clear Notes", run: clearBuffer },
  { id: "keys.copy", label: "Copy Notes", run: copyBuffer },
];
