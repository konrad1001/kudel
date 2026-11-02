import * as core from "@strudel/core";
import * as mini from "@strudel/mini";
import * as tonal from "@strudel/tonal";
import { transpiler } from "@strudel/transpiler";
import * as webaudio from "@strudel/webaudio";
import * as codemirror from "@strudel/codemirror";
import { StrudelMirror } from "@strudel/codemirror";
import * as soundfonts from "@strudel/soundfonts";
import { EditorState, StateEffect, Transaction, type Extension, type TransactionSpec } from "@codemirror/state";
import { language } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { errorLine, setErrorLine } from "./errorLine";
import { errorPosition, loadsInProgress } from "./errors";
import { DRUM_MACHINE_ALIASES, SAMPLE_SOURCES } from "./soundSources";
import { soundInfo, type SoundInfo } from "./sounds";
import "./piano";

export type { SoundInfo } from "./sounds";

let mirror: StrudelMirror | undefined;
let container: HTMLDivElement | undefined;
let audioReady: Promise<void> | undefined;

// An error to show. A syntax error also says where it is, in the document it came from.
export interface EngineError {
  message: string;
  at?: ErrorLocation;
}

export interface ErrorLocation {
  docId: string;
  // 1-based.
  line: number;
  // 0-based.
  column: number;
}

export type ErrorListener = (error: EngineError | undefined) => void;
const errorListeners = new Set<ErrorListener>();
// Evaluation errors come from repl state; errors while playing (a pattern that
// throws, an unknown sound) only reach Strudel's logger, so they are tracked apart.
let evalError: EngineError | undefined;
// The repl's Error object evalError was made from; repl state repeats it on every update.
let evalErrorSource: unknown;
let runtimeError: EngineError | undefined;
let shownError: EngineError | undefined;
// The document whose line is marked as the error's.
let markedDoc: string | null = null;

// Samples Strudel has started loading and not finished, by URL, with when they started.
const sampleLoads = new Map<string, number>();

// `quiet` is true for the re-evaluations number scrubbing makes, which nothing should
// draw attention to.
export type EvaluatedListener = (docId: string | null, code: string, quiet: boolean) => void;
const evaluatedListeners = new Set<EvaluatedListener>();
// A scrub re-evaluation is running; another is wanted once it finishes.
let quietRun: Promise<void> | undefined;
let quietAgain = false;
let evaluatingQuietly = false;
// A normal evaluation (Ctrl+Enter) is running, which read the text when it started; a
// quiet one asked for meanwhile runs after it, on the latest text.
let loudRun: Promise<void> | undefined;
let quietAfterLoud = false;

export type CodeListener = (docId: string, code: string) => void;
const codeListeners = new Set<CodeListener>();

function publishCode(docId: string, code: string): void {
  codeListeners.forEach((listener) => listener(docId, code));
}

// Open documents by id. There is one editor: the shown document lives in the view,
// the others keep their whole editor state (text, cursor, undo history, Strudel's
// highlights) here until they are shown again.
interface StoredDoc {
  state: EditorState;
  scrollTop: number;
}
const docs = new Map<string, StoredDoc>();
let shownDoc: string | null = null;
// An empty state with every extension the editor uses; new documents start from it.
let blankState: EditorState | undefined;

// The document the latest evaluation came from. Recorded when evaluation starts, so a
// tab switch while it is still running (loading samples, say) doesn't change it.
let evaluatingDoc: string | null = null;

// The document whose code was last evaluated while the sound is running.
export type PlayingListener = (docId: string | null) => void;
const playingListeners = new Set<PlayingListener>();
let playingDoc: string | null = null;

function setPlaying(docId: string | null): void {
  if (docId === playingDoc) return;
  playingDoc = docId;
  playingListeners.forEach((listener) => listener(docId));
}

function publishError(): void {
  const next = evalError ?? runtimeError;
  if (next === shownError) return;
  shownError = next;
  errorListeners.forEach((listener) => listener(next));
}

