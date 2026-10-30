import { create } from "zustand";
import * as engine from "../engine";
import type { Command } from "../commands/commands";
import { registerContextKey } from "../commands/when";
import { useTabs } from "../files/tabsStore";
import { clampSize, DEFAULT_LAYOUT, sectionOf, shownViewId, type Layout, type SectionLayout } from "./layout";
import { getView, viewsIn, type Region, type View } from "./views";

export const useLayout = create<Layout>(() => DEFAULT_LAYOUT);

const set = useLayout.setState;
const get = useLayout.getState;

// Focus is somewhere in the bottom panel, or in the aside.
registerContextKey("panelFocus", () => !!document.activeElement?.closest("[data-region='panel']"));
registerContextKey("asideFocus", () => !!document.activeElement?.closest("[data-region='aside']"));

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

function setSection(id: string, change: Partial<SectionLayout>): void {
  set((s) => ({ sections: { ...s.sections, [id]: { ...sectionOf(s.sections, id), ...change } } }));
}

export function setSectionSize(id: string, size: number): void {
  setSection(id, { size: clampSize("section", size) });
}

// Folds a sidebar section down to its title, or opens it again.
export function toggleSection(id: string): void {
  setSection(id, { collapsed: !sectionOf(get().sections, id).collapsed });
}

// Moves focus into a region once it has rendered: to the element marked
// data-autofocus in the part showing `viewId` (marked data-view), or else that part,
// or the region itself.
function focusRegion(region: Region, viewId?: string): void {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLElement>(`[data-region='${region}']`);
    const part = (viewId && el?.querySelector<HTMLElement>(`[data-view='${viewId}']`)) || el;
    (part?.querySelector<HTMLElement>("[data-autofocus]") ?? part)?.focus();
  });
}

// Shows a view in its region (opening its section, in the sidebar), optionally moving
// focus into it.
export function showView(id: string, { focus = false } = {}): void {
  const view = getView(id);
  if (!view) return;
  set((s) => ({ [view.region]: { ...s[view.region], view: id, visible: true } }));
  if (view.region === "sidebar") setSection(id, { collapsed: false });
  if (focus) focusRegion(view.region, id);
}

function hideRegion(region: Region): void {
  const hadFocus = !!document.activeElement?.closest(`[data-region='${region}']`);
  set((s) => ({ [region]: { ...s[region], visible: false }, ...(region === "aside" && { maximised: false }) }));
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

// Shows or hides a region with whatever view it last had. Showing the panel or the
// aside focuses it, so its keys work straight away.
export function toggleRegion(region: Region): void {
  if (get()[region].visible) {
    hideRegion(region);
    return;
  }
  set((s) => ({ [region]: { ...s[region], visible: true } }));
  if (region !== "sidebar") focusRegion(region, shownView(region) ?? undefined);
}

// Lets the aside take the editor column's place, or gives it back. Maximising shows the
// aside if it was hidden.
export function toggleMaximised(): void {
  if (get().maximised) {
    restoreEditor();
    return;
  }
  const hadFocus = !!document.activeElement?.closest("[data-region='aside']");
  set((s) => ({ aside: { ...s.aside, visible: true }, maximised: true }));
  if (!hadFocus) focusRegion("aside", shownView("aside") ?? undefined);
}

// Brings the editor column back from behind a maximised aside and focuses the editor.
function restoreEditor(): void {
  set({ maximised: false });
  engine.focusEditor();
}

// Switching or opening a tab means looking at code, so the editor comes back.
const unsubscribe = useTabs.subscribe((s, prev) => {
  if (s.activeId !== prev.activeId && get().maximised) set({ maximised: false });
});
import.meta.hot?.dispose(unsubscribe);

export const LAYOUT_COMMANDS: Command[] = [
  { id: "view.toggleSidebar", label: "Toggle Sidebar", run: () => toggleRegion("sidebar") },
  { id: "view.togglePanel", label: "Toggle Panel", run: () => toggleRegion("panel") },
  { id: "view.toggleAside", label: "Toggle Right Side Bar", run: () => toggleRegion("aside") },
  { id: "view.toggleMaximised", label: "Toggle Maximised Side Bar", run: toggleMaximised },
  { id: "view.focusEditor", label: "Focus Editor", run: restoreEditor },
];
