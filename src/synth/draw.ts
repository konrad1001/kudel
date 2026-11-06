import { filterGain, logFrequencies, envelopeLevel, type EnvelopeShape } from "./shapes";
import type { Settings } from "./controls";

// Drawing the Synth view's displays: blocky columns on a pixel grid, like a terminal
// rendering. Colours come from CSS variables, so a theme can change them.

// Pixels per block, across and up.
export const BLOCK = 3;

interface Palette {
  osc: string;
  env: string;
  foreground: string;
  dim: string;
  font: string;
}

function palette(el: Element): Palette {
  const style = getComputedStyle(el);
  const v = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    osc: v("--synth-osc", "#ff9e40"),
    env: v("--synth-env", "#5cc8e0"),
    foreground: v("--foreground", "#cccccc"),
    dim: v("--gutterForeground", "#3c3c3c"),
    font: `10px ${style.fontFamily}`,
  };
}

// Sizes the canvas's backing store to its CSS size at the screen's pixel ratio and
// returns a cleared context drawing in CSS pixels.
function prepare(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null {
  const ratio = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(width * ratio));
  const h = Math.max(1, Math.round(height * ratio));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return ctx;
}

const snap = (y: number) => Math.round(y / BLOCK) * BLOCK;

function label(ctx: CanvasRenderingContext2D, p: Palette, text: string, x: number, y: number, align: CanvasTextAlign = "left") {
  ctx.font = p.font;
  ctx.fillStyle = p.foreground;
  ctx.globalAlpha = 0.5;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.fillText(text, x, y);
  ctx.globalAlpha = 1;
}

// Room under a display for its ruler or labels.
export const FOOT = 14;

// Where the wave stack sits: frame 0 at the front (bottom left), the last frame at the
// back (top right), the way Ableton's Wavetable draws a table.
export const STACK = { width: 0.74, shiftX: 0.22, amp: 0.15 };

// A wavetable as a stack of its frames in perspective, the one the position plays in the
// oscillator colour and the rest as faint lines; a single wave (a synth) large and
// centred.
export function drawWaves(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  waves: { current: Float32Array | null; stack: Float32Array[]; position: number; note?: string },
): void {
  const ctx = prepare(canvas, width, height);
  if (!ctx) return;
  const p = palette(canvas);
  const pad = 8;
  const stacked = waves.stack.length > 1;
  const waveWidth = stacked ? (width - 2 * pad) * STACK.width : width - 2 * pad;
  const amp = stacked ? (height - 2 * pad) * STACK.amp : (height - 2 * pad) * 0.4;
  const place = (position: number) => ({
    x: pad + (stacked ? (width - 2 * pad) * STACK.shiftX * position : 0),
    y: stacked ? height - pad - amp - (height - 2 * pad - 2 * amp) * position : height / 2,
  });
  const line = (frame: Float32Array, position: number) => {
    const { x, y } = place(position);
    ctx.beginPath();
    for (let px = 0; px <= waveWidth; px += 1.5) {
      const v = frame[Math.min(frame.length - 1, Math.floor((px / waveWidth) * frame.length))];
      const py = y - v * amp;
      if (px === 0) ctx.moveTo(x + px, py);
      else ctx.lineTo(x + px, py);
    }
    ctx.stroke();
  };
  ctx.lineJoin = "round";
  if (!stacked) {
    ctx.fillStyle = p.dim;
    ctx.fillRect(pad, Math.round(height / 2), width - 2 * pad, 1);
  }
  // Up to a dozen frames from front to back, faint.
  if (stacked) {
    const count = Math.min(12, waves.stack.length);
    ctx.strokeStyle = p.foreground;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.22;
    for (let k = count - 1; k >= 0; k--) {
      const index = Math.round((k * (waves.stack.length - 1)) / Math.max(1, count - 1));
      line(waves.stack[index], index / (waves.stack.length - 1));
    }
    ctx.globalAlpha = 1;
  }
  if (waves.current) {
    ctx.strokeStyle = p.osc;
    ctx.lineWidth = 2;
    line(waves.current, stacked ? waves.position : 0);
  }
  if (waves.note) label(ctx, p, waves.note, width / 2, height / 2 - 6, "center");
}

// Harmonic levels as bars, numbered along the foot.
export function drawHarmonics(canvas: HTMLCanvasElement, width: number, height: number, levels: number[], active: boolean): void {
  const ctx = prepare(canvas, width, height);
  if (!ctx) return;
  const p = palette(canvas);
  const top = 8;
  const bottom = height - FOOT - 4;
  const slot = width / levels.length;
  ctx.fillStyle = p.dim;
  ctx.fillRect(0, bottom, width, 1);
  levels.forEach((level, i) => {
    const x = Math.round(i * slot) + 1;
    const w = Math.max(BLOCK, Math.round(slot) - 3);
    const y = snap(bottom - level * (bottom - top));
    ctx.fillStyle = p.osc;
    ctx.globalAlpha = active ? 0.9 : 0.35;
    ctx.fillRect(x, y, w, bottom - y);
    ctx.globalAlpha = 1;
    if (levels.length <= 16 || i % 2 === 0) label(ctx, p, String(i + 1), x + w / 2, bottom + 3, "center");
  });
}

