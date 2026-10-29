import { describe, expect, it } from "vitest";
import {
  clampLength,
  DEFAULT_KEYS_SETTINGS,
  formatBuffer,
  isBlackKey,
  KEY_LETTERS,
  noteMidi,
  noteName,
  parseKeysSettings,
  REST,
  shiftOctave,
  soundName,
} from "./notes";

describe("noteName", () => {
  it("names the letters' notes in mini-notation, sharps as #", () => {
    const names = KEY_LETTERS.map((_, semitone) => noteName(4, semitone));
    expect(names).toEqual(["c4", "c#4", "d4", "d#4", "e4", "f4", "f#4", "g4", "g#4", "a4", "a#4", "b4", "c5"]);
  });

  it("carries steps past B into the next octaves", () => {
    expect(noteName(3, 24)).toBe("c5");
    expect(noteName(3, 23)).toBe("b4");
  });
});

describe("noteMidi", () => {
  it("matches Strudel's noteToMidi: c4 is 60, a4 is 69", () => {
    expect(noteMidi(4, 0)).toBe(60);
    expect(noteMidi(4, 9)).toBe(69);
    expect(noteMidi(3, 13)).toBe(noteMidi(4, 1));
  });
});

describe("isBlackKey", () => {
  it("knows the black keys in any octave", () => {
    const black = KEY_LETTERS.filter((_, s) => isBlackKey(s));
    expect(black).toEqual(["W", "E", "T", "Y", "U"]);
    expect(isBlackKey(13)).toBe(true);
    expect(isBlackKey(24)).toBe(false);
  });
});

describe("shiftOctave", () => {
  it("moves within the limits", () => {
    expect(shiftOctave(4, 1)).toBe(5);
    expect(shiftOctave(4, -1)).toBe(3);
    expect(shiftOctave(7, 1)).toBe(7);
    expect(shiftOctave(1, -1)).toBe(1);
  });
});

describe("formatBuffer", () => {
  it("writes notes and rests as one mini-notation line", () => {
    expect(formatBuffer(["b5", "c5", REST, "d4"])).toBe("b5 c5 ~ d4");
    expect(formatBuffer([])).toBe("");
  });
});

describe("clampLength", () => {
  it("keeps a note's length sensible", () => {
    expect(clampLength(0)).toBe(0.05);
    expect(clampLength(0.25)).toBe(0.25);
    expect(clampLength(60)).toBe(10);
    expect(clampLength(NaN)).toBe(DEFAULT_KEYS_SETTINGS.length);
  });
});

describe("soundName", () => {
  it("falls back to the default for an empty field", () => {
    expect(soundName(" gm_epiano1 ")).toBe("gm_epiano1");
    expect(soundName("  ")).toBe("piano");
  });
});

describe("parseKeysSettings", () => {
  it("reads saved settings", () => {
    expect(parseKeysSettings({ octave: 2, sound: "sawtooth", length: 1 })).toEqual({
      octave: 2,
      sound: "sawtooth",
      length: 1,
    });
  });

  it("uses defaults for missing or invalid parts", () => {
    expect(parseKeysSettings(undefined)).toEqual(DEFAULT_KEYS_SETTINGS);
    expect(parseKeysSettings({ octave: 2.5, sound: " ", length: "long" })).toEqual(DEFAULT_KEYS_SETTINGS);
    expect(parseKeysSettings({ octave: 12 }).octave).toBe(7);
  });
});
