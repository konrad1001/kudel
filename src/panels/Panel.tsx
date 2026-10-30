import { useKeyFor, withKey } from "../commands/keybindings";
import { setRegionSize, showView, toggleRegion, useLayout, useShownView } from "../layout/layoutStore";
import { viewsIn } from "../layout/views";
import { ResizeHandle } from "./ResizeHandle";

// The hideable region under the editor. Its border lights while it has focus, so it's
// clear whether keys go to the editor or to the panel's view.
export function Panel() {
  const visible = useLayout((s) => s.panel.visible);
  const height = useLayout((s) => s.panel.size);
  const shown = useShownView("panel");
  const closeKey = useKeyFor("view.togglePanel");

  if (!visible || !shown) return null;
  const views = viewsIn("panel");
  const Content = shown.component;
  return (
    // Focusable itself, so a click anywhere in it counts as focus in the panel.
    <section className="panel" data-region="panel" tabIndex={-1} style={{ height }}>
      <ResizeHandle edge="top" onResize={(height) => setRegionSize("panel", height)} />
      <header className="panel-header">
        {views.length > 1 ? (
          <div className="panel-tabs" role="tablist">
            {views.map((view) => (
              <button
                key={view.id}
                type="button"
                role="tab"
                aria-selected={view.id === shown.id}
                className="panel-tab"
                onClick={() => showView(view.id, { focus: true })}
              >
                {view.title}
              </button>
            ))}
          </div>
        ) : (
          <span className="panel-title">{shown.title}</span>
        )}
        <button
          type="button"
          className="panel-close"
          title={withKey("Close Panel", closeKey)}
          aria-label="Close Panel"
          onClick={() => toggleRegion("panel")}
        >
          ×
        </button>
      </header>
      <div className="panel-body" data-view={shown.id}>
        <Content />
      </div>
    </section>
  );
}
