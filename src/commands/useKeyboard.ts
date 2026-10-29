import { useEffect } from "react";
import { getCommand } from "./commands";
import { bindingFor, useKeybindings } from "./keybindings";
import { shortcutFromEvent } from "./keys";
import { contextValue } from "./when";

// The app's one keyboard handler: turns key presses into commands through the
// keybindings. Listens in the capture phase so the editor never sees a key that is
// bound, and blocks WebView2's own handling (Ctrl+S would otherwise save the page).
// Keys with no binding (or whose "when" fails) pass through untouched.
export function useKeyboard(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const binding = bindingFor(useKeybindings.getState().bindings, shortcutFromEvent(event), contextValue);
      const command = binding && getCommand(binding.command);
      if (!command) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) command.run();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
