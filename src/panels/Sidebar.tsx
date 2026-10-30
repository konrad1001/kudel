import { sectionOf, type SectionLayout } from "../layout/layout";
import { setRegionSize, setSectionSize, toggleSection, useLayout } from "../layout/layoutStore";
import { viewsIn, type View } from "../layout/views";
import { ResizeHandle } from "./ResizeHandle";

// The region left of the editor. It stacks its views (the explorer, the sounds) as
// sections that fold down to their title. The first open one takes the height left over;
// the ones below keep their own height, set by dragging their top edge.
export function Sidebar() {
  const visible = useLayout((s) => s.sidebar.visible);
  const width = useLayout((s) => s.sidebar.size);
  const sections = useLayout((s) => s.sections);

  const views = viewsIn("sidebar");
  if (!visible || !views.length) return null;
  const filler = views.find((view) => !sectionOf(sections, view.id).collapsed);
  return (
    <aside className="sidebar" data-region="sidebar" style={{ width }}>
      {views.map((view) => (
        <Section key={view.id} view={view} layout={sectionOf(sections, view.id)} fills={view === filler} />
      ))}
      <ResizeHandle edge="right" onResize={(size) => setRegionSize("sidebar", size)} />
    </aside>
  );
}

function Section({ view, layout, fills }: { view: View; layout: SectionLayout; fills: boolean }) {
  const Content = view.component;
  const open = !layout.collapsed;
  const sized = open && !fills;
  return (
    <section
      className={["sidebar-section", fills && "fill", !open && "collapsed"].filter(Boolean).join(" ")}
      data-view={view.id}
      style={sized ? { flexBasis: layout.size } : undefined}
    >
      {sized && <ResizeHandle edge="top" onResize={(size) => setSectionSize(view.id, size)} />}
      <button type="button" className="sidebar-title" aria-expanded={open} onClick={() => toggleSection(view.id)}>
        <span className="chevron">{CHEVRON}</span>
        {view.title}
      </button>
      {open && <Content />}
    </section>
  );
}

const CHEVRON = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.2">
    <path d="M6 4l4 4-4 4" />
  </svg>
);
