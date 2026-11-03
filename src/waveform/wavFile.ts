// Writing part of a sample to a new .wav. Pure: bytes in, bytes out; Rust writes them.
//
// From a .wav source the frames are copied byte for byte, keeping its sample rate, bit
// depth and format chunk; only the few milliseconds of fade at each end are changed.
// Other sources (mp3, flac, ...) are written from the decoded audio as 24-bit PCM.

export interface WavLayout {
  sampleRate: number;
  channels: number;
  bits: number;
  float: boolean;
  // 1 = integer PCM, 3 = IEEE float, anything else = a format we can't edit.
  code: number;
  blockAlign: number;
  // The "fmt " chunk's body, copied as is into a trimmed file.
  fmt: Uint8Array;
  dataOffset: number;
  // Bytes of audio, clamped to what the file actually holds.
  dataSize: number;
  frames: number;
  duration: number;
}

const tagAt = (bytes: Uint8Array, at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));

// The layout of a RIFF/WAVE file, or null if it isn't one (or has no audio).
export function parseWav(buffer: ArrayBuffer): WavLayout | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 12 || tagAt(bytes, 0) !== "RIFF" || tagAt(bytes, 8) !== "WAVE") return null;
  const view = new DataView(buffer);
  let fmt: Omit<WavLayout, "dataOffset" | "dataSize" | "frames" | "duration"> | null = null;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const id = tagAt(bytes, at);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (id === "fmt " && body + 16 <= bytes.length) {
      const tag = view.getUint16(body, true);
      const bits = view.getUint16(body + 14, true);
      // 0xfffe (extensible) puts the real format code first in its sub-format.
      const code = tag === 0xfffe && size >= 40 && body + 26 <= bytes.length ? view.getUint16(body + 24, true) : tag;
      fmt = {
        sampleRate: view.getUint32(body + 4, true),
        channels: view.getUint16(body + 2, true),
        bits,
        float: code === 3,
        code,
        blockAlign: view.getUint16(body + 12, true),
        fmt: bytes.slice(body, Math.min(bytes.length, body + size)),
      };
    }
    if (id === "data" && fmt && fmt.blockAlign && fmt.sampleRate) {
      const available = Math.min(size, bytes.length - body);
      const frames = Math.floor(available / fmt.blockAlign);
      return {
        ...fmt,
        dataOffset: body,
        dataSize: frames * fmt.blockAlign,
        frames,
        duration: frames / fmt.sampleRate,
      };
    }
    // Chunks are padded to an even size.
    at = body + size + (size % 2);
  }
  return null;
}

// Gain of frame `i` of `frames` with `fade` frames of linear fade at each end: 0 at the
// first and last frame, 1 in between.
export function fadeGain(i: number, frames: number, fade: number): number {
  if (fade <= 0) return 1;
  if (i < fade) return i / fade;
  const fromEnd = frames - 1 - i;
  return fromEnd < fade ? fromEnd / fade : 1;
}

// Frames of fade for `ms` at `sampleRate`, never more than half the clip.
export function fadeFrames(ms: number, sampleRate: number, frames: number): number {
  return Math.min(Math.round((ms / 1000) * sampleRate), Math.floor(frames / 2));
}

// Scales one sample in place, in the file's own format.
function scaleSample(view: DataView, at: number, bits: number, float: boolean, gain: number): void {
  if (float) {
    if (bits === 32) view.setFloat32(at, view.getFloat32(at, true) * gain, true);
    else view.setFloat64(at, view.getFloat64(at, true) * gain, true);
    return;
  }
  switch (bits) {
    case 8: {
      // Unsigned, centred on 128.
      view.setUint8(at, Math.round((view.getUint8(at) - 128) * gain) + 128);
      return;
    }
    case 16:
      view.setInt16(at, Math.round(view.getInt16(at, true) * gain), true);
      return;
    case 24: {
      const raw = view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getUint8(at + 2) << 16);
      const scaled = Math.round(((raw << 8) >> 8) * gain);
      view.setUint8(at, scaled & 0xff);
      view.setUint8(at + 1, (scaled >> 8) & 0xff);
      view.setUint8(at + 2, (scaled >> 16) & 0xff);
      return;
    }
    case 32:
      view.setInt32(at, Math.round(view.getInt32(at, true) * gain), true);
      return;
  }
}

