import { describe, expect, it } from "vitest";
import { soundInfo } from "./sounds";

describe("soundInfo", () => {
  it("counts a sample's files", () => {
    expect(soundInfo("bd", { type: "sample", samples: ["a.wav", "b.wav"], prebake: true, tag: "drum-machines" })).toEqual({
      name: "bd",
      type: "sample",
      tag: "drum-machines",
      prebake: true,
      count: 2,
    });
  });

  it("counts a pitched sample's notes, not its base url", () => {
    const piano = soundInfo("piano", { type: "sample", samples: { a0: ["a0.mp3"], c1: ["c1.mp3"], _base: "x" } });
    expect(piano.count).toBe(2);
    expect(piano.prebake).toBe(false);
  });

  it("counts wavetables and soundfont presets; synths have none", () => {
    expect(soundInfo("wt_a", { type: "wavetable", tables: ["1.wav", "2.wav", "3.wav"] }).count).toBe(3);
    expect(soundInfo("gm_piano", { type: "soundfont", fonts: ["a", "b"] }).count).toBe(2);
    expect(soundInfo("sawtooth", { type: "synth", prebake: true }).count).toBe(0);
  });

  it("tolerates missing data", () => {
    expect(soundInfo("odd", {})).toEqual({ name: "odd", type: "unknown", tag: undefined, prebake: false, count: 0 });
  });
});
