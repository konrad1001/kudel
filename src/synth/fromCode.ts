import { isActive, normalize, oscKind, PARAMS, type Settings } from "./controls";

// Reading a patch object in the code back into the panel's settings (code → panel). Pure.
//
// - A control written as a plain value sets its setting (rounded and clamped as the
//   panel would).
// - A control written as anything else (slider(…), sine.range(…)) leaves its setting as
//   it was: the panel can't show an expression.
// - The switches that write no control of their own come from which controls are there:
//   cutoff means the lowpass is on, tremolosync a synced tremolo, and so on.
// - A missing control means Strudel's default, but only where the setting would be
//   written: a hidden one (the warp mode while nothing warps) keeps its value.

// A value read from the code: plain, or `expression` for anything else.
export type CodeValue = number | string | number[] | "expression";

type Has = (key: string) => boolean;
const wavetable = (s: Settings) => oscKind(String(s.s)) === "wavetable";

// Each switch's value from the controls present, in this order, and when the code speaks
// for it at all: the highpass isn't written with a ladder, the filter LFO without the
// lowpass, and so on; then the panel's own value stands.
const SWITCHES: [id: string, fromKeys: (has: Has) => string, matters: (s: Settings) => boolean][] = [
  ["lp", (has) => (has("cutoff") ? "on" : "off"), () => true],
  ["hp", (has) => (has("hcutoff") ? "on" : "off"), (s) => s.ftype !== "ladder"],
  ["amplfo", (has) => (has("tremolosync") ? "sync" : has("tremolo") ? "hz" : "off"), () => true],
  ["filterlfo", (has) => (has("lpsync") ? "sync" : has("lprate") ? "hz" : "off"), (s) => s.lp === "on"],
  ["poslfo", (has) => (has("wtsync") ? "sync" : has("wtrate") ? "hz" : "off"), wavetable],
  ["warplfo", (has) => (has("warpsync") ? "sync" : has("warprate") ? "hz" : "off"), wavetable],
  ["fmenvon", (has) => (["fmattack", "fmdecay", "fmsustain", "fmrelease"].some(has) ? "on" : "off"), (s) => s.fmi !== 0],
  ["pwlfo", (has) => (has("pwrate") ? "on" : "off"), (s) => oscKind(String(s.s)) === "pulse"],
];
const SWITCH_IDS = new Set(SWITCHES.map(([id]) => id));

export function settingsFromCode(code: Map<string, CodeValue>, current: Settings): Settings {
  const has = (key: string) => code.has(key);
  const next: Settings = { ...current };
  // Values first, so switches and missing controls are judged on the code's settings.
  for (const param of PARAMS) {
    const value = code.get(param.id);
    if (value !== undefined && value !== "expression") next[param.id] = normalize(param, value);
  }
  // A missing ftype with a filter on is the 12db default; read before the switches that
  // depend on it. With no filter on, the panel's choice stands.
  if (!has("ftype") && (has("cutoff") || has("hcutoff"))) next.ftype = "12db";
  for (const [id, fromKeys, matters] of SWITCHES) if (matters(next)) next[id] = fromKeys(has);
  for (const param of PARAMS) {
    if (code.has(param.id) || SWITCH_IDS.has(param.id) || !isActive(param, next)) continue;
    if (param.omitAt !== undefined) next[param.id] = param.omitAt;
    // A basic shape without partials plays its stock wave: every harmonic at full.
    else if (param.kind === "harmonics" && oscKind(String(next.s)) === "basic") next[param.id] = param.default;
  }
  return next;
}

// Whether two settings say the same thing.
export function sameSettings(a: Settings, b: Settings): boolean {
  return PARAMS.every((param) => JSON.stringify(a[param.id]) === JSON.stringify(b[param.id]));
}
