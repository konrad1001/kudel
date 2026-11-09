import { deleteListItems, indentAt, lineStart } from "../editor/objectCode";
import type { PatternArg, PatternDeclaration, PatternString } from "../editor/patternCode";
import type { TextChange } from "../editor/sliderCode";
import { emptySteps, isSoundName, parseRowMini, rowMini, type DrumRow, type Loop } from "./loop";

// The Drums view's link to a loop in the code (`const drums = stack(s("…"), …).bank("…")`),
// both ways. Pure, so it's tested without an editor.
//
// - A row is an s("…") whose mini-notation the grid can show (parseRowMini), matched to
//   the panel's rows by its sound. Other s("…") calls and arguments stay as written, and
//   aren't shown.
// - The kit is .bank("…") among the chained calls; others (.gain(…), .fast(2)) stay.

// A row in the code, and where its s("…") and string are.
export interface CodeRow extends DrumRow {
  arg: PatternArg;
  string: PatternString;
}

// What the code's loop holds: its rows and kit. Null when it isn't a loop the panel can
// link to (its base isn't silence, s("…") of a row, or stack(…)).
export function readLoop(pattern: PatternDeclaration): { rows: CodeRow[]; bank: string } | null {
  const { base, chain } = pattern;
  const bankCall = chain.find((call) => call.name === "bank");
  const bank = bankCall?.args[0]?.string?.value ?? "";
  if (!base.call) return base.name === "silence" ? { rows: [], bank } : null;
  const asRow = (arg: PatternArg): CodeRow | null => {
    const call = arg.call;
    const string = call?.name === "s" && call.args.length === 1 ? call.args[0].string : undefined;
    const row = string ? parseRowMini(string.value) : null;
    return row && string ? { ...row, arg, string } : null;
  };
  if (base.call.name === "s") {
    const row = asRow({ from: base.from, to: base.to, call: base.call });
    return row ? { rows: [row], bank } : null;
  }
  if (base.call.name !== "stack") return null;
  // The first row of each sound; a second one stays as written.
  const rows: CodeRow[] = [];
  for (const arg of base.call.args) {
    const row = asRow(arg);
    if (row && !rows.some((r) => r.sound === row.sound)) rows.push(row);
  }
  return { rows, bank };
}

// The panel's rows with the code's steps: each row's steps from the code row of its
// sound (none if the code has none), then any code rows the panel hasn't got.
export function rowsFromCode(codeRows: DrumRow[], panelRows: DrumRow[]): DrumRow[] {
  const bySound = new Map(codeRows.map((row) => [row.sound, row]));
  const rows = panelRows.map((row) => ({ sound: row.sound, steps: [...(bySound.get(row.sound)?.steps ?? emptySteps())] }));
  for (const row of codeRows) if (!panelRows.some((p) => p.sound === row.sound)) rows.push({ sound: row.sound, steps: [...row.steps] });
  return rows;
}

// Each sound's row as written, for the rows with steps on, in order.
function rowMinis(loop: Loop): Map<string, string> {
  const minis = new Map<string, string>();
  for (const row of loop.rows) {
    const mini = isSoundName(row.sound) ? rowMini(row) : null;
    if (mini !== null && !minis.has(row.sound)) minis.set(row.sound, mini);
  }
  return minis;
}

const sameMap = (a: Map<string, string>, b: Map<string, string>) =>
  a.size === b.size && [...a].every(([key, value]) => b.get(key) === value);

// The base written whole: silence, one s("…"), or a stack of them.
function baseCode(minis: Map<string, string>): string {
  const rows = [...minis.values()].map((mini) => `s("${mini}")`);
  if (rows.length === 0) return "silence";
  if (rows.length === 1) return rows[0];
  return `stack(\n${rows.map((row) => `  ${row},`).join("\n")}\n)`;
}

