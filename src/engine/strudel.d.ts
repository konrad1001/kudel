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
  // Creates the output (orbits, channel merger, destination gain) on first call, which
  // also sets the destination's channelCount to its maxChannelCount.
  export function getSuperdoughAudioController(): unknown;
  // Plays one sound at AudioContext time `t` for `duration` seconds (there is no
  // note-off). Rejects if `value.s` isn't a registered sound; skips the note if its
  // sample is still loading at `t`. Mutates `value`.
  // A registered sound by name (any case), as registerSound(key, onTrigger, data) left it.
  // data.type is "sample" (data.samples: its bank), "soundfont" (data.fonts: preset
  // names), "synth", "wavetable", ...
  export function getSound(s: string): { onTrigger: unknown; data: Record<string, unknown> & { type?: string } } | undefined;
  // Loads (once; cached by URL) the file of `bank` that a sample sound plays for
  // `value` (its note, n, ...), the same choice the sampler makes when triggered.
  export function getSampleBuffer(value: Record<string, unknown>, bank: unknown): Promise<unknown>;
  export function superdough(
    value: Record<string, unknown>,
    t: number,
    duration: number,
    cps?: number,
    cycle?: number,
  ): Promise<void>;
  export function registerSynthSounds(): void;
  export function registerZZFXSounds(): void;
  // With a single string argument: the URL of a JSON map of bank aliases.
  export function aliasBank(path: string): Promise<void>;
  export function samples(
    sampleMap: string | Record<string, unknown>,
    baseUrl?: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
  // samples("<prefix>...") calls `resolve` with the whole string instead of fetching
  // it; resolve returns [sampleMap, baseUrl]. Checked before github:, shabda:, ...
  export function registerSamplesPrefix(
    prefix: string,
    resolve: (url: string) => Promise<[Record<string, unknown>, string]>,
  ): void;
}

declare module "@strudel/soundfonts" {
  // Registers the General MIDI instruments (gm_*); presets load on first use.
  export function registerSoundfonts(): void;
  // Loads (once; cached) the preset zone for value.note and returns an unstarted source.
  export function getFontBufferSource(font: string, value: Record<string, unknown>, ac: AudioContext): Promise<unknown>;
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
    // The constructor's call to the prebake option; evaluation waits for it.
    prebaked: Promise<unknown>;
    // The repl from @strudel/core/repl.mjs; setCode only updates its dirty tracking.
    repl: {
      scheduler: { started: boolean };
      setCode?(code: string): void;
    };
    // Also what StrudelMirror's keymap (Alt+Enter) and vim's :w call, via `this`.
    evaluate(autostart?: boolean): Promise<void>;
    stop(): Promise<void>;
    // Only removes StrudelMirror's document listeners; the editor and scheduler live on.
    clear(): void;
  }
}