function onLog(event: Event): void {
  const { message, type, data } = (event as CustomEvent<LogDetail>).detail;
  if (data?.url && type === "load-sample") sampleLoads.set(data.url, performance.now());
  if (data?.url && type === "loaded-sample") sampleLoads.delete(data.url);
  if (!/^\[[\w-]+\] error: /.test(message) || runtimeError?.message === message) return;
  runtimeError = { message };
  publishError();
}

// What Strudel's logger sends; superdough's sampler adds the URL to its load messages.
interface LogDetail {
  message: string;
  type?: string;
  data?: { url?: string };
}

// An evaluation error, placed in the document being evaluated when it has a position.
function evalErrorFrom(err: Error): EngineError {
  const position = errorPosition(err);
  return {
    message: err.message,
    at: position && evaluatingDoc !== null ? { docId: evaluatingDoc, ...position } : undefined,
  };
}

// Applies a transaction to a document, shown or not. Only for effects and selections:
// edits to a stored document also need publishCode, as dispatchChanges does.
function updateDoc(docId: string, spec: TransactionSpec): void {
  const view = mirror?.editor;
  if (view && docId === shownDoc) {
    view.dispatch(spec);
    return;
  }
  const stored = docs.get(docId);
  if (stored) docs.set(docId, { ...stored, state: stored.state.update(spec).state });
}

// Moves the error mark to `at`'s line, or clears it.
function markErrorLine(at: ErrorLocation | undefined): void {
  if (markedDoc !== null) updateDoc(markedDoc, { effects: setErrorLine.of(null) });
  markedDoc = at?.docId ?? null;
  if (at) updateDoc(at.docId, { effects: setErrorLine.of(at.line) });
}

// Turns the path in samples("./drums") into a sample map: sound name to the URLs of
// its files. Set by the app, which knows where files are; the engine only knows code
// and which document is being evaluated (null if none).
export type LocalSampleResolver = (path: string, docId: string | null) => Promise<Record<string, string[]>>;
let localSampleResolver: LocalSampleResolver | undefined;

export function setLocalSampleResolver(resolver: LocalSampleResolver): void {
  localSampleResolver = resolver;
}

// superdough checks registered prefixes before its own (github:, shabda:, ...) and
// expects [sampleMap, baseUrl] back; the map's URLs are already complete.
async function loadLocalSamples(path: string): Promise<[Record<string, string[]>, string]> {
  if (!localSampleResolver) throw new Error(`samples("${path}"): local samples are not available`);
  return [await localSampleResolver(path, evaluatingDoc), ""];
}

// Everything evaluated code can see, plus the sounds strudel.cc ships with.
async function prebake(): Promise<void> {
  webaudio.registerSamplesPrefix("./", loadLocalSamples);
  webaudio.registerSamplesPrefix("../", loadLocalSamples);
  await Promise.all([
    core.evalScope(core, mini, tonal, webaudio, codemirror, soundfonts),
    webaudio.registerSynthSounds(),
    webaudio.registerZZFXSounds(),
    soundfonts.registerSoundfonts(),
    ...SAMPLE_SOURCES.map(({ map, baseUrl, options }) => webaudio.samples(map, baseUrl, options)),
  ]);
  await webaudio.aliasBank(DRUM_MACHINE_ALIASES);
}

// resume() resolves once the context runs, but the output device can take longer to
// start (about 100ms measured in WebView2, more on some hardware), and anything
// scheduled before then is never heard. getOutputTimestamp's contextTime stays 0 until
// the device plays; wait for that, giving up after `timeoutMs` so sound never hangs.
function outputStarted(ac: AudioContext, timeoutMs = 2000): Promise<void> {
  const start = performance.now();
  return new Promise((resolve) => {
    const check = () => {
      const playing = (ac.getOutputTimestamp?.().contextTime ?? 1) > 0;
      if (playing || performance.now() - start > timeoutMs) resolve();
      else setTimeout(check, 10);
    };
    check();
  });
}