// The edits that take the code's loop from the panel's `before` to its `after`:
// - a row that changed has the text in its s("…") replaced;
// - a sound newly on gets an s("…") in the stack, after the row before it;
// - a row now empty (or removed) has its s("…") taken out of the stack;
// - a base that isn't a stack (silence, one s("…")) is rewritten when the rows outgrow it;
// - the kit's .bank("…") is changed, added after the base, or taken out.
export function drumChanges(code: string, pattern: PatternDeclaration, before: Loop, after: Loop): TextChange[] {
  const read = readLoop(pattern);
  if (!read) return [];
  const prev = rowMinis(before);
  const next = rowMinis(after);
  const inCode = new Map(read.rows.map((row) => [row.sound, row]));
  const changes: TextChange[] = [];
  const replaceString = (string: PatternString, value: string) => changes.push({ from: string.from + 1, to: string.to - 1, insert: value });
  const { base } = pattern;

  if (!sameMap(prev, next)) {
    if (base.call?.name === "stack") {
      const added: string[] = [];
      const removed: PatternArg[] = [];
      for (const [sound, mini] of next) {
        if (prev.get(sound) === mini) continue;
        const row = inCode.get(sound);
        if (row) replaceString(row.string, mini);
        else added.push(sound);
      }
      for (const sound of prev.keys()) {
        const row = inCode.get(sound);
        if (!next.has(sound) && row) removed.push(row.arg);
      }
      for (const range of deleteListItems(code, removed)) changes.push({ ...range, insert: "" });
      changes.push(...stackInsertions(code, base.call, removed, added, after, next, inCode));
    } else {
      const only = [...next][0];
      const row = only && next.size === 1 ? inCode.get(only[0]) : undefined;
      if (row && base.call?.name === "s") replaceString(row.string, only[1]);
      else changes.push({ from: base.from, to: base.to, insert: baseCode(next) });
    }
  }

  if (before.bank !== after.bank) {
    const bankCall = pattern.chain.find((call) => call.name === "bank");
    const string = bankCall?.args[0]?.string;
    if (bankCall && !after.bank) changes.push({ from: bankCall.from, to: bankCall.to, insert: "" });
    else if (string) replaceString(string, after.bank);
    else if (after.bank) changes.push({ from: base.to, to: base.to, insert: `.bank("${after.bank}")` });
  }
  return changes.sort((a, b) => a.from - b.from);
}

// Where new rows go in a stack: each after the code row of the panel row before it, or
// after the stack's last argument; on its own line in a stack written over lines.
function stackInsertions(
  code: string,
  stack: NonNullable<PatternDeclaration["base"]["call"]>,
  removed: PatternArg[],
  added: string[],
  after: Loop,
  next: Map<string, string>,
  inCode: Map<string, CodeRow>,
): TextChange[] {
  if (added.length === 0) return [];
  const kept = stack.args.filter((arg) => !removed.includes(arg));
  const multiline = code.slice(stack.open, stack.close).includes("\n");
  const anchorFor = (sound: string): PatternArg | undefined => {
    const order = after.rows.map((row) => row.sound);
    for (let i = order.indexOf(sound) - 1; i >= 0; i--) {
      const row = inCode.get(order[i]);
      if (row && kept.includes(row.arg)) return row.arg;
    }
    return kept[kept.length - 1];
  };
  const inserts = new Map<number, string>();
  for (const sound of added) {
    const text = `s("${next.get(sound)}")`;
    const anchor = anchorFor(sound);
    let at: number;
    let insert: string;
    if (!anchor) {
      at = stack.open + 1;
      insert = multiline ? `\n  ${text},` : text;
    } else {
      let end = anchor.to;
      while (code[end] === " " || code[end] === "\t") end++;
      const comma = code[end] === ",";
      at = comma ? end + 1 : anchor.to;
      const indent = indentAt(code, lineStart(code, anchor.from)) || "  ";
      insert = multiline ? (comma ? `\n${indent}${text},` : `,\n${indent}${text}`) : `, ${text}`;
    }
    inserts.set(at, (inserts.get(at) ?? "") + insert);
  }
  return [...inserts].map(([at, insert]) => ({ from: at, to: at, insert }));
}
