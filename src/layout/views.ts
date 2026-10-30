import type { ComponentType } from "react";

// The places a view can be shown: the sidebar left of the editor, the panel under it,
// the aside right of it.
export type Region = "sidebar" | "panel" | "aside";

// Something that fills a region, like the explorer or the keys. Adding one means
// registering it here and adding a command that shows it; App.tsx doesn't change.
export interface View {
  id: string;
  title: string;
  region: Region;
  component: ComponentType;
}

const registry = new Map<string, View>();

// Registering an id again replaces it (hot reload does this). Views are listed in
// the order they were first registered.
export function registerViews(views: View[]): void {
  for (const view of views) registry.set(view.id, view);
}

export function getView(id: string): View | undefined {
  return registry.get(id);
}

export function viewsIn(region: Region): View[] {
  return [...registry.values()].filter((view) => view.region === region);
}
