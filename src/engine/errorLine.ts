import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

// Marks the line an evaluation error points at (class cm-errorLine). The mark moves
// with edits and stays until the next evaluation replaces or clears it.
export const setErrorLine = StateEffect.define<number | null>();

export const errorLine = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    marks = marks.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setErrorLine)) continue;
      if (effect.value === null) {
        marks = Decoration.none;
      } else {
        const { doc } = tr.state;
        const line = doc.line(Math.min(Math.max(effect.value, 1), doc.lines));
        marks = Decoration.set([Decoration.line({ class: "cm-errorLine" }).range(line.from)]);
      }
    }
    return marks;
  },
  provide: (field) => EditorView.decorations.from(field),
});
