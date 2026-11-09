import { getParam, lowpassOn, oscKind, type Settings, type Value } from "./controls";

// The Synth view's mod column: a tab per destination, each with the envelope and the LFO
// superdough has for it. Every setting here is a control in the patch object; this only
// says which belong together. Pure, so it's tested without audio.

export type ModTab = "amp" | "filter" | "pitch" | "pos" | "warp" | "fm" | "width";
export type ModView = "env" | "lfo";

export interface EnvelopeSpec {
  // The setting that scales the envelope (lpenv, penv, wtenv, ...), or null for the amp
  // envelope, which is always on.
  amount: string | null;
  // A switch that turns it on instead of an amount (the FM envelope's fmenvon).
  switch?: string;
  attack: string;
  decay: string;
  // Null where Strudel has none (the pitch envelope).
  sustain: string | null;
  release: string;
  // Its dials, in order.
  dials: string[];
}

export interface LfoSpec {
  // The off / hz / sync (or off / on) switch, or null for one that's on while its rate
  // isn't 0 (vibrato).
  switch: string | null;
  rate: string;
  // The per-cycle rate used when the switch says sync.
  sync?: string;
  depth: string;
  shape?: string;
  skew?: string;
  // The shape it has when it has no shape setting.
  fixedShape?: string;
}

export interface ModTabSpec {
  id: ModTab;
  label: string;
  env?: EnvelopeSpec;
  lfo?: LfoSpec;
}

const adsr = (attack: string, decay: string, sustain: string | null, release: string) => ({ attack, decay, sustain, release });

export const MOD_TABS: ModTabSpec[] = [
  {
    id: "amp",
    label: "amp",
    env: { amount: null, ...adsr("attack", "decay", "sustain", "release"), dials: ["attack", "decay", "sustain", "release"] },
    lfo: { switch: "amplfo", rate: "tremolo", sync: "tremolosync", depth: "tremolodepth", shape: "tremoloshape", skew: "tremoloskew" },
  },
  {
    id: "filter",
    label: "filter",
    env: { amount: "lpenv", ...adsr("lpattack", "lpdecay", "lpsustain", "lprelease"), dials: ["lpenv", "lpattack", "lpdecay", "lpsustain", "lprelease"] },
    lfo: { switch: "filterlfo", rate: "lprate", sync: "lpsync", depth: "lpdepth", shape: "lpshape", skew: "lpskew" },
  },
  {
    id: "pitch",
    label: "pitch",
    env: { amount: "penv", ...adsr("pattack", "pdecay", null, "prelease"), dials: ["penv", "pattack", "pdecay", "prelease"] },
    // Vibrato: a sine, on while its rate isn't 0.
    lfo: { switch: null, rate: "vib", depth: "vibmod", fixedShape: "sine" },
  },
  {
    id: "pos",
    label: "pos",
    env: { amount: "wtenv", ...adsr("wtattack", "wtdecay", "wtsustain", "wtrelease"), dials: ["wtenv", "wtattack", "wtdecay", "wtsustain", "wtrelease"] },
    lfo: { switch: "poslfo", rate: "wtrate", sync: "wtsync", depth: "wtdepth", shape: "wtshape", skew: "wtskew" },
  },
  {
    id: "warp",
    label: "warp",
    env: { amount: "warpenv", ...adsr("warpattack", "warpdecay", "warpsustain", "warprelease"), dials: ["warpenv", "warpattack", "warpdecay", "warpsustain", "warprelease"] },
    lfo: { switch: "warplfo", rate: "warprate", sync: "warpsync", depth: "warpdepth", shape: "warpshape", skew: "warpskew" },
  },
  {
    id: "fm",
    label: "fm",
    // It scales the FM amount (fmi) from 0 up to its value.
    env: { amount: "fmi", switch: "fmenvon", ...adsr("fmattack", "fmdecay", "fmsustain", "fmrelease"), dials: ["fmi", "fmattack", "fmdecay", "fmsustain", "fmrelease", "fmenv"] },
  },
  {
    id: "width",
    label: "width",
    // superdough's pulse-width LFO is a triangle (getLfo's default shape).
    lfo: { switch: "pwlfo", rate: "pwrate", depth: "pwsweep", fixedShape: "tri" },
  },
];

