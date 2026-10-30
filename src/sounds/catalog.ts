import type { SoundInfo } from "../engine/sounds";

// The Sounds view's categories, sorted the way strudel.cc's sounds tab sorts them
// (website/src/repl/components/panel/SoundsTab.jsx at tag @strudel/webaudio@1.3.0).
export const CATEGORIES = [
  { id: "samples", label: "samples" },
  { id: "drum-machines", label: "drum-machines" },
  { id: "synths", label: "synths" },
  { id: "wavetables", label: "wavetables" },
] as const;

export type SoundCategory = (typeof CATEGORIES)[number]["id"];

// Only sounds loaded at startup are listed for now; ones loaded by samples(…) in code
// will get a category of their own. Names starting with "_" are internal.
export function categoryOf(sound: SoundInfo): SoundCategory | null {
  if (!sound.prebake || sound.name.startsWith("_")) return null;
  switch (sound.type) {
    case "sample":
      return sound.tag === "drum-machines" ? "drum-machines" : "samples";
    case "synth":
    case "soundfont":
      return "synths";
    case "wavetable":
      return "wavetables";
    default:
      return null;
  }
}

// The sounds in `category` whose name contains `search` (any case), alphabetically.
export function filterSounds(sounds: SoundInfo[], category: SoundCategory, search: string): SoundInfo[] {
  const query = search.trim().toLowerCase();
  return sounds
    .filter((sound) => categoryOf(sound) === category && sound.name.toLowerCase().includes(query))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// The note a click plays: synths and soundfonts need one (strudel.cc uses a3); samples
// and wavetables play at their own pitch.
export function auditionNoteFor(sound: SoundInfo): string | undefined {
  return sound.type === "synth" || sound.type === "soundfont" ? "a3" : undefined;
}
