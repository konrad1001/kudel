import { describe, expect, it } from "vitest";
import { canTrim, encodeWav, fadeFrames, fadeGain, packWrite, parseWav, trimWav } from "./wavFile";

// A complete .wav of `frames` frames whose samples count up from 1 (so slices and fades
// can be checked by value), in the given integer or float format.
function wav({ rate = 1000, channels = 2, bits = 16, float = false, frames = 100, extensible = false, extra = false } = {}) {
  const bytesPer = bits / 8;
  const blockAlign = bytesPer * channels;
  const fmt = new DataView(new ArrayBuffer(extensible ? 40 : 16));
  fmt.setUint16(0, extensible ? 0xfffe : float ? 3 : 1, true);
  fmt.setUint16(2, channels, true);
  fmt.setUint32(4, rate, true);
  fmt.setUint32(8, rate * blockAlign, true);
  fmt.setUint16(12, blockAlign, true);
  fmt.setUint16(14, bits, true);
  if (extensible) {
    fmt.setUint16(16, 22, true);
    fmt.setUint16(18, bits, true);
    fmt.setUint16(24, float ? 3 : 1, true);
  }
  const data = new DataView(new ArrayBuffer(frames * blockAlign));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < channels; c++) {
      const at = i * blockAlign + c * bytesPer;
      const v = (i + 1) * (c === 0 ? 1 : -1);
      if (float) data.setFloat32(at, v / 1000, true);
      else if (bits === 16) data.setInt16(at, v * 100, true);
      else if (bits === 24) {
        const s = v * 1000;
        data.setUint8(at, s & 0xff);
        data.setUint8(at + 1, (s >> 8) & 0xff);
        data.setUint8(at + 2, (s >> 16) & 0xff);
      } else if (bits === 8) data.setUint8(at, 128 + Math.max(-127, Math.min(127, v)));
    }
  }
  const chunks: [string, Uint8Array][] = [];
  if (extra) chunks.push(["LIST", new Uint8Array([1, 2, 3])]);
  chunks.push(["fmt ", new Uint8Array(fmt.buffer)], ["data", new Uint8Array(data.buffer)]);
  const parts: number[] = [..."RIFF"].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [..."WAVE"].map((c) => c.charCodeAt(0)));
  for (const [id, body] of chunks) {
    parts.push(...[...id].map((c) => c.charCodeAt(0)), body.length & 0xff, (body.length >> 8) & 0xff, (body.length >> 16) & 0xff, 0);
    parts.push(...body);
    if (body.length % 2) parts.push(0);
  }
  return Uint8Array.from(parts).buffer;
}

// Sample `c` of frame `i` of a .wav, as an integer (or float).
function sampleOf(bytes: Uint8Array, i: number, c: number): number {
  const layout = parseWav(bytes.slice().buffer)!;
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  const at = layout.dataOffset + i * layout.blockAlign + c * (layout.bits / 8);
  if (layout.float) return view.getFloat32(at, true);
  if (layout.bits === 16) return view.getInt16(at, true);
  if (layout.bits === 8) return view.getUint8(at) - 128;
  const raw = view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getUint8(at + 2) << 16);
  return (raw << 8) >> 8;
}

describe("parseWav", () => {
  it("reads the layout, past other chunks", () => {
    const layout = parseWav(wav({ extra: true, frames: 250, rate: 1000 }))!;
    expect(layout).toMatchObject({ sampleRate: 1000, channels: 2, bits: 16, code: 1, blockAlign: 4, frames: 250, duration: 0.25 });
    expect(layout.fmt.length).toBe(16);
  });

  it("knows extensible files by their real format", () => {
    expect(parseWav(wav({ extensible: true, bits: 24 }))).toMatchObject({ code: 1, bits: 24, float: false });
    expect(parseWav(wav({ extensible: true, bits: 32, float: true }))).toMatchObject({ code: 3, float: true });
  });

  it("counts only the frames the file holds", () => {
    const whole = new Uint8Array(wav({ frames: 100 }));
    expect(parseWav(whole.slice(0, whole.length - 10).buffer)?.frames).toBe(97);
  });

  it("refuses what isn't a WAVE file", () => {
    expect(parseWav(new TextEncoder().encode("ID3 not a wave").buffer)).toBeNull();
  });
});

