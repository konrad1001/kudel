import { describe, expect, it } from "vitest";
import type { SoundInfo } from "../engine/sounds";
import { auditionNoteFor, categoryOf, filterSounds } from "./catalog";

const sound = (name: string, type: string, extra: Partial<SoundInfo> = {}): SoundInfo => ({
  name,
  type,
  prebake: true,
  count: 0,
  ...extra,
});

const SOUNDS = [
  sound("piano", "sample"),
  sound("tr808_bd", "sample", { tag: "drum-machines" }),
  sound("bd", "sample", { tag: "drum-machines" }),
  sound("sawtooth", "synth"),
  sound("gm_acoustic_bass", "soundfont"),
  sound("wt_digital", "wavetable"),
  sound("mic", "input"),
  sound("_internal", "sample"),
  sound("kick", "sample", { prebake: false }),
];

describe("categoryOf", () => {
  it("sorts sounds as strudel.cc does", () => {
    expect(SOUNDS.map(categoryOf)).toEqual([
      "samples",
      "drum-machines",
      "drum-machines",
      "synths",
      "synths",
      "wavetables",
      null,
      null,
      null,
    ]);
  });
});

describe("filterSounds", () => {
  it("lists a category alphabetically", () => {
    expect(filterSounds(SOUNDS, "drum-machines", "").map((s) => s.name)).toEqual(["bd", "tr808_bd"]);
    expect(filterSounds(SOUNDS, "synths", "").map((s) => s.name)).toEqual(["gm_acoustic_bass", "sawtooth"]);
  });

  it("keeps names containing the search, in any case", () => {
    expect(filterSounds(SOUNDS, "drum-machines", " 808 ").map((s) => s.name)).toEqual(["tr808_bd"]);
    expect(filterSounds(SOUNDS, "synths", "SAW").map((s) => s.name)).toEqual(["sawtooth"]);
    expect(filterSounds(SOUNDS, "samples", "nothing")).toEqual([]);
  });
});

describe("auditionNoteFor", () => {
  it("gives synths and soundfonts a note, and lets samples play at their own pitch", () => {
    expect(auditionNoteFor(sound("sawtooth", "synth"))).toBe("a3");
    expect(auditionNoteFor(sound("gm_epiano1", "soundfont"))).toBe("a3");
    expect(auditionNoteFor(sound("bd", "sample"))).toBeUndefined();
    expect(auditionNoteFor(sound("wt_a", "wavetable"))).toBeUndefined();
  });
});
