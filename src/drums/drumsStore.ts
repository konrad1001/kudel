import { create } from "zustand";
import * as engine from "../engine";
import type { Command } from "../commands/commands";
import { isTextField, registerContextKey } from "../commands/when";
import { appFile } from "../files/appFile";
import { showView } from "../layout/layoutStore";
import {
  copyLoop,
  defaultLoop,
  emptySteps,
  isSoundName,
  loopCode,
  parseDrumFile,
  saveLoop,
  serializeDrumFile,
  STEPS,
  stepValue,
  valuesAt,
  type DrumRow,
  type Loop,
} from "./loop";

// The Drums view. The loop being edited is UI state, like the Synth view's patch: its
// preview is an audition and never changes what the pattern plays. It reaches the code
// only as text, copied or dragged in (loopCode), and from then on the code is what counts.
interface DrumsState {
  // The loop being edited.
  name: string;
  bank: string;
  rows: DrumRow[];
  // Saved loops, kept for the app (drums.json), not per project.
  saved: Loop[];
  // The step the preview is sounding, or null when it's stopped.
  playhead: number | null;
  playing: boolean;
  // Why the last preview or copy failed, until the next one works.
  error: string | null;
  // Briefly true after the code is copied, or the loop saved.
  copied: boolean;
  justSaved: boolean;
}

export const useDrums = create<DrumsState>(() => {
  const loop = defaultLoop();
  return {
    name: loop.name,
    bank: loop.bank,
    rows: loop.rows,
    saved: [],
    playhead: null,
    playing: false,
    error: null,
    copied: false,
    justSaved: false,
  };
});

const set = useDrums.setState;
const get = useDrums.getState;

// Focus is in the Drums view, but not in one of its text fields.
registerContextKey("drumsFocus", () => {
  const el = document.activeElement;
  return !!el?.closest(".drums") && !isTextField(el);
});

export const currentLoop = (s: DrumsState = get()): Loop => ({ name: s.name, bank: s.bank, rows: s.rows });

function updateRow(index: number, change: (row: DrumRow) => DrumRow): void {
  set((s) => ({ rows: s.rows.map((row, i) => (i === index ? change(row) : row)) }));
}

// Sets one step on or off. Turning one on while the preview is stopped plays its sound.
export function setStep(rowIndex: number, step: number, on: boolean): void {
  const row = get().rows[rowIndex];
  if (!row || row.steps[step] === on) return;
  updateRow(rowIndex, (r) => ({ ...r, steps: r.steps.map((v, i) => (i === step ? on : v)) }));
  if (on && !get().playing) hear(row.sound);
}

// Plays one row's sound once (a click on its name, or a step turned on).
export function hear(sound: string): void {
  if (!isSoundName(sound)) return;
  const { s, n } = stepValue(sound, "");
  const bank = get().bank;
  engine
    .auditionNote({ s: bank ? `${bank}_${s}` : String(s), n: n === undefined ? undefined : Number(n), duration: 1, release: 0.05 })
    .catch((err: unknown) => set({ error: err instanceof Error ? err.message : String(err) }));
}

export function setRowSound(rowIndex: number, sound: string): void {
  updateRow(rowIndex, (row) => ({ ...row, sound }));
}

export function clearRow(rowIndex: number): void {
  updateRow(rowIndex, (row) => ({ ...row, steps: emptySteps() }));
}

export function removeRow(rowIndex: number): void {
  set((s) => ({ rows: s.rows.filter((_, i) => i !== rowIndex) }));
}

// Adds a row for a sound typed in ("bd", "bd:3", "rim"). False if it isn't one step of
// mini-notation.
export function addRow(sound: string): boolean {
  const name = sound.trim();
  if (!isSoundName(name)) {
    set({ error: `"${name}" isn't a sound name (letters, digits, _, and :n for a sample number).` });
    return false;
  }
  set((s) => ({ rows: [...s.rows, { sound: name, steps: emptySteps() }], error: null }));
  return true;
}

