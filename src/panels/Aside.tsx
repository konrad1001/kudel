import { useKeyFor, withKey } from "../commands/keybindings";
import { setRegionSize, toggleMaximised, useLayout, useShownView } from "../layout/layoutStore";
import { RegionHeader } from "./RegionHeader";
import { ResizeHandle } from "./ResizeHandle";

// The hideable region right of the editor, for reading beside the code. Maximised, it
// takes the editor column's place. Its border lights while it has focus, like the panel's.
export function Aside() {
  const visible = useLayout((s) => s.aside.visible);
  const width = useLayout((s) => s.aside.size);
  const maximised = useLayout((s) => s.maximised);
  const shown = useShownView("aside");
  const maximiseKey = useKeyFor("view.toggleMaximised");

  if (!visible || !shown) return null;
  const Content = shown.component;
  const maximiseLabel = maximised ? "Restore Editor" : "Maximise";
  return (
    <section
      className={maximised ? "aside maximised" : "aside"}
      data-region="aside"
      tabIndex={-1}
      style={maximised ? undefined : { width }}
    >
      {!maximised && <ResizeHandle edge="left" onResize={(size) => setRegionSize("aside", size)} />}
      <RegionHeader region="aside" shown={shown} closeCommand="view.toggleAside" closeLabel="Close Side Bar">
        <button
          type="button"
          className="panel-button"
          title={withKey(maximiseLabel, maximiseKey)}
          aria-label={maximiseLabel}
          aria-pressed={maximised}
          onClick={toggleMaximised}
        >
          {maximised ? RESTORE : MAXIMISE}
        </button>
      </RegionHeader>
      <div className="panel-body" data-view={shown.id}>
        <Content />
      </div>
    </section>
  );
}

const MAXIMISE = (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.2">
    <rect x="3" y="3" width="10" height="10" />
  </svg>
);

const RESTORE = (
  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.2">
    <rect x="3" y="5" width="8" height="8" />
    <path d="M5 5V3h8v8h-2" />
  </svg>
);