// Evaluation and auditions always follow a key press or click, so the AudioContext may
// start here. initAudio loads the effect worklets but never resumes the context (its
// OfflineAudioContext check is always false in superdough 1.3.0), so resume it ourselves.
function ensureAudio(): Promise<void> {
  audioReady ??= webaudio.initAudio().then(async () => {
    const ac = webaudio.getAudioContext();
    await ac.resume();
    await outputStarted(ac);
  });
  return audioReady;
}

// Starts audio ahead of the first sound, so the output device is already playing when a
// note comes. Only during a user gesture (a click or key press moments ago): outside
// one the browser keeps the context suspended and resume() would never settle.
export function warmUpAudio(): void {
  if (navigator.userActivation?.isActive) void ensureAudio();
}

// The keys StrudelMirror reads in @strudel/codemirror's defaultSettings.
export interface EditorSettings {
  theme: string;
  fontFamily: string;
  fontSize: number;
  keybindings: "codemirror" | "vim" | "emacs" | "vscode";
  isLineNumbersDisplayed: boolean;
  isActiveLineHighlighted: boolean;
  isBracketMatchingEnabled: boolean;
  isBracketClosingEnabled: boolean;
  isPatternHighlightingEnabled: boolean;
  isFlashEnabled: boolean;
  isAutoCompletionEnabled: boolean;
  isTooltipEnabled: boolean;
  isLineWrappingEnabled: boolean;
  isTabIndentationEnabled: boolean;
  isMultiCursorEnabled: boolean;
}

// Colours a theme exposes as CSS variables (--background, --foreground, ...),
// which the page and Strudel's highlighting use outside the editor.
export interface ThemeSettings {
  background: string;
  foreground: string;
  caret: string;
  selection: string;
  selectionMatch: string;
  lineHighlight: string;
  gutterBackground: string;
  gutterForeground: string;
  light?: boolean;
}

// Makes a CodeMirror theme extension selectable by name, like Strudel's built-in themes.
// Call before init when it is the starting theme.
export function registerTheme(name: string, extension: unknown, settings: ThemeSettings): void {
  codemirror.themes[name] = extension;
  codemirror.settings[name] = { ...settings };
}

export interface InitOptions {
  editorSettings: EditorSettings;
  // Our own CodeMirror extensions (src/editor), added to every document.
  extensions?: Extension[];
}

