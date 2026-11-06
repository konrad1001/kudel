import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  formatValue,
  fromDial,
  getParam,
  normalize,
  oscKind,
  patchControls,
  toDial,
  type NumberParam,
  type Settings,
} from "./controls";
import {
  defaultPatch,
  identifierFor,
  parseSynthFile,
  patchCode,
  savePatch,
  serializeSynthFile,
  shiftOctave,
} from "./patch";

const settings = (change: Settings): Settings => ({ ...DEFAULT_SETTINGS, ...change });
const numParam = (id: string) => getParam(id) as NumberParam;

describe("oscKind", () => {
  it("tells the synth sounds apart and takes anything else for a wavetable", () => {
    expect(oscKind("sawtooth")).toBe("basic");
    expect(oscKind("pulse")).toBe("pulse");
    expect(oscKind("supersaw")).toBe("supersaw");
    expect(oscKind("wt_digital")).toBe("wavetable");
  });
});

describe("patchControls", () => {
  it("writes the sound and the whole amp envelope by default", () => {
    expect(patchControls(DEFAULT_SETTINGS)).toEqual({
      s: "wt_basic_shapes",
      wt: 0,
      unison: 1,
      attack: 0.005,
      decay: 0.3,
      sustain: 0.7,
      release: 0.2,
    });
  });

  it("writes only the controls the oscillator has", () => {
    const pulse = patchControls(settings({ s: "pulse", wt: 0.5, unison: 3 }));
    expect(pulse.pw).toBe(0.5);
    expect(pulse).not.toHaveProperty("wt");
    expect(pulse).not.toHaveProperty("unison");
    const table = patchControls(settings({ s: "wt_digital", wt: 0.33, n: 2 }));
    expect(table).toMatchObject({ s: "wt_digital", n: 2, wt: 0.33, unison: 1 });
    expect(table).not.toHaveProperty("pw");
  });

  it("writes detune and spread only with more than one voice", () => {
    expect(patchControls(settings({ s: "supersaw", unison: 1 }))).not.toHaveProperty("detune");
    expect(patchControls(settings({ s: "supersaw", unison: 5 }))).toMatchObject({ unison: 5, detune: 0.18, spread: 0.6 });
  });

  it("writes each filter when it's switched on, both together if both are", () => {
    expect(patchControls(settings({ cutoff: 500 }))).not.toHaveProperty("cutoff");
    expect(patchControls(settings({ lp: "on", cutoff: 500, resonance: 4 }))).toMatchObject({ cutoff: 500, resonance: 4 });
    expect(patchControls(settings({ hp: "on", hcutoff: 500 }))).toMatchObject({ hcutoff: 500, hresonance: 1 });
    expect(patchControls(settings({ lp: "on", hp: "on" }))).toMatchObject({ cutoff: 20000, hcutoff: 20 });
  });

  it("leaves the highpass out with the ladder, which is a lowpass only", () => {
    const controls = patchControls(settings({ lp: "on", hp: "on", ftype: "ladder" }));
    expect(controls).toMatchObject({ cutoff: 20000, ftype: "ladder" });
    expect(controls).not.toHaveProperty("hcutoff");
  });

  it("writes the filter envelope only with an amount", () => {
    expect(patchControls(settings({ lp: "on" }))).not.toHaveProperty("lpattack");
    expect(patchControls(settings({ lp: "on", lpenv: 2 }))).toMatchObject({
      lpenv: 2,
      lpattack: 0.005,
      lpdecay: 0.14,
      lpsustain: 0,
      lprelease: 0.1,
    });
  });

  it("leaves out values that sound the same as no control", () => {
    const controls = patchControls(settings({ lp: "on", ftype: "12db", gain: 1, pan: 0.5, delay: 0, room: 0 }));
    for (const key of ["ftype", "gain", "pan", "delay", "delaysync", "room", "roomsize"]) expect(controls).not.toHaveProperty(key);
    expect(patchControls(settings({ delay: 0.3 }))).toMatchObject({ delay: 0.3, delaysync: 3 / 16, delayfeedback: 0.5 });
  });
});