const DB_TOP = 24;
const DB_FLOOR = -48;

export function dbToY(db: number, height: number): number {
  const top = 8;
  const bottom = height - FOOT - 4;
  const t = (Math.min(DB_TOP, Math.max(DB_FLOOR, db)) - DB_FLOOR) / (DB_TOP - DB_FLOOR);
  return bottom - t * (bottom - top);
}

// The two filters' response together, drawn as columns from the floor, frequency on a
// log scale, with a node for each: the lowpass (1) and the highpass (2). A node that's
// off is drawn hollow on the 0 dB line.
export function filterNodeX(freq: number, width: number): number {
  return (Math.log(freq / 20) / Math.log(1000)) * width;
}

export function drawFilter(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  settings: Settings,
  nodes: { label: string; freq: number; on: boolean; disabled?: boolean }[],
): void {
  const ctx = prepare(canvas, width, height);
  if (!ctx) return;
  const p = palette(canvas);
  const bottom = height - FOOT - 4;
  const freqs = logFrequencies(Math.ceil(width / BLOCK));
  // Grid: 100 Hz, 1 kHz, 10 kHz, and the 0 dB line.
  ctx.fillStyle = p.dim;
  for (const [f, text] of [[100, "100"], [1000, "1k"], [10000, "10k"]] as const) {
    const x = Math.round(filterNodeX(f, width));
    for (let y = 8; y < bottom; y += 4) ctx.fillRect(x, y, 1, 2);
    label(ctx, p, text, x, bottom + 3, "center");
  }
  ctx.fillStyle = p.dim;
  ctx.fillRect(0, Math.round(dbToY(0, height)), width, 1);
  const anyOn = nodes.some((node) => node.on);
  ctx.fillStyle = p.osc;
  ctx.globalAlpha = anyOn ? 0.75 : 0.2;
  freqs.forEach((f, i) => {
    const y = snap(dbToY(filterGain(settings, f), height));
    ctx.fillRect(i * BLOCK, y, BLOCK - 1, Math.max(0, bottom - y));
  });
  ctx.globalAlpha = 1;
  for (const node of nodes) {
    const x = Math.round(Math.min(width - 5, Math.max(5, filterNodeX(node.freq, width))));
    const y = Math.round(node.on ? dbToY(filterGain(settings, node.freq), height) : dbToY(0, height));
    ctx.globalAlpha = node.disabled ? 0.3 : 1;
    ctx.fillStyle = p.foreground;
    ctx.strokeStyle = p.foreground;
    ctx.lineWidth = 1;
    if (node.on) ctx.fillRect(x - 4, y - 4, 9, 9);
    else ctx.strokeRect(x - 3.5, y - 3.5, 8, 8);
    ctx.globalAlpha = 1;
    label(ctx, p, node.label, x, Math.max(2, y - 16), "center");
  }
}

// An envelope as columns from the floor, with a square at each corner that drags.
export function drawEnvelope(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  shape: EnvelopeShape,
  options: { active: boolean; hasSustain: boolean; amount?: string },
): void {
  const ctx = prepare(canvas, width, height);
  if (!ctx) return;
  const p = palette(canvas);
  const top = 10;
  const bottom = height - FOOT - 4;
  const yOf = (level: number) => bottom - level * (bottom - top);
  const xOf = (x: number) => 4 + x * (width - 8);
  ctx.fillStyle = p.dim;
  ctx.fillRect(0, bottom, width, 1);
  for (const x of [shape.attackEnd, shape.decayEnd, shape.releaseStart]) {
    const px = Math.round(xOf(x));
    for (let y = top; y < bottom; y += 4) ctx.fillRect(px, y, 1, 2);
  }
  ctx.fillStyle = p.env;
  ctx.globalAlpha = options.active ? 0.6 : 0.2;
  for (let px = 0; px < width; px += BLOCK) {
    const level = envelopeLevel(shape, (px + BLOCK / 2 - 4) / (width - 8));
    const y = snap(yOf(level));
    if (y < bottom) ctx.fillRect(px, y, BLOCK - 1, bottom - y);
  }
  ctx.globalAlpha = 1;
  if (options.active) {
    ctx.fillStyle = p.foreground;
    const corners: [number, number][] = [
      [shape.attackEnd, 1],
      [shape.decayEnd, options.hasSustain ? shape.sustain : 0],
      [shape.releaseEnd, 0],
    ];
    for (const [x, level] of corners) ctx.fillRect(Math.round(xOf(x)) - 3, Math.round(yOf(level)) - 3, 7, 7);
  }
  const letters: [string, number][] = [
    ["A", shape.attackEnd / 2],
    ["D", (shape.attackEnd + shape.decayEnd) / 2],
    ["S", (shape.decayEnd + shape.releaseStart) / 2],
    ["R", (shape.releaseStart + shape.releaseEnd) / 2],
  ];
  for (const [letter, x] of letters) label(ctx, p, letter, xOf(x), bottom + 3, "center");
  if (options.amount) label(ctx, p, options.amount, width - 4, 4, "right");
}
