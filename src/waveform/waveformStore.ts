import { create } from "zustand";
import * as engine from "../engine";
import type { Command } from "../commands/commands";
import { isTextField, registerContextKey } from "../commands/when";
import { assetUrl } from "../files/native";
import { baseName, samePath } from "../files/paths";
import { showView } from "../layout/layoutStore";
import { stopPreview } from "../samples/preview";
import {
  buildBlocks,
  clampView,
  minSpan,
  scrollView,
  wavInfo,
  zoomView,
  type Blocks,
  type Span,
  type WavInfo,
} from "./waveform";

// The Sample view: one audio file, its waveform, a selection and playback of it.
// UI-only state: nothing here is in the code or changes what patterns play. Playing is
// an audition, like the explorer's preview.

export interface SampleInfo {
  duration: number;
  channels: number;
  sampleRate: number;
  // From the file's header, when it's a .wav.
  wav: WavInfo | null;
}

export interface Playing {
  from: number;
  to: number;
  loop: boolean;
  // On engine.audioTime()'s clock.
  startedAt: number;
}

interface WaveformState {
  path: string | null;
  status: "empty" | "loading" | "ready" | "error";
  error: string | null;
  info: SampleInfo | null;
  // What's on screen, in seconds.
  view: Span;
  selection: Span | null;
  // Where a click put the play position.
  cursor: number;
  loop: boolean;
  playing: Playing | null;
}

export const useWaveform = create<WaveformState>(() => ({
  path: null,
  status: "empty",
  error: null,
  info: null,
  view: { start: 0, end: 1 },
  selection: null,
  cursor: 0,
  loop: false,
  playing: null,
}));

const set = useWaveform.setState;
const get = useWaveform.getState;

// Focus is in the Sample view, but not in a text field: its keys work.
registerContextKey("sampleFocus", () => {
  const el = document.activeElement;
  return !!el?.closest(".sample") && !isTextField(el);
});

// Kept out of the store: large, and never rendered directly.
let buffer: AudioBuffer | null = null;
let channels: Float32Array[] = [];
let blocks: Blocks | null = null;

export function sampleData(): { buffer: AudioBuffer; channels: Float32Array[]; blocks: Blocks } | null {
  return buffer && blocks ? { buffer, channels, blocks } : null;
}

// Each file's view, selection and cursor, so going back to one finds it as it was.
type Remembered = Pick<WaveformState, "view" | "selection" | "cursor">;
const remembered = new Map<string, Remembered>();

// Longer files are refused: decoded audio is 32-bit float at the audio context's rate,
// about 23 MB per stereo minute at 48k, so 5 minutes is about 115 MB. A .wav is
// checked from its header before decoding; other formats once decoded. To become a
// setting (ROADMAP milestone 3).
const MAX_MINUTES = 5;
const MAX_DURATION = MAX_MINUTES * 60;
// Checked before fetching the whole file: 5 minutes of 32-bit float stereo at 96k.
const MAX_BYTES = 250_000_000;
const TOO_LONG = `it's longer than ${MAX_MINUTES} minutes`;

let loadToken = 0;

// Opens a file in the Sample view, showing the view.
export function openSample(path: string, { focus = false } = {}): void {
  showView("sample", { focus });
  void loadSample(path);
}

async function loadSample(path: string): Promise<void> {
  const { path: current, status } = get();
  if (samePath(current, path) && status !== "error") return;
  stopPlayback();
  if (current && get().status === "ready") remembered.set(current, pick(get()));
  const token = ++loadToken;
  buffer = null;
  channels = [];
  blocks = null;
  set({ path, status: "loading", error: null, info: null, playing: null });
  try {
    const response = await fetch(assetUrl(path));
    if (!response.ok) throw new Error(`could not read it (${response.status})`);
    if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("it's too large to open");
    const bytes = await response.arrayBuffer();
    const wav = wavInfo(bytes);
    if (wav && wav.duration > MAX_DURATION) throw new Error(TOO_LONG);
    const decoded = await engine.decodeAudio(bytes);
    if (token !== loadToken) return;
    if (decoded.duration > MAX_DURATION) throw new Error(TOO_LONG);
    buffer = decoded;
    channels = Array.from({ length: decoded.numberOfChannels }, (_, c) => decoded.getChannelData(c));
    blocks = buildBlocks(channels);
    const duration = decoded.duration;
    const info: SampleInfo = { duration, channels: decoded.numberOfChannels, sampleRate: decoded.sampleRate, wav };
    const before = remembered.get(path);
    set({
      status: "ready",
      info,
      view: before?.view ?? { start: 0, end: duration },
      selection: before?.selection ?? null,
      cursor: before?.cursor ?? 0,
    });
  } catch (err) {
    if (token !== loadToken) return;
    const reason = err instanceof Error ? err.message : String(err);
    set({ status: "error", error: `Could not open ${baseName(path)}: ${reason}` });
  }
}

