import { describe, expect, it } from "vitest";
import {
  buildBlocks,
  clampView,
  columnPeaks,
  infoText,
  minSpan,
  playheadAt,
  rulerTicks,
  scrollView,
  spanBetween,
  tickLabel,
  timeAt,
  timeText,
  wavInfo,
  wheelAction,
  xAt,
  zoomView,
} from "./waveform";

const ramp = (n: number) => Float32Array.from({ length: n }, (_, i) => i / n);

describe("peaks", () => {
  it("finds each block's range over every channel", () => {
    const left = Float32Array.from([0, 0.5, -0.2, 0.1, 0.3]);
    const right = Float32Array.from([0.1, -0.6, 0, 0.9, 0]);
    const blocks = buildBlocks([left, right], 2);
    expect([...blocks.min]).toEqual([-0.6, -0.2, 0].map(Math.fround));
    expect([...blocks.max]).toEqual([0.5, 0.9, 0.3].map(Math.fround));
  });

  it("reads samples when zoomed in and blocks when zoomed out, alike", () => {
    const data = ramp(4096);
    const blocks = buildBlocks([data], 256);
    const near = columnPeaks([data], { ...blocks, blockSize: 1e9 }, 0, 1024, 4);
    const far = columnPeaks([data], blocks, 0, 1024, 4);
    expect([...far.min]).toEqual([...near.min]);
    expect([...far.max]).toEqual([...near.max]);
    expect(far.min[1]).toBeCloseTo(1024 / 4096);
  });

  it("gives every column at least one sample when zoomed past single samples", () => {
    const data = Float32Array.from([0.1, 0.2, 0.3]);
    const peaks = columnPeaks([data], buildBlocks([data]), 0, 0.5, 6);
    expect([...peaks.max]).toEqual([0.1, 0.1, 0.2, 0.2, 0.3, 0.3].map(Math.fround));
  });

  it("leaves columns past the end at 0", () => {
    const data = Float32Array.from([0.5, 0.5]);
    const peaks = columnPeaks([data], buildBlocks([data]), 0, 1, 4);
    expect([...peaks.max]).toEqual([0.5, 0.5, 0, 0]);
  });
});

describe("view", () => {
  it("keeps the view inside the file and at least the narrowest width", () => {
    expect(clampView({ start: -1, end: 2 }, 10, 0.01)).toEqual({ start: 0, end: 3 });
    expect(clampView({ start: 9, end: 12 }, 10, 0.01)).toEqual({ start: 7, end: 10 });
    expect(clampView({ start: 0, end: 20 }, 10, 0.01)).toEqual({ start: 0, end: 10 });
    expect(clampView({ start: 5, end: 5 }, 10, 0.01)).toEqual({ start: 5, end: 5.01 });
    expect(minSpan(48000)).toBe(0.005);
    expect(minSpan(8000)).toBe(0.008);
  });

  it("zooms around the anchor", () => {
    const view = zoomView({ start: 0, end: 10 }, 0.5, 5, 10, 0.01);
    expect(view).toEqual({ start: 2.5, end: 7.5 });
    const edge = zoomView({ start: 0, end: 10 }, 0.5, 0, 10, 0.01);
    expect(edge).toEqual({ start: 0, end: 5 });
    expect(zoomView({ start: 2, end: 4 }, 100, 3, 10, 0.01)).toEqual({ start: 0, end: 10 });
  });

  it("scrolls without leaving the file", () => {
    expect(scrollView({ start: 2, end: 4 }, 1, 10)).toEqual({ start: 3, end: 5 });
    expect(scrollView({ start: 2, end: 4 }, -5, 10)).toEqual({ start: 0, end: 2 });
    expect(scrollView({ start: 2, end: 4 }, 50, 10)).toEqual({ start: 8, end: 10 });
  });

  it("converts between pixels and seconds", () => {
    const view = { start: 2, end: 4 };
    expect(timeAt(view, 50, 100)).toBe(3);
    expect(xAt(view, 3, 100)).toBe(50);
    expect(spanBetween(5, 1, 4)).toEqual({ start: 1, end: 4 });
  });
});

describe("wheelAction", () => {
  const wheel = (deltaX: number, deltaY: number, mods: { ctrl?: boolean; shift?: boolean; mode?: number } = {}) =>
    wheelAction(
      { deltaX, deltaY, deltaMode: mods.mode ?? 0, ctrlKey: mods.ctrl ?? false, shiftKey: mods.shift ?? false },
      800,
    );

  it("zooms on a mouse wheel: down zooms out, up zooms in", () => {
    expect(wheel(0, 100)).toEqual({ zoom: Math.exp(0.2) });
    expect(wheel(0, -100)).toEqual({ zoom: Math.exp(-0.2) });
  });

  it("zooms on a pinch, ten times as strongly, even when it drifts sideways", () => {
    expect(wheel(0, -10, { ctrl: true })).toEqual({ zoom: Math.exp(-0.2) });
    expect(wheel(5, -2, { ctrl: true })).toEqual({ zoom: Math.exp(-0.04) });
    expect(wheel(5, 0, { ctrl: true })).toBeNull();
  });

  it("scrolls on a sideways swipe or Shift+wheel", () => {
    expect(wheel(30, 4)).toEqual({ scroll: 30 });
    expect(wheel(0, 100, { shift: true })).toEqual({ scroll: 100 });
    expect(wheel(-20, 0, { shift: true })).toEqual({ scroll: -20 });
  });

  it("zooms on a mostly vertical swipe", () => {
    expect(wheel(3, -40)).toEqual({ zoom: Math.exp(-0.08) });
  });

  it("converts lines and pages to pixels", () => {
    expect(wheel(0, 3, { mode: 1 })).toEqual({ zoom: Math.exp(48 * 0.002) });
    expect(wheel(1, 0, { mode: 2 })).toEqual({ scroll: 800 });
  });

  it("does nothing for an empty event", () => {
    expect(wheel(0, 0)).toBeNull();
  });
});

