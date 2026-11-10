import { MapMode, StateEffect, StateField, Transaction, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, GutterMarker, gutter, type DecorationSet } from "@codemirror/view";
import { RangeSet } from "@codemirror/state";
import * as engine from "../engine";
import type { Command } from "../commands/commands";
import { currentView } from "./currentView";
import { blockAt, composeEvaluation, findBlocks, toggleMute, toggleSolo, type Block } from "./blockCode";

// Play, mute and solo for each labelled block (`$: …`), as [▶][M][S] in a gutter beside
// the block's first line.
//
// ▶ evaluates that block alone: it plays as written now, while the other blocks keep
// playing what they last played, even if they've been edited since (see
// composeEvaluation). M and S rewrite the label the way Strudel reads it (`_$:` is
// muted, `S$:` soloed) and, while the document is playing, evaluate that block, so the
// change is heard and the code says so.
//
// Each document's state remembers, per block, the text that is playing, so the gutter
// can tell playing from edited, and ▶ knows what the others are playing. Ctrl+Enter
// (all of it) and scrubbing (the block scrubbed in) update it like ▶ does.

// A block in the playing evaluation: where its label starts (mapped through edits) and
// the text it plays.
interface Played {
  at: number;
  text: string;
}

interface PlayedState {
  // Empty unless this document is the one playing.
  playing: Played[];
  // Evaluations started and not finished, by the code they evaluate.
  pending: { code: string; played: Played[] }[];
}

const setPending = StateEffect.define<{ code: string; played: Played[] }>();
const commit = StateEffect.define<string>();
const clear = StateEffect.define<null>();

function mapPlayed(list: Played[], tr: Transaction): Played[] {
  const out: Played[] = [];
  for (const p of list) {
    const at = tr.changes.mapPos(p.at, 1, MapMode.TrackDel);
    if (at !== null) out.push({ at, text: p.text });
  }
  return out;
}

// Older evaluations still pending beyond this many are forgotten.
const MAX_PENDING = 4;

const played = StateField.define<PlayedState>({
  create: () => ({ playing: [], pending: [] }),
  update(value, tr) {
    if (tr.docChanged) {
      value = {
        playing: mapPlayed(value.playing, tr),
        pending: value.pending.map((p) => ({ code: p.code, played: mapPlayed(p.played, tr) })),
      };
    }
    for (const effect of tr.effects) {
      if (effect.is(setPending)) {
        value = { ...value, pending: [...value.pending.slice(1 - MAX_PENDING), effect.value] };
      } else if (effect.is(commit)) {
        const done = value.pending.findIndex((p) => p.code === effect.value);
        if (done >= 0) value = { playing: value.pending[done].played, pending: value.pending.slice(done + 1) };
      } else if (effect.is(clear)) {
        value = { ...value, playing: [] };
      }
    }
    return value;
  },
});

// The document's blocks, found again after each edit.
const blocksField = StateField.define<Block[]>({
  create: (state) => findBlocks(state.doc.toString()),
  update: (blocks, tr) => (tr.docChanged ? findBlocks(tr.newDoc.toString()) : blocks),
});

// What each block plays now (null: nothing), by matching where the playing labels are.
function evaluatedTexts(state: EditorState): (string | null)[] {
  const blocks = state.field(blocksField);
  const texts: (string | null)[] = blocks.map(() => null);
  for (const p of state.field(played).playing) {
    const i = blocks.findIndex((b) => p.at >= b.labelFrom && p.at <= b.labelTo);
    if (i >= 0 && texts[i] === null) texts[i] = p.text;
  }
  return texts;
}

// The code to evaluate for playing `targets`, remembered so the evaluation can record
// what it played once it starts.
let lastBuilt: { code: string; played: Played[] } | undefined;

function build(state: EditorState, targets: ReadonlySet<number>): string {
  const blocks = state.field(blocksField);
  const { code, included } = composeEvaluation(state.doc.toString(), blocks, evaluatedTexts(state), targets);
  lastBuilt = { code, played: included.map(({ index, text }) => ({ at: blocks[index].labelFrom, text })) };
  return code;
}

