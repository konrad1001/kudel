import { create } from "zustand";
import * as engine from "../engine";
import type { Command } from "../commands/commands";
import { isTextField, registerContextKey } from "../commands/when";
import { appFile } from "../files/appFile";
import { showView } from "../layout/layoutStore";
import { getParam, normalize, patchControls, type Settings, type Value } from "./controls";
import { defaultPatch, parseSynthFile, patchCode, savePatch, serializeSynthFile, shiftChord, parseChord, chordOctave, type Patch } from "./patch";
import { KEY_LETTERS, noteName } from "../keys/notes";
import type { ModTab, ModView } from "./mod";

// The Synth view. The patch being edited is UI state like the Keys view's sound: playing
// it is an audition and never changes what the pattern plays. It reaches the code only
// as text, copied or dragged in (patchCode), and from then on the code is what counts.
interface SynthState {
  // The patch being edited.
  name: string;
  settings: Settings;
  // Saved patches, kept for the app (synths.json), not per project.
  saved: Patch[];
  // What the play button plays: notes (one, or several as a chord) and seconds held.
  note: string;
  length: number;
  // Why the last audition or copy failed, until the next one works.
  error: string | null;
  // Briefly true after the code is copied, or the patch saved.
  copied: boolean;
  justSaved: boolean;
  // The mod column's tab and whether it shows the envelope or the LFO, and whether the
  // oscillator display shows the wave or its harmonics. Not saved.
  modTab: ModTab;
  modView: ModView;
  oscView: "wave" | "harmonics";
}

export const useSynth = create<SynthState>(() => {
  const patch = defaultPatch();
  return {
    name: patch.name,
    settings: patch.settings,
    saved: [],
    note: "c3",
    length: 1,
    error: null,
    copied: false,
    justSaved: false,
    modTab: "amp",
    modView: "env",
    oscView: "wave",
  };
});

const set = useSynth.setState;
const get = useSynth.getState;

// Focus is in the Synth view, but not in one of its text fields.
registerContextKey("synthFocus", () => {
  const el = document.activeElement;
  return !!el?.closest(".synth") && !isTextField(el);
});

export const currentPatch = (s: SynthState = get()): Patch => ({ name: s.name, settings: s.settings });

export function setSetting(id: string, value: Value): void {
  const param = getParam(id);
  if (!param) return;
  set((s) => ({ settings: { ...s.settings, [id]: normalize(param, value) } }));
}

export function resetSetting(id: string): void {
  const param = getParam(id);
  if (param) setSetting(id, param.default);
}

export function setName(name: string): void {
  set({ name });
}

export function setNote(note: string): void {
  set({ note });
}

export function shiftNoteOctave(step: number): void {
  set((s) => ({ note: shiftChord(s.note, step) }));
}

export function showModTab(modTab: ModTab): void {
  set({ modTab });
}

export function showModView(modView: ModView): void {
  set({ modView });
}

// Changes several settings as one (switching an envelope or LFO on as a drag starts).
export function setSettings(changes: Record<string, Value>): void {
  for (const [id, value] of Object.entries(changes)) setSetting(id, value);
}

export function showOscView(oscView: SynthState["oscView"]): void {
  set({ oscView });
}

// An effect's mix (delay, room) or rate (phaserrate) before it was switched off, to
// switch back on to.
const mixBefore = new Map<string, number>();
// What an effect switches on to the first time.
const FIRST_ON: Record<string, number> = { delay: 0.25, room: 0.25, phaserrate: 1 };

// Switches an effect on (back to where it was, or a starting value) or off (0, which
// leaves its controls out of the code).
export function toggleEffect(id: string): void {
  const current = Number(get().settings[id]);
  if (current > 0) {
    mixBefore.set(id, current);
    setSetting(id, 0);
  } else {
    setSetting(id, mixBefore.get(id) ?? FIRST_ON[id] ?? 0.25);
  }
}

