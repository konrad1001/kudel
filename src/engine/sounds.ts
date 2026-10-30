// A registered sound as the sounds list shows it, read from the data superdough keeps
// with it (registerSound's third argument, as superdough 1.3.0 and
// @strudel/soundfonts 1.3.0 fill it in). Pure, so it's tested without audio.

export interface SoundInfo {
  // Lowercase, as registered: what goes in s("…").
  name: string;
  // "sample", "synth", "soundfont", "wavetable", "input", ...
  type: string;
  // "drum-machines" for the drum machine banks.
  tag?: string;
  // Loaded at startup (the sounds strudel.cc ships), not by samples(…) in code.
  prebake: boolean;
  // What strudel.cc's sounds tab shows in brackets: a sample's files (or a pitched
  // sample's notes), a wavetable's tables, a soundfont's presets. 0 for synths.
  count: number;
}

export function soundInfo(name: string, data: Record<string, unknown>): SoundInfo {
  return {
    name,
    type: typeof data.type === "string" ? data.type : "unknown",
    tag: typeof data.tag === "string" ? data.tag : undefined,
    prebake: data.prebake === true,
    count: countOf(data),
  };
}

function countOf(data: Record<string, unknown>): number {
  const files =
    data.type === "sample"
      ? data.samples
      : data.type === "wavetable"
        ? data.tables
        : data.type === "soundfont"
          ? data.fonts
          : undefined;
  if (Array.isArray(files)) return files.length;
  // A pitched sample (the piano) maps note names to files; "_base" and the like aren't notes.
  if (files && typeof files === "object") return Object.keys(files).filter((key) => !key.startsWith("_")).length;
  return 0;
}