describe("patchCode", () => {
  it("writes a const object, one line per section, strings in single quotes", () => {
    const code = patchCode({ name: "init", settings: settings({ s: "wt_digital", wt: 0.33, lp: "on", cutoff: 2892, resonance: 4.4, ftype: "24db" }) });
    expect(code).toBe(
      [
        "const init = {",
        "  s: 'wt_digital', wt: 0.33, unison: 1,",
        "  ftype: '24db', cutoff: 2892, resonance: 4.4,",
        "  attack: 0.005, decay: 0.3, sustain: 0.7, release: 0.2,",
        "}",
        "",
      ].join("\n"),
    );
  });

  it("is valid JavaScript that gives the same object the audition plays", () => {
    const patch = { name: "x", settings: settings({ s: "supersaw", unison: 4, delay: 0.25, penv: -12 }) };
    const object = new Function(`${patchCode(patch)}; return x;`)();
    expect(object).toEqual(patchControls(patch.settings));
  });
});

describe("identifierFor", () => {
  it("makes a usable const name", () => {
    expect(identifierFor("my bass!")).toBe("my_bass_");
    expect(identifierFor("808")).toBe("_808");
    expect(identifierFor("  ")).toBe("synth");
    expect(identifierFor("pad$2")).toBe("pad$2");
  });
});

describe("dials", () => {
  it("round-trips along each curve", () => {
    for (const id of ["cutoff", "attack", "resonance"]) {
      const param = numParam(id);
      for (const value of [param.min, param.default, param.max]) {
        expect(fromDial(param, toDial(param, value))).toBeCloseTo(value, param.decimals);
      }
    }
  });

  it("gives short times most of the dial", () => {
    expect(toDial(numParam("attack"), 0.1)).toBeGreaterThan(0.2);
  });

  it("clamps and rounds when normalizing", () => {
    expect(normalize(numParam("wt"), 0.32999)).toBe(0.33);
    expect(normalize(numParam("wt"), 4)).toBe(1);
    expect(normalize(numParam("wt"), "x")).toBe(0);
    expect(normalize(getParam("lp")!, "maybe")).toBe("off");
  });

  it("formats values with units", () => {
    expect(formatValue(numParam("cutoff"), 2892)).toBe("2.89 kHz");
    expect(formatValue(numParam("attack"), 0.33)).toBe("330 ms");
    expect(formatValue(numParam("decay"), 10)).toBe("10 s");
    expect(formatValue(getParam("delaysync")!, 3 / 16)).toBe("3/16");
  });
});

describe("synth file", () => {
  it("starts with a default patch when there's no file or a broken one", () => {
    expect(parseSynthFile(null)).toEqual({ current: defaultPatch(), saved: [] });
    expect(parseSynthFile("{oops")).toEqual({ current: defaultPatch(), saved: [] });
  });

  it("round-trips, repairing bad settings", () => {
    const file = { current: { name: "a", settings: settings({ wt: 0.5 }) }, saved: [{ name: "b", settings: settings({ s: "pulse" }) }] };
    expect(parseSynthFile(serializeSynthFile(file))).toEqual(file);
    const repaired = parseSynthFile(JSON.stringify({ current: { name: "a", settings: { wt: 9, lp: "?" } } }));
    expect(repaired.current.settings).toEqual(settings({ wt: 1 }));
  });

  it("replaces a saved patch of the same name in place", () => {
    const a = { name: "a", settings: settings({}) };
    const b = { name: "b", settings: settings({}) };
    const a2 = { name: "a", settings: settings({ s: "sine" }) };
    expect(savePatch([a, b], a2)).toEqual([a2, b]);
    expect(savePatch([a], b)).toEqual([a, b]);
  });
});

describe("shiftOctave", () => {
  it("moves a note name by octaves, within 0 to 9", () => {
    expect(shiftOctave("c3", 1)).toBe("c4");
    expect(shiftOctave("a#", -1)).toBe("a#2");
    expect(shiftOctave("eb0", -1)).toBe("eb0");
    expect(shiftOctave("60", 1)).toBe("60");
  });
});

describe("saved patches from before the two filters", () => {
  it("move a lowpass to the lowpass and a highpass to the highpass", () => {
    const old = (settings: Record<string, unknown>) => parseSynthFile(JSON.stringify({ current: { name: "a", settings } })).current.settings;
    expect(old({ filter: "lp", freq: 800, q: 6, fenv: 2, fattack: 0.1 })).toMatchObject({ lp: "on", cutoff: 800, resonance: 6, lpenv: 2, lpattack: 0.1, hp: "off" });
    expect(old({ filter: "hp", freq: 300, q: 2 })).toMatchObject({ hp: "on", hcutoff: 300, hresonance: 2, lp: "off" });
    expect(old({ filter: "off", freq: 300 })).toMatchObject({ lp: "off", hp: "off", cutoff: 20000 });
  });
});
