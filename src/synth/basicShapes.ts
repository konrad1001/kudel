import { encodeWav } from "../waveform/wavFile";

// A wavetable of our own, like Ableton's "Basic Shapes": position 0 is a sine, then it
// morphs through a triangle and a saw to a square ("step") at 1. strudel.cc has nothing
// like it (wt_digital_basique is noisy, two cycles to a frame), so the app generates it
// and registers it at startup; code using it plays here, not on strudel.cc.

export const BASIC_SHAPES_TABLE = "wt_basic_shapes";
// Samples per frame: superdough's default frameLen, which registerWaveTable is given.
export const FRAME_LEN = 2048;
const SHAPES = ["sine", "triangle", "sawtooth", "square"] as const;
// Frames between one shape and the next, so 3 * 21 + 1 = 64 in all.
const STEPS = 21;
// Harmonics in the bright shapes. Band-limited, so they alias less at high notes, and
// softened (Lanczos sigma) so the square's edges don't ring.
const PARTIALS = 64;

// One cycle of a shape, starting at 0 and rising, peak 1.
export function shapeFrame(shape: (typeof SHAPES)[number], length = FRAME_LEN): Float32Array {
  const frame = new Float32Array(length);
  for (let n = 1; n <= (shape === "sine" ? 1 : PARTIALS); n++) {
    const odd = n % 2 === 1;
    const amp =
      shape === "sine"
        ? 1
        : shape === "triangle"
          ? odd ? ((n - 1) / 2) % 2 === 0 ? 1 / (n * n) : -1 / (n * n) : 0
          : shape === "sawtooth"
            ? (odd ? 1 : -1) / n
            : odd ? 1 / n : 0;
    if (!amp) continue;
    const x = (Math.PI * n) / (PARTIALS + 1);
    const sigma = shape === "sine" ? 1 : Math.sin(x) / x;
    for (let i = 0; i < length; i++) frame[i] += amp * sigma * Math.sin((2 * Math.PI * n * i) / length);
  }
  let peak = 0;
  for (const v of frame) peak = Math.max(peak, Math.abs(v));
  for (let i = 0; i < length; i++) frame[i] /= peak;
  return frame;
}

// Every frame, from sine to square, blending neighbouring shapes sample by sample.
export function basicShapesFrames(length = FRAME_LEN): Float32Array[] {
  const keys = SHAPES.map((shape) => shapeFrame(shape, length));
  const frames: Float32Array[] = [];
  for (let k = 0; k < keys.length - 1; k++) {
    for (let step = 0; step < STEPS; step++) {
      const t = step / STEPS;
      frames.push(keys[k].map((a, i) => a + (keys[k + 1][i] - a) * t));
    }
  }
  frames.push(keys[keys.length - 1]);
  return frames;
}

// The table as a .wav file: the frames one after another, as superdough reads a table.
export function basicShapesWav(): Uint8Array {
  const frames = basicShapesFrames();
  const data = new Float32Array(frames.length * FRAME_LEN);
  frames.forEach((frame, i) => data.set(frame, i * FRAME_LEN));
  return encodeWav([data], 44100, 0, data.length, 0);
}