describe("ruler", () => {
  it("picks a round step that leaves room for the labels", () => {
    expect(rulerTicks({ start: 0, end: 10 }, 800, 72)).toEqual({ step: 1, ticks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });
    expect(rulerTicks({ start: 1.03, end: 1.5 }, 500, 72).step).toBe(0.1);
    expect(rulerTicks({ start: 1.03, end: 1.5 }, 500, 72).ticks).toEqual([1.1, 1.2, 1.3, 1.4, 1.5]);
  });

  it("labels ticks with the decimals their step needs", () => {
    expect(tickLabel(65, 5)).toBe("1:05");
    expect(tickLabel(1.5, 0.5)).toBe("0:01.5");
    expect(tickLabel(0.25, 0.05)).toBe("0:00.25");
    expect(tickLabel(0.012, 0.002)).toBe("0:00.012");
    expect(timeText(3723.5, 1)).toBe("1:02:03.5");
  });
});

describe("playhead", () => {
  it("runs to the end and stops", () => {
    expect(playheadAt(1, 2, 5, false)).toBe(3);
    expect(playheadAt(10, 2, 5, false)).toBe(5);
  });

  it("wraps when looping", () => {
    expect(playheadAt(4, 2, 5, true)).toBe(3);
    expect(playheadAt(6, 2, 5, true)).toBe(2);
  });
});

// A WAVE header with an optional chunk before "fmt ", like files from some editors.
function wavHeader({ rate = 44100, channels = 2, bits = 16, code = 1, frames = 44100, extra = false } = {}) {
  const blockAlign = (channels * bits) / 8;
  const chunks: [string, number[]][] = [];
  if (extra) chunks.push(["LIST", [1, 2, 3]]);
  const fmt = [
    ...u16(code),
    ...u16(channels),
    ...u32(rate),
    ...u32(rate * blockAlign),
    ...u16(blockAlign),
    ...u16(bits),
  ];
  if (code === 0xfffe) fmt.push(...u16(22), ...u16(bits), ...u32(0), ...u16(3), ...new Array(14).fill(0));
  chunks.push(["fmt ", fmt]);
  const bytes = [..."RIFF"].map((c) => c.charCodeAt(0));
  bytes.push(...u32(0), ..."WAVE".split("").map((c) => c.charCodeAt(0)));
  for (const [id, body] of chunks) {
    bytes.push(...[...id].map((c) => c.charCodeAt(0)), ...u32(body.length), ...body);
    if (body.length % 2) bytes.push(0);
  }
  bytes.push(..."data".split("").map((c) => c.charCodeAt(0)), ...u32(frames * blockAlign));
  return Uint8Array.from(bytes).buffer;
}
function u16(n: number) {
  return [n & 0xff, (n >> 8) & 0xff];
}
function u32(n: number) {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff];
}

describe("wavInfo", () => {
  it("reads the format and length", () => {
    expect(wavInfo(wavHeader({ frames: 88200 }))).toEqual({
      sampleRate: 44100,
      channels: 2,
      bits: 16,
      float: false,
      duration: 2,
    });
  });

  it("skips chunks before the format, including odd-sized ones", () => {
    expect(wavInfo(wavHeader({ extra: true, rate: 48000, channels: 1, bits: 24, frames: 24000 }))).toMatchObject({
      sampleRate: 48000,
      channels: 1,
      bits: 24,
      duration: 0.5,
    });
  });

  it("knows float files, plain or extensible", () => {
    expect(wavInfo(wavHeader({ code: 3, bits: 32 }))?.float).toBe(true);
    expect(wavInfo(wavHeader({ code: 0xfffe, bits: 32 }))?.float).toBe(true);
  });

  it("refuses what isn't a WAVE file", () => {
    expect(wavInfo(new TextEncoder().encode("ID3\u0004 not a wave file").buffer)).toBeNull();
    expect(wavInfo(new ArrayBuffer(4))).toBeNull();
  });

  it("sums a file up", () => {
    expect(infoText(7.5, 2, wavInfo(wavHeader()))).toBe("7.50s · 44.1k · 16-bit · stereo");
    expect(infoText(3, 1, null)).toBe("3.00s · mono");
  });
});