// Creates the editor and scheduler once, with no document shown. Later calls are
// no-ops, because React StrictMode runs effects twice in dev and StrudelMirror has
// no real teardown.
export function init({ editorSettings, extensions = [] }: InitOptions): void {
  if (mirror) return;
  // StrudelMirror builds the editor from its localStorage-backed settings, so ours go
  // there first; otherwise whatever was saved last would win on startup.
  codemirror.codemirrorSettings.set({ ...codemirror.codemirrorSettings.get(), ...editorSettings });
  container = document.createElement("div");
  container.className = "strudel-root";
  mirror = new StrudelMirror({
    root: container,
    initialCode: "",
    prebake,
    beforeEval: ensureAudio,
    transpiler,
    defaultOutput: webaudio.webaudioOutput,
    getTime: () => webaudio.getAudioContext().currentTime,
    onUpdateState: (state: { evalError?: Error }) => {
      if (state.evalError === evalErrorSource) return;
      evalErrorSource = state.evalError;
      evalError = state.evalError && evalErrorFrom(state.evalError);
      markErrorLine(evalError?.at);
      publishError();
    },
    // Only called after a successful evaluation.
    afterEval: ({ code }: { code: string }) => {
      runtimeError = undefined;
      publishError();
      if (mirror?.repl.scheduler.started) setPlaying(evaluatingDoc);
      evaluatedListeners.forEach((listener) => listener(evaluatingDoc, code, evaluatingQuietly));
    },
    onToggle: (started: boolean) => {
      if (started) {
        setPlaying(evaluatingDoc);
        return;
      }
      setPlaying(null);
      cutSound();
      runtimeError = undefined;
      publishError();
    },
  });
  document.addEventListener(core.logger.key, onLog);
  // superdough builds its output on the first sound, setting the destination's
  // channelCount to maxChannelCount. On an interface with more than two channels that
  // makes Chromium reopen the device, and the sound that triggered it is never heard.
  // Building it now, before any sound (the context is still suspended without a user
  // gesture), means the device opens with its final layout.
  webaudio.getSuperdoughAudioController();
  // StrudelMirror's own change handler is internal, so add a second update listener.
  // Added before blankState is captured, so every document gets these.
  mirror.editor.dispatch({
    effects: StateEffect.appendConfig.of([
      // The view only ever holds the shown document.
      EditorView.updateListener.of((update) => {
        if (update.docChanged && shownDoc !== null) publishCode(shownDoc, update.state.doc.toString());
      }),
      errorLine,
      ...extensions,
    ]),
  });
  blankState = mirror.editor.state;

  // Every evaluation goes through this method: our Play action, StrudelMirror's own
  // keymap (Alt+Enter) and vim's :w. Record which document it evaluates before
  // anything async happens. Wrapping the instance's method, not patching the package.
  const evaluateShown = mirror.evaluate.bind(mirror);
  mirror.evaluate = (autostart?: boolean) => {
    evaluatingDoc = shownDoc;
    const run = evaluateShown(autostart);
    loudRun = run;
    void run.finally(() => {
      if (loudRun === run) loudRun = undefined;
      if (quietAfterLoud && !loudRun) {
        quietAfterLoud = false;
        evaluateQuietly();
      }
    });
    return run;
  };

  // After a hot reload, bring back the documents the previous instance had open.
  const carried: CarriedDocs | undefined = import.meta.hot?.data.docs;
  if (carried) {
    Object.entries(carried.codes).forEach(([id, code]) => openDoc(id, code));
    showDoc(carried.shown);
  }
}

interface CarriedDocs {
  codes: Record<string, string>;
  shown: string | null;
}

// Calls `listener` with the document and its full text after every edit, whether made
// in the editor or by dispatchChanges. Returns an unsubscribe function.
export function onCodeChange(listener: CodeListener): () => void {
  codeListeners.add(listener);
  return () => {
    codeListeners.delete(listener);
  };
}

// Calls `listener` with the current error now and whenever it changes
// (undefined means no error). Returns an unsubscribe function.
export function onError(listener: ErrorListener): () => void {
  errorListeners.add(listener);
  listener(shownError);
  return () => {
    errorListeners.delete(listener);
  };
}

// Calls `listener` after every successful evaluation, with the document evaluated and
// the code that is now playing. Returns an unsubscribe function.
export function onEvaluated(listener: EvaluatedListener): () => void {
  evaluatedListeners.add(listener);
  return () => {
    evaluatedListeners.delete(listener);
  };
}

// The state of playback, for a status display to read as often as it likes.
export interface Transport {
  // The scheduler is running.
  started: boolean;
  // An evaluation is under way (loading samples, say).
  evaluating: boolean;
  // Cycles per second.
  cps: number;
  // The current cycle, fractional; 0 when stopped.
  cycle: number;
  // The AudioContext's state, or null before the engine starts.
  audio: AudioContextState | null;
  // Samples being fetched and decoded.
  loading: number;
}

export function getTransport(): Transport {
  const repl = mirror?.repl;
  const started = !!repl?.scheduler.started;
  return {
    started,
    evaluating: !!repl?.state.pending,
    cps: repl?.scheduler.cps ?? 0.5,
    cycle: repl && started ? Math.max(0, repl.scheduler.now()) : 0,
    audio: mirror ? webaudio.getAudioContext().state : null,
    loading: loadsInProgress(sampleLoads, performance.now()),
  };
}

