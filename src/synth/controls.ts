import { BASIC_SHAPES_TABLE } from "./basicShapes";

// The Synth view's model: one oscillator and what shapes it, every setting a Strudel
// control. A patch is written into code as an object of those controls,
// note("c").set(patch), and auditioned with exactly the same object, so what the panel
// plays is what the code plays. Pure, so it's tested without audio.
//
// Keys are Strudel's main control names (cutoff, not lpf): .set() takes the object as it
// is, and aliases are only resolved by the methods (core controls.mjs, registerControl).

// Numbers, names, and lists (partials: the harmonics' levels).
export type Scalar = number | string;
export type Value = Scalar | number[];

// What kind of oscillator a sound is decides which controls it has.
export type OscKind = "basic" | "additive" | "pulse" | "supersaw" | "wavetable";

export const BASIC_SHAPES = ["sine", "triangle", "square", "sawtooth"];
// "user" is superdough's additive synth: sine harmonics at the levels in partials.
export const SYNTH_SOUNDS = [...BASIC_SHAPES, "user", "pulse", "supersaw"];

export function oscKind(s: string): OscKind {
  if (s === "user") return "additive";
  if (s === "pulse") return "pulse";
  if (s === "supersaw") return "supersaw";
  if (BASIC_SHAPES.includes(s)) return "basic";
  return "wavetable";
}

export type Section = "osc" | "filter" | "amp" | "pitch" | "fx" | "out";

// Every setting, by id. Each id is the control it writes, except the lowpass and
// highpass switches (lp, hp), which write nothing themselves.
export type Settings = Record<string, Value>;

interface BaseParam {
  id: string;
  label: string;
  section: Section;
  // The oscillators that have this setting. Missing: all of them.
  kinds?: OscKind[];
  // Whether the setting is written (and shown live, not greyed out) for these settings.
  // Missing: always.
  active?: (settings: Settings) => boolean;
  // A value that sounds the same as leaving the control out; at it the key is left out.
  omitAt?: Value;
}

export interface NumberParam extends BaseParam {
  kind: "number";
  min: number;
  max: number;
  default: number;
  // Digits after the point the value is rounded to.
  decimals: number;
  // How the dial maps to the range: "log" for frequencies, "time" (cubed) for seconds,
  // so short times get most of the dial.
  curve?: "linear" | "log" | "time";
  unit?: string;
}

export interface ChoiceParam extends BaseParam {
  kind: "choice";
  options: { value: Scalar; label: string }[];
  default: Scalar;
}

// A list of levels (0 to 1), one per harmonic, drawn as bars.
export interface HarmonicsParam extends BaseParam {
  kind: "harmonics";
  count: number;
  default: number[];
}

export type Param = NumberParam | ChoiceParam | HarmonicsParam;

export const HARMONICS = 16;

// Settings that switch something on or off without writing a control themselves.
const SWITCHES = new Set(["lp", "hp"]);

const WARP_MODES = [
  "none", "asym", "mirror", "bendp", "bendm", "bendmp", "sync", "quant", "fold", "pwm",
  "orbit", "spin", "chaos", "primes", "binary", "brownian", "reciprocal", "wormhole",
  "logistic", "sigmoid", "fractal", "flip",
];

// Delay times in cycles, as Strudel's delaysync takes them.
const DELAY_SYNCS: [number, string][] = [
  [1 / 16, "1/16"], [1 / 8, "1/8"], [3 / 16, "3/16"], [1 / 4, "1/4"],
  [3 / 8, "3/8"], [1 / 2, "1/2"], [3 / 4, "3/4"], [1, "1"],
];

const kindOf = (s: Settings) => oscKind(String(s.s));
// Two filters in series: a lowpass and a highpass, each switched on by itself. The type
// (ftype) applies to both, but superdough's ladder is always a lowpass (helpers.mjs
// createFilter ignores the type for it), so with a ladder the highpass isn't written.
export const lowpassOn = (s: Settings) => s.lp === "on";
export const highpassOn = (s: Settings) => s.hp === "on" && s.ftype !== "ladder";
const lowpassEnvOn = (s: Settings) => lowpassOn(s) && s.lpenv !== 0;
const unisonOn = (s: Settings) => Number(s.unison) > 1;
const WT = { kinds: ["wavetable"] as OscKind[] };
const UNISON = { kinds: ["supersaw", "wavetable"] as OscKind[] };

const num = (
  id: string,
  label: string,
  section: Section,
  [min, max, def, decimals]: [number, number, number, number],
  more: Partial<NumberParam> = {},
): NumberParam => ({ kind: "number", id, label, section, min, max, default: def, decimals, ...more });

const choice = (
  id: string,
  label: string,
  section: Section,
  options: (Scalar | [Scalar, string])[],
  def: Scalar,
  more: Partial<ChoiceParam> = {},
): ChoiceParam => ({
  kind: "choice",
  id,
  label,
  section,
  options: options.map((o) => (Array.isArray(o) ? { value: o[0], label: o[1] } : { value: o, label: String(o) })),
  default: def,
  ...more,
});

const sec = { unit: "s", curve: "time" } as const;

