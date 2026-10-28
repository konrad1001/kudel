// Strudel ships no type declarations. These cover only what src/engine uses,
// written against the installed source; re-check it before widening them.

declare module "@strudel/core" {
  // Copies every export of each module onto globalThis so evaluated code can use it.
  export function evalScope(...modules: unknown[]): Promise<unknown[]>;
  // Every message is also dispatched on document as a CustomEvent named logger.key.
  export const logger: ((message: string, type?: string) => void) & { key: string };

  // A hap's value: control names (s, note, pan, clip, ...) to their values.
  export interface ControlValue {
    clip?: number;
    pan?: number;
    [control: string]: unknown;
  }

  export class Pattern {
    fmap(fn: (value: ControlValue) => ControlValue): Pattern;
    s(sound: string): Pattern;
    release(seconds: number): Pattern;
    // Added by src/engine/piano.ts, as strudel.cc does in its website code.
    piano(): Pattern;
  }

  export function noteToMidi(note: string): number;
  export function valueToMidi(value: ControlValue): number;
}

// Imported only to hand to evalScope; @strudel/mini also registers the mini-notation parser.
declare module "@strudel/mini" {}
declare module "@strudel/tonal" {}

declare module "@strudel/transpiler" {
  export function transpiler(input: string, options?: Record<string, unknown>): unknown;
}

// @strudel/webaudio re-exports all of superdough.
declare module "@strudel/webaudio" {
  export function webaudioOutput(...args: unknown[]): unknown;
  export function getAudioContext(): AudioContext;
  export function initAudio(options?: Record<string, unknown>): Promise<void>;
  export function registerSynthSounds(): void;
  export function registerZZFXSounds(): void;
  // With a single string argument: the URL of a JSON map of bank aliases.
  export function aliasBank(path: string): Promise<void>;
  export function samples(
    sampleMap: string | Record<string, unknown>,
    baseUrl?: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
}

declare module "@strudel/soundfonts" {
  // Registers the General MIDI instruments (gm_*); presets load on first use.
  export function registerSoundfonts(): void;
}

declare module "@strudel/codemirror" {
  export interface StrudelMirrorOptions {
    root: HTMLElement;
    initialCode?: string;
    prebake: () => Promise<unknown>;
    // Everything else is forwarded to repl() in @strudel/core/repl.mjs.
    [replOption: string]: unknown;
  }

  // Theme registries looked up by name: themes holds CodeMirror extensions,
  // settings the colours activateTheme turns into CSS variables (--background, ...).
  export const themes: Record<string, unknown>;
  export const settings: Record<string, Record<string, unknown>>;

  // nanostores persistentAtom, saved to localStorage as "codemirror-settings";
  // the StrudelMirror constructor reads it to build the editor.
  export const codemirrorSettings: {
    get(): Record<string, unknown>;
    set(value: Record<string, unknown>): void;
  };

  export class StrudelMirror {
    constructor(options: StrudelMirrorOptions);
    // The CodeMirror view; its update listener keeps `code` in step with the document.
    editor: import("@codemirror/view").EditorView;
    code: string;
    evaluate(autostart?: boolean): Promise<void>;
    stop(): Promise<void>;
    // Only removes StrudelMirror's document listeners; the editor and scheduler live on.
    clear(): void;
  }
}
