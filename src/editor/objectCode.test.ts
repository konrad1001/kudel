import { describe, expect, it } from "vitest";
import { findObject, NOT_LITERAL, objectChanges, tidyObject } from "./objectCode";
import { placeOf, UNKNOWN_LINE } from "../synth/codeLayout";
import type { TextChange } from "./sliderCode";

const literal = (value: unknown) => (typeof value === "string" ? `'${value}'` : Array.isArray(value) ? `[${value.join(", ")}]` : String(value));

// The code after the changes, applied from the end so earlier positions stay valid.
function apply(code: string, changes: TextChange[]): string {
  return [...changes].sort((a, b) => b.from - a.from).reduce((text, c) => text.slice(0, c.from) + c.insert + text.slice(c.to), code);
}

const CODE = [
  "const other = { s: 'sine' }",
  "const pad = {",
  "  s: 'sawtooth', unison: 4,",
  "  cutoff: 800, orbit: 2, // mine",
  "  attack: 0.1, release: 0.5,",
  "}",
  '$: note("c3").set(pad)',
].join("\n");

const write = (before: Record<string, unknown>, after: Record<string, unknown>, code = CODE) =>
  apply(code, objectChanges(code, findObject(code, "pad")!, before, after, literal, placeOf));

describe("findObject", () => {
  it("finds the object a const of that name holds, and its properties", () => {
    const object = findObject(CODE, "pad")!;
    expect(object.properties.map((p) => p.key)).toEqual(["s", "unison", "cutoff", "orbit", "attack", "release"]);
    expect(CODE.slice(object.properties[2].valueFrom, object.properties[2].valueTo)).toBe("800");
    expect(CODE[object.open]).toBe("{");
    expect(CODE[object.close]).toBe("}");
    expect(object.multiline).toBe(true);
    expect(object.hasComments).toBe(true);
  });

  it("reads quoted keys, and finds nothing for other names or non-objects", () => {
    expect(findObject("const p = { 's': 'x' }", "p")!.properties[0].key).toBe("s");
    expect(findObject(CODE, "nope")).toBeNull();
    expect(findObject('const pad = note("c")', "pad")).toBeNull();
  });

  it("reads plain values, and marks expressions as not literal", () => {
    const code = "const p = { a: 0.5, b: -2, c: 'saw', d: [1, 0.5, -1], e: slider(3, 0, 8), f: [1, x] }";
    expect(findObject(code, "p")!.properties.map((p) => p.value)).toEqual([0.5, -2, "saw", [1, 0.5, -1], NOT_LITERAL, NOT_LITERAL]);
  });
});

describe("objectChanges", () => {
  const base = { s: "sawtooth", unison: 4, cutoff: 800, attack: 0.1, release: 0.5 };

  it("replaces only the value that changed", () => {
    expect(write(base, { ...base, cutoff: 1200 })).toBe(CODE.replace("cutoff: 800", "cutoff: 1200"));
  });

  it("leaves keys the panel didn't change alone, even if the code differs", () => {
    const code = CODE.replace("unison: 4", "unison: slider(4, 1, 8)");
    expect(write(base, { ...base, attack: 0.2 }, code)).toBe(code.replace("attack: 0.1", "attack: 0.2"));
  });

  it("adds a key to its category's line", () => {
    expect(write(base, { ...base, sustain: 0.6 })).toContain("  attack: 0.1, release: 0.5, sustain: 0.6,\n}");
    expect(write(base, { ...base, detune: 0.3 })).toContain("  s: 'sawtooth', unison: 4, detune: 0.3,\n");
  });

  it("starts a category's line after the last line of an earlier category", () => {
    expect(write(base, { ...base, room: 0.3 })).toContain("  attack: 0.1, release: 0.5,\n  room: 0.3,\n}");
    expect(write(base, { ...base, lpenv: 2 })).toContain("  cutoff: 800, orbit: 2, // mine\n  lpenv: 2,\n  attack: 0.1");
  });

  it("starts a line before the first one when nothing comes earlier", () => {
    const code = "const pad = {\n  attack: 0.1,\n}";
    expect(apply(code, objectChanges(code, findObject(code, "pad")!, { attack: 0.1 }, { s: "sine", attack: 0.1 }, literal, placeOf))).toBe(
      "const pad = {\n  s: 'sine',\n  attack: 0.1,\n}",
    );
  });

  it("deletes a key the panel stops writing, leaving no trailing spaces or empty lines", () => {
    expect(write(base, { s: "sawtooth", unison: 4, cutoff: 800, attack: 0.1 })).toContain("  attack: 0.1,\n}");
    const lines = write(base, { s: "sawtooth", unison: 4, cutoff: 800 });
    expect(lines).not.toContain("attack");
    expect(lines).toContain("  cutoff: 800, orbit: 2, // mine\n}");
  });

  it("writes a one-line object on its line", () => {
    const code = "const pad = { s: 'sine' }";
    expect(apply(code, objectChanges(code, findObject(code, "pad")!, { s: "sine" }, { s: "user", partials: [1, 0.5] }, literal, placeOf))).toBe(
      "const pad = { s: 'user', partials: [1, 0.5] }",
    );
    const empty = "const pad = {}";
    expect(apply(empty, objectChanges(empty, findObject(empty, "pad")!, {}, { s: "sine" }, literal, placeOf))).toBe("const pad = { s: 'sine' }");
  });

  it("can add and delete at once without the edits overlapping", () => {
    const result = write(base, { s: "sawtooth", unison: 4, cutoff: 800, attack: 0.1, room: 0.3 });
    expect(result).toContain("  attack: 0.1,\n  room: 0.3,\n}");
    expect(result).not.toContain("release");
  });
});

describe("tidyObject", () => {
  const messy = [
    "const synth = {",
    "  s: 'wt_basic_shapes', wt: 0.69, unison: 4,",
    "  cutoff: 326, resonance: 0, ",
    "  attack: 0.562, decay: 0.238, sustain: 1, release: 3.026,",
    "  vib: 10.33, vibmod: 0.21, lpenv: 0.55, lpattack: 0.003, room: 0.25, orbit: 2, roomsize: 2, gain: slider(1, 0, 2),",
    "}",
  ].join("\n");

  it("puts each category on its own line, in order, keeping expressions and unknown keys", () => {
    const tidy = apply(messy, [tidyObject(messy, findObject(messy, "synth")!, placeOf, UNKNOWN_LINE)!]);
    expect(tidy).toBe(
      [
        "const synth = {",
        "  s: 'wt_basic_shapes', wt: 0.69, unison: 4,",
        "  cutoff: 326, resonance: 0,",
        "  lpenv: 0.55, lpattack: 0.003,",
        "  attack: 0.562, decay: 0.238, sustain: 1, release: 3.026,",
        "  vib: 10.33, vibmod: 0.21,",
        "  room: 0.25, roomsize: 2,",
        "  gain: slider(1, 0, 2),",
        "  orbit: 2,",
        "}",
      ].join("\n"),
    );
    // Already tidy: nothing to do.
    expect(tidyObject(tidy, findObject(tidy, "synth")!, placeOf, UNKNOWN_LINE)).toBeNull();
  });

  it("won't rewrite an object with comments", () => {
    expect(tidyObject(CODE, findObject(CODE, "pad")!, placeOf, UNKNOWN_LINE)).toBeNull();
  });
});
