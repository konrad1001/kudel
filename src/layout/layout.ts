import type { Region } from "./views";

// What each region shows and how big it is. UI-only state, saved with the session.
export interface RegionLayout {
  // The shown view's id; null (or an id no longer registered) means the region's first view.
  view: string | null;
  visible: boolean;
  // Pixels: the sidebar's width, the panel's height.
  size: number;
}

export type Layout = Record<Region, RegionLayout>;

export const DEFAULT_LAYOUT: Layout = {
  sidebar: { view: null, visible: true, size: 240 },
  panel: { view: null, visible: false, size: 240 },
};

const SIZE_LIMITS: Record<Region, [min: number, max: number]> = {
  sidebar: [160, 600],
  panel: [100, 800],
};

export function clampSize(region: Region, size: number): number {
  const [min, max] = SIZE_LIMITS[region];
  return Math.min(max, Math.max(min, Math.round(size)));
}

// The id of the view a region shows: its own choice if that view exists, else the first.
export function shownViewId(layout: RegionLayout, ids: string[]): string | null {
  return layout.view !== null && ids.includes(layout.view) ? layout.view : (ids[0] ?? null);
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
