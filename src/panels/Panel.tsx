import { setRegionSize, useLayout, useShownView } from "../layout/layoutStore";
import { RegionHeader } from "./RegionHeader";
import { ResizeHandle } from "./ResizeHandle";

// The hideable region under the editor. Its border lights while it has focus, so it's
// clear whether keys go to the editor or to the panel's view.
export function Panel() {
  const visible = useLayout((s) => s.panel.visible);
  const height = useLayout((s) => s.panel.size);
  const shown = useShownView("panel");

  if (!visible || !shown) return null;
  const Content = shown.component;
  return (
    // Focusable itself, so a click anywhere in it counts as focus in the panel.
    <section className="panel" data-region="panel" tabIndex={-1} style={{ height }}>
      <ResizeHandle edge="top" onResize={(height) => setRegionSize("panel", height)} />
      <RegionHeader region="panel" shown={shown} closeCommand="view.togglePanel" closeLabel="Close Panel" />
      <div className="panel-body" data-view={shown.id}>
        <Content />
      </div>
    </section>
  );
}
