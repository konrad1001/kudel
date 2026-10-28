import { useEffect } from "react";

// Something the user can trigger from a menu, and from the keyboard when it has a shortcut.
export interface Action {
  label: string;
  // Written like "Ctrl+Shift+S": modifiers in the order Ctrl, Alt, Shift, then the key.
  shortcut?: string;
  run: () => unknown;
}

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

// The shortcut a key press spells, in the same form as Action.shortcut.
export function shortcutFromEvent({ key, ctrlKey, altKey, shiftKey }: KeyLike): string {
  const parts: string[] = [];
  if (ctrlKey) parts.push("Ctrl");
  if (altKey) parts.push("Alt");
  if (shiftKey) parts.push("Shift");
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join("+");
}

// Runs actions from anywhere in the window. Listens in the capture phase so the
// editor never sees a key that belongs to an action, and blocks WebView2's own
// handling (Ctrl+S would otherwise offer to save the page).
export function useShortcuts(actions: Action[]): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = shortcutFromEvent(event);
      const action = actions.find((a) => a.shortcut === shortcut);
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) action.run();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [actions]);
}