export function getModTab(id: ModTab): ModTabSpec {
  return MOD_TABS.find((tab) => tab.id === id) ?? MOD_TABS[0];
}

// Whether the oscillator has this destination: position and warp are a wavetable's,
// width a pulse's.
export function tabAvailable(tab: ModTabSpec, settings: Settings): boolean {
  const kind = oscKind(String(settings.s));
  if (tab.id === "pos" || tab.id === "warp") return kind === "wavetable";
  if (tab.id === "width") return kind === "pulse";
  return true;
}

export function availableTabs(settings: Settings): ModTabSpec[] {
  return MOD_TABS.filter((tab) => tabAvailable(tab, settings));
}

// The view to show: the one asked for if the tab has it, else the one it has.
export function viewFor(tab: ModTabSpec, view: ModView): ModView {
  if (view === "lfo" && !tab.lfo) return "env";
  if (view === "env" && !tab.env) return "lfo";
  return view;
}

// Whether an envelope is shaping its destination: the amp one always; the FM one while
// switched on with some FM; the rest while their amount isn't 0 (the filter's only with
// the lowpass on).
export function envelopeOn(tab: ModTabSpec, settings: Settings): boolean {
  const env = tab.env;
  if (!env) return false;
  if (env.amount === null) return true;
  if (env.switch) return settings[env.switch] === "on" && settings[env.amount] !== 0;
  if (tab.id === "filter" && !lowpassOn(settings)) return false;
  return settings[env.amount] !== 0;
}

export function lfoOn(tab: ModTabSpec, settings: Settings): boolean {
  const lfo = tab.lfo;
  if (!lfo) return false;
  if (tab.id === "filter" && !lowpassOn(settings)) return false;
  return lfo.switch ? settings[lfo.switch] !== "off" : settings[lfo.rate] !== 0;
}

// Whether the tab moves anything beyond the amp envelope every patch has: marked on its tab.
export function modulated(tab: ModTabSpec, settings: Settings): boolean {
  return (tab.id !== "amp" && envelopeOn(tab, settings)) || lfoOn(tab, settings);
}

// The LFO's dials: the rate in Hz or synced, whichever the switch says, then the rest.
export function lfoDials(lfo: LfoSpec, settings: Settings): string[] {
  const rate = lfo.sync && lfo.switch && settings[lfo.switch] === "sync" ? lfo.sync : lfo.rate;
  return [rate, lfo.depth, lfo.shape, lfo.skew].filter((id): id is string => !!id);
}

// The settings that switch an envelope on, so dragging its shape is heard: an amount for
// the ones that have one (an octave and a bit for the filter, opening a lowpass that's
// fully open down to 1 kHz first), the switch and some FM for the FM one. Nothing when
// it's already on.
export function enableEnvelope(tab: ModTabSpec, settings: Settings): Record<string, Value> {
  const env = tab.env;
  if (!env || env.amount === null || envelopeOn(tab, settings)) return {};
  const changes: Record<string, Value> = {};
  if (env.switch) {
    changes[env.switch] = "on";
    if (settings[env.amount] === 0) changes[env.amount] = 2;
    return changes;
  }
  if (tab.id === "filter") {
    changes.lp = "on";
    if (Number(settings.cutoff) >= 20000) changes.cutoff = 1000;
  }
  if (settings[env.amount] === 0) changes[env.amount] = tab.id === "pitch" ? 12 : tab.id === "filter" ? 2 : 0.5;
  return changes;
}

// The settings that switch an LFO on, so dragging it is heard: its switch to hz (or
// on), or vibrato at 5 Hz; the filter's also needs the lowpass on.
export function enableLfo(tab: ModTabSpec, settings: Settings): Record<string, Value> {
  const lfo = tab.lfo;
  if (!lfo || lfoOn(tab, settings)) return {};
  const changes: Record<string, Value> = {};
  if (tab.id === "filter") {
    changes.lp = "on";
    if (Number(settings.cutoff) >= 20000) changes.cutoff = 1000;
  }
  if (lfo.switch) {
    const options = getParam(lfo.switch);
    changes[lfo.switch] = options?.kind === "choice" && options.options.some((o) => o.value === "hz") ? "hz" : "on";
  } else if (settings[lfo.rate] === 0) {
    changes[lfo.rate] = 5;
  }
  return changes;
}