// Places the editor inside `parent`; the returned function takes it out again.
export function attach(parent: HTMLElement): () => void {
  if (!container) throw new Error("engine.attach called before engine.init");
  const el = container;
  parent.appendChild(el);
  return () => el.remove();
}

export async function evaluate(): Promise<void> {
  await mirror?.evaluate();
}

export async function stop(): Promise<void> {
  await mirror?.stop();
}

// Re-evaluates the shown document after number scrubbing changed it, if it's the one
// playing; otherwise the edit is only text. No flash: it runs the repl directly rather
// than StrudelMirror's evaluate. One run at a time: changes made during a run are
// evaluated together, from the latest text, once it finishes.
export function evaluateQuietly(): void {
  if (loudRun) {
    quietAfterLoud = true;
    return;
  }
  if (!mirror?.repl.scheduler.started || shownDoc === null || shownDoc !== playingDoc) return;
  if (quietRun) {
    quietAgain = true;
    return;
  }
  const repl = mirror.repl;
  quietRun = (async () => {
    do {
      quietAgain = false;
      evaluatingDoc = shownDoc;
      evaluatingQuietly = true;
      try {
        await repl.evaluate(mirror.code);
      } finally {
        evaluatingQuietly = false;
      }
    } while (quietAgain && mirror && shownDoc === playingDoc);
  })().finally(() => (quietRun = undefined));
}

// Seconds the cut sound takes to fade, so stopping doesn't click.
const CUT_FADE = 0.03;

// Stopping the scheduler only stops new notes. The ones already handed to superdough
// (up to its latency ahead, and whatever is still sounding: a long sample, a release,
// reverb and delay tails) would play out. This silences them: the controller gets a
// fresh output and orbits for later notes, and the old ones fade out and are
// disconnected, taking every voice routed through them along. The controller's own
// reset() does the same but disconnects at once, which clicks.
function cutSound(): void {
  const ac = webaudio.getAudioContext();
  const controller = webaudio.getSuperdoughAudioController();
  const { nodes, buses, output } = controller;
  const { channelMerger, destinationGain } = output;
  controller.nodes = {};
  controller.buses = {};
  output.initializeAudio();
  if (destinationGain) {
    const now = ac.currentTime;
    destinationGain.gain.setValueAtTime(destinationGain.gain.value, now);
    destinationGain.gain.linearRampToValueAtTime(0, now + CUT_FADE);
  }
  setTimeout(
    () => {
      Object.values(nodes).forEach((orbit) => orbit.disconnect());
      Object.values(buses).forEach((bus) => bus.disconnect());
      channelMerger?.disconnect();
      destinationGain?.disconnect();
    },
    CUT_FADE * 1000 + 50,
  );
}

export interface Audition {
  // Mini-notation note name, e.g. "c#4". Without one a sample plays at its own pitch.
  note?: string;
  // Any registered sound or sample, as in s("…").
  s: string;
  // Seconds.
  duration: number;
  // Seconds the sound fades out after `duration`. Defaults to 0.1.
  release?: number;
}

// Scheduling a moment ahead, so the first note isn't "in the past" by the time it starts.
const AUDITION_LATENCY = 0.01;

// Wavetables already loaded by loadSoundFor.
const loadedTables = new Set<string>();

// Loads whatever file a sound needs for `value` (a sample, a soundfont zone or a
// wavetable), so superdough finds it cached. Its own loading happens after the start
// time is fixed, and a note whose file arrives late is skipped. Other sounds need
// nothing loaded; an unknown one is left for superdough to report.
async function loadSoundFor(value: { note?: string; s: string }): Promise<void> {
  const sound = webaudio.getSound(value.s);
  const data = sound?.data;
  if (data?.type === "sample") await webaudio.getSampleBuffer(value, data.samples);
  if (data?.type === "soundfont" && Array.isArray(data.fonts)) {
    // superdough picks the font by n; auditions have none, so the first.
    await soundfonts.getFontBufferSource(data.fonts[0], value, webaudio.getAudioContext());
  }
  // superdough's wavetable loader isn't exported. Triggering the sound at a time already
  // past loads the table and caches it (here and in the worklet), then returns silently.
  // That leaves one unused oscillator node per table.
  if (sound && data?.type === "wavetable" && !loadedTables.has(value.s)) {
    await sound.onTrigger(0, { ...value, duration: 0 }, () => {});
    loadedTables.add(value.s);
  }
}

