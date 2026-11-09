import { useEffect, useState } from "react";
import * as engine from "../engine";
import { findPattern, type PatternDeclaration } from "../editor/patternCode";
import { useTabs } from "../files/tabsStore";
import { identifierFor } from "../synth/patch";
import { drumChanges, readLoop, rowsFromCode } from "./drumCode";
import { currentLoop, useDrums } from "./drumsStore";
import type { DrumRow } from "./loop";

// The Drums view's link to the code, both ways, while the open document declares a loop
// named like the panel's (`const drums = stack(s("…"), …)`, s("…") or silence):
// - panel → code: each change in the grid or kit is written into that declaration as
//   minimal edits (drumChanges): a changed row's text, a row's s("…") added or taken
//   out, the .bank("…").
// - code → panel: when the code changes, the rows the grid can show and the kit are
//   read back into the panel (readLoop, rowsFromCode).

// The open document's id and the loop named like the panel's in it, or null.
function linkedPattern(name: string): { docId: string; code: string; pattern: PatternDeclaration } | null {
  const docId = useTabs.getState().activeId;
  if (docId === null) return null;
  const code = engine.getDocCode(docId);
  const pattern = findPattern(code, identifierFor(name));
  return pattern && readLoop(pattern) ? { docId, code, pattern } : null;
}

const sameRows = (a: DrumRow[], b: DrumRow[]) => JSON.stringify(a) === JSON.stringify(b);

// True while the panel is being set from the code, so that change isn't written back.
let readingCode = false;

// code → panel: the code's rows and kit into the panel, if they say something else.
function readFromCode(): void {
  const s = useDrums.getState();
  const link = linkedPattern(s.name);
  const read = link && readLoop(link.pattern);
  if (!read) return;
  const rows = rowsFromCode(read.rows, s.rows);
  if (sameRows(rows, s.rows) && read.bank === s.bank) return;
  readingCode = true;
  try {
    useDrums.setState({ rows, bank: read.bank });
  } finally {
    readingCode = false;
  }
}

// panel → code. Not when the change came from the code, on a rename (that picks which
// loop is linked, and reads it instead), or when drums.json is read at startup (that
// changes the saved list too).
const stopWriting = useDrums.subscribe((s, prev) => {
  if (s.name !== prev.name) {
    readFromCode();
    return;
  }
  if (readingCode || s.saved !== prev.saved || (s.rows === prev.rows && s.bank === prev.bank)) return;
  const link = linkedPattern(s.name);
  if (!link) return;
  const changes = drumChanges(link.code, link.pattern, currentLoop(prev), currentLoop(s));
  if (changes.length) engine.dispatchChanges(link.docId, changes);
});

// code → panel as the open document changes, or another one is opened.
const stopReading = engine.onCodeChange((docId) => {
  if (docId === useTabs.getState().activeId) readFromCode();
});
const stopTabs = useTabs.subscribe((s, prev) => {
  if (s.activeId !== prev.activeId) readFromCode();
});

import.meta.hot?.dispose(() => {
  stopWriting();
  stopReading();
  stopTabs();
});

// Whether the open document has a loop named like the panel's, kept current as the code,
// the open tab and the name change.
export function useDrumsLink(): boolean {
  const name = useDrums((s) => s.name);
  const activeId = useTabs((s) => s.activeId);
  const [linked, setLinked] = useState(() => linkedPattern(name) !== null);
  useEffect(() => {
    const check = () => setLinked(linkedPattern(name) !== null);
    check();
    return engine.onCodeChange((docId) => {
      if (docId === useTabs.getState().activeId) check();
    });
  }, [name, activeId]);
  return linked;
}
