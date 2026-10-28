import * as core from "@strudel/core";
import * as mini from "@strudel/mini";
import * as tonal from "@strudel/tonal";
import { transpiler } from "@strudel/transpiler";
import * as webaudio from "@strudel/webaudio";
import * as codemirror from "@strudel/codemirror";
import { StrudelMirror } from "@strudel/codemirror";
import * as soundfonts from "@strudel/soundfonts";
import { StateEffect } from "@codemirror/state";
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
  initialCode: string;
  editorSettings: EditorSettings;
}

// Creates the editor and scheduler once. Later calls are no-ops, because React
// StrictMode runs effects twice in dev and StrudelMirror has no real teardown.
export function init({ initialCode, editorSettings }: InitOptions): void {
  if (mirror) return;
  // StrudelMirror builds the editor from its localStorage-backed settings, so ours go
  // there first; otherwise whatever was saved last would win on startup.
  codemirror.codemirrorSettings.set({ ...codemirror.codemirrorSettings.get(), ...editorSettings });
  container = document.createElement("div");
  container.className = "strudel-root";
  mirror = new StrudelMirror({
    root: container,
    initialCode: import.meta.hot?.data.code ?? initialCode,
    prebake,
    beforeEval: ensureAudio,
    transpiler,
    defaultOutput: webaudio.webaudioOutput,
    getTime: () => webaudio.getAudioContext().currentTime,
    onUpdateState: (state: { evalError?: Error }) => {
      evalError = state.evalError?.message;
      publishError();
    },
    afterEval: () => {
      runtimeError = undefined;
      publishError();
    },
    onToggle: (started: boolean) => {
      if (started) return;
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

export function getCode(): string {
  return mirror?.code ?? "";
}

// Replaces the whole text in one undoable edit, with the cursor at the start.
// Does not evaluate: what is playing keeps playing until the next evaluation.
export function loadCode(code: string): void {
  const editor = mirror?.editor;
  if (!editor) return;
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: code },
    selection: { anchor: 0 },
    scrollIntoView: true,
  });
}

export function focusEditor(): void {
  mirror?.editor.focus();
}

// Editing this module in dev re-runs it: silence the old instance so two
// schedulers never play at once, and carry the code over to the new one.
if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.code = mirror?.code;
    mirror?.stop();
    mirror?.clear();
    container?.remove();
    document.removeEventListener(core.logger.key, onLog);
  });
}
