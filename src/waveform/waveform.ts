// The Sample view's arithmetic: waveform peaks, the visible span and zooming, ruler
// ticks, the playhead, and reading a .wav header. Pure; the store and the canvas use it.

// A stretch of the file, in seconds.
export interface Span {
  start: number;
  end: number;
}

// --- Peaks -----------------------------------------------------------------------------

// The lowest and highest sample in each block of `blockSize` samples, over all channels.
// Drawing a zoomed-out view reads these instead of every sample.
export interface Blocks {
  blockSize: number;
  min: Float32Array;
  max: Float32Array;
}

export function buildBlocks(channels: Float32Array[], blockSize = 256): Blocks {
  const length = channels[0]?.length ?? 0;
  const count = Math.ceil(length / blockSize);
  const min = new Float32Array(count);
  const max = new Float32Array(count);
  for (let b = 0; b < count; b++) {
    const from = b * blockSize;
    const to = Math.min(length, from + blockSize);
    let lo = Infinity;
    let hi = -Infinity;
    for (const data of channels) {
      for (let i = from; i < to; i++) {
        const v = data[i];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    min[b] = lo;
    max[b] = hi;
  }
  return { blockSize, min, max };
}

// The lowest and highest sample under each of `columns` columns, the first starting at
// sample `start`, each `perColumn` samples wide (less than 1 when zoomed in past single
// samples). Columns past the end of the file are 0.
export function columnPeaks(
  channels: Float32Array[],
  blocks: Blocks,
  start: number,
  perColumn: number,
  columns: number,
): { min: Float32Array; max: Float32Array } {
  const length = channels[0]?.length ?? 0;
  const min = new Float32Array(columns);
  const max = new Float32Array(columns);
  const useBlocks = perColumn >= blocks.blockSize * 2;
  for (let c = 0; c < columns; c++) {
    const from = Math.max(0, Math.floor(start + c * perColumn));
    // At least one sample, so a zoomed-in view joins up rather than leaving gaps.
    const to = Math.min(length, Math.max(from + 1, Math.floor(start + (c + 1) * perColumn)));
    if (from >= length || to <= 0) continue;
    let lo = Infinity;
    let hi = -Infinity;
    if (useBlocks) {
      const last = Math.min(blocks.min.length, Math.ceil(to / blocks.blockSize));
      for (let b = Math.floor(from / blocks.blockSize); b < last; b++) {
        if (blocks.min[b] < lo) lo = blocks.min[b];
        if (blocks.max[b] > hi) hi = blocks.max[b];
      }
    } else {
      for (const data of channels) {
        for (let i = from; i < to; i++) {
          if (data[i] < lo) lo = data[i];
          if (data[i] > hi) hi = data[i];
        }
      }
    }
    min[c] = lo;
    max[c] = hi;
  }
  return { min, max };
}

// --- The visible span ------------------------------------------------------------------

// The narrowest view: 64 samples, or 5ms, whichever is wider.
export function minSpan(sampleRate: number): number {
  return Math.max(0.005, 64 / sampleRate);
}

// `view` moved and narrowed as needed to lie inside the file, at least `least` wide.
export function clampView(view: Span, duration: number, least: number): Span {
  const width = Math.min(duration, Math.max(least, view.end - view.start));
  const start = Math.min(Math.max(0, view.start), duration - width);
  return { start, end: start + width };
}

// Zooms by `factor` (below 1 zooms in) keeping `anchor` (seconds) where it is on screen.
export function zoomView(view: Span, factor: number, anchor: number, duration: number, least: number): Span {
  const at = (anchor - view.start) / (view.end - view.start);
  const width = Math.min(duration, Math.max(least, (view.end - view.start) * factor));
  const start = anchor - at * width;
  return clampView({ start, end: start + width }, duration, least);
}

export function scrollView(view: Span, seconds: number, duration: number): Span {
  return clampView({ start: view.start + seconds, end: view.end + seconds }, duration, 0);
}

// What a wheel event over the waveform does: zoom by a factor (below 1 zooms in) or
// scroll by some pixels.
//   - A trackpad pinch arrives as a wheel event with ctrlKey set (Chromium's convention)
//     and small deltas, so it always zooms, more strongly per unit.
//   - Otherwise the stronger direction wins: sideways (a two-finger swipe, a tilt wheel,
//     or Shift+wheel) scrolls; up and down (a mouse wheel, a two-finger swipe) zooms.
// Deltas in lines or pages (some mouse drivers) are converted to pixels first.
export type WheelAction = { zoom: number } | { scroll: number };

const WHEEL_ZOOM = 0.002;
const PINCH_ZOOM = 0.02;
const LINE_PX = 16;

export interface WheelLike {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  shiftKey: boolean;
}

export function wheelAction({ deltaX, deltaY, deltaMode, ctrlKey, shiftKey }: WheelLike, pageHeight: number): WheelAction | null {
  const unit = deltaMode === 1 ? LINE_PX : deltaMode === 2 ? pageHeight : 1;
  const x = deltaX * unit;
  const y = deltaY * unit;
  if (ctrlKey) return y ? { zoom: Math.exp(y * PINCH_ZOOM) } : null;
  if (shiftKey && !x) return y ? { scroll: y } : null;
  if (Math.abs(x) > Math.abs(y)) return { scroll: x };
  return y ? { zoom: Math.exp(y * WHEEL_ZOOM) } : null;
}

// Seconds at `x` pixels across a view `width` wide, and back.
export function timeAt(view: Span, x: number, width: number): number {
  return view.start + (x / width) * (view.end - view.start);
}

export function xAt(view: Span, time: number, width: number): number {
  return ((time - view.start) / (view.end - view.start)) * width;
}

// A selection from two times in either order, inside the file.
export function spanBetween(a: number, b: number, duration: number): Span {
  const clamp = (t: number) => Math.min(duration, Math.max(0, t));
  return { start: clamp(Math.min(a, b)), end: clamp(Math.max(a, b)) };
}

// --- Ruler -----------------------------------------------------------------------------

const STEPS = [0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800];

// Times to label along the top: the smallest round step leaving at least `spacing`
// pixels between labels, and every multiple of it in view.
export function rulerTicks(view: Span, width: number, spacing = 72): { step: number; ticks: number[] } {
  const perSecond = width / (view.end - view.start);
  const step = STEPS.find((s) => s * perSecond >= spacing) ?? STEPS[STEPS.length - 1];
  const ticks: number[] = [];
  // Counting in whole steps, rounded, keeps 11 × 0.1 at 1.1 (and -0 at 0).
  for (let n = Math.ceil(view.start / step - 1e-9); n * step <= view.end + 1e-9; n++) {
    ticks.push(Number((n * step).toFixed(6)) + 0);
  }
  return { step, ticks };
}

// A tick's label, with as many decimals as the step needs: "0:05", "0:01.5", "0:00.250".
export function tickLabel(time: number, step: number): string {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  return timeText(time, decimals);
}

// "m:ss" with `decimals` places of seconds; "h:mm:ss" past an hour.
export function timeText(seconds: number, decimals = 3): string {
  const scale = 10 ** decimals;
  const total = Math.round(Math.max(0, seconds) * scale) / scale;
  const whole = Math.floor(total);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, "0");
  const fraction = decimals ? (total - whole).toFixed(decimals).slice(1) : "";
  return h ? `${h}:${String(m).padStart(2, "0")}:${s}${fraction}` : `${m}:${s}${fraction}`;
}

// --- Playback --------------------------------------------------------------------------

// Where the playhead is `elapsed` seconds after starting at `from`: running on to `to`
// and stopping there, or wrapping back to `from` when looping.
export function playheadAt(elapsed: number, from: number, to: number, loop: boolean): number {
  const length = to - from;
  if (length <= 0) return from;
  if (loop) return from + (((elapsed % length) + length) % length);
  return Math.min(to, from + Math.max(0, elapsed));
}

// --- File info -------------------------------------------------------------------------

export interface WavInfo {
  sampleRate: number;
  channels: number;
  bits: number;
  float: boolean;
  duration: number;
}

// The format of a .wav from its header, or null if the bytes aren't a WAVE file. Read
// before decoding: the decoded AudioBuffer is at the audio context's rate, not the file's.
export function wavInfo(bytes: ArrayBuffer): WavInfo | null {
  if (bytes.byteLength < 12) return null;
  const view = new DataView(bytes);
  const tag = (at: number) => String.fromCharCode(...new Uint8Array(bytes, at, 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let format: Omit<WavInfo, "duration"> | null = null;
  let blockAlign = 0;
  for (let at = 12; at + 8 <= bytes.byteLength; ) {
    const id = tag(at);
    const size = view.getUint32(at + 4, true);
    if (id === "fmt " && at + 24 <= bytes.byteLength) {
      const code = view.getUint16(at + 8, true);
      const channels = view.getUint16(at + 10, true);
      const sampleRate = view.getUint32(at + 12, true);
      blockAlign = view.getUint16(at + 20, true);
      const bits = view.getUint16(at + 22, true);
      // 3 is IEEE float. 0xfffe (extensible) puts the real code first in its sub-format.
      const extensible = code === 0xfffe && size >= 40 && at + 34 <= bytes.byteLength;
      const real = extensible ? view.getUint16(at + 32, true) : code;
      format = { sampleRate, channels, bits, float: real === 3 };
    }
    if (id === "data" && format && blockAlign) {
      return { ...format, duration: size / blockAlign / format.sampleRate };
    }
    // Chunks are padded to an even size.
    at += 8 + size + (size % 2);
  }
  return null;
}

// "7.50s · 44.1k · 16-bit · stereo".
export function infoText(duration: number, channels: number, wav: WavInfo | null): string {
  const parts = [`${duration.toFixed(2)}s`];
  if (wav) {
    parts.push(`${+(wav.sampleRate / 1000).toFixed(1)}k`, `${wav.bits}-bit${wav.float ? " float" : ""}`);
  }
  parts.push(channels === 1 ? "mono" : channels === 2 ? "stereo" : `${channels} ch`);
  return parts.join(" · ");
}
