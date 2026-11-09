import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "./controls";
import { availableTabs, enableEnvelope, enableLfo, envelopeOn, getModTab, lfoDials, lfoOn, modulated, viewFor } from "./mod";
import { lfoValue } from "./shapes";

const settings = (change: Settings): Settings => ({ ...DEFAULT_SETTINGS, ...change });
const ids = (s: Settings) => availableTabs(s).map((tab) => tab.id);

describe("mod tabs", () => {
  it("offer the destinations the oscillator has", () => {
    expect(ids(settings({ s: "wt_basic_shapes" }))).toEqual(["amp", "filter", "pitch", "pos", "warp", "fm"]);
    expect(ids(settings({ s: "sawtooth" }))).toEqual(["amp", "filter", "pitch", "fm"]);
    expect(ids(settings({ s: "pulse" }))).toEqual(["amp", "filter", "pitch", "fm", "width"]);
  });

  it("show the view a tab has", () => {
    expect(viewFor(getModTab("fm"), "lfo")).toBe("env");
    expect(viewFor(getModTab("width"), "env")).toBe("lfo");
    expect(viewFor(getModTab("amp"), "lfo")).toBe("lfo");
  });

  it("mark the tabs that move something beyond the amp envelope", () => {
    const tabs = (s: Settings) => availableTabs(s).filter((tab) => modulated(tab, s)).map((tab) => tab.id);
    expect(tabs(DEFAULT_SETTINGS)).toEqual([]);
    expect(tabs(settings({ amplfo: "hz", penv: 12, wtenv: 0.3 }))).toEqual(["amp", "pitch", "pos"]);
    // The filter's only count with the lowpass on.
    expect(tabs(settings({ lpenv: 2, filterlfo: "hz" }))).toEqual([]);
    expect(tabs(settings({ lp: "on", lpenv: 2 }))).toEqual(["filter"]);
    expect(tabs(settings({ vib: 5 }))).toEqual(["pitch"]);
    expect(tabs(settings({ fmenvon: "on", fmi: 0 }))).toEqual([]);
    expect(tabs(settings({ fmenvon: "on", fmi: 3 }))).toEqual(["fm"]);
  });

  it("list an LFO's rate in Hz or synced, as its switch says", () => {
    const amp = getModTab("amp").lfo!;
    expect(lfoDials(amp, settings({ amplfo: "hz" }))).toEqual(["tremolo", "tremolodepth", "tremoloshape", "tremoloskew"]);
    expect(lfoDials(amp, settings({ amplfo: "sync" }))[0]).toBe("tremolosync");
    expect(lfoDials(getModTab("pitch").lfo!, DEFAULT_SETTINGS)).toEqual(["vib", "vibmod"]);
  });
});

describe("switching modulation on as a drag starts", () => {
  it("gives an envelope an amount, and the filter's a lowpass that isn't fully open", () => {
    expect(enableEnvelope(getModTab("pitch"), DEFAULT_SETTINGS)).toEqual({ penv: 12 });
    expect(enableEnvelope(getModTab("pos"), DEFAULT_SETTINGS)).toEqual({ wtenv: 0.5 });
    expect(enableEnvelope(getModTab("filter"), DEFAULT_SETTINGS)).toEqual({ lp: "on", cutoff: 1000, lpenv: 2 });
    expect(enableEnvelope(getModTab("fm"), DEFAULT_SETTINGS)).toEqual({ fmenvon: "on", fmi: 2 });
    expect(enableEnvelope(getModTab("amp"), DEFAULT_SETTINGS)).toEqual({});
    expect(enableEnvelope(getModTab("pitch"), settings({ penv: -5 }))).toEqual({});
  });

  it("switches an LFO to Hz, or vibrato to 5 Hz", () => {
    expect(enableLfo(getModTab("amp"), DEFAULT_SETTINGS)).toEqual({ amplfo: "hz" });
    expect(enableLfo(getModTab("width"), settings({ s: "pulse" }))).toEqual({ pwlfo: "on" });
    expect(enableLfo(getModTab("pitch"), DEFAULT_SETTINGS)).toEqual({ vib: 5 });
    expect(enableLfo(getModTab("amp"), settings({ amplfo: "sync" }))).toEqual({});
    const on = settings(enableLfo(getModTab("filter"), DEFAULT_SETTINGS));
    expect(lfoOn(getModTab("filter"), on)).toBe(true);
    expect(envelopeOn(getModTab("filter"), on)).toBe(false);
  });
});

describe("lfoValue", () => {
  it("follows superdough's shapes, from 0 to 1", () => {
    expect(lfoValue("sine", 0.25)).toBeCloseTo(1);
    expect(lfoValue("sine", 0.75)).toBeCloseTo(0);
    expect(lfoValue("ramp", 0.3)).toBeCloseTo(0.3);
    expect(lfoValue("saw", 0.3)).toBeCloseTo(0.7);
    expect(lfoValue("tri", 0.5)).toBeCloseTo(1);
    expect(lfoValue("tri", 0.25)).toBeCloseTo(0.5);
    expect(lfoValue("square", 0.25)).toBe(1);
    expect(lfoValue("square", 0.75)).toBe(0);
  });

  it("moves a triangle's peak and a square's edge with the skew, and repeats", () => {
    expect(lfoValue("tri", 0.2, 0.2)).toBeCloseTo(1);
    expect(lfoValue("square", 0.5, 0.75)).toBe(1);
    expect(lfoValue("ramp", 1.3)).toBeCloseTo(0.3);
  });
});
