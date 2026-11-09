import { HARMONICS, highpassOn, lowpassOn, oscKind, type Settings } from "./controls";

// What the Synth view draws: one cycle of the oscillator, the filter's response and the
// envelopes, worked out from the same settings the code gets. Pure, so it's tested
// without audio. The formulas follow superdough 1.3.0 (synth.mjs, worklets.mjs,
// helpers.mjs); re-check them when upgrading.

const TWO_PI = Math.PI * 2;
const frac = (x: number) => x - Math.floor(x);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// ---------------------------------------------------------------- oscillator

// The phase warps of superdough's wavetable oscillator (WavetableOscillatorProcessor
// ._warpPhase), by the name warpmode takes.
export function warpPhase(phase: number, amt: number, mode: string): number {
  const toBits = (a: number, min = 2, max = 12) => {
    const b = max + (min - max) * a;
    return { b, n: Math.floor(Math.pow(2, b) + 0.5) };
  };
  const mirror = (x: number) => 1 - Math.abs(2 * x - 1);
  switch (mode) {
    case "asym": {
      const a = 0.01 + 0.99 * amt;
      return phase < a ? (0.5 * phase) / a : 0.5 + (0.5 * (phase - a)) / (1 - a);
    }
    case "mirror":
      return mirror(warpPhase(phase, amt, "asym"));
    case "bendp":
      return Math.pow(phase, 1 + 3 * amt);
    case "bendm":
      return Math.pow(phase, 1 / (1 + 3 * amt));
    case "bendmp":
      return amt < 0.5 ? warpPhase(phase, 1 - 2 * amt, "bendm") : warpPhase(phase, 2 * amt - 1, "bendp");
    case "sync":
      return (phase * Math.pow(16, amt ** 2)) % 1;
    case "quant": {
      const { n } = toBits(amt);
      return Math.floor(phase * n) / n;
    }
    case "fold": {
      const k = 1 + Math.max(1, Math.floor(7 * amt + 0.5));
      return Math.abs(frac(k * phase) - 0.5) * 2;
    }
    case "pwm": {
      const w = clamp(0.5 + 0.49 * (2 * amt - 1), 0, 1);
      return phase < w ? (phase / w) * 0.5 : 0.5 + ((phase - w) / (1 - w)) * 0.5;
    }
    case "orbit":
      return frac(phase + 0.5 * amt * Math.sin(TWO_PI * 3 * phase));
    case "spin":
      return frac(phase + 0.5 * amt * Math.sin(TWO_PI * toBits(amt, 1, 6).n * phase));
    case "chaos": {
      const r = 3.7 + 0.3 * amt;
      return clamp((1 - amt) * phase + amt * r * phase * (1 - phase), 0, 1);
    }
    case "primes": {
      const isPrime = (n: number) => {
        if (n < 2) return false;
        if (n % 2 === 0) return n === 2;
        for (let d = 3; d * d <= n; d += 2) if (n % d === 0) return false;
        return true;
      };
      let { n } = toBits(amt, 3);
      while (!isPrime(n)) n++;
      return Math.floor(phase * n) / n;
    }
    case "binary": {
      const b = Math.floor(toBits(amt, 3).b + 0.5);
      const n = 1 << b;
      let i = Math.floor(phase * n);
      let r = 0;
      for (let bit = 0; bit < b; bit++) {
        r = (r << 1) | (i & 1);
        i >>>= 1;
      }
      return r / n;
    }
    case "reciprocal": {
      const g = 2 + 4 * amt;
      const den = phase + (1 - phase) * g;
      return clamp(den > 1e-12 ? (phase * g) / den : 0, 0, 1);
    }
    case "wormhole": {
      const gap = clamp(0.8 * amt, 0, 1);
      const a = 0.5 * (1 - gap);
      const b = 0.5 * (1 + gap);
      if (phase < a) return (phase / a) * 0.5;
      if (phase > b) return 0.5 * (1 + (phase - b) / (1 - b));
      return 0.5;
    }
    case "logistic": {
      let x = phase;
      const r = 3.6 + 0.4 * amt;
      const iters = 1 + Math.floor(2 * amt + 0.5);
      for (let i = 0; i < iters; i++) x = r * x * (1 - x);
      return clamp(x, 0, 1);
    }
    case "sigmoid": {
      const k = 1 + 10 * amt;
      const y = (x: number) => 1 / (1 + Math.exp(-k * x));
      return (y(phase - 0.5) - y(-0.5)) / (y(0.5) - y(-0.5));
    }
    case "fractal":
      return frac(phase + 0.5 * Math.sin(TWO_PI * phase) * amt);
    // brownian uses superdough's hashed noise; drawn unwarped. "flip" negates instead.
    default:
      return phase;
  }
}

