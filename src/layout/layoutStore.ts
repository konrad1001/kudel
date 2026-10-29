import { create } from "zustand";
import * as engine from "../engine";
import type { Command } from "../commands/commands";
import { registerContextKey } from "../commands/when";
import { clampSize, DEFAULT_LAYOUT, shownViewId, type Layout } from "./layout";
import { getView, viewsIn, type Region, type View } from "./views";

export const useLayout = create<Layout>(() => DEFAULT_LAYOUT);

const set = useLayout.setState;
const get = useLayout.getState;

// Focus is somewhere in the bottom panel.
registerContextKey("panelFocus", () => !!document.activeElement?.closest("[data-region='panel']"));

const shownIn = (layout: Layout, region: Region) =>
  shownViewId(
    layout[region],
    viewsIn(region).map((view) => view.id),
  );

export function shownView(region: Region): string | null {
  return shownIn(get(), region);
}

export function useShownView(region: Region): View | undefined {
  const id = useLayout((s) => shownIn(s, region));
  return id === null ? undefined : getView(id);
}

export function setRegionSize(region: Region, size: number): void {
  set((s) => ({ [region]: { ...s[region], size: clampSize(region, size) } }));
}

// Moves focus into a region once it has rendered: to its view's element marked
// data-autofocus, or else the region itself.
function focusRegion(region: Region): void {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`[data-region='${region}']`);
    (el?.querySelector<HTMLElement>("[data-autofocus]") ?? el)?.focus();
  });
}

// Shows a view in its region, optionally moving focus into it.
export function showView(id: string, { focus = false } = {}): void {
  const view = getView(id);
  if (!view) return;
  set((s) => ({ [view.region]: { ...s[view.region], view: id, visible: true } }));
  if (focus) focusRegion(view.region);
}

function hideRegion(region: Region): void {
  const hadFocus = !!document.activeElement?.closest(`[data-region='${region}']`);
  set((s) => ({ [region]: { ...s[region], visible: false } }));
  // Focus would otherwise fall to the page, where typing does nothing.
  if (hadFocus) engine.focusEditor();
}

// Shows the view, or hides its region if the view is already showing.
export function toggleView(id: string, options?: { focus?: boolean }): void {
  const view = getView(id);
  if (!view) return;
  if (get()[view.region].visible && shownView(view.region) === id) hideRegion(view.region);
  else showView(id, options);
}

// Shows or hides a region with whatever view it last had. Showing the panel focuses
// it, so its keys work straight away.
export function toggleRegion(region: Region): void {
  if (get()[region].visible) {
    hideRegion(region);
    return;
  }
  set((s) => ({ [region]: { ...s[region], visible: true } }));
  if (region === "panel") focusRegion(region);
}

export const LAYOUT_COMMANDS: Command[] = [
  { id: "view.togglePanel", label: "Toggle Panel", run: () => toggleRegion("panel") },
  { id: "view.focusEditor", label: "Focus Editor", run: engine.focusEditor },
];
