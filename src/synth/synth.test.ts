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
  parseChord,
  shiftChord,
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
    expect(shiftOctave("x", 1)).toBe("x");
  });

  it("moves a MIDI number by 12", () => {
    expect(shiftOctave("60", 1)).toBe("72");
    expect(shiftOctave("120", 1)).toBe("127");
  });
});

describe("chords", () => {
  it("reads notes separated by spaces, commas or mini-notation's brackets", () => {
    expect(parseChord("c3 e3 g3")).toEqual(["c3", "e3", "g3"]);
    expect(parseChord("c3,e3, g3")).toEqual(["c3", "e3", "g3"]);
    expect(parseChord("[c3,eb3,g3]")).toEqual(["c3", "eb3", "g3"]);
    expect(parseChord("60 64")).toEqual([60, 64]);
    expect(parseChord("  ")).toEqual(["c3"]);
  });

  it("shifts every note, keeping how the chord was written", () => {
    expect(shiftChord("c3 e3 g3", 1)).toBe("c4 e4 g4");
    expect(shiftChord("[c3,eb3,g3]", -1)).toBe("[c2,eb2,g2]");
    expect(shiftChord("60, a", 1)).toBe("72, a4");
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

describe("modulation", () => {
  it("writes nothing extra by default", () => {
    expect(Object.keys(patchControls(DEFAULT_SETTINGS))).toEqual(["s", "wt", "unison", "attack", "decay", "sustain", "release"]);
  });

  it("writes an LFO's rate in Hz or synced, with its depth and shape, only while it's on", () => {
    expect(patchControls(settings({ amplfo: "hz", tremolo: 6 }))).toMatchObject({ tremolo: 6, tremolodepth: 0.5, tremoloshape: "sine" });
    const synced = patchControls(settings({ amplfo: "sync", tremolosync: 4 }));
    expect(synced).toMatchObject({ tremolosync: 4 });
    expect(synced).not.toHaveProperty("tremolo");
    expect(patchControls(settings({ amplfo: "off", tremolo: 6 }))).not.toHaveProperty("tremolo");
  });

  it("writes the filter LFO only with the lowpass on", () => {
    expect(patchControls(settings({ filterlfo: "hz" }))).not.toHaveProperty("lprate");
    expect(patchControls(settings({ lp: "on", filterlfo: "hz", lprate: 3 }))).toMatchObject({ lprate: 3, lpdepth: 1, lpshape: "sine" });
  });

  it("writes the position envelope and LFO for wavetables only", () => {
    expect(patchControls(settings({ wtenv: 0.5 }))).toMatchObject({ wtenv: 0.5, wtattack: 0, wtdecay: 0.5, wtsustain: 0, wtrelease: 0.1 });
    expect(patchControls(settings({ s: "sawtooth", wtenv: 0.5, poslfo: "hz" }))).not.toHaveProperty("wtenv");
    expect(patchControls(settings({ poslfo: "sync", wtsync: 2 }))).toMatchObject({ wtsync: 2, wtdepth: 0.5 });
  });

  it("writes the FM envelope when it's on and there's FM", () => {
    expect(patchControls(settings({ fmenvon: "on" }))).not.toHaveProperty("fmattack");
    expect(patchControls(settings({ fmi: 4, fmenvon: "on" }))).toMatchObject({ fmi: 4, fmattack: 0.001, fmdecay: 0.3, fmsustain: 0, fmrelease: 0.1 });
    expect(patchControls(settings({ fmi: 4, fmenvon: "on", fmenv: "lin" }))).toMatchObject({ fmenv: "lin" });
  });

  it("writes the warp mode when the warp's envelope or LFO moves it from 0", () => {
    expect(patchControls(settings({ warpmode: "fold" }))).not.toHaveProperty("warpmode");
    expect(patchControls(settings({ warpmode: "fold", warpenv: 0.5 }))).toMatchObject({ warpmode: "fold", warpenv: 0.5 });
    expect(patchControls(settings({ warpmode: "fold", warplfo: "hz" }))).toMatchObject({ warpmode: "fold", warprate: 2 });
  });

  it("writes a pulse's width LFO", () => {
    expect(patchControls(settings({ s: "pulse", pwlfo: "on" }))).toMatchObject({ pwrate: 1, pwsweep: 0.3 });
    expect(patchControls(settings({ s: "sine", pwlfo: "on" }))).not.toHaveProperty("pwrate");
  });

  it("writes the phaser under superdough's name for it, while its rate isn't 0", () => {
    expect(patchControls(settings({ phaserrate: 2 }))).toMatchObject({ phaserrate: 2, phaserdepth: 0.75, phasersweep: 2000 });
    expect(patchControls(settings({ phaserdepth: 1 }))).not.toHaveProperty("phaserdepth");
  });

  it("puts the modulation on a line of its own", () => {
    const code = patchCode({ name: "pad", settings: settings({ amplfo: "sync", tremolosync: 4 }) });
    expect(code).toContain("\n  tremolosync: 4, tremolodepth: 0.5, tremoloshape: 'sine',\n");
  });
});