// For engine.evaluateQuietly after an edit at `pos` (a scrub): evaluates the block
// there, if any, leaving the other blocks as they are playing.
export function quietCodeAt(view: EditorView, pos: number): () => string {
  return () => {
    const index = blockAt(view.state.field(blocksField), pos);
    return build(view.state, new Set(index >= 0 ? [index] : []));
  };
}

// --- Keeping track as evaluations start, succeed and stop -------------------------

let playingDoc: string | null = null;

const unsubscribers = [
  engine.onEvaluating((docId, code) => {
    if (docId === null) return;
    let list = lastBuilt?.code === code ? lastBuilt.played : null;
    // Everything as written: Ctrl+Enter, or a scrub outside any block's code.
    if (!list && code === engine.getDocCode(docId)) {
      list = findBlocks(code).map((b) => ({ at: b.labelFrom, text: code.slice(b.from, b.to) }));
    }
    if (list) engine.dispatchEffects(docId, [setPending.of({ code, played: list })]);
  }),
  engine.onEvaluated((docId, code) => {
    if (docId !== null) engine.dispatchEffects(docId, [commit.of(code)]);
  }),
  engine.onPlayingChange((docId) => {
    if (playingDoc !== null && playingDoc !== docId) engine.dispatchEffects(playingDoc, [clear.of(null)]);
    playingDoc = docId;
  }),
];
import.meta.hot?.dispose(() => unsubscribers.forEach((unsubscribe) => unsubscribe()));

// --- Actions ----------------------------------------------------------------------

// Lights up the block's lines for a moment, as Strudel flashes the whole editor.
const setFlash = StateEffect.define<{ from: number; to: number } | null>();
const flashLine = Decoration.line({ class: "cm-blockFlash" });

const flash = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    marks = marks.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setFlash)) continue;
      if (!effect.value) {
        marks = Decoration.none;
        continue;
      }
      const { doc } = tr.state;
      const lines = [];
      for (let n = doc.lineAt(effect.value.from).number; n <= doc.lineAt(effect.value.to).number; n++) {
        lines.push(flashLine.range(doc.line(n).from));
      }
      marks = Decoration.set(lines);
    }
    return marks;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const FLASH_MS = 200;

function playBlock(view: EditorView, index: number, flashIt = true): void {
  const block = view.state.field(blocksField)[index];
  if (!block) return;
  if (flashIt) {
    view.dispatch({ effects: setFlash.of({ from: block.from, to: block.to }) });
    setTimeout(() => view.dispatch({ effects: setFlash.of(null) }), FLASH_MS);
  }
  void engine.evaluateCode(build(view.state, new Set([index])));
}

// This document's code is playing.
function isPlaying(state: EditorState): boolean {
  return state.field(played).playing.length > 0;
}

function relabel(view: EditorView, index: number, toggle: typeof toggleMute): void {
  const block = view.state.field(blocksField)[index];
  if (!block) return;
  view.dispatch({ changes: toggle(block), annotations: Transaction.userEvent.of("input.label") });
  if (isPlaying(view.state)) playBlock(view, index, false);
}

type Action = "play" | "mute" | "solo";

function run(view: EditorView, index: number, action: Action): void {
  if (action === "play") playBlock(view, index);
  else relabel(view, index, action === "mute" ? toggleMute : toggleSolo);
}

function runAtCursor(action: Action): void {
  const view = currentView();
  if (!view) return;
  const index = blockAt(view.state.field(blocksField), view.state.selection.main.head);
  if (index >= 0) run(view, index, action);
}

export const BLOCK_COMMANDS: Command[] = [
  { id: "run.playBlock", label: "Play Block", run: () => runAtCursor("play") },
  { id: "run.muteBlock", label: "Mute Block", run: () => runAtCursor("mute") },
  { id: "run.soloBlock", label: "Solo Block", run: () => runAtCursor("solo") },
];

