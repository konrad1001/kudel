export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

// The key a key press spells, written like "Ctrl+Shift+S": modifiers in the order
// Ctrl, Alt, Shift, then the key (letters upper-cased). Keybindings use this form.
export function shortcutFromEvent({ key, ctrlKey, altKey, shiftKey }: KeyLike): string {
  const parts: string[] = [];
  if (ctrlKey) parts.push("Ctrl");
  if (altKey) parts.push("Alt");
  if (shiftKey) parts.push("Shift");
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join("+");
}
