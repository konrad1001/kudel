import { useEffect, useState } from "react";
import * as engine from "../engine";
import { findObject, NOT_LITERAL, objectChanges, tidyObject, type ObjectLiteral } from "../editor/objectCode";
import { useTabs } from "../files/tabsStore";
import { placeOf, UNKNOWN_LINE } from "./codeLayout";
import { patchControls, type Value } from "./controls";
import { sameSettings, settingsFromCode, type CodeValue } from "./fromCode";
import { identifierFor, literal } from "./patch";
import { useSynth } from "./synthStore";

// The Synth view's link to the code, both ways, while the open document declares a const
// named like the patch (`const pad = { … }`):
// - panel → code: each change made in the panel is written into that object as it
//   happens, as minimal edits (objectChanges): only the controls that changed, new ones
//   on their category's line (codeLayout.ts).
// - code → panel: when the object changes (typing, undo, paste), its plain values are
//   read back into the panel (settingsFromCode).
// The code stays the source of truth; the panel is a way of editing it.

// The open document's id and the object named like the patch in it, or null.
function linkedObject(name: string): { docId: string; code: string; object: ObjectLiteral } | null {
  const docId = useTabs.getState().activeId;
  if (docId === null) return null;
  const code = engine.getDocCode(docId);
  const object = findObject(code, identifierFor(name));
  return object ? { docId, code, object } : null;
}

// True while the panel is being set from the code, so that change isn't written back.
let readingCode = false;

// code → panel: the linked object's values into the panel, if they say something else.
function readFromCode(): void {
  const s = useSynth.getState();
  const link = linkedObject(s.name);
  if (!link) return;
  const values = new Map<string, CodeValue>(
    link.object.properties.map((p) => [p.key, p.value === NOT_LITERAL ? "expression" : p.value]),
  );
  const settings = settingsFromCode(values, s.settings);
  if (sameSettings(settings, s.settings)) return;
  readingCode = true;
  try {
    useSynth.setState({ settings });
  } finally {
    readingCode = false;
  }
}

// panel → code. Not when the change came from the code, on a rename (that picks which
// object is linked, and reads it instead), or when synths.json is read at startup (that
// changes the saved list too; nothing in the panel changes both at once).
const stopWriting = useSynth.subscribe((s, prev) => {
  if (s.name !== prev.name) {
    readFromCode();
    return;
  }
  if (readingCode || s.settings === prev.settings || s.saved !== prev.saved) return;
  const link = linkedObject(s.name);
  if (!link) return;
  const changes = objectChanges(
    link.code,
    link.object,
    patchControls(prev.settings),
    patchControls(s.settings),
    (value) => literal(value as Value),
    placeOf,
  );
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

// Rewrites the linked object one line per category. Returns why it couldn't, or null.
export function tidyLinkedObject(): string | null {
  const link = linkedObject(useSynth.getState().name);
  if (!link) return null;
  if (link.object.hasComments) return "Can't tidy an object with comments in it: they'd be lost.";
  const change = tidyObject(link.code, link.object, placeOf, UNKNOWN_LINE);
  if (change) engine.dispatchChanges(link.docId, [change]);
  return null;
}

// Whether the open document has a const named like the patch, kept current as the code,
// the open tab and the name change.
export function useCodeLink(): boolean {
  const name = useSynth((s) => s.name);
  const activeId = useTabs((s) => s.activeId);
  const [linked, setLinked] = useState(() => linkedObject(name) !== null);
  useEffect(() => {
    const check = () => setLinked(linkedObject(name) !== null);
    check();
    return engine.onCodeChange((docId) => {
      if (docId === useTabs.getState().activeId) check();
    });
  }, [name, activeId]);
  return linked;
}
