import * as engine from "./engine";
import type { Action } from "./shortcuts";
import { useTabs } from "./files/tabsStore";

// Evaluates the active tab, replacing whatever is playing.
export function play(): void {
  if (useTabs.getState().activeId !== null) void engine.evaluate();
}

export function stop(): void {
  void engine.stop();
}

// Same keys as StrudelMirror's editor keymap, but these work wherever focus is.
export const RUN_ACTIONS: Action[][] = [
  [
    { label: "Play", shortcut: "Ctrl+Enter", run: play },
    { label: "Stop", shortcut: "Ctrl+.", run: stop },
  ],
];