export function setBank(bank: string): void {
  set({ bank });
}

export function setName(name: string): void {
  set({ name });
}

// Every step off, keeping the rows.
export function clearAll(): void {
  set((s) => ({ rows: s.rows.map((row) => ({ ...row, steps: emptySteps() })) }));
}

// ---------------------------------------------------------------- preview

let stopLoop: (() => void) | null = null;
// Each start gets a number, so a stop that comes while one is still loading wins.
let generation = 0;

export async function startPreview(): Promise<void> {
  if (get().playing) return;
  const mine = ++generation;
  set({ playing: true, error: null });
  try {
    const stop = await engine.playLoop({
      steps: STEPS,
      valuesAt: (step) => valuesAt(currentLoop(), step),
      onStep: (step) => set({ playhead: step }),
      onError: (error) => set({ error }),
    });
    if (mine !== generation) stop();
    else stopLoop = stop;
  } catch (err) {
    if (mine === generation) set({ playing: false, error: String(err) });
  }
}

export function stopPreview(): void {
  generation++;
  stopLoop?.();
  stopLoop = null;
  set({ playing: false, playhead: null });
}

export function togglePreview(): void {
  if (get().playing) stopPreview();
  else void startPreview();
}

// ---------------------------------------------------------------- code and saving

const flash = (key: "copied" | "justSaved") => {
  set({ [key]: true });
  setTimeout(() => set({ [key]: false }), 1200);
};

// Copies the loop's code: const name = stack(s("…"), …), to play with $: name.
export async function copyCode(loop: Loop = currentLoop()): Promise<void> {
  try {
    await navigator.clipboard.writeText(loopCode(loop));
  } catch (err) {
    set({ error: `Could not copy: ${String(err)}` });
    return;
  }
  flash("copied");
}

// Saves the loop under its name, replacing a saved one of the same name.
export function save(): void {
  const name = get().name.trim();
  if (!name) {
    set({ error: "Name the loop to save it." });
    return;
  }
  set((s) => ({ name, saved: saveLoop(s.saved, { name, bank: s.bank, rows: s.rows }), error: null }));
  flash("justSaved");
}

// Opens a saved loop for editing (a copy: changes need saving again).
export function open(name: string): void {
  const loop = get().saved.find((l) => l.name === name);
  if (!loop) return;
  const copy = copyLoop(loop);
  set({ name: copy.name, bank: copy.bank, rows: copy.rows, error: null });
}

export function remove(name: string): void {
  set((s) => ({ saved: s.saved.filter((l) => l.name !== name) }));
}

// The loop being edited and the saved ones, kept in drums.json in the app data folder.
export const drumsFile = appFile({
  name: "drums.json",
  restore(text) {
    const file = parseDrumFile(text);
    set({ name: file.current.name, bank: file.current.bank, rows: file.current.rows, saved: file.saved });
  },
  onReadError: (error) => set({ error }),
  serialize: () => serializeDrumFile({ current: currentLoop(), saved: get().saved }),
  watch: (onChange) =>
    useDrums.subscribe((s, prev) => {
      if (s.name !== prev.name || s.bank !== prev.bank || s.rows !== prev.rows || s.saved !== prev.saved) onChange();
    }),
});

// Keys for these are in src/commands/keybindings.ts, "when": "drumsFocus".
export const DRUMS_COMMANDS: Command[] = [
  { id: "view.drums", label: "Show Drums", run: () => showView("drums", { focus: true }) },
  { id: "drums.playStop", label: "Play or Stop Drum Loop", run: togglePreview },
  { id: "drums.copy", label: "Copy Drum Loop Code", run: () => void copyCode() },
  { id: "drums.save", label: "Save Drum Loop", run: save },
  { id: "drums.clear", label: "Clear Drum Loop", run: clearAll },
];
