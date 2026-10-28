import * as core from "@strudel/core";
import * as mini from "@strudel/mini";
import * as tonal from "@strudel/tonal";
import { transpiler } from "@strudel/transpiler";
import * as webaudio from "@strudel/webaudio";
import * as codemirror from "@strudel/codemirror";
import { StrudelMirror } from "@strudel/codemirror";
import * as soundfonts from "@strudel/soundfonts";
import { EditorState, StateEffect, Transaction } from "@codemirror/state";
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

export type CodeListener = (code: string) => void;
const codeListeners = new Set<CodeListener>();

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

// Everything evaluated code can see, plus the sounds strudel.cc ships with.
async function prebake(): Promise<void> {
  await Promise.all([
    core.evalScope(core, mini, tonal, webaudio, codemirror, soundfonts),
    webaudio.registerSynthSounds(),
    webaudio.registerZZFXSounds(),
    soundfonts.registerSoundfonts(),
    ...SAMPLE_SOURCES.map(({ map, baseUrl, options }) => webaudio.samples(map, baseUrl, options)),
  ]);
  await webaudio.aliasBank(DRUM_MACHINE_ALIASES);
}

// Evaluation always follows a key press or click, so the AudioContext may start here.
// initAudio loads the effect worklets but never resumes the context (its
// OfflineAudioContext check is always false in superdough 1.3.0), so resume it ourselves.
function ensureAudio(): Promise<void> {
  audioReady ??= webaudio.initAudio().then(() => webaudio.getAudioContext().resume());
  return audioReady;
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
}

// Creates the editor and scheduler once, with no document shown. Later calls are
// no-ops, because React StrictMode runs effects twice in dev and StrudelMirror has
// no real teardown.
export function init({ editorSettings }: InitOptions): void {
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
    // Only called after a successful evaluation, which always comes from the shown document.
    afterEval: () => {
      runtimeError = undefined;
      publishError();
      if (mirror?.repl.scheduler.started) setPlaying(shownDoc);
    },
    onToggle: (started: boolean) => {
      if (started) {
        setPlaying(shownDoc);
        return;
      }
      setPlaying(null);
      runtimeError = undefined;
      publishError();
    },
  });
  document.addEventListener(core.logger.key, onLog);
  // StrudelMirror's own change handler is internal, so add a second update listener.
  mirror.editor.dispatch({
    effects: StateEffect.appendConfig.of(
      EditorView.updateListener.of((update) => {
        if (!update.docChanged) return;
        const code = update.state.doc.toString();
        codeListeners.forEach((listener) => listener(code));
      }),
    ),
  });
  blankState = mirror.editor.state;

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

// Calls `listener` with the full text after every edit. Returns an unsubscribe function.
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

// The shown document's code.
export function getCode(): string {
  return mirror?.code ?? "";
}

// Adds a document with its own empty undo history. It is not shown or evaluated.
export function openDoc(id: string, code: string): void {
  if (!blankState) throw new Error("engine.openDoc called before engine.init");
  const state = blankState.update({
    changes: { from: 0, to: blankState.doc.length, insert: code },
    annotations: Transaction.addToHistory.of(false),
  }).state;
  docs.set(id, { state, scrollTop: 0 });
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
