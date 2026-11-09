import { parser } from "@lezer/javascript";
import type { SyntaxNode } from "@lezer/common";
import type { TextChange } from "./sliderCode";

// Finding a `const name = { … }` in code, reading its plain values, and writing changed
// properties back into it with minimal edits: only the properties that changed, never
// the whole object, so anything else in it (keys the panel doesn't know, expressions,
// comments) survives. Pure, so it's tested without an editor.

// A property's value that isn't a plain number, string or list of numbers (an
// expression like slider(…) or sine.range(…)): there to keep, not to read.
export const NOT_LITERAL = Symbol("not a literal");

export interface ObjectProperty {
  key: string;
  // The whole `key: value`, and its value alone.
  from: number;
  to: number;
  valueFrom: number;
  valueTo: number;
  value: number | string | number[] | typeof NOT_LITERAL;
}

export interface ObjectLiteral {
  // The braces' positions: `{` at open, `}` at close.
  open: number;
  close: number;
  properties: ObjectProperty[];
  // Written over several lines (then new keys go on their own lines).
  multiline: boolean;
  hasComments: boolean;
}

// Where a key goes in a tidy object: its line, and its place on it. Lower comes first.
export type Placement = (key: string) => [line: number, order: number];

function keyOf(property: SyntaxNode, code: string): string | null {
  const key = property.firstChild;
  if (!key) return null;
  const text = code.slice(key.from, key.to);
  if (key.name === "PropertyDefinition") return text;
  if (key.name === "String") return text.slice(1, -1);
  return null;
}

function numberOf(node: SyntaxNode, code: string): number | null {
  if (node.name === "Number") {
    const n = Number(code.slice(node.from, node.to).replace(/_/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  // -0.5: a minus sign before a number.
  if (node.name === "UnaryExpression" && code[node.from] === "-") {
    const operand = node.lastChild;
    const n = operand ? numberOf(operand, code) : null;
    return n === null ? null : -n;
  }
  return null;
}

// A value written as a plain literal, or NOT_LITERAL.
function literalOf(node: SyntaxNode, code: string): ObjectProperty["value"] {
  const n = numberOf(node, code);
  if (n !== null) return n;
  if (node.name === "String") return code.slice(node.from + 1, node.to - 1).replace(/\\(.)/g, "$1");
  if (node.name === "ArrayExpression") {
    const items: number[] = [];
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name === "[" || child.name === "]" || child.name === ",") continue;
      const item = numberOf(child, code);
      if (item === null) return NOT_LITERAL;
      items.push(item);
    }
    return items;
  }
  return NOT_LITERAL;
}

// The object assigned to `const name` (or let/var) at the top level of `code`, or null.
// A later declaration of the same name wins, as it would in the code.
export function findObject(code: string, name: string): ObjectLiteral | null {
  const tree = parser.parse(code);
  let found: ObjectLiteral | null = null;
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.name !== "VariableDeclaration") continue;
    const definition = node.getChild("VariableDefinition");
    if (!definition || code.slice(definition.from, definition.to) !== name) continue;
    const object = node.getChild("ObjectExpression");
    if (!object) continue;
    const properties: ObjectProperty[] = [];
    for (const property of object.getChildren("Property")) {
      const key = keyOf(property, code);
      const value = property.lastChild;
      if (key === null || !value || value.name === ":") continue;
      properties.push({ key, from: property.from, to: property.to, valueFrom: value.from, valueTo: value.to, value: literalOf(value, code) });
    }
    found = {
      open: object.from,
      close: object.to - 1,
      properties,
      multiline: code.slice(object.from, object.to).includes("\n"),
      hasComments: object.getChildren("LineComment").length + object.getChildren("BlockComment").length > 0,
    };
  }
  return found;
}

type Values = Record<string, unknown>;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const isSpace = (char: string | undefined) => char === " " || char === "\t";
const isLineEnd = (code: string, at: number) => code[at] === "\n" || (code[at] === "\r" && code[at + 1] === "\n");

// What deleting a property removes: it, a comma after it, and the spaces after that.
function deletion(code: string, property: { from: number; to: number }): { from: number; to: number } {
  let to = property.to;
  while (isSpace(code[to])) to++;
  if (code[to] === ",") to++;
  while (isSpace(code[to])) to++;
  return { from: property.from, to };
}

// Deletions that touch merged into one; each widened to its whole line when nothing else
// is left on it, or else to the spaces before it when it ends its line, so no line is
// left blank or ending in spaces.
function mergeDeletions(code: string, ranges: { from: number; to: number }[]): { from: number; to: number }[] {
  const merged: { from: number; to: number }[] = [];
  for (const range of [...ranges].sort((a, b) => a.from - b.from)) {
    const last = merged[merged.length - 1];
    if (last && range.from <= last.to) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  }
  return merged.map(({ from, to }) => {
    let before = from;
    while (before > 0 && isSpace(code[before - 1])) before--;
    const startsLine = before === 0 || code[before - 1] === "\n";
    if (!isLineEnd(code, to)) return { from, to };
    if (startsLine) return { from: before, to: to + (code[to] === "\r" ? 2 : 1) };
    return { from: before, to };
  });
}