export function setLength(length: number): void {
  if (Number.isFinite(length) && length > 0) set({ length: Math.min(length, 30) });
}

// Plays the patch on the note or chord, exactly as note("…").set(patch) would.
export function play(): void {
  const { settings, note, length } = get();
  set({ error: null });
  const controls = patchControls(settings) as Record<string, Value> & { s: string };
  engine.auditionControls({ controls, notes: parseChord(note), duration: length }).catch((err: unknown) => {
    set({ error: err instanceof Error ? err.message : String(err) });
  });
}

// Plays the note `semitone` steps above C in the note field's octave, with the patch, for
// `len` seconds: the letter keys, laid out as in the Keys view (A is C, W is C#, …).
export function playKey(semitone: number): void {
  const { settings, note, length } = get();
  set({ error: null });
  const controls = patchControls(settings) as Record<string, Value> & { s: string };
  engine.auditionControls({ controls, notes: [noteName(chordOctave(note), semitone)], duration: length }).catch((err: unknown) => {
    set({ error: err instanceof Error ? err.message : String(err) });
  });
}

const flash = (key: "copied" | "justSaved") => {
  set({ [key]: true });
  setTimeout(() => set({ [key]: false }), 1200);
};

// Copies the patch's code: const name = { …controls }, for note("…").set(name).
export async function copyCode(patch: Patch = currentPatch()): Promise<void> {
  try {
    await navigator.clipboard.writeText(patchCode(patch));
  } catch (err) {
    set({ error: `Could not copy: ${String(err)}` });
    return;
  }
  flash("copied");
}

// Saves the patch under its name, replacing a saved one of the same name.
export function save(): void {
  const name = get().name.trim();
  if (!name) {
    set({ error: "Name the sound to save it." });
    return;
  }
  set((s) => ({ name, saved: savePatch(s.saved, { name, settings: s.settings }), error: null }));
  flash("justSaved");
}

// Opens a saved patch for editing (a copy: changes need saving again).
export function open(name: string): void {
  const patch = get().saved.find((p) => p.name === name);
  if (patch) set({ name: patch.name, settings: { ...patch.settings }, error: null });
}

export function remove(name: string): void {
  set((s) => ({ saved: s.saved.filter((p) => p.name !== name) }));
}

// A fresh patch, keeping the name.
export function reset(): void {
  set((s) => ({ settings: defaultPatch(s.name).settings, error: null }));
}

// The patch and the saved sounds, kept in synths.json in the app data folder.
export const synthFile = appFile({
  name: "synths.json",
  restore(text) {
    const file = parseSynthFile(text);
    set({ name: file.current.name, settings: file.current.settings, saved: file.saved });
  },
  onReadError: (error) => set({ error }),
  serialize: () => serializeSynthFile({ current: currentPatch(), saved: get().saved }),
  watch: (onChange) =>
    useSynth.subscribe((s, prev) => {
      if (s.name !== prev.name || s.settings !== prev.settings || s.saved !== prev.saved) onChange();
    }),
});

// Keys for these are in src/commands/keybindings.ts, "when": "synthFocus".
export const SYNTH_COMMANDS: Command[] = [
  { id: "view.synth", label: "Show Synth", run: () => showView("synth", { focus: true }) },
  { id: "synth.play", label: "Play Synth", run: play },
  // The letter keys (A W S E D F T G Y H U J K), in the note field's octave.
  ...KEY_LETTERS.map((_, semitone) => ({ id: `synth.key${semitone}`, label: `Play Synth Key ${semitone}`, run: () => playKey(semitone) })),
  { id: "synth.octaveDown", label: "Synth Octave Down", run: () => shiftNoteOctave(-1) },
  { id: "synth.octaveUp", label: "Synth Octave Up", run: () => shiftNoteOctave(1) },
  { id: "synth.copy", label: "Copy Synth Code", run: () => void copyCode() },
  { id: "synth.save", label: "Save Synth", run: save },
];