// The level of each harmonic of a basic shape (superdough's waveformN terms):
// [cosine, sine] coefficients for harmonic n (1-based).
function harmonicTerms(s: string, n: number): [number, number] {
  if (s === "sawtooth") return [0, -1 / n];
  if (s === "square") return [0, n % 2 === 0 ? 0 : 1 / n];
  if (s === "triangle") return [n % 2 === 0 ? 0 : 1 / (n * n), 0];
  return [0, 1];
}

// Scales a cycle so its peak is 1, as a PeriodicWave is normalized.
function normalizePeak(cycle: Float32Array): Float32Array {
  let peak = 0;
  for (const v of cycle) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < cycle.length; i++) cycle[i] /= peak;
  return cycle;
}

// Linear interpolation into a frame, wrapping, like the worklet's _sampleFrame.
function sampleFrame(frame: Float32Array, phase: number): number {
  const pos = phase * frame.length;
  let i = Math.floor(pos);
  if (i >= frame.length) i = 0;
  const t = pos - i;
  return frame[i] + (frame[(i + 1) % frame.length] - frame[i]) * t;
}

// The wavetable frame index the position plays (fractional between two frames).
export function framePosition(position: number, frameCount: number): number {
  return clamp(position, 0, 1) * Math.max(0, frameCount - 1);
}

// One cycle of the oscillator as `points` samples between -1 and 1. A wavetable needs its
// frames (null until loaded: then null comes back).
export function oscCycle(settings: Settings, points: number, frames?: Float32Array[] | null): Float32Array | null {
  const s = String(settings.s);
  const kind = oscKind(s);
  const cycle = new Float32Array(points);
  if (kind === "wavetable") {
    if (!frames?.length) return null;
    const idx = framePosition(Number(settings.wt), frames.length);
    const a = frames[Math.floor(idx)];
    const b = frames[Math.min(frames.length - 1, Math.floor(idx) + 1)];
    const t = idx - Math.floor(idx);
    const amt = clamp(Number(settings.warp), 0, 1);
    const mode = String(settings.warpmode);
    for (let i = 0; i < points; i++) {
      const phase = i / points;
      const ph = warpPhase(phase, amt, mode);
      let v = sampleFrame(a, ph) + (sampleFrame(b, ph) - sampleFrame(a, ph)) * t;
      if (mode === "flip" && phase < amt) v = -v;
      cycle[i] = v;
    }
    return cycle;
  }
  if (kind === "pulse") {
    const pw = clamp(Number(settings.pw), 0, 1);
    for (let i = 0; i < points; i++) cycle[i] = i / points < pw ? 1 : -1;
    return cycle;
  }
  const partials = Array.isArray(settings.partials) ? settings.partials : null;
  const additive = kind === "additive" || (kind === "basic" && s !== "sine" && partials?.some((p) => p !== 1));
  if (additive && partials) {
    for (let n = 1; n <= partials.length; n++) {
      const [re, im] = harmonicTerms(s, n);
      if (!partials[n - 1] || (!re && !im)) continue;
      for (let i = 0; i < points; i++) {
        const x = (TWO_PI * n * i) / points;
        cycle[i] += partials[n - 1] * (re * Math.cos(x) + im * Math.sin(x));
      }
    }
    return normalizePeak(cycle);
  }
  for (let i = 0; i < points; i++) {
    const p = i / points;
    cycle[i] =
      s === "sine"
        ? Math.sin(TWO_PI * p)
        : s === "square"
          ? p < 0.5 ? 1 : -1
          : s === "triangle"
            ? 1 - 4 * Math.abs(frac(p + 0.25) - 0.5)
            : 2 * frac(p + 0.5) - 1; // sawtooth, supersaw
  }
  return cycle;
}