// Plays one note through superdough, so it sounds as it would in a pattern and shares
// its audio context, but outside the scheduler: it never changes what the pattern plays.
// clip ends samples at `duration` (like .piano()), release keeps the cut from clicking.
// The start time is taken once the sound is loaded, so a first press plays late rather
// than not at all. Rejects for an unknown sound; called from a key press or click, so
// audio may start.
export async function auditionNote({ note, s, duration, release = 0.1 }: Audition): Promise<void> {
  if (!mirror) return;
  await mirror.prebaked;
  await ensureAudio();
  const value = note === undefined ? { s } : { note, s };
  await loadSoundFor(value);
  const now = webaudio.getAudioContext().currentTime;
  await webaudio.superdough({ ...value, clip: 1, release }, now + AUDITION_LATENCY, duration);
}

const SOUNDS_BATCH_MS = 100;

// Calls `listener` with every registered sound now, and again after changes. Loading
// registers sounds one at a time (thousands at startup), so changes are batched into
// one call per SOUNDS_BATCH_MS. Returns an unsubscribe function.
export function onSoundsChange(listener: (sounds: SoundInfo[]) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const publish = () => {
    timer = undefined;
    listener(Object.entries(webaudio.soundMap.get()).map(([name, { data }]) => soundInfo(name, data)));
  };
  publish();
  const unlisten = webaudio.soundMap.listen(() => {
    timer ??= setTimeout(publish, SOUNDS_BATCH_MS);
  });
  return () => {
    unlisten();
    clearTimeout(timer);
  };
}

// The shown document's code.
export function getCode(): string {
  return mirror?.code ?? "";
}

export interface DocSelection {
  anchor: number;
  head: number;
}

// Adds a document with its own empty undo history, the cursor at `selection` (kept
// inside the text). It is not shown or evaluated.
export function openDoc(id: string, code: string, selection?: DocSelection): void {
  if (!blankState) throw new Error("engine.openDoc called before engine.init");
  const clamp = (pos: number) => Math.max(0, Math.min(pos, code.length));
  const state = blankState.update({
    changes: { from: 0, to: blankState.doc.length, insert: code },
    selection: selection && { anchor: clamp(selection.anchor), head: clamp(selection.head) },
    annotations: Transaction.addToHistory.of(false),
  }).state;
  docs.set(id, { state, scrollTop: 0 });
}

export function getDocSelection(id: string): DocSelection {
  const state = id === shownDoc ? mirror?.editor.state : docs.get(id)?.state;
  const main = state?.selection.main;
  return { anchor: main?.anchor ?? 0, head: main?.head ?? 0 };
}

// Scrolls the shown document so its cursor is in view (after restoring a session).
export function revealCursor(): void {
  const view = mirror?.editor;
  if (view && shownDoc !== null) view.dispatch({ scrollIntoView: true });
}

// Puts a document in the editor, keeping the previous one's state for later.
// null leaves the editor empty. Switching never evaluates.
export function showDoc(id: string | null): void {
  const view = mirror?.editor;
  if (!view || !blankState || id === shownDoc) return;
  const scroller = container?.parentElement;
  if (shownDoc !== null && docs.has(shownDoc)) {
    docs.set(shownDoc, { state: view.state, scrollTop: scroller?.scrollTop ?? 0 });
  }
  const next = id === null ? undefined : docs.get(id);
  shownDoc = next ? id : null;
  view.setState(next?.state ?? blankState);
  // setState skips update listeners, so StrudelMirror's copy of the code is synced by hand.
  mirror!.code = view.state.doc.toString();
  mirror!.repl.setCode?.(mirror!.code);
  if (next && scroller) requestAnimationFrame(() => (scroller.scrollTop = next.scrollTop));
}

