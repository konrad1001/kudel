import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, patchControls, type Settings } from "./controls";
import {
  envelopeLevel,
  envelopeShape,
  filterGain,
  framePosition,
  handleDial,
  nearestHandle,
  oscCycle,
  paintHarmonics,
  warpPhase,
} from "./shapes";

const settings = (change: Settings): Settings => ({ ...DEFAULT_SETTINGS, ...change });
const peak = (cycle: Float32Array) => Math.max(...[...cycle].map(Math.abs));

describe("oscCycle", () => {
  it("draws the stock shapes", () => {
    const sine = oscCycle(settings({ s: "sine" }), 4)!;
    expect([...sine].map((v) => Math.round(v))).toEqual([0, 1, 0, -1]);
    const square = oscCycle(settings({ s: "square" }), 4)!;
    expect([...square]).toEqual([1, 1, -1, -1]);
  });

  it("follows the pulse width", () => {
    const pulse = oscCycle(settings({ s: "pulse", pw: 0.25 }), 8)!;
    expect([...pulse]).toEqual([1, 1, -1, -1, -1, -1, -1, -1]);
  });

  it("adds harmonics for the additive synth, normalized to a peak of 1", () => {
    const levels = new Array(16).fill(0);
    levels[0] = 1;
    const fundamental = oscCycle(settings({ s: "user", partials: levels }), 64)!;
    expect(peak(fundamental)).toBeCloseTo(1);
    expect(fundamental[16]).toBeCloseTo(1); // a sine, peaking a quarter through
    levels[1] = 1;
    expect(peak(oscCycle(settings({ s: "user", partials: levels }), 64)!)).toBeCloseTo(1);
  });

  it("needs a wavetable's frames, and blends between them by position", () => {
    expect(oscCycle(settings({ s: "wt_x" }), 4, null)).toBeNull();
    const frames = [new Float32Array([0, 0, 0, 0]), new Float32Array([1, 1, 1, 1])];
    expect([...oscCycle(settings({ s: "wt_x", wt: 0.5 }), 4, frames)!]).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(framePosition(1, 5)).toBe(4);
  });
});

describe("warpPhase", () => {
  it("leaves the phase alone without a mode, and bends it with one", () => {
    expect(warpPhase(0.3, 1, "none")).toBe(0.3);
    expect(warpPhase(0.5, 1, "bendp")).toBeCloseTo(0.5 ** 4);
    expect(warpPhase(0.25, 0.5, "asym")).toBeCloseTo((0.5 * 0.25) / 0.505);
  });
});

describe("filterGain", () => {
  const lp = settings({ lp: "on", cutoff: 1000, resonance: 0 });

  it("passes lows and cuts highs for a lowpass", () => {
    expect(filterGain(lp, 50)).toBeCloseTo(0, 0);
    // Web Audio's lowpass Q is the peak in dB: 0 gives 0 dB at the cutoff.
    expect(filterGain(lp, 1000)).toBeCloseTo(0, 0);
    expect(filterGain(lp, 8000)).toBeLessThan(-30);
  });

  it("doubles the slope at 24db and peaks with resonance", () => {
    expect(filterGain({ ...lp, ftype: "24db" }, 8000)).toBeCloseTo(2 * filterGain(lp, 8000));
    expect(filterGain({ ...lp, resonance: 12 }, 1000)).toBeCloseTo(12, 0);
  });

  it("is flat with the filters off, and the other way round for a highpass", () => {
    expect(filterGain(settings({}), 100)).toBe(0);
    const hp = settings({ hp: "on", hcutoff: 1000, hresonance: 0 });
    expect(filterGain(hp, 50)).toBeLessThan(-30);
    expect(filterGain(hp, 15000)).toBeCloseTo(0, 0);
  });

  it("adds the two filters together into a band", () => {
    const band = settings({ lp: "on", cutoff: 4000, resonance: 0, hp: "on", hcutoff: 250, hresonance: 0 });
    // Within a dB: the two slopes overlap a little in the middle.
    expect(Math.abs(filterGain(band, 1000))).toBeLessThan(1);
    expect(filterGain(band, 40)).toBeLessThan(-20);
    expect(filterGain(band, 18000)).toBeLessThan(-20);
  });
});

describe("envelopes", () => {
  const shape = envelopeShape({ attack: 0.5, decay: 0.5, release: 1 }, 0.4);

  it("rises, decays to the sustain, holds and releases", () => {
    expect(envelopeLevel(shape, 0)).toBe(0);
    expect(envelopeLevel(shape, shape.attackEnd)).toBeCloseTo(1);
    expect(envelopeLevel(shape, shape.decayEnd)).toBeCloseTo(0.4);
    expect(envelopeLevel(shape, shape.releaseStart)).toBeCloseTo(0.4);
    expect(envelopeLevel(shape, shape.releaseEnd)).toBeCloseTo(0);
  });

  it("finds the handle near a point and maps a drag back to its dial", () => {
    expect(nearestHandle(shape, shape.attackEnd, 0.95, true)).toBe("attack");
    expect(nearestHandle(shape, shape.decayEnd, 0.4, true)).toBe("decay");
    expect(nearestHandle(shape, shape.releaseEnd, 0, true)).toBe("release");
    expect(handleDial(shape, "attack", shape.attackEnd)).toBeCloseTo(0.5);
    expect(handleDial(shape, "release", shape.releaseEnd)).toBeCloseTo(1);
  });
});

describe("harmonics", () => {
  it("paints every bar between two drag points", () => {
    expect(paintHarmonics([0, 0, 0, 0], [0, 1], [3, 0.4])).toEqual([1, 0.8, 0.6, 0.4]);
  });

  it("are left out for a basic shape at full levels, and written trimmed otherwise", () => {
    expect(patchControls(settings({ s: "sawtooth" }))).not.toHaveProperty("partials");
    const levels = [1, 0.5, ...new Array(14).fill(0)];
    expect(patchControls(settings({ s: "sawtooth", partials: levels })).partials).toEqual([1, 0.5]);
    expect(patchControls(settings({ s: "sine", partials: levels }))).not.toHaveProperty("partials");
    expect(patchControls(settings({ s: "user" })).partials).toHaveLength(16);
  });
});
