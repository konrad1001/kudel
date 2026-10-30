import { create } from "zustand";
import * as engine from "../engine";
import type { Command } from "../commands/commands";
import { showView } from "../layout/layoutStore";
import { auditionNoteFor, type SoundCategory } from "./catalog";

// The Sounds view: the sounds the app has loaded, to find and hear. Clicking one is an
// audition, like a key in the Keys view: it never changes what the pattern plays.
interface SoundsState {
  sounds: engine.SoundInfo[];
  category: SoundCategory;
  search: string;
  // The sound heard now, while it lasts.
  playing: string | null;
  // Why the last sound didn't play, until the next one does.
  error: string | null;
}

export const useSounds = create<SoundsState>(() => ({
  sounds: [],
  category: "samples",
  search: "",
  playing: null,
  error: null,
}));

const set = useSounds.setState;

const unsubscribe = engine.onSoundsChange((sounds) => set({ sounds }));
import.meta.hot?.dispose(unsubscribe);

// How long a click sounds, as on strudel.cc: half a second, then a half-second fade.
const DURATION = 0.5;
const RELEASE = 0.5;

let playingTimer: ReturnType<typeof setTimeout> | undefined;

export function playSound(sound: engine.SoundInfo): void {
  clearTimeout(playingTimer);
  set({ playing: sound.name, error: null });
  playingTimer = setTimeout(() => set({ playing: null }), (DURATION + RELEASE) * 1000);
  engine
    .auditionNote({ s: sound.name, note: auditionNoteFor(sound), duration: DURATION, release: RELEASE })
    .catch((err: unknown) => set({ error: err instanceof Error ? err.message : String(err) }));
}

// Puts the name on the clipboard, ready to paste into s("…").
export async function copySoundName(sound: engine.SoundInfo): Promise<void> {
  try {
    await navigator.clipboard.writeText(sound.name);
  } catch (err) {
    set({ error: `Could not copy: ${String(err)}` });
  }
}

export function setCategory(category: SoundCategory): void {
  set({ category });
}

export function setSearch(search: string): void {
  set({ search });
}

export const SOUNDS_COMMANDS: Command[] = [
  { id: "view.sounds", label: "Show Sounds", run: () => showView("sounds", { focus: true }) },
];