// In the order they're written. The oscillator's choices are the registered sounds, so
// `s` has no fixed options here.
export const PARAMS: Param[] = [
  choice("s", "wave", "osc", [], BASIC_SHAPES_TABLE),
  num("n", "table", "osc", [0, 127, 0, 0], { ...WT, omitAt: 0 }),
  num("wt", "position", "osc", [0, 1, 0, 2], { ...WT }),
  num("warp", "warp", "osc", [0, 1, 0, 2], { ...WT, omitAt: 0 }),
  choice("warpmode", "warp mode", "osc", WARP_MODES, "none", {
    ...WT,
    active: (s) => s.warp !== 0,
    omitAt: "none",
  }),
  num("pw", "width", "osc", [0, 1, 0.5, 2], { kinds: ["pulse"] }),
  num("unison", "voices", "osc", [1, 16, 1, 0], UNISON),
  num("detune", "detune", "osc", [0, 1, 0.18, 2], { ...UNISON, active: unisonOn }),
  num("spread", "spread", "osc", [0, 1, 0.6, 2], { ...UNISON, active: unisonOn }),
  {
    kind: "harmonics",
    id: "partials",
    label: "harmonics",
    section: "osc",
    count: HARMONICS,
    default: new Array<number>(HARMONICS).fill(1),
    // A sine has no harmonics to scale: superdough plays its own sine whatever partials says.
    kinds: ["basic", "additive"],
    active: (s) => s.s !== "sine",
  },
  num("noise", "noise", "osc", [0, 1, 0, 2], { kinds: ["basic", "additive"], omitAt: 0 }),
  num("fmi", "fm", "osc", [0, 32, 0, 2], { omitAt: 0 }),
  num("fmh", "fm ratio", "osc", [0.125, 16, 1, 3], { active: (s) => s.fmi !== 0, curve: "log" }),

  choice("lp", "lowpass", "filter", ["off", "on"], "off"),
  choice("hp", "highpass", "filter", ["off", "on"], "off"),
  choice("ftype", "type", "filter", ["12db", "24db", "ladder"], "12db", {
    active: (s) => lowpassOn(s) || highpassOn(s),
    omitAt: "12db",
  }),
  num("cutoff", "lp freq", "filter", [20, 20000, 20000, 0], { active: lowpassOn, curve: "log", unit: "Hz" }),
  num("resonance", "lp res", "filter", [0, 30, 1, 2], { active: lowpassOn }),
  num("hcutoff", "hp freq", "filter", [20, 20000, 20, 0], { active: highpassOn, curve: "log", unit: "Hz" }),
  num("hresonance", "hp res", "filter", [0, 30, 1, 2], { active: highpassOn }),
  num("drive", "drive", "filter", [0, 5, 0.69, 2], { active: (s) => lowpassOn(s) && s.ftype === "ladder", omitAt: 0.69 }),
  // The envelope moves the lowpass's cutoff.
  num("lpenv", "env", "filter", [-8, 8, 0, 2], { active: lowpassOn, omitAt: 0 }),
  num("lpattack", "attack", "filter", [0, 10, 0.005, 3], { ...sec, active: lowpassEnvOn }),
  num("lpdecay", "decay", "filter", [0, 10, 0.14, 3], { ...sec, active: lowpassEnvOn }),
  num("lpsustain", "sustain", "filter", [0, 1, 0, 2], { active: lowpassEnvOn }),
  num("lprelease", "release", "filter", [0, 10, 0.1, 3], { ...sec, active: lowpassEnvOn }),

  // Always written, all four: superdough fills in a missing one depending on which
  // others are set, so leaving one out wouldn't mean its default.
  num("attack", "attack", "amp", [0, 10, 0.005, 3], sec),
  num("decay", "decay", "amp", [0, 10, 0.3, 3], sec),
  num("sustain", "sustain", "amp", [0, 1, 0.7, 2]),
  num("release", "release", "amp", [0, 10, 0.2, 3], sec),

  num("penv", "env", "pitch", [-24, 24, 0, 1], { omitAt: 0, unit: "st" }),
  num("pattack", "attack", "pitch", [0, 10, 0.001, 3], { ...sec, active: (s) => s.penv !== 0 }),
  num("pdecay", "decay", "pitch", [0, 10, 0.1, 3], { ...sec, active: (s) => s.penv !== 0 }),
  num("prelease", "release", "pitch", [0, 10, 0.001, 3], { ...sec, active: (s) => s.penv !== 0 }),
  num("vib", "vibrato", "pitch", [0, 20, 0, 2], { omitAt: 0, unit: "Hz", curve: "time" }),
  num("vibmod", "depth", "pitch", [0, 12, 0.5, 2], { active: (s) => s.vib !== 0, unit: "st" }),

  num("delay", "delay", "fx", [0, 1, 0, 2], { omitAt: 0 }),
  choice("delaysync", "time", "fx", DELAY_SYNCS, 3 / 16, { active: (s) => s.delay !== 0 }),
  num("delayfeedback", "feedback", "fx", [0, 0.95, 0.5, 2], { active: (s) => s.delay !== 0 }),
  num("room", "reverb", "fx", [0, 1, 0, 2], { omitAt: 0 }),
  num("roomsize", "size", "fx", [0, 10, 2, 2], { active: (s) => s.room !== 0 }),
  num("roomlp", "damp", "fx", [200, 20000, 8000, 0], { active: (s) => s.room !== 0, curve: "log", unit: "Hz" }),

  num("gain", "gain", "out", [0, 2, 1, 2], { omitAt: 1 }),
  num("pan", "pan", "out", [0, 1, 0.5, 2], { omitAt: 0.5 }),
];

