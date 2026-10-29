import { useLayout, useShownView } from "../layout/layoutStore";
import { ResizeHandle } from "./ResizeHandle";

// The region left of the editor, showing one view at a time (the explorer).
export function Sidebar() {
  const visible = useLayout((s) => s.sidebar.visible);
  const width = useLayout((s) => s.sidebar.size);
  const view = useShownView("sidebar");

  if (!visible || !view) return null;
  const Content = view.component;
  return (
    <aside className="sidebar" data-region="sidebar" style={{ width }}>
      <div className="sidebar-title">{view.title}</div>
      <Content />
      <ResizeHandle region="sidebar" />
    </aside>
  );
}
