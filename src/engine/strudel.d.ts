// Strudel ships no type declarations. These cover only what src/engine uses,
// written against the installed source; re-check it before widening them.

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