const BY_ID = new Map(PARAMS.map((p) => [p.id, p]));

export function getParam(id: string): Param | undefined {
  return BY_ID.get(id);
}

export const DEFAULT_SETTINGS: Settings = Object.fromEntries(PARAMS.map((p) => [p.id, p.default]));

// The Strudel control a setting writes, or null for a switch, which writes none.
export function controlName(id: string): string | null {
  return SWITCHES.has(id) ? null : id;
}

// Whether the oscillator has the setting at all.
export function hasParam(param: Param, settings: Settings): boolean {
  return !param.kinds || param.kinds.includes(kindOf(settings));
}

export function isActive(param: Param, settings: Settings): boolean {
  return hasParam(param, settings) && (param.active?.(settings) ?? true);
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// A value that fits the param: a number in range, rounded; a choice it offers. The
// oscillator takes any sound name.
export function normalize(param: Param, raw: unknown): Value {
  if (param.kind === "number") {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) return param.default;
    return roundTo(Math.min(param.max, Math.max(param.min, n)), param.decimals);
  }
  if (param.kind === "harmonics") {
    const list = Array.isArray(raw) ? raw : [];
    return Array.from({ length: param.count }, (_, i) => {
      const level = Number(list[i] ?? (Array.isArray(raw) ? 0 : 1));
      return Number.isFinite(level) ? roundTo(Math.min(1, Math.max(0, level)), 2) : 0;
    });
  }
  if (param.id === "s") return typeof raw === "string" && raw.trim() ? raw.trim() : param.default;
  return param.options.some((o) => o.value === raw) ? (raw as Value) : param.default;
}

export interface ControlEntry {
  control: string;
  value: Value;
  section: Section;
}

// The controls a patch writes, in PARAMS order: the active settings, less those at a
// value that sounds the same as leaving them out.
export function patchEntries(settings: Settings): ControlEntry[] {
  const entries: ControlEntry[] = [];
  for (const param of PARAMS) {
    const control = controlName(param.id);
    if (control === null || !isActive(param, settings)) continue;
    const value = settings[param.id] ?? param.default;
    if (param.omitAt !== undefined && value === param.omitAt) continue;
    if (param.kind === "harmonics" && !harmonicsWritten(value, settings)) continue;
    entries.push({ control, value: Array.isArray(value) ? trimHarmonics(value) : value, section: param.section });
  }
  return entries;
}

// A basic shape at every harmonic's full level is the stock waveform, so partials is left
// out; the additive synth needs it, trailing silent harmonics trimmed.
function harmonicsWritten(value: Value, settings: Settings): boolean {
  if (!Array.isArray(value)) return false;
  return oscKind(String(settings.s)) === "additive" || value.some((level) => level !== 1);
}

export function trimHarmonics(levels: number[]): number[] {
  let end = levels.length;
  while (end > 1 && levels[end - 1] === 0) end--;
  return levels.slice(0, end);
}

export function patchControls(settings: Settings): Record<string, Value> {
  return Object.fromEntries(patchEntries(settings).map((e) => [e.control, e.value]));
}

// Dial position (0 to 1) ↔ value, along the param's curve.
export function toDial(param: NumberParam, value: number): number {
  const { min, max } = param;
  const t = (value - min) / (max - min);
  if (param.curve === "log" && min > 0) return Math.log(value / min) / Math.log(max / min);
  if (param.curve === "time") return Math.cbrt(Math.max(0, t));
  return t;
}

export function fromDial(param: NumberParam, dial: number): number {
  const { min, max } = param;
  const d = Math.min(1, Math.max(0, dial));
  const raw =
    param.curve === "log" && min > 0 ? min * (max / min) ** d : param.curve === "time" ? min + (max - min) * d ** 3 : min + (max - min) * d;
  return roundTo(raw, param.decimals);
}

// How a value reads under its dial: "2.89 kHz", "330 ms", "0.44".
export function formatValue(param: Param, value: Value): string {
  if (param.kind === "harmonics") return Array.isArray(value) ? `${trimHarmonics(value).length} partials` : "";
  if (param.kind === "choice") return param.options.find((o) => o.value === value)?.label ?? String(value);
  const n = Number(value);
  if (param.unit === "Hz" && n >= 1000) return `${roundTo(n / 1000, 2)} kHz`;
  if (param.unit === "s" && n < 1) return `${roundTo(n * 1000, n < 0.01 ? 1 : 0)} ms`;
  const text = String(roundTo(n, param.decimals));
  return param.unit ? `${text} ${param.unit}` : text;
}
