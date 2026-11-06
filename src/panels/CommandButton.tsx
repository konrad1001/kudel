import type { ReactNode } from "react";
import { getCommand } from "../commands/commands";
import { useKeyFor, withKey } from "../commands/keybindings";
import { identifierFor, isReserved } from "../synth/patch";

// A [text] button that runs a command, with the command's label and key as its tooltip.
export function CommandButton({ command, disabled, children }: { command: string; disabled?: boolean; children: ReactNode }) {
  const key = useKeyFor(command);
  const label = getCommand(command)?.label ?? command;
  return (
    <button
      type="button"
      className="ascii-button"
      title={withKey(label, key)}
      aria-label={label}
      disabled={disabled}
      onClick={() => getCommand(command)?.run()}
    >
      [{children}]
    </button>
  );
}

// Why a name won't work well as the const a panel's code declares, or null: a
// JavaScript keyword can't be one, and a function or pattern on Strudel's global scope
// (saw, note, …) would be hidden in the code that declares it.
export function nameWarning(name: string): string | null {
  const id = identifierFor(name);
  if (isReserved(id)) return `"${id}" is a JavaScript keyword; rename it`;
  const value = (globalThis as Record<string, unknown>)[id];
  if (value !== undefined && (typeof value === "function" || typeof value === "object")) {
    return `"${id}" hides Strudel's ${id} in code that declares it`;
  }
  return null;
}
