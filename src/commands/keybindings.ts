import { create } from "zustand";
import { evaluateWhen } from "./when";

export interface KeyBinding {
  // Written as shortcutFromEvent spells it: "Ctrl+Shift+S", "Escape".
  key: string;
  command: string;
  when?: string;
}

// The built-in keys. The settings file (milestone 3) will append the user's own
// bindings after these; later bindings win.
export const DEFAULT_KEYBINDINGS: KeyBinding[] = [
  { key: "Ctrl+N", command: "file.new" },
  { key: "Ctrl+O", command: "file.open" },
  { key: "Ctrl+Shift+O", command: "file.openFolder" },
  { key: "Ctrl+S", command: "file.save" },
  { key: "Ctrl+Shift+S", command: "file.saveAs" },
  { key: "Ctrl+W", command: "file.closeEditor" },
  { key: "Ctrl+B", command: "view.toggleExplorer" },
  { key: "Ctrl+Tab", command: "editor.next" },
  { key: "Ctrl+Shift+Tab", command: "editor.previous" },
  // Also in StrudelMirror's own editor keymap (with Alt+Enter and Alt+.); these
  // make them work wherever focus is.
  { key: "Ctrl+Enter", command: "run.play" },
  { key: "Ctrl+.", command: "run.stop" },
  // Not while typing: vim and text fields need their Escape.
  { key: "Escape", command: "samples.stopPreview", when: "previewing && !editorFocus && !inputFocus" },
  { key: "Escape", command: "menu.close", when: "menuOpen" },
];

export const useKeybindings = create<{ bindings: KeyBinding[] }>(() => ({
  bindings: DEFAULT_KEYBINDINGS,
}));

// The binding a key press triggers: the last one for that key whose "when" holds.
export function bindingFor(
  bindings: KeyBinding[],
  key: string,
  value: (contextKey: string) => boolean,
): KeyBinding | undefined {
  for (let i = bindings.length - 1; i >= 0; i--) {
    const binding = bindings[i];
    if (binding.key === key && evaluateWhen(binding.when, value)) return binding;
  }
  return undefined;
}

// The key shown for a command in menus and tooltips: its last binding.
export function keyFor(bindings: KeyBinding[], commandId: string): string | undefined {
  for (let i = bindings.length - 1; i >= 0; i--) {
    if (bindings[i].command === commandId) return bindings[i].key;
  }
  return undefined;
}

export function useKeyFor(commandId: string): string | undefined {
  return useKeybindings((s) => keyFor(s.bindings, commandId));
}

// "Stop (Ctrl+.)", or just "Stop" when the command has no key.
export function withKey(label: string, key: string | undefined): string {
  return key ? `${label} (${key})` : label;
}