// Forgets a document. Closing the one that is playing stops the sound, because
// nothing that is heard may be missing from the open code.
export function closeDoc(id: string): void {
  if (id === shownDoc) showDoc(null);
  docs.delete(id);
  if (id === playingDoc) void stop();
}

// Applies edits to a document, shown or not, as one undoable step. Positions refer to
// the code before the edits; the cursor moves to just after whatever lands at `cursorAt`.
export function dispatchChanges(
  docId: string,
  changes: { from: number; to?: number; insert: string }[],
  cursorAt?: number,
): void {
  const view = mirror?.editor;
  if (!view) return;
  const stored = docs.get(docId);
  const state = docId === shownDoc ? view.state : stored?.state;
  if (!state) return;
  const set = state.changes(changes);
  const spec = {
    changes: set,
    selection: cursorAt === undefined ? undefined : { anchor: set.mapPos(cursorAt, 1) },
    scrollIntoView: true,
  };
  if (docId === shownDoc) {
    view.dispatch(spec);
    return;
  }
  // A stored document has no view to notify the listeners, so do it here.
  const next = state.update(spec).state;
  docs.set(docId, { state: next, scrollTop: stored!.scrollTop });
  publishCode(docId, next.doc.toString());
}

export function getDocCode(id: string): string {
  if (id === shownDoc) return getCode();
  return docs.get(id)?.state.doc.toString() ?? "";
}

// Calls `listener` with the playing document now and whenever it changes.
// Returns an unsubscribe function.
export function onPlayingChange(listener: PlayingListener): () => void {
  playingListeners.add(listener);
  listener(playingDoc);
  return () => {
    playingListeners.delete(listener);
  };
}

export function focusEditor(): void {
  mirror?.editor.focus();
}

// Puts the cursor at `line` (1-based) and `column` (0-based) in the shown document,
// scrolled into view, and focuses the editor.
export function revealPosition(line: number, column: number): void {
  const view = mirror?.editor;
  if (!view || shownDoc === null) return;
  const { doc } = view.state;
  const target = doc.line(Math.min(Math.max(line, 1), doc.lines));
  view.dispatch({ selection: { anchor: Math.min(target.from + column, target.to) }, scrollIntoView: true });
  view.focus();
}

// The word at the cursor in the shown document (a function or control name, say), or
// null with no document or no word there.
export function wordAtCursor(): string | null {
  const view = mirror?.editor;
  if (!view || shownDoc === null) return null;
  const range = view.state.wordAt(view.state.selection.main.head);
  return range ? view.state.sliceDoc(range.from, range.to) : null;
}

// Shows `code` read-only in `parent`, coloured like the editor: its current theme,
// language and font. Returns a function that removes it.
export function mountCodeView(parent: HTMLElement, code: string): () => void {
  const source = mirror?.editor.state;
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: code,
      extensions: [
        source ? (codemirror.compartments.theme.get(source) ?? []) : [],
        source?.facet(language)?.extension ?? [],
        EditorState.readOnly.of(true),
        EditorView.editable.of(false),
        EditorView.lineWrapping,
      ],
    }),
  });
  // StrudelMirror sets the font on its root and scroller, over the theme's.
  view.scrollDOM.style.fontFamily = container?.style.fontFamily ?? "";
  return () => view.destroy();
}

// Editing this module in dev re-runs it: silence the old instance so two
// schedulers never play at once, and carry the open documents over to the new one.
if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    const codes: Record<string, string> = {};
    docs.forEach((_, id) => (codes[id] = getDocCode(id)));
    data.docs = { codes, shown: shownDoc } satisfies CarriedDocs;
    mirror?.stop();
    mirror?.clear();
    container?.remove();
    document.removeEventListener(core.logger.key, onLog);
  });
}
