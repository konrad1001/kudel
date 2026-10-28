import { useEffect, useRef, useState } from "react";
import type { Action } from "../shortcuts";

export interface Menu {
  label: string;
  actions: Action[];
}

export function MenuBar({ menus }: { menus: Menu[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const barRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (openIndex === null) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) setOpenIndex(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenIndex(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
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
              {menu.actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  role="menuitem"
                  className="menu-item"
                  onClick={() => {
                    setOpenIndex(null);
                    action.run();
                  }}
                >
                  <span>{action.label}</span>
                  {action.shortcut && <span className="menu-shortcut">{action.shortcut}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}
