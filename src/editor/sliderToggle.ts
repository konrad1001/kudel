import { Transaction } from "@codemirror/state";
import * as engine from "../engine";
import type { Command } from "../commands/commands";
import { currentView } from "./currentView";
import { quietCodeAt } from "./blocks";
import { isInString } from "./sampleDrop";
import { toggleSlider } from "./sliderCode";

// Wraps the number at the cursor in slider(…), or unwraps the slider() around it, as one
// undoable edit. The widget only appears (or goes) on evaluation, so the playing tab is
// re-evaluated quietly; any other tab shows it when next played.
function toggleSliderAtCursor(): void {
  const view = currentView();
  if (!view) return;
  const { state } = view;
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  const changes = toggleSlider(line.text, head - line.from, (offset) => isInString(state, line.from + offset + 1));
  if (!changes) return;
  view.dispatch({
    changes: changes.map((c) => ({ ...c, from: c.from + line.from, to: c.to + line.from })),
    annotations: Transaction.userEvent.of("input.slider"),
    scrollIntoView: true,
  });
  engine.evaluateQuietly(quietCodeAt(view, head));
}

export const SLIDER_COMMANDS: Command[] = [
  { id: "editor.toggleSlider", label: "Toggle Slider", run: toggleSliderAtCursor },
];
