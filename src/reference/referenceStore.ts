import { useMemo } from "react";
import { create } from "zustand";
import * as engine from "../engine";
import type { Command } from "../commands/commands";
import { showView } from "../layout/layoutStore";
import { findEntry, searchReference, type ReferenceData } from "./reference";

// The Reference view: the Strudel API reference, searched and read beside the code.
// Reading it never changes the sound; examples open as new tabs, to play from there.
interface ReferenceState {
  // Loaded the first time the view opens.
  data: ReferenceData | null;
  error: string | null;
  query: string;
  // Only entries from this package and file ("@strudel/core — signal"), or all.
  group: string | null;
  // The entry shown, as an index into data.entries.
  selected: number | null;
  // Entries shown before, most recent last, for going back after following a link.
  history: number[];
}

export const useReference = create<ReferenceState>(() => ({
  data: null,
  error: null,
  query: "",
  group: null,
  selected: null,
  history: [],
}));

const set = useReference.setState;
const get = useReference.getState;

let loading: Promise<ReferenceData | null> | undefined;

// docs/strudel-api.json is about 300 KB, so it's a separate chunk, fetched when needed.
export function loadReference(): Promise<ReferenceData | null> {
  loading ??= import("../../docs/strudel-api.json")
    .then((module) => {
      const data = module.default as unknown as ReferenceData;
      set({ data, error: null });
      return data;
    })
    .catch((err: unknown) => {
      loading = undefined;
      set({ error: `Could not load the reference: ${String(err)}` });
      return null;
    });
  return loading;
}

const results = (s: ReferenceState) => (s.data ? searchReference(s.data.entries, s.query, s.group) : []);

// Shows an entry. Following a link from another entry remembers that one for back().
export function selectEntry(index: number, { follow = false } = {}): void {
  set((s) => ({
    selected: index,
    history: follow && s.selected !== null && s.selected !== index ? [...s.history, s.selected] : s.history,
  }));
}

export function back(): void {
  const { history } = get();
  if (history.length) set({ selected: history[history.length - 1], history: history.slice(0, -1) });
}

// Searching shows the best match straight away.
export function setQuery(query: string): void {
  set({ query });
  const first = results(get())[0];
  if (query.trim() && first !== undefined) set({ selected: first });
}

export function setGroup(group: string | null): void {
  set({ group });
}

// Moves the selection through the results, as arrow keys do in the search box.
export function moveSelection(step: number): void {
  const list = results(get());
  if (!list.length) return;
  const at = list.indexOf(get().selected ?? -1);
  const next = at < 0 ? (step > 0 ? 0 : list.length - 1) : Math.min(list.length - 1, Math.max(0, at + step));
  set({ selected: list[next] });
}

export function useResults(): number[] {
  const data = useReference((s) => s.data);
  const query = useReference((s) => s.query);
  const group = useReference((s) => s.group);
  return useMemo(() => (data ? searchReference(data.entries, query, group) : []), [data, query, group]);
}

function showReference(): void {
  void loadReference();
  showView("reference", { focus: true });
}

// Looks up the word at the cursor. Found, its entry shows and focus stays in the code;
// otherwise the search box gets the word (or nothing) and focus.
async function lookUp(): Promise<void> {
  const word = engine.wordAtCursor();
  const data = await loadReference();
  const found = data && word ? findEntry(data.entries, word) : null;
  if (found === null) {
    set({ group: null });
    if (word) setQuery(word);
    showView("reference", { focus: true });
    return;
  }
  set({ query: word ?? "", group: null });
  selectEntry(found, { follow: true });
  showView("reference");
}

export const REFERENCE_COMMANDS: Command[] = [
  { id: "view.reference", label: "Show Reference", run: showReference },
  { id: "reference.lookUp", label: "Look Up in Reference", run: () => void lookUp() },
];
