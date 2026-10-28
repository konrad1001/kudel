// Strudel ships no type declarations. These cover only what src/engine uses,
// written against the installed source; re-check it before widening them.

declare module "@strudel/core" {
  // Copies every export of each module onto globalThis so evaluated code can use it.
  export function evalScope(...modules: unknown[]): Promise<unknown[]>;
  // Every message is also dispatched on document as a CustomEvent named logger.key.
  export const logger: ((message: string, type?: string) => void) & { key: string };
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
  export function samples(
    sampleMap: string | Record<string, unknown>,
    baseUrl?: string,
    options?: Record<string, unknown>,
  ): Promise<void>;
}

declare module "@strudel/codemirror" {
  export interface StrudelMirrorOptions {
    root: HTMLElement;
    initialCode?: string;
    prebake: () => Promise<unknown>;
    // Everything else is forwarded to repl() in @strudel/core/repl.mjs.
    [replOption: string]: unknown;
  }

  export class StrudelMirror {
    constructor(options: StrudelMirrorOptions);
    code: string;
    evaluate(autostart?: boolean): Promise<void>;
    stop(): Promise<void>;
    // Only removes StrudelMirror's document listeners; the editor and scheduler live on.
    clear(): void;
  }
}
