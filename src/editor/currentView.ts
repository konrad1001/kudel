import type { Extension } from "@codemirror/state";
import { EditorView, ViewPlugin } from "@codemirror/view";

// The editor showing documents, for commands that act at its cursor (number nudging,
// slider toggling). There is only one; it's recorded by the extension below.
let view: EditorView | undefined;

export function currentView(): EditorView | undefined {
  return view;
}

export function trackCurrentView(): Extension {
  return ViewPlugin.define((v) => {
    view = v;
    return {
      destroy() {
        if (view === v) view = undefined;
      },
    };
  });
}