// The ranges that delete these items of a comma-separated list (properties, arguments):
// each with its comma, neighbours merged, and whole lines when they're left empty.
export function deleteListItems(code: string, items: { from: number; to: number }[]): { from: number; to: number }[] {
  return mergeDeletions(code, items.map((item) => deletion(code, item)));
}

// The start of the line `pos` is on.
export function lineStart(code: string, pos: number): number {
  let at = pos;
  while (at > 0 && code[at - 1] !== "\n") at--;
  return at;
}

export function indentAt(code: string, start: number): string {
  let end = start;
  while (isSpace(code[end])) end++;
  return code.slice(start, end);
}

// Where a new key goes in a multi-line object, and what to insert there: after the last
// property on its line; or, if its line isn't there yet, as a new line after the line
// of the last property from an earlier line, or before the first property if none is.
function insertion(code: string, kept: ObjectProperty[], object: ObjectLiteral, line: number, place: Placement, text: string) {
  const sameLine = kept.filter((p) => place(p.key)[0] === line);
  if (sameLine.length) {
    const last = sameLine[sameLine.length - 1];
    let at = last.to;
    while (isSpace(code[at])) at++;
    return code[at] === "," ? { at: at + 1, insert: ` ${text},` } : { at: last.to, insert: `, ${text}` };
  }
  const earlier = kept.filter((p) => place(p.key)[0] < line);
  const after = earlier[earlier.length - 1];
  if (after) {
    const start = lineStart(code, after.from);
    let end = after.to;
    while (end < object.close && code[end] !== "\n" && code[end] !== "\r") end++;
    return { at: end, insert: `\n${indentAt(code, start) || "  "}${text},` };
  }
  const first = kept[0];
  if (!first) return { at: object.open + 1, insert: `\n  ${text},` };
  const start = lineStart(code, first.from);
  return { at: start, insert: `${indentAt(code, start) || "  "}${text},\n` };
}

// The edits that take the object from the panel's `before` controls to its `after` ones:
// a changed value replaced in place, a new key added on its line (`place`), a key the
// panel no longer writes deleted. Keys that didn't change aren't touched, even if the
// code says something else for them.
export function objectChanges(
  code: string,
  object: ObjectLiteral,
  before: Values,
  after: Values,
  literal: (value: unknown) => string,
  place: Placement,
): TextChange[] {
  const byKey = new Map(object.properties.map((p) => [p.key, p]));
  const changes: TextChange[] = [];
  const added: string[] = [];
  const deleted = new Set<string>();
  const deletions: { from: number; to: number }[] = [];
  for (const [key, value] of Object.entries(after)) {
    if (key in before && same(before[key], value)) continue;
    const property = byKey.get(key);
    if (property) changes.push({ from: property.valueFrom, to: property.valueTo, insert: literal(value) });
    else added.push(key);
  }
  for (const key of Object.keys(before)) {
    if (key in after) continue;
    const property = byKey.get(key);
    if (!property) continue;
    deleted.add(key);
    deletions.push(deletion(code, property));
  }
  for (const range of mergeDeletions(code, deletions)) changes.push({ ...range, insert: "" });
  if (added.length) {
    const kept = object.properties.filter((p) => !deleted.has(p.key));
    const text = (keys: string[]) => keys.map((key) => `${key}: ${literal(after[key])}`).join(", ");
    const sorted = [...added].sort((a, b) => place(a)[0] - place(b)[0] || place(a)[1] - place(b)[1]);
    if (!object.multiline) {
      const last = kept[kept.length - 1];
      changes.push(
        last
          ? { from: last.to, to: last.to, insert: `, ${text(sorted)}` }
          : { from: object.open + 1, to: object.open + 1, insert: ` ${text(sorted)} ` },
      );
    } else {
      // One insertion per line; insertions at the same spot joined in line order.
      const at = new Map<number, string>();
      for (const line of [...new Set(sorted.map((key) => place(key)[0]))]) {
        const keys = sorted.filter((key) => place(key)[0] === line);
        const { at: pos, insert } = insertion(code, kept, object, line, place, text(keys));
        at.set(pos, (at.get(pos) ?? "") + insert);
      }
      for (const [pos, insert] of at) changes.push({ from: pos, to: pos, insert });
    }
  }
  return changes.sort((a, b) => a.from - b.from);
}

// The object rewritten one line per category (`place`), each property as written
// (expressions and your own keys kept, the unknown ones on a last line), or null when it
// has comments, which a rewrite would lose, or is tidy already.
export function tidyObject(code: string, object: ObjectLiteral, place: Placement, unknownLine: number): TextChange | null {
  if (object.hasComments) return null;
  const lines = new Map<number, ObjectProperty[]>();
  for (const property of object.properties) {
    const [line] = place(property.key);
    lines.set(line, [...(lines.get(line) ?? []), property]);
  }
  const body = [...lines.entries()]
    .sort(([a], [b]) => a - b)
    .map(([line, properties]) => {
      const ordered = line === unknownLine ? properties : [...properties].sort((a, b) => place(a.key)[1] - place(b.key)[1]);
      return `  ${ordered.map((p) => code.slice(p.from, p.to)).join(", ")},`;
    })
    .join("\n");
  const text = body ? `{\n${body}\n}` : "{}";
  return code.slice(object.open, object.close + 1) === text ? null : { from: object.open, to: object.close + 1, insert: text };
}
