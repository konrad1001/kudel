import { columnPeaks, rulerTicks, tickLabel, xAt, type Blocks, type Span } from "./waveform";

// Drawing the Sample view's canvases in the terminal style: one colour, 1px lines on
// whole pixels, no gradients. Colours come from the theme's CSS variables.

// The ruler's height along the top, in CSS pixels.
export const RULER = 18;
const PAD = 4;

interface Colors {
  foreground: string;
  dim: string;
  selection: string;
  playing: string;
  font: string;
}

function colors(el: Element): Colors {
  const style = getComputedStyle(el);
  const v = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    foreground: v("--foreground", "#cccccc"),
    dim: v("--gutterForeground", "#3c3c3c"),
    selection: v("--selection", "#ffffff26"),
    playing: v("--playing", "#fbfcfb"),
    font: `10px ${style.fontFamily}`,
  };
}

// Sizes the canvas's backing store to its CSS size at the screen's pixel ratio and
// returns a context drawing in CSS pixels.
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
  // Cleared in device pixels: the backing store is rounded up, so at 125% a 150px
  // canvas has 188 rows, and clearing 150 CSS pixels (187.5 rows) would leave the last
  // row half-cleared, collecting a trail from every frame of the playhead.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}

export interface WaveData {
  channels: Float32Array[];
  blocks: Blocks;
  sampleRate: number;
}

// The ruler and the waveform: what only changes with the view, the size or the file.
export function drawWave(canvas: HTMLCanvasElement, width: number, height: number, view: Span, data: WaveData): void {
  const ctx = prepare(canvas, width, height);
  if (!ctx || width <= 0) return;
  const c = colors(canvas);

  // Ruler: a rule along the bottom of it, a short tick and a label at each step.
  ctx.fillStyle = c.dim;
  ctx.fillRect(0, RULER - 1, width, 1);
  ctx.font = c.font;
  ctx.textBaseline = "alphabetic";
  const { step, ticks } = rulerTicks(view, width);
  for (const t of ticks) {
    const x = Math.round(xAt(view, t, width));
    ctx.fillStyle = c.dim;
    ctx.fillRect(x, RULER - 5, 1, 5);
    ctx.fillStyle = c.foreground;
    ctx.globalAlpha = 0.55;
    ctx.fillText(tickLabel(t, step), x + 3, RULER - 6);
    ctx.globalAlpha = 1;
  }

  // Waveform: a centre line, then each device pixel column from its lowest sample to
  // its highest. Drawn per device pixel so it stays sharp on scaled screens.
  const top = RULER + PAD;
  const middle = top + (height - top - PAD) / 2;
  const amplitude = (height - top - PAD) / 2;
  ctx.fillStyle = c.dim;
  ctx.fillRect(0, Math.round(middle), width, 1);

  const ratio = window.devicePixelRatio || 1;
  const columns = Math.round(width * ratio);
  const startSample = view.start * data.sampleRate;
  const perColumn = ((view.end - view.start) * data.sampleRate) / columns;
  const peaks = columnPeaks(data.channels, data.blocks, startSample, perColumn, columns);
  const column = 1 / ratio;
  ctx.fillStyle = c.foreground;
  for (let i = 0; i < columns; i++) {
    const hi = Math.min(1, peaks.max[i]);
    const lo = Math.max(-1, peaks.min[i]);
    if (hi === 0 && lo === 0) continue;
    const y = middle - hi * amplitude;
    ctx.fillRect(i * column, y, column, Math.max(column, (hi - lo) * amplitude));
  }
}

// What moves over the waveform, on a canvas of its own so moving it never redraws the
// wave: the selection (translucent, so the wave shows through), the cursor (dashed,
// dim) and the playhead (solid, in --playing).
export function drawOverlay(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  view: Span,
  selection: Span | null,
  cursor: number,
  playhead: number | null,
): void {
  const ctx = prepare(canvas, width, height);
  if (!ctx) return;
  const c = colors(canvas);
  const line = (time: number) => Math.round(xAt(view, time, width)) + 0.5;

  if (selection) {
    const left = Math.round(xAt(view, selection.start, width));
    const right = Math.round(xAt(view, selection.end, width));
    ctx.fillStyle = c.selection;
    ctx.fillRect(left, 0, Math.max(1, right - left), height);
  }

  if (cursor >= view.start && cursor <= view.end) {
    ctx.strokeStyle = c.foreground;
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(line(cursor), 0);
    ctx.lineTo(line(cursor), height);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  if (playhead !== null && playhead >= view.start && playhead <= view.end) {
    ctx.strokeStyle = c.playing;
    ctx.beginPath();
    ctx.moveTo(line(playhead), 0);
    ctx.lineTo(line(playhead), height);
    ctx.stroke();
  }
}