// Harmonic levels after painting from one bar to another: every bar between gets a
// level on the line between them, so a fast drag leaves no gaps.
export function paintHarmonics(levels: number[], from: [number, number], to: [number, number]): number[] {
  const next = [...levels];
  const [i0, v0] = from;
  const [i1, v1] = to;
  const steps = Math.abs(i1 - i0);
  for (let k = 0; k <= steps; k++) {
    const i = steps === 0 ? i1 : i0 + Math.sign(i1 - i0) * k;
    if (i < 0 || i >= next.length) continue;
    const v = steps === 0 ? v1 : v0 + ((v1 - v0) * k) / steps;
    next[i] = Math.round(clamp(v, 0, 1) * 100) / 100;
  }
  return next;
}

export const HARMONIC_COUNT = HARMONICS;

// ---------------------------------------------------------------- filter

const SAMPLE_RATE = 48000;

// The gain in dB at `freq` of one of superdough's filters: a Web Audio biquad (the 24db
// type is two in series), or its ladder (a 4-pole lowpass with the worklet's resonance
// feedback and makeup gain, here as the analog model).
export function oneFilterGain(type: "lp" | "hp", f0: number, q: number, ftype: string, freq: number): number {
  if (ftype === "ladder" && type === "lp") {
    const k = Math.min(3.95, q * 0.13);
    const x = freq / f0;
    // (1 + jx)^4 + k
    let re = 1;
    let im = 0;
    for (let i = 0; i < 4; i++) [re, im] = [re - im * x, re * x + im];
    re += k;
    const mag = Math.min(1.75, 1 + q * 0.13) / Math.hypot(re, im);
    return 20 * Math.log10(Math.max(mag, 1e-6));
  }
  const w0 = (TWO_PI * Math.min(f0, SAMPLE_RATE / 2 - 1)) / SAMPLE_RATE;
  const cos = Math.cos(w0);
  // Lowpass and highpass Q is the resonant peak in dB.
  const alpha = Math.sin(w0) / (2 * Math.pow(10, q / 20));
  const b: [number, number, number] =
    type === "hp" ? [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2] : [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
  const a: [number, number, number] = [1 + alpha, -2 * cos, 1 - alpha];
  const w = (TWO_PI * freq) / SAMPLE_RATE;
  const response = (c: [number, number, number]) => {
    const re = c[0] + c[1] * Math.cos(-w) + c[2] * Math.cos(-2 * w);
    const im = c[1] * Math.sin(-w) + c[2] * Math.sin(-2 * w);
    return Math.hypot(re, im);
  };
  const db = 20 * Math.log10(Math.max(response(b) / response(a), 1e-6));
  return ftype === "24db" ? 2 * db : db;
}

// Both filters' gain together (they're in series), in dB; 0 with neither on.
export function filterGain(settings: Settings, freq: number): number {
  const ftype = String(settings.ftype);
  let db = 0;
  if (lowpassOn(settings)) db += oneFilterGain("lp", Number(settings.cutoff), Number(settings.resonance), ftype, freq);
  if (highpassOn(settings)) db += oneFilterGain("hp", Number(settings.hcutoff), Number(settings.hresonance), ftype, freq);
  return db;
}

// Frequencies spaced evenly on a log scale across the audible range, for a curve
// `count` points wide.
export function logFrequencies(count: number, min = 20, max = 20000): number[] {
  return Array.from({ length: count }, (_, i) => min * Math.pow(max / min, count > 1 ? i / (count - 1) : 0));
}

// ---------------------------------------------------------------- LFOs

// One of superdough's LFO shapes at `phase` (0 to 1), from 0 to 1 (worklets.mjs
// waveshapes). Skew moves a triangle's peak and a square's edge; the others ignore it.
export function lfoValue(shape: string, phase: number, skew = 0.5): number {
  const p = frac(phase);
  switch (shape) {
    case "sine":
      return Math.sin(TWO_PI * p) * 0.5 + 0.5;
    case "ramp":
      return p;
    case "saw":
      return 1 - p;
    case "square":
      return p >= skew ? 0 : 1;
    default: {
      // tri
      if (skew <= 0) return 1 - p;
      if (skew >= 1) return p;
      return p >= skew ? (1 - p) / (1 - skew) : p / skew;
    }
  }
}

// ---------------------------------------------------------------- envelopes

// Where the envelope's corners are drawn, as fractions of the display: x across, y up
// (0 at the bottom). Each time segment gets up to `SEGMENT` of the width along the same
// curve as its dial, so a drag maps straight back to a time; the held part between
// decay and release has a fixed width.
export const SEGMENT = 0.28;
export const HOLD = 0.16;

export interface EnvelopeShape {
  attackEnd: number;
  decayEnd: number;
  releaseStart: number;
  releaseEnd: number;
  sustain: number;
  // The zoom the segments were drawn at (envelopeZoom).
  zoom: number;
}

export interface EnvelopeDials {
  attack: number;
  decay: number;
  release: number;
}

// How much to widen the segments so a short envelope still fills the display (up to 4
// times). Kept fixed while a corner is dragged, so it doesn't jump under the pointer.
export function envelopeZoom(dials: EnvelopeDials): number {
  const used = SEGMENT * (dials.attack + dials.decay + dials.release);
  return used > 0 ? Math.min(4, Math.max(1, (1 - HOLD) / used)) : 4;
}

export function envelopeShape(dials: EnvelopeDials, sustain: number, zoom = 1): EnvelopeShape {
  const segment = SEGMENT * zoom;
  const attackEnd = segment * dials.attack;
  const decayEnd = attackEnd + segment * dials.decay;
  const releaseStart = decayEnd + HOLD;
  return { attackEnd, decayEnd, releaseStart, releaseEnd: releaseStart + segment * dials.release, sustain, zoom };
}

// The envelope's level (0 to 1) at x along the display.
export function envelopeLevel(shape: EnvelopeShape, x: number): number {
  const { attackEnd, decayEnd, releaseStart, releaseEnd, sustain } = shape;
  if (x <= attackEnd) return attackEnd > 0 ? x / attackEnd : 1;
  if (x <= decayEnd) return 1 - (1 - sustain) * ((x - attackEnd) / (decayEnd - attackEnd));
  if (x <= releaseStart) return sustain;
  if (x <= releaseEnd) return sustain * (1 - (x - releaseStart) / (releaseEnd - releaseStart));
  return 0;
}

export type EnvelopeHandle = "attack" | "decay" | "release";

// The handle nearest to a point on the display (fractions, y up).
export function nearestHandle(shape: EnvelopeShape, x: number, y: number, hasSustain: boolean): EnvelopeHandle {
  const handles: [EnvelopeHandle, number, number][] = [
    ["attack", shape.attackEnd, 1],
    ["decay", shape.decayEnd, hasSustain ? shape.sustain : 0],
    ["release", shape.releaseEnd, 0],
  ];
  let best = handles[0];
  let bestDistance = Infinity;
  for (const handle of handles) {
    const d = Math.hypot(handle[1] - x, (handle[2] - y) * 0.5);
    if (d < bestDistance) {
      bestDistance = d;
      best = handle;
    }
  }
  return best[0];
}

// Dragging a handle to x: the dial position (0 to 1) of the time it sets.
export function handleDial(shape: EnvelopeShape, handle: EnvelopeHandle, x: number): number {
  const start = handle === "attack" ? 0 : handle === "decay" ? shape.attackEnd : shape.releaseStart;
  return clamp((x - start) / (SEGMENT * shape.zoom), 0, 1);
}
