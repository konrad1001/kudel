import * as engine from "./engine";
import type { Command } from "./commands/commands";
import { useTabs } from "./files/tabsStore";

// Evaluates the active tab, replacing whatever is playing.
export function play(): void {
  if (useTabs.getState().activeId !== null) void engine.evaluate();
}

export function stop(): void {
  void engine.stop();
}

export const RUN_COMMANDS: Command[] = [
  { id: "run.play", label: "Play", run: play },
  { id: "run.stop", label: "Stop", run: stop },
];