// --- The gutter -------------------------------------------------------------------

// ▶: "on" plays as written and is heard; "edited" plays an earlier text; "held" plays
// as written but is muted or silenced by a solo elsewhere; "" isn't playing.
type PlayLight = "on" | "edited" | "held" | "";

class BlockMarker extends GutterMarker {
  constructor(
    readonly play: PlayLight,
    readonly muted: boolean,
    readonly soloed: boolean,
  ) {
    super();
  }

  eq(other: BlockMarker): boolean {
    return other.play === this.play && other.muted === this.muted && other.soloed === this.soloed;
  }

  toDOM(): Node {
    const el = document.createElement("span");
    el.className = "cm-blockButtons";
    const titles: Record<PlayLight, string> = {
      on: "Playing: play this block again",
      edited: "Playing an earlier version: play this one",
      held: "Playing, but not heard (muted or another block is soloed)",
      "": "Play this block",
    };
    el.append(
      button("play", "▶", this.play, titles[this.play]),
      button("mute", "M", this.muted ? "on" : "", this.muted ? "Unmute (_ in the label)" : "Mute (_ in the label)"),
      button("solo", "S", this.soloed ? "on" : "", this.soloed ? "Unsolo (S in the label)" : "Solo (S in the label)"),
    );
    return el;
  }
}

function button(action: Action, text: string, state: string, title: string): HTMLElement {
  const el = document.createElement("span");
  el.className = `cm-blockButton cm-block-${action}${state ? ` ${state}` : ""}`;
  el.dataset.action = action;
  el.textContent = text;
  el.title = title;
  return el;
}

function markers(state: EditorState): RangeSet<GutterMarker> {
  const blocks = state.field(blocksField);
  if (!blocks.length) return RangeSet.empty;
  const texts = evaluatedTexts(state);
  const doc = state.doc;
  // A solo silences every block that isn't soloed, among those playing.
  const soloing = blocks.some((b, i) => texts[i] !== null && b.soloed && !b.muted);
  const list: { from: number; marker: BlockMarker }[] = [];
  let lastLine = -1;
  blocks.forEach((block, i) => {
    const line = doc.lineAt(block.labelFrom);
    // One set of buttons per line, for its first block.
    if (line.number === lastLine) return;
    lastLine = line.number;
    const text = doc.sliceString(block.from, block.to);
    let play: PlayLight = "";
    if (texts[i] !== null) {
      if (texts[i] !== text) play = "edited";
      else play = block.muted || (soloing && !block.soloed) ? "held" : "on";
    }
    list.push({ from: line.from, marker: new BlockMarker(play, block.muted, block.soloed) });
  });
  return RangeSet.of(list.map(({ from, marker }) => marker.range(from)));
}

const markersField = StateField.define<RangeSet<GutterMarker>>({
  create: markers,
  update: (set, tr) =>
    // The start state lacks the field in the transaction that adds these extensions.
    tr.docChanged || tr.startState.field(played, false) !== tr.state.field(played) ? markers(tr.state) : set,
});

// The block whose label is on `lineFrom`'s line.
function blockOnLine(state: EditorState, lineFrom: number): number {
  return state.field(blocksField).findIndex((b) => state.doc.lineAt(b.labelFrom).from === lineFrom);
}

export function blockControls(): Extension {
  return [
    played,
    blocksField,
    markersField,
    flash,
    gutter({
      class: "cm-blockGutter",
      markers: (view) => view.state.field(markersField),
      domEventHandlers: {
        mousedown(view, line, event) {
          const action = (event.target as HTMLElement).closest<HTMLElement>(".cm-blockButton")?.dataset.action;
          if (!action) return false;
          event.preventDefault();
          if ((event as MouseEvent).button !== 0) return true;
          const index = blockOnLine(view.state, line.from);
          if (index >= 0) run(view, index, action as Action);
          return true;
        },
      },
    }),
  ];
}
