import { useEffect, useLayoutEffect, useRef } from "react";
import { create } from "zustand";
import { getCommand, type Command } from "../commands/commands";
import { keyFor, useKeybindings } from "../commands/keybindings";
import { registerContextKey } from "../commands/when";

// A right-click menu: a list of command ids shown at the pointer. The commands act on
// whatever the right-click selected first (the explorer's selected entry, say), so
// they work the same from the menu and from their keys.
const useContextMenu = create<{ at: { x: number; y: number } | null; commands: string[] }>(() => ({
  at: null,
  commands: [],
}));

export function openContextMenu(x: number, y: number, commands: string[]): void {
  useContextMenu.setState({ at: { x, y }, commands });
}

export function closeContextMenu(): void {
  useContextMenu.setState({ at: null });
}

registerContextKey("contextMenuOpen", () => useContextMenu.getState().at !== null);

export const CONTEXT_MENU_COMMANDS: Command[] = [
  { id: "contextMenu.close", label: "Close Menu", run: closeContextMenu },
];

export function ContextMenu() {
  const at = useContextMenu((s) => s.at);
  const commands = useContextMenu((s) => s.commands);
  const bindings = useKeybindings((s) => s.bindings);
  const ref = useRef<HTMLDivElement>(null);

  // Any click elsewhere, or the window losing focus, closes it.
  useEffect(() => {
    if (!at) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) closeContextMenu();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("blur", closeContextMenu);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("blur", closeContextMenu);
    };
  }, [at]);

  // Keep it on screen: open up and to the left of the pointer near the edges.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !at) return;
    const { width, height } = el.getBoundingClientRect();
    el.style.left = `${Math.max(0, Math.min(at.x, window.innerWidth - width - 4))}px`;
    el.style.top = `${Math.max(0, Math.min(at.y, window.innerHeight - height - 4))}px`;
  }, [at]);

  if (!at) return null;
  return (
    <div
      ref={ref}
      className="menu-items context-menu"
      role="menu"
      style={{ left: at.x, top: at.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {commands.map((id) => {
        const command = getCommand(id);
        if (!command) return null;
        const key = keyFor(bindings, id);
        return (
          <button
            key={id}
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              closeContextMenu();
              command.run();
            }}
          >
            <span>{command.label}</span>
            {key && <span className="menu-shortcut">{key}</span>}
          </button>
        );
      })}
    </div>
  );
}
