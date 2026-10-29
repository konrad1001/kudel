import { Fragment, useEffect, useRef } from "react";
import { create } from "zustand";
import { getCommand, type Command } from "../commands/commands";
import { keyFor, useKeybindings } from "../commands/keybindings";
import { registerContextKey } from "../commands/when";

export interface Menu {
  label: string;
  // Command ids; separators are drawn between groups.
  groups: string[][];
}

// Which menu is open, if any. A store rather than component state so the keyboard
// can see it ("menuOpen") and close it (menu.close on Escape).
const useMenuBar = create<{ openIndex: number | null }>(() => ({ openIndex: null }));
const setOpenIndex = (openIndex: number | null) => useMenuBar.setState({ openIndex });

registerContextKey("menuOpen", () => useMenuBar.getState().openIndex !== null);

export const MENU_COMMANDS: Command[] = [{ id: "menu.close", label: "Close Menu", run: () => setOpenIndex(null) }];

export function MenuBar({ menus }: { menus: Menu[] }) {
  const openIndex = useMenuBar((s) => s.openIndex);
  const bindings = useKeybindings((s) => s.bindings);
  const barRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (openIndex === null) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpenIndex(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [openIndex]);

  return (
    <nav ref={barRef} className="menu-bar">
      {menus.map((menu, index) => (
        <div key={menu.label} className="menu">
          <button
            type="button"
            className="menu-title"
            aria-expanded={openIndex === index}
            onClick={() => setOpenIndex(openIndex === index ? null : index)}
            // Once a menu is open, hovering another title switches to it.
            onPointerEnter={() => openIndex !== null && setOpenIndex(index)}
          >
            {menu.label}
          </button>
          {openIndex === index && (
            <div className="menu-items" role="menu">
              {menu.groups.map((group, groupIndex) => (
                <Fragment key={groupIndex}>
                  {groupIndex > 0 && <div className="menu-separator" role="separator" />}
                  {group.map((id) => {
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
                          setOpenIndex(null);
                          command.run();
                        }}
                      >
                        <span>{command.label}</span>
                        {key && <span className="menu-shortcut">{key}</span>}
                      </button>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