const pick = ({ view, selection, cursor }: WaveformState): Remembered => ({ view, selection, cursor });

function least(): number {
  return minSpan(get().info?.sampleRate ?? 48000);
}

export function setView(view: Span): void {
  const info = get().info;
  if (info) set({ view: clampView(view, info.duration, least()) });
}

// Zooms by `factor` (below 1 zooms in) around `anchor`, or the middle of the view.
export function zoomBy(factor: number, anchor?: number): void {
  const { info, view } = get();
  if (!info) return;
  set({ view: zoomView(view, factor, anchor ?? (view.start + view.end) / 2, info.duration, least()) });
}

export function zoomFit(): void {
  const info = get().info;
  if (info) set({ view: { start: 0, end: info.duration } });
}

export function scrollBy(seconds: number): void {
  const { info, view } = get();
  if (info) set({ view: scrollView(view, seconds, info.duration) });
}

// --- Playback --------------------------------------------------------------------------

let playback: engine.BufferPlayback | null = null;

export function stopPlayback(): void {
  playback?.stop();
  playback = null;
  if (get().playing) set({ playing: null });
}

// Plays from..to, looping if the loop switch is on. Stops Import's [play] preview, so
// only one file sounds at a time.
async function play(from: number, to: number): Promise<void> {
  if (!buffer || to - from <= 0) return;
  stopPlayback();
  stopPreview();
  const loop = get().loop;
  const started = await engine.playBuffer(buffer, {
    from,
    to,
    loop,
    onEnded: () => {
      if (playback === started) {
        playback = null;
        set({ playing: null });
      }
    },
  });
  playback = started;
  set({ playing: { from, to, loop, startedAt: started.startedAt } });
}

// What [play] and Space play: the selection, or from the cursor to the end.
function region(): Span | null {
  const { selection, cursor, info } = get();
  if (!info) return null;
  return selection ?? { start: cursor, end: info.duration };
}

export function togglePlay(): void {
  if (get().playing) {
    stopPlayback();
    return;
  }
  const span = region();
  if (span) void play(span.start, span.end);
}

// Switches looping; what's playing starts over with the new setting.
export function toggleLoop(): void {
  set((s) => ({ loop: !s.loop }));
  if (get().playing) {
    const span = region();
    if (span) void play(span.start, span.end);
  }
}

// A click on the waveform: the cursor moves there, the selection goes, and it plays.
export function playFrom(time: number): void {
  const info = get().info;
  if (!info) return;
  set({ cursor: time, selection: null });
  void play(time, info.duration);
}

// The selection while a drag is still going: shown, but nothing restarts yet.
export function dragSelection(span: Span): void {
  set({ selection: span });
}

// A finished drag. A loop that's playing moves to the new selection.
export function select(span: Span): void {
  set({ selection: span, cursor: span.start });
  if (get().playing?.loop) void play(span.start, span.end);
}

export function clearSelection(): void {
  set({ selection: null });
}

const ZOOM_STEP = 0.5;

// Keys for these are in src/commands/keybindings.ts, "when": "sampleFocus".
export const SAMPLE_COMMANDS: Command[] = [
  { id: "view.sample", label: "Show Sample", run: () => showView("sample", { focus: true }) },
  { id: "sample.playStop", label: "Play or Stop Sample", run: togglePlay },
  { id: "sample.toggleLoop", label: "Loop Sample", run: toggleLoop },
  { id: "sample.zoomIn", label: "Zoom In", run: () => zoomBy(ZOOM_STEP) },
  { id: "sample.zoomOut", label: "Zoom Out", run: () => zoomBy(1 / ZOOM_STEP) },
  { id: "sample.zoomFit", label: "Zoom to Fit", run: zoomFit },
];
