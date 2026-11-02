import { create } from "zustand";
import * as engine from "../engine";
import type { Command } from "../commands/commands";
import { activateTab } from "../files/actions";

// What the status bar and error bar show besides the transport (which they read from the
// engine as it runs). UI-only: it mirrors the engine and never changes the sound.
interface StatusState {
  // The document last evaluated successfully, and whether its text has changed since:
  // what's heard is then not what's written.
  evaluatedDoc: string | null;
  edited: boolean;
  // Counts successful evaluations, so the status bar can flash on each.
  evaluations: number;
  error: engine.EngineError | undefined;
}

export const useStatus = create<StatusState>(() => ({
  evaluatedDoc: null,
  edited: false,
  evaluations: 0,
  error: undefined,
}));

const set = useStatus.setState;

// The evaluated code itself, kept out of the store: only whether it still matches matters.
let evaluatedCode = "";

// "Edited" shows only once the text has differed for this long, so number scrubbing,
// which edits and re-evaluates many times a second, doesn't make it flicker.
const EDITED_DELAY_MS = 250;
let editedTimer: ReturnType<typeof setTimeout> | undefined;

const unsubscribers = [
  engine.onEvaluated((docId, code, quiet) => {
    evaluatedCode = code;
    clearTimeout(editedTimer);
    // A scrub's re-evaluations don't flash.
    set((s) => ({ evaluatedDoc: docId, edited: false, evaluations: s.evaluations + (quiet ? 0 : 1) }));
  }),
  engine.onCodeChange((docId, code) => {
    if (docId !== useStatus.getState().evaluatedDoc) return;
    clearTimeout(editedTimer);
    if (code === evaluatedCode) set({ edited: false });
    else editedTimer = setTimeout(() => set({ edited: true }), EDITED_DELAY_MS);
  }),
  engine.onError((error) => set({ error })),
];
import.meta.hot?.dispose(() => {
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  clearTimeout(editedTimer);
});

// Shows the tab a syntax error is in and puts the cursor where it points.
export function revealError(): void {
  const at = useStatus.getState().error?.at;
  if (!at) return;
  activateTab(at.docId);
  engine.revealPosition(at.line, at.column);
}

export const STATUS_COMMANDS: Command[] = [{ id: "run.revealError", label: "Go to Error", run: revealError }];
