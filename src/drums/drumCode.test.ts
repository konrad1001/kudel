import { describe, expect, it } from "vitest";
import { findPattern } from "../editor/patternCode";
import type { TextChange } from "../editor/sliderCode";
import { drumChanges, readLoop, rowsFromCode } from "./drumCode";
import type { DrumRow, Loop } from "./loop";

const row = (sound: string, pattern: string): DrumRow => ({ sound, steps: [...pattern].map((c) => c === "x") });
const loop = (rows: DrumRow[], bank = ""): Loop => ({ name: "drums", bank, rows });

function apply(code: string, changes: TextChange[]): string {
  return [...changes].sort((a, b) => b.from - a.from).reduce((text, c) => text.slice(0, c.from) + c.insert + text.slice(c.to), code);
}

const CODE = ['const drums = stack(', '  s("[bd ~ ~ ~]*4"),', '  s("<bd sd> hh"),', '  s("hh*16"),', ').bank("rolandtr909").gain(0.8)', "$: drums"].join(
  "\n",
);
const BEFORE = loop([row("bd", "x...x...x...x..."), row("sd", "................"), row("hh", "xxxxxxxxxxxxxxxx")], "rolandtr909");

const write = (after: Loop, code = CODE, before = BEFORE) => apply(code, drumChanges(code, findPattern(code, "drums")!, before, after));

describe("readLoop", () => {
  it("reads the rows the grid can show and the kit, skipping the rest", () => {
    const read = readLoop(findPattern(CODE, "drums")!)!;
    expect(read.rows.map((r) => r.sound)).toEqual(["bd", "hh"]);
    expect(read.rows[0].steps).toEqual(row("bd", "x...x...x...x...").steps);
    expect(read.bank).toBe("rolandtr909");
  });

  it("reads silence and a single row, and nothing else", () => {
    expect(readLoop(findPattern("const drums = silence", "drums")!)).toEqual({ rows: [], bank: "" });
    expect(readLoop(findPattern('const drums = s("bd*4").fast(2)', "drums")!)!.rows[0].sound).toBe("bd");
    expect(readLoop(findPattern('const drums = s("bd sd")', "drums")!)).toBeNull();
    expect(readLoop(findPattern('const drums = note("c")', "drums")!)).toBeNull();
  });
});

describe("rowsFromCode", () => {
  it("keeps the panel's rows, takes the code's steps, and adds rows the panel hasn't got", () => {
    const rows = rowsFromCode([row("hh", "x.x.x.x.x.x.x.x."), row("cp", "....x.......x...")], [row("bd", "x..............."), row("hh", "................")]);
    expect(rows).toEqual([row("bd", "................"), row("hh", "x.x.x.x.x.x.x.x."), row("cp", "....x.......x...")]);
  });
});

describe("drumChanges", () => {
  it("replaces the text of a row that changed, and nothing else", () => {
    const after = loop([row("bd", "x.....x.x......."), BEFORE.rows[1], BEFORE.rows[2]], "rolandtr909");
    expect(write(after)).toBe(CODE.replace('s("[bd ~ ~ ~]*4")', 's("bd ~ ~ ~ ~ ~ bd ~ bd ~ ~ ~ ~ ~ ~ ~")'));
  });

  it("adds a row on its own line after the row before it", () => {
    const after = loop([BEFORE.rows[0], row("sd", "....x.......x..."), BEFORE.rows[2]], "rolandtr909");
    expect(write(after)).toContain('  s("[bd ~ ~ ~]*4"),\n  s("[~ ~ ~ ~ sd ~ ~ ~]*2"),\n  s("<bd sd> hh"),');
  });

  it("takes out a row that's emptied, with its line", () => {
    const after = loop([BEFORE.rows[0], BEFORE.rows[1], row("hh", "................")], "rolandtr909");
    expect(write(after)).toBe(CODE.replace('  s("hh*16"),\n', ""));
  });

  it("changes, removes and adds the bank, keeping other chained calls", () => {
    expect(write({ ...BEFORE, bank: "linndrum" })).toContain(').bank("linndrum").gain(0.8)');
    expect(write({ ...BEFORE, bank: "" })).toContain(").gain(0.8)");
    const plain = 'const drums = s("bd*4")';
    const one = loop([row("bd", "x...x...x...x...")]);
    expect(write({ ...one, bank: "tr909" }, plain, one)).toBe('const drums = s("bd*4").bank("tr909")');
  });

  it("rewrites silence or a single row when the rows outgrow it", () => {
    const empty = loop([row("bd", "................")]);
    expect(write(loop([row("bd", "x...x...x...x...")]), "const drums = silence", empty)).toBe('const drums = s("[bd ~ ~ ~]*4")');
    const one = loop([row("bd", "x...x...x...x..."), row("hh", "................")]);
    const two = loop([row("bd", "x...x...x...x..."), row("hh", "xxxxxxxxxxxxxxxx")]);
    expect(write(two, 'const drums = s("bd*4").gain(0.5)', one)).toBe('const drums = stack(\n  s("[bd ~ ~ ~]*4"),\n  s("hh*16"),\n).gain(0.5)');
  });

  it("writes a single row's change in place, even in a short form", () => {
    const one = loop([row("bd", "x...x...x...x...")]);
    expect(write(loop([row("bd", "x.x.x.x.x.x.x.x.")]), 'const drums = s("bd*4")', one)).toBe('const drums = s("[bd ~]*8")');
  });

  it("adds into an empty stack", () => {
    const code = "const drums = stack(\n)";
    const empty = loop([row("bd", "................")]);
    expect(write(loop([row("bd", "xxxxxxxxxxxxxxxx")]), code, empty)).toBe('const drums = stack(\n  s("bd*16"),\n)');
  });
});
