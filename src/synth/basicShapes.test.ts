import { describe, expect, it } from "vitest";
import { basicShapesFrames, basicShapesWav, FRAME_LEN, shapeFrame } from "./basicShapes";

const at = (frame: Float32Array, phase: number) => frame[Math.round(phase * frame.length) % frame.length];

describe("basic shapes", () => {
  it("draws each shape starting at 0 and rising, peak 1", () => {
    for (const shape of ["sine", "triangle", "sawtooth", "square"] as const) {
      const frame = shapeFrame(shape, 512);
      expect(Math.max(...frame.map(Math.abs))).toBeCloseTo(1);
      expect(Math.abs(frame[0])).toBeLessThan(0.05);
      expect(at(frame, 0.1)).toBeGreaterThan(0);
    }
    expect(at(shapeFrame("triangle", 512), 0.25)).toBeCloseTo(1, 1);
    expect(at(shapeFrame("square", 512), 0.25)).toBeCloseTo(1, 1);
    expect(at(shapeFrame("square", 512), 0.75)).toBeCloseTo(-1, 1);
  });

  it("morphs from a sine to a square across 64 frames", () => {
    const frames = basicShapesFrames(256);
    expect(frames).toHaveLength(64);
    expect([...frames[0]]).toEqual([...shapeFrame("sine", 256)]);
    expect([...frames[63]]).toEqual([...shapeFrame("square", 256)]);
  });

  it("is a .wav of whole frames", () => {
    const wav = basicShapesWav();
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(String.fromCharCode(...wav.subarray(0, 4))).toBe("RIFF");
    // 24-bit mono: 3 bytes a sample after the 44-byte header.
    expect((wav.length - 44) / 3).toBe(64 * FRAME_LEN);
    expect(view.getUint32(24, true)).toBe(44100);
  });
});
