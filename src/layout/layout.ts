import type { Region } from "./views";

// What each region shows and how big it is. UI-only state, saved with the session.
export interface RegionLayout {
  // The shown view's id; null (or an id no longer registered) means the region's first view.
  view: string | null;
  visible: boolean;
  // Pixels: the sidebar's and the aside's width, the panel's height.
  size: number;
}

// The sidebar stacks all its views as sections, each folded down to its title or open.
// The first open section takes whatever height is left; the others keep their own.
export interface SectionLayout {
  collapsed: boolean;
  // Pixels high.
  size: number;
}

export interface Layout {
  sidebar: RegionLayout;
  panel: RegionLayout;
  aside: RegionLayout;
  // The aside takes the editor column's place, for reading at full size.
  maximised: boolean;
  // By view id; a view without an entry uses DEFAULT_SECTION.
  sections: Record<string, SectionLayout>;
}

export const DEFAULT_LAYOUT: Layout = {
  sidebar: { view: null, visible: true, size: 240 },
  panel: { view: null, visible: false, size: 240 },
  aside: { view: null, visible: false, size: 420 },
  maximised: false,
  sections: {},
};

export const DEFAULT_SECTION: SectionLayout = { collapsed: false, size: 300 };

const SIZE_LIMITS: Record<Region | "section", [min: number, max: number]> = {
  sidebar: [160, 600],
  panel: [100, 800],
  aside: [240, 1400],
  section: [80, 2000],
};

export function clampSize(kind: Region | "section", size: number): number {
  const [min, max] = SIZE_LIMITS[kind];
  return Math.min(max, Math.max(min, Math.round(size)));
}

// The id of the view a region shows: its own choice if that view exists, else the first.
export function shownViewId(layout: RegionLayout, ids: string[]): string | null {
  return layout.view !== null && ids.includes(layout.view) ? layout.view : (ids[0] ?? null);
}

export function sectionOf(sections: Layout["sections"], id: string): SectionLayout {
  return sections[id] ?? DEFAULT_SECTION;
}

// Reads a region from a session file, keeping whatever is usable.
export function parseRegion(region: Region, raw: unknown, fallback: RegionLayout = DEFAULT_LAYOUT[region]): RegionLayout {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    view: typeof r.view === "string" ? r.view : fallback.view,
    visible: typeof r.visible === "boolean" ? r.visible : fallback.visible,
    size: typeof r.size === "number" && Number.isFinite(r.size) ? clampSize(region, r.size) : fallback.size,
  };
}

// Reads the sidebar's sections from a session file, the same way.
export function parseSections(raw: unknown): Record<string, SectionLayout> {
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).map(([id, value]) => {
      const r = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
      const section: SectionLayout = {
        collapsed: typeof r.collapsed === "boolean" ? r.collapsed : DEFAULT_SECTION.collapsed,
        size: typeof r.size === "number" && Number.isFinite(r.size) ? clampSize("section", r.size) : DEFAULT_SECTION.size,
      };
      return [id, section];
    }),
  );
}
