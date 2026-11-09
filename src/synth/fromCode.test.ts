import { describe, expect, it } from "vitest";
import { CODE_LINES } from "./codeLayout";
import { DEFAULT_SETTINGS, PARAMS, patchControls, type Settings } from "./controls";
import { sameSettings, settingsFromCode, type CodeValue } from "./fromCode";

const settings = (change: Settings): Settings => ({ ...DEFAULT_SETTINGS, ...change });
const asCode = (controls: Record<string, unknown>) => new Map(Object.entries(controls) as [string, CodeValue][]);

// Patches covering every switch, LFO mode and oscillator kind.
const PATCHES: Settings[] = [
  DEFAULT_SETTINGS,
  settings({ s: "sawtooth", partials: [1, 0.5, ...new Array(14).fill(0)], noise: 0.2 }),
  settings({ s: "user" }),
  settings({ s: "pulse", pw: 0.3, pwlfo: "on", pwrate: 3 }),
  settings({ s: "supersaw", unison: 5, detune: 0.4, spread: 1 }),
  settings({ wt: 0.69, warp: 0.2, warpmode: "fold", unison: 4, detune: 0.4, spread: 1, wtenv: 0.5, poslfo: "sync", wtsync: 4, warplfo: "hz" }),
  settings({ lp: "on", cutoff: 326, resonance: 3, ftype: "24db", lpenv: 2, filterlfo: "hz", lprate: 3, hp: "on", hcutoff: 120 }),
  settings({ lp: "on", ftype: "ladder", drive: 2, hp: "on" }),
  settings({ amplfo: "sync", tremolosync: 8, tremoloskew: 0.8, penv: 12, vib: 5, vibmod: 0.3 }),
  settings({ fmi: 3, fmh: 2, fmenvon: "on", fmenv: "lin" }),
  settings({ delay: 0.3, delaysync: 0.25, room: 0.4, roomsize: 4, phaserrate: 2, gain: 0.8, pan: 0.3 }),
];

describe("settingsFromCode", () => {
  it("gives back exactly the settings that wrote the code", () => {
    for (const patch of PATCHES) {
      const read = settingsFromCode(asCode(patchControls(patch)), patch);
      expect(sameSettings(read, patch), JSON.stringify(patchControls(patch))).toBe(true);
    }
  });

  it("reads plain values, rounded and clamped", () => {
    const read = settingsFromCode(asCode({ s: "sawtooth", cutoff: 812.4, resonance: 99 }), DEFAULT_SETTINGS);
    expect(read).toMatchObject({ s: "sawtooth", lp: "on", cutoff: 812, resonance: 30 });
  });

  it("keeps a setting the code writes as an expression", () => {
    const current = settings({ lp: "on", cutoff: 500 });
    expect(settingsFromCode(asCode({ s: "sawtooth", cutoff: "expression" }), current).cutoff).toBe(500);
  });

  it("switches things on and off by which controls are there", () => {
    const on = settingsFromCode(asCode({ s: "wt_basic_shapes", tremolosync: 4, wtrate: 2, fmi: 2, fmattack: 0.1 }), DEFAULT_SETTINGS);
    expect(on).toMatchObject({ amplfo: "sync", poslfo: "hz", fmenvon: "on", lp: "off" });
    // A switch the code can't speak for keeps the panel's value: no position LFO without a wavetable.
    expect(settingsFromCode(asCode({ s: "sawtooth" }), settings({ poslfo: "hz" })).poslfo).toBe("hz");
    const off = settingsFromCode(asCode({ s: "sawtooth" }), settings({ lp: "on", amplfo: "hz", room: 0.5, gain: 0.7 }));
    expect(off).toMatchObject({ lp: "off", amplfo: "off", room: 0, gain: 1 });
  });

  it("keeps hidden settings a missing control doesn't speak for", () => {
    // Nothing warps, so no warp mode is written: the chosen one stays.
    const current = settings({ warpmode: "fold" });
    expect(settingsFromCode(asCode(patchControls(current)), current).warpmode).toBe("fold");
    // One voice: detune isn't written, and keeps its value.
    expect(settingsFromCode(asCode({ s: "wt_basic_shapes", unison: 1 }), settings({ detune: 0.4 })).detune).toBe(0.4);
  });
});

describe("code layout", () => {
  it("has a line for every control the panel writes", () => {
    const placed = new Set(CODE_LINES.flat());
    const switches = new Set(["lp", "hp", "amplfo", "filterlfo", "poslfo", "warplfo", "fmenvon", "pwlfo"]);
    expect(PARAMS.map((p) => p.id).filter((id) => !switches.has(id) && !placed.has(id))).toEqual([]);
  });
});
