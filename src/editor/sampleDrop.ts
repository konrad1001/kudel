import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { EditorState, Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

// The drag data the explorer sets on audio files and folders.
export const SAMPLE_DRAG_TYPE = "application/x-strudel-sample";

export interface DraggedSample {
  path: string;
  isDir: boolean;
}

export interface DropTarget {
  pos: number;
  inString: boolean;
}

// Whether `pos` sits inside a string or template literal (a mini-notation pattern).
export function isInString(state: EditorState, pos: number): boolean {
  const tree = ensureSyntaxTree(state, pos, 50) ?? syntaxTree(state);
  for (
    let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(
      pos,
      -1,
    );
    node;
    node = node.parent
  ) {
    if (node.name === "String" || node.name === "TemplateString")
      return pos > node.from && pos < node.to;
  }
  return false;
}

const carriesSample = (event: DragEvent) =>
  !!event.dataTransfer?.types.includes(SAMPLE_DRAG_TYPE);

// Raised on the editor's DOM when a sample is dropped, with { sample, target }.
export const SAMPLE_DROP_EVENT = "strudel-sample-drop";
export type SampleDropEvent = CustomEvent<{
  sample: DraggedSample;
  target: DropTarget;
}>;

// Turns samples dragged from the explorer into a SAMPLE_DROP_EVENT, with where they
// landed. Other drags (plain text) keep CodeMirror's own handling. The extension is
// installed once, when the editor is created, so it raises an event instead of
// calling a handler: whoever listens can be swapped by hot reload.
export function sampleDrop(): Extension {
  return EditorView.domEventHandlers({
    dragover(event) {
      if (!carriesSample(event)) return false;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      // false lets CodeMirror keep drawing its drop cursor.
      return false;
    },
    drop(event, view) {
      if (!carriesSample(event)) return false;
      event.preventDefault();
      const sample = JSON.parse(
        event.dataTransfer!.getData(SAMPLE_DRAG_TYPE),
      ) as DraggedSample;
      const pos =
        view.posAtCoords({ x: event.clientX, y: event.clientY }) ??
        view.state.selection.main.head;
      const target = { pos, inString: isInString(view.state, pos) };
      view.dom.dispatchEvent(
        new CustomEvent(SAMPLE_DROP_EVENT, {
          bubbles: true,
          detail: { sample, target },
        }),
      );
      return true;
    },
  });
}
