import { parser } from "@lezer/javascript";
import type { SyntaxNode } from "@lezer/common";
import type { TextChange } from "./sliderCode";

// Strudel's labelled blocks (`$: s("bd")`, `bass: n("0 2")`) as text: finding them,
// muting and soloing them the way Strudel itself reads labels, and building the code
// that evaluates some blocks while the others keep playing what they played. Pure.
//
// What the labels mean is in @strudel/core repl.mjs: the transpiler turns `x: pat` into
// pat.p('x'); p() returns silence for an id starting or ending with `_` (muted); an id
// containing `$` gets a running number appended; and once any id longer than one
// character starts with `S`, only those ids play (soloed, several at once allowed).

export interface Block {
  label: string;
  // The label itself, without its colon.
  labelFrom: number;
  labelTo: number;
  // The whole statement, label included, without trailing whitespace.
  from: number;
  to: number;
  // As Strudel reads the label.
  muted: boolean;
  soloed: boolean;
  // Has a syntax error (it's being typed, say).
  broken: boolean;
}

function hasError(node: SyntaxNode): boolean {
  if (node.type.isError) return true;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (hasError(child)) return true;
  }
  return false;
}

export function isMuted(label: string): boolean {
  return label.startsWith("_") || label.endsWith("_");
}

// The id repl.mjs checks for a solo: `$` labels get a number appended, so `S$` counts.
export function isSoloed(label: string): boolean {
  const id = label.includes("$") ? `${label}0` : label;
  return id.length > 1 && id.startsWith("S");
}

// The labelled statements at the top level of `code`, in order. Lezer recovers from
// syntax errors, so a block being typed doesn't hide the ones after it.
export function findBlocks(code: string): Block[] {
  const blocks: Block[] = [];
  for (let node = parser.parse(code).topNode.firstChild; node; node = node.nextSibling) {
    if (node.name !== "LabeledStatement") continue;
    const labelNode = node.getChild("Label");
    if (!labelNode) continue;
    const label = code.slice(labelNode.from, labelNode.to);
    let to = node.to;
    while (to > node.from && /\s/.test(code[to - 1])) to--;
    blocks.push({
      label,
      labelFrom: labelNode.from,
      labelTo: labelNode.to,
      from: node.from,
      to,
      muted: isMuted(label),
      soloed: isSoloed(label),
      broken: hasError(node),
    });
  }
  return blocks;
}

// The block whose label contains `pos`, or whose statement does.
export function blockAt(blocks: Block[], pos: number): number {
  return blocks.findIndex((b) => pos >= b.from && pos <= b.to);
}

// Mutes with a leading `_`; unmutes by taking off every leading and trailing one.
export function toggleMute(block: Block): TextChange[] {
  const { label, labelFrom, labelTo } = block;
  if (!block.muted) return [{ from: labelFrom, to: labelFrom, insert: "_" }];
  const lead = label.length - label.replace(/^_+/, "").length;
  const trail = label.length - label.replace(/_+$/, "").length;
  // A label of only underscores keeps one character, so it stays a label.
  if (lead === label.length) return [{ from: labelFrom, to: labelTo, insert: "$" }];
  const changes: TextChange[] = [];
  if (lead) changes.push({ from: labelFrom, to: labelFrom + lead, insert: "" });
  if (trail) changes.push({ from: labelTo - trail, to: labelTo, insert: "" });
  return changes;
}

// Solos with an `S` in front of the name (after any muting `_`), or takes it off.
// A named label that already starts with S (`Snare:`) is soloed as far as Strudel is
// concerned, so un-soloing it drops that S.
export function toggleSolo(block: Block): TextChange[] {
  const { label, labelFrom } = block;
  const lead = label.length - label.replace(/^_+/, "").length;
  const name = label.slice(lead);
  const at = labelFrom + lead;
  if (isSoloed(name)) {
    // `S` alone would leave an empty label.
    return [{ from: at, to: at + 1, insert: name.length > 1 ? "" : "$" }];
  }
  return [{ from: at, to: at, insert: "S" }];
}

// Spaces in place of everything but line breaks, so what follows keeps its position.
function blank(text: string): string {
  return text.replace(/[^\n]/g, " ");
}

export interface Composition {
  code: string;
  // The blocks that will play, by index, with the text each plays.
  included: { index: number; text: string }[];
}

// The code that plays `targets` as they are written now, while every other block
// keeps playing what it last played. `evaluated[i]` is block i's text as it is
// playing, or null if it isn't. Code outside blocks is taken as written, and so is a
// muted block that isn't playing, since it's silent either way (unless it has a syntax
// error, which would stop the rest from playing).
//
// Positions in the result match `code` everywhere except after its end: a block that
// plays an older text has its place blanked and that text appended, so Strudel's
// highlights, sliders and error positions still land in the right places in the
// editor, and the old text, placed past the end, gets none.
export function composeEvaluation(
  code: string,
  blocks: Block[],
  evaluated: (string | null)[],
  targets: ReadonlySet<number>,
): Composition {
  let out = "";
  let appended = "";
  let blanked = false;
  let pos = 0;
  const included: Composition["included"] = [];
  blocks.forEach((block, index) => {
    const text = code.slice(block.from, block.to);
    const old = evaluated[index] ?? null;
    out += code.slice(pos, block.from);
    pos = block.to;
    const silent = old === null && block.muted && !block.broken;
    if (targets.has(index) || old === text || silent) {
      out += text;
      included.push({ index, text });
      return;
    }
    out += blank(text);
    blanked = true;
    if (old !== null) {
      // On a line of its own, after a semicolon, whatever the code ends with.
      appended += `\n;${old}`;
      included.push({ index, text: old });
    }
  });
  out += code.slice(pos);
  // Strudel's transpiler needs the last statement to be an expression (it returns it as
  // the pattern, which the blocks then override). With the last block blanked, a
  // `const` before it would be last, so the code ends on `silence` instead.
  if (blanked && !appended) appended = "\n;silence";
  return { code: out + appended, included };
}