describe("fades", () => {
  it("ramps from 0 to 1 and back to 0", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => fadeGain(i, 10, 4))).toEqual([0, 0.25, 0.5, 0.75, 1, 1, 0.75, 0.5, 0.25, 0]);
    expect(fadeGain(3, 10, 0)).toBe(1);
  });

  it("never fades more than half the clip", () => {
    expect(fadeFrames(5, 48000, 10000)).toBe(240);
    expect(fadeFrames(5, 48000, 100)).toBe(50);
  });
});

describe("trimWav", () => {
  it("copies the frames exactly, keeping the format, outside the fades", () => {
    const out = trimWav(wav({ frames: 100, rate: 1000 }), 20, 60, 5)!;
    const layout = parseWav(out.slice().buffer)!;
    expect(layout).toMatchObject({ sampleRate: 1000, channels: 2, bits: 16, frames: 40 });
    // Frame 10 of the clip is frame 30 of the file (value 31 × 100), untouched.
    expect(sampleOf(out, 10, 0)).toBe(3100);
    expect(sampleOf(out, 10, 1)).toBe(-3100);
    // Faded: silent at both ends, part-way in between.
    expect(sampleOf(out, 0, 0)).toBe(0);
    expect(sampleOf(out, 39, 1)).toBe(0);
    expect(sampleOf(out, 2, 0)).toBe(Math.round(2300 * 0.4));
  });

  it("handles 24-bit, 8-bit and float samples, negative ones included", () => {
    const deep = trimWav(wav({ bits: 24, frames: 100 }), 0, 100, 10)!;
    expect(sampleOf(deep, 50, 1)).toBe(-51000);
    expect(sampleOf(deep, 5, 1)).toBe(Math.round(-6000 * 0.5));
    const low = trimWav(wav({ bits: 8, frames: 100 }), 0, 100, 10)!;
    expect(sampleOf(low, 50, 0)).toBe(51);
    const float = trimWav(wav({ bits: 32, float: true, frames: 100 }), 0, 100, 10)!;
    expect(sampleOf(float, 50, 0)).toBeCloseTo(0.051);
    expect(sampleOf(float, 5, 1)).toBeCloseTo(-0.003);
  });

  it("keeps an extensible format chunk as it was", () => {
    const source = wav({ extensible: true, bits: 24, frames: 50 });
    const out = trimWav(source, 10, 20, 0)!;
    expect([...parseWav(out.slice().buffer)!.fmt]).toEqual([...parseWav(source)!.fmt]);
  });

  it("clamps the range to the file", () => {
    expect(parseWav(trimWav(wav({ frames: 100 }), 90, 500, 0)!.slice().buffer)?.frames).toBe(10);
  });

  it("refuses formats it can't copy", () => {
    const layout = parseWav(wav())!;
    expect(canTrim(layout)).toBe(true);
    expect(canTrim({ ...layout, code: 2 })).toBe(false);
    expect(canTrim({ ...layout, bits: 12 })).toBe(false);
  });
});

describe("encodeWav", () => {
  it("writes decoded audio as 24-bit PCM, faded", () => {
    const left = Float32Array.from({ length: 1000 }, () => 0.5);
    const right = Float32Array.from({ length: 1000 }, () => -1);
    const out = encodeWav([left, right], 48000, 100, 600, 1);
    expect(parseWav(out.slice().buffer)).toMatchObject({ sampleRate: 48000, channels: 2, bits: 24, frames: 500 });
    expect(sampleOf(out, 250, 0)).toBe(4194304);
    expect(sampleOf(out, 250, 1)).toBe(-8388608);
    expect(sampleOf(out, 0, 0)).toBe(0);
  });
});

describe("packWrite", () => {
  it("puts the length, the JSON and the file one after another", () => {
    const packed = packWrite({ dir: "C:\\Café", name: "amen-0s376" }, Uint8Array.from([9, 8, 7]));
    const length = new DataView(packed.buffer).getUint32(0, true);
    const json = JSON.parse(new TextDecoder().decode(packed.subarray(4, 4 + length)));
    expect(json).toEqual({ dir: "C:\\Café", name: "amen-0s376" });
    expect([...packed.subarray(4 + length)]).toEqual([9, 8, 7]);
  });
});
