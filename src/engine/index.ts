import * as core from "@strudel/core";
import * as mini from "@strudel/mini";
import * as tonal from "@strudel/tonal";
import { transpiler } from "@strudel/transpiler";
import * as webaudio from "@strudel/webaudio";
import * as codemirror from "@strudel/codemirror";
import { StrudelMirror } from "@strudel/codemirror";
import * as soundfonts from "@strudel/soundfonts";
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

export interface InitOptions {
  initialCode: string;
}

// Creates the editor and scheduler once. Later calls are no-ops, because React
// StrictMode runs effects twice in dev and StrudelMirror has no real teardown.
export function init({ initialCode }: InitOptions): void {
  if (mirror) return;
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