// Whether trimWav can copy this file's frames: integer PCM of 8 to 32 bits or float of
// 32 or 64, with whole bytes per sample.
export function canTrim(layout: WavLayout): boolean {
  const integer = layout.code === 1 && [8, 16, 24, 32].includes(layout.bits);
  const float = layout.code === 3 && (layout.bits === 32 || layout.bits === 64);
  return (integer || float) && layout.blockAlign === (layout.bits / 8) * layout.channels;
}

// A RIFF/WAVE file of one "fmt " chunk and one "data" chunk.
function wavBytes(fmt: Uint8Array, data: Uint8Array): Uint8Array {
  const pad = (n: number) => n % 2;
  const length = 12 + 8 + fmt.length + pad(fmt.length) + 8 + data.length + pad(data.length);
  const out = new Uint8Array(length);
  const view = new DataView(out.buffer);
  const tag = (at: number, text: string) => [...text].forEach((c, i) => (out[at + i] = c.charCodeAt(0)));
  tag(0, "RIFF");
  view.setUint32(4, length - 8, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, fmt.length, true);
  out.set(fmt, 20);
  const dataAt = 20 + fmt.length + pad(fmt.length);
  tag(dataAt, "data");
  view.setUint32(dataAt + 4, data.length, true);
  out.set(data, dataAt + 8);
  return out;
}

// Frames [start, end) of a .wav, faded over `fade` frames at each end, as a new .wav in
// the same format. null if the file can't be copied that way (see canTrim).
export function trimWav(buffer: ArrayBuffer, start: number, end: number, fadeMs: number): Uint8Array | null {
  const layout = parseWav(buffer);
  if (!layout || !canTrim(layout)) return null;
  const from = Math.max(0, Math.min(layout.frames, Math.round(start)));
  const to = Math.max(from, Math.min(layout.frames, Math.round(end)));
  const frames = to - from;
  const data = new Uint8Array(buffer, layout.dataOffset + from * layout.blockAlign, frames * layout.blockAlign).slice();
  const view = new DataView(data.buffer);
  const fade = fadeFrames(fadeMs, layout.sampleRate, frames);
  const bytesPerSample = layout.bits / 8;
  for (let i = 0; i < frames; i++) {
    const gain = fadeGain(i, frames, fade);
    if (gain === 1) {
      // Past the fade in: jump to where the fade out starts.
      if (i >= fade) i = Math.max(i, frames - fade - 1);
      continue;
    }
    for (let c = 0; c < layout.channels; c++) {
      scaleSample(view, i * layout.blockAlign + c * bytesPerSample, layout.bits, layout.float, gain);
    }
  }
  return wavBytes(layout.fmt, data);
}

// Frames [start, end) of decoded audio as a 24-bit PCM .wav, faded at each end.
export function encodeWav(
  channels: Float32Array[],
  sampleRate: number,
  start: number,
  end: number,
  fadeMs: number,
): Uint8Array {
  const length = channels[0]?.length ?? 0;
  const from = Math.max(0, Math.min(length, Math.round(start)));
  const to = Math.max(from, Math.min(length, Math.round(end)));
  const frames = to - from;
  const count = channels.length;
  const blockAlign = 3 * count;
  const fmt = new Uint8Array(16);
  const f = new DataView(fmt.buffer);
  f.setUint16(0, 1, true);
  f.setUint16(2, count, true);
  f.setUint32(4, sampleRate, true);
  f.setUint32(8, sampleRate * blockAlign, true);
  f.setUint16(12, blockAlign, true);
  f.setUint16(14, 24, true);
  const data = new Uint8Array(frames * blockAlign);
  const fade = fadeFrames(fadeMs, sampleRate, frames);
  for (let i = 0; i < frames; i++) {
    const gain = fadeGain(i, frames, fade);
    for (let c = 0; c < count; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][from + i] * gain));
      const s = Math.max(-8388608, Math.min(8388607, Math.round(v * 8388608)));
      const at = i * blockAlign + c * 3;
      data[at] = s & 0xff;
      data[at + 1] = (s >> 8) & 0xff;
      data[at + 2] = (s >> 16) & 0xff;
    }
  }
  return wavBytes(fmt, data);
}

// One message for Rust's write_wav command: a 4-byte length, that many bytes of JSON
// (where to write, as UTF-8, which request headers can't carry), then the file.
export function packWrite(meta: { dir: string; name: string }, file: Uint8Array): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(meta));
  const out = new Uint8Array(4 + json.length + file.length);
  new DataView(out.buffer).setUint32(0, json.length, true);
  out.set(json, 4);
  out.set(file, 4 + json.length);
  return out;
}
