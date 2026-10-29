import * as core from "@strudel/core";
import * as mini from "@strudel/mini";
import * as tonal from "@strudel/tonal";
import { transpiler } from "@strudel/transpiler";
import * as webaudio from "@strudel/webaudio";
import * as codemirror from "@strudel/codemirror";
import { StrudelMirror } from "@strudel/codemirror";
import * as soundfonts from "@strudel/soundfonts";
import { EditorState, StateEffect, Transaction, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { DRUM_MACHINE_ALIASES, SAMPLE_SOURCES } from "./soundSources";
import "./piano";

let mirror: StrudelMirror | undefined;
let container: HTMLDivElement | undefined;
let audioReady: Promise<void> | undefined;

export type ErrorListener = (message: string | undefined) => void;
const errorListeners = new Set<ErrorListener>();
// Evaluation errors come from repl state; errors while playing (a pattern that
// throws, an unknown sound) only reach Strudel's logger, so they are tracked apart.
let evalError: string | undefined;
let runtimeError: string | undefined;
let shownError: string | undefined;

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
  const { message } = (event as CustomEvent<{ message: string }>).detail;
  if (!/^\[[\w-]+\] error: /.test(message)) return;
  runtimeError = message;
  publishError();
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
      evalError = state.evalError?.message;
      publishError();
    },
    // Only called after a successful evaluation.
    afterEval: () => {
      runtimeError = undefined;
      publishError();
      if (mirror?.repl.scheduler.started) setPlaying(evaluatingDoc);
    },
    onToggle: (started: boolean) => {
      if (started) {
        setPlaying(evaluatingDoc);
        return;
      }
      setPlaying(null);
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
    return evaluateShown(autostart);
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

export interface Audition {
  // Mini-notation note name, e.g. "c#4".
  note: string;
  // Any registered sound or sample, as in s("…").
  s: string;
  // Seconds.
  duration: number;
}

// Scheduling a moment ahead, so the first note isn't "in the past" by the time it starts.
const AUDITION_LATENCY = 0.01;

// Loads whatever file a sound needs for `value` (a sample or a soundfont zone), so
// superdough finds it cached. Its own loading happens after the start time is fixed,
// and a note whose file arrives late is skipped. Other sounds need nothing loaded;
// an unknown one is left for superdough to report.
async function loadSoundFor(value: { note: string; s: string }): Promise<void> {
  const data = webaudio.getSound(value.s)?.data;
  if (data?.type === "sample") await webaudio.getSampleBuffer(value, data.samples);
  if (data?.type === "soundfont" && Array.isArray(data.fonts)) {
    // superdough picks the font by n; auditions have none, so the first.
    await soundfonts.getFontBufferSource(data.fonts[0], value, webaudio.getAudioContext());
  }
}

// Plays one note through superdough, so it sounds as it would in a pattern and shares
// its audio context, but outside the scheduler: it never changes what the pattern plays.
// clip ends samples at `duration` (like .piano()), release keeps the cut from clicking.
// The start time is taken once the sound is loaded, so a first press plays late rather
// than not at all. Rejects for an unknown sound; called from a key press or click, so
// audio may start.
export async function auditionNote({ note, s, duration }: Audition): Promise<void> {
  if (!mirror) return;
  await mirror.prebaked;
  await ensureAudio();
  await loadSoundFor({ note, s });
  const now = webaudio.getAudioContext().currentTime;
  await webaudio.superdough({ note, s, clip: 1, release: 0.1 }, now + AUDITION_LATENCY, duration);
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
