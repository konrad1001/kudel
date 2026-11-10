import { StateEffect, StateField, Transaction, type Extension } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import * as engine from "../engine";
import type { Command } from "../commands/commands";
import { currentView } from "./currentView";
import { quietCodeAt } from "./blocks";
import { numberAt, PX_PER_STEP, stepNumber, type NumberLiteral } from "./scrubNumber";

// Number scrubbing: Alt+drag a number left or right, Alt+wheel over it, or Ctrl+Alt+↑/↓
// at the cursor. Each step is a small edit to the code, re-evaluated quietly when the
// document is the one playing (engine.evaluateQuietly): the block it's in, or only the
// code outside blocks, with the other blocks left playing as they are (blocks.ts). The steps stay out of the undo
// history; when the gesture ends, the whole change becomes one undoable edit.

// One gesture on one number. `from`/`to` track the number as it's rewritten.
interface Session {
  view: EditorView;
  start: NumberLiteral;
  from: number;
  to: number;
  text: string;
}

// The number at `pos`, with document positions.
function numberIn(view: EditorView, pos: number): NumberLiteral | null {
  const line = view.state.doc.lineAt(pos);
  const found = numberAt(line.text, pos - line.from);
  return found && { ...found, from: found.from + line.from, to: found.to + line.from };
}

function begin(view: EditorView, start: NumberLiteral): Session {
  return { view, start, from: start.from, to: start.to, text: start.text };
}

const SCRUB_EVENT = "input.scrub";

// Writes `text` over the number, outside the undo history, and asks for a re-evaluation.
function write(session: Session, text: string): void {
  if (text === session.text) return;
  session.view.dispatch({
    changes: { from: session.from, to: session.to, insert: text },
    annotations: [Transaction.addToHistory.of(false), Transaction.userEvent.of(SCRUB_EVENT)],
  });
  session.to = session.from + text.length;
  session.text = text;
  engine.evaluateQuietly(quietCodeAt(session.view, session.from));
}

// Turns the gesture into one undoable edit: put the original back and make the whole
// change in one go, both before anything redraws or re-evaluates.
function finish(session: Session): void {
  const { view, start, from, to, text } = session;
  if (text === start.text) return;
  view.dispatch({
    changes: { from, to, insert: start.text },
    annotations: [Transaction.addToHistory.of(false), Transaction.userEvent.of(SCRUB_EVENT)],
  });
  view.dispatch({
    changes: { from, to: from + start.text.length, insert: text },
    annotations: Transaction.userEvent.of(SCRUB_EVENT),
  });
}

// Wheel turns and key presses come one at a time; a pause this long ends the gesture.
const NUDGE_IDLE_MS = 600;
let nudging: { session: Session; steps: number; timer?: ReturnType<typeof setTimeout> } | undefined;

function endNudge(): void {
  if (!nudging) return;
  clearTimeout(nudging.timer);
  finish(nudging.session);
  nudging = undefined;
}

// Steps the number at `pos` by `steps`, continuing the gesture if it's the same number.
function nudge(view: EditorView, pos: number, steps: number, fine: boolean): boolean {
  const current = nudging?.session;
  const same = current?.view === view && pos >= current.from && pos <= current.to;
  if (!same) {
    endNudge();
    const start = numberIn(view, pos);
    if (!start) return false;
    nudging = { session: begin(view, start), steps: 0 };
  }
  const n = nudging!;
  clearTimeout(n.timer);
  n.steps += steps;
  write(n.session, stepNumber(n.session.start, n.steps, fine));
  n.timer = setTimeout(endNudge, NUDGE_IDLE_MS);
  return true;
}

// Follows the pointer from an Alt+press until release; Shift makes the steps finer.
function drag(session: Session, event: MouseEvent): void {
  const { view } = session;
  const startX = event.clientX;
  view.dom.classList.add("cm-scrubbing");
  const move = (e: MouseEvent) =>
    write(session, stepNumber(session.start, (e.clientX - startX) / PX_PER_STEP, e.shiftKey));
  const up = () => {
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
    view.dom.classList.remove("cm-scrubbing");
    finish(session);
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
}

// While Alt is held, the number under the pointer is underlined to show it can be dragged.
const setHover = StateEffect.define<{ from: number; to: number } | null>();
const hoverMark = Decoration.mark({ class: "cm-scrubNumber" });

const hover = StateField.define({
  create: () => Decoration.none,
  update(marks, tr) {
    marks = marks.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setHover)) {
        marks = effect.value ? Decoration.set([hoverMark.range(effect.value.from, effect.value.to)]) : Decoration.none;
      }
    }
    return marks;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function showHover(view: EditorView, range: { from: number; to: number } | null): void {
  const shown = view.state.field(hover).iter();
  const same = range ? shown.value !== null && shown.from === range.from && shown.to === range.to : shown.value === null;
  if (!same) view.dispatch({ effects: setHover.of(range) });
}

const pointerNumber = (view: EditorView, event: MouseEvent) => {
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  return pos === null ? null : numberIn(view, pos);
};

export function scrub(): Extension {
  return [
    hover,
    EditorView.domEventHandlers({
      mousedown(event, view) {
        if (event.button !== 0 || !event.altKey) return false;
        const start = pointerNumber(view, event);
        if (!start) return false;
        // Instead of CodeMirror's Alt+drag rectangular selection.
        event.preventDefault();
        endNudge();
        drag(begin(view, start), event);
        return true;
      },
      mousemove(event, view) {
        const found = event.altKey ? pointerNumber(view, event) : null;
        showHover(view, found && { from: found.from, to: found.to });
        return false;
      },
      mouseleave(_event, view) {
        showHover(view, null);
        return false;
      },
      wheel(event, view) {
        if (!event.altKey || event.deltaY === 0) return false;
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos === null || !nudge(view, pos, event.deltaY < 0 ? 1 : -1, event.shiftKey)) return false;
        event.preventDefault();
        return true;
      },
    }),
  ];
}

function nudgeAtCursor(steps: number): void {
  const view = currentView();
  if (view) nudge(view, view.state.selection.main.head, steps, false);
}

export const SCRUB_COMMANDS: Command[] = [
  { id: "editor.increaseNumber", label: "Increase Number", run: () => nudgeAtCursor(1) },
  { id: "editor.decreaseNumber", label: "Decrease Number", run: () => nudgeAtCursor(-1) },
];
