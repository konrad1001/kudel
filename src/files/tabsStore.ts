import { create } from "zustand";
import type { Tab } from "./tabs";

// The open editors. Nothing here affects the sound: the text itself lives in the
// engine, and playingId only mirrors what the engine reports.
interface TabsState {
  tabs: Tab[];
  activeId: string | null;
  // The tab whose code was last evaluated while the sound is running.
  playingId: string | null;
}

export const useTabs = create<TabsState>(() => ({
  tabs: [],
  activeId: null,
  playingId: null,
}));

export function selectActiveTab(state: TabsState): Tab | null {
  return state.tabs.find((tab) => tab.id === state.activeId) ?? null;
}

export function updateTab(id: string, patch: Partial<Tab>): void {
  useTabs.setState((s) => ({ tabs: s.tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)) }));
}
