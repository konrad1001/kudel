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
  { key: "Ctrl+B", command: "view.toggleSidebar" },
  { key: "Ctrl+J", command: "view.togglePanel" },
  { key: "Ctrl+Alt+B", command: "view.toggleAside" },
  { key: "Ctrl+Shift+M", command: "view.toggleMaximised" },
  { key: "F1", command: "reference.lookUp" },
  { key: "Ctrl+Tab", command: "editor.next" },
  { key: "Ctrl+Shift+Tab", command: "editor.previous" },
  // Also in StrudelMirror's own editor keymap (with Alt+Enter and Alt+.); these
  // make them work wherever focus is.
  { key: "Ctrl+Enter", command: "run.play" },
  { key: "Ctrl+.", command: "run.stop" },
  // The Keys view: a DAW-style keyboard, only while it has focus, so everywhere else
  // these letters type. Auto-repeat never retriggers a command.
  { key: "A", command: "keys.play0", when: "keysFocus" },
  { key: "W", command: "keys.play1", when: "keysFocus" },
  { key: "S", command: "keys.play2", when: "keysFocus" },
  { key: "E", command: "keys.play3", when: "keysFocus" },
  { key: "D", command: "keys.play4", when: "keysFocus" },
  { key: "F", command: "keys.play5", when: "keysFocus" },
  { key: "T", command: "keys.play6", when: "keysFocus" },
  { key: "G", command: "keys.play7", when: "keysFocus" },
  { key: "Y", command: "keys.play8", when: "keysFocus" },
  { key: "H", command: "keys.play9", when: "keysFocus" },
  { key: "U", command: "keys.play10", when: "keysFocus" },
  { key: "J", command: "keys.play11", when: "keysFocus" },
  { key: "K", command: "keys.play12", when: "keysFocus" },
  { key: "N", command: "keys.octaveDown", when: "keysFocus" },
  { key: "M", command: "keys.octaveUp", when: "keysFocus" },
  { key: "X", command: "keys.rest", when: "keysFocus" },
  { key: "C", command: "keys.clear", when: "keysFocus" },
  { key: "Ctrl+C", command: "keys.copy", when: "keysFocus" },
  // Back to the editor from the panel or the aside. Before stopPreview, so Escape stops a preview first.
  { key: "Escape", command: "view.focusEditor", when: "panelFocus" },
  // Not from the reference's search box, which handles its own Escape (clear, then leave).
  { key: "Escape", command: "view.focusEditor", when: "asideFocus && !inputFocus" },
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
