// "when" clauses on keybindings: named true/false values about the app right now,
// like VS Code's context keys. A clause is terms joined by "&&", each a key name,
// optionally negated with "!": "previewing && !inputFocus". No clause means always.

// Whether `when` holds, given how to read each key. Unknown keys read as false.
export function evaluateWhen(when: string | undefined, value: (key: string) => boolean): boolean {
  if (!when?.trim()) return true;
  return when.split("&&").every((raw) => {
    const term = raw.trim();
    return term.startsWith("!") ? !value(term.slice(1).trim()) : value(term);
  });
}

const contextKeys = new Map<string, () => boolean>();

// Modules register the keys they know about (the preview module registers "previewing").
export function registerContextKey(name: string, read: () => boolean): void {
  contextKeys.set(name, read);
}

export function contextValue(name: string): boolean {
  return contextKeys.get(name)?.() ?? false;
}

const focused = () => document.activeElement;

// Focus is inside a CodeMirror editor.
registerContextKey("editorFocus", () => !!focused()?.closest(".cm-editor"));

// A text field of our own (not the code editor), e.g. the new-file name box.
export function isTextField(el: Element | null): boolean {
  if (!el || el.closest(".cm-editor")) return false;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement).isContentEditable;
}

registerContextKey("inputFocus", () => isTextField(focused()));
