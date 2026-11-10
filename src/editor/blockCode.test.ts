import { describe, expect, it } from "vitest";
import { composeEvaluation, findBlocks, isMuted, isSoloed, toggleMute, toggleSolo } from "./blockCode";
import type { TextChange } from "./sliderCode";

function apply(text: string, changes: TextChange[]): string {
  return [...changes].sort((a, b) => b.from - a.from).reduce((t, c) => t.slice(0, c.from) + c.insert + t.slice(c.to), text);
}

// The code with block 0's label rewritten by `toggle`.
function toggled(code: string, toggle: typeof toggleMute): string {
  return apply(code, toggle(findBlocks(code)[0]));
}

describe("findBlocks", () => {
  const code = 'setcpm(30)\n$: s("bd sd")\n  .gain(.5);\n_$: note("c e")\nbass: n("0 2")\n// $: s("no")\nS$: s("hh*8")\n';

  it("finds top-level labelled statements, multi-line ones whole", () => {
    const blocks = findBlocks(code);
    expect(blocks.map((b) => b.label)).toEqual(["$", "_$", "bass", "S$"]);
    expect(code.slice(blocks[0].from, blocks[0].to)).toBe('$: s("bd sd")\n  .gain(.5);');
    expect(code.slice(blocks[3].labelFrom, blocks[3].labelTo)).toBe("S$");
  });

  it("reads mute and solo as Strudel does", () => {
    expect(findBlocks(code).map((b) => [b.muted, b.soloed])).toEqual([
      [false, false],
      [true, false],
      [false, false],
      [false, true],
    ]);
  });

  it("keeps finding blocks after one that is half typed", () => {
    const blocks = findBlocks('$: s("x"\n$: s("y")');
    expect(blocks).toHaveLength(2);
    expect(blocks[0].to).toBe(8);
  });

  it("ignores labels nested in functions", () => {
    expect(findBlocks("function f() {\n  $: s('bd')\n}")).toEqual([]);
  });
});

describe("labels", () => {
  it("mutes with a leading or trailing underscore", () => {
    expect(isMuted("_$")).toBe(true);
    expect(isMuted("$_")).toBe(true);
    expect(isMuted("bass")).toBe(false);
  });

  it("solos labels starting with S, longer than one character", () => {
    expect(isSoloed("S$")).toBe(true);
    expect(isSoloed("Snare")).toBe(true);
    expect(isSoloed("S")).toBe(false);
    expect(isSoloed("$")).toBe(false);
  });
});

describe("toggleMute", () => {
  it("adds and removes the underscore", () => {
    expect(toggled("$: s('bd')", toggleMute)).toBe("_$: s('bd')");
    expect(toggled("_$: s('bd')", toggleMute)).toBe("$: s('bd')");
    expect(toggled("bass_: n(0)", toggleMute)).toBe("bass: n(0)");
    expect(toggled("__bass__: n(0)", toggleMute)).toBe("bass: n(0)");
  });

  it("keeps a soloed block soloed", () => {
    expect(toggled("S$: s('bd')", toggleMute)).toBe("_S$: s('bd')");
    expect(toggled("_S$: s('bd')", toggleMute)).toBe("S$: s('bd')");
  });

  it("leaves a label behind", () => {
    expect(toggled("_: s('bd')", toggleMute)).toBe("$: s('bd')");
  });
});

describe("toggleSolo", () => {
  it("adds and removes the S", () => {
    expect(toggled("$: s('bd')", toggleSolo)).toBe("S$: s('bd')");
    expect(toggled("S$: s('bd')", toggleSolo)).toBe("$: s('bd')");
    expect(toggled("bass: n(0)", toggleSolo)).toBe("Sbass: n(0)");
  });

  it("goes after a muting underscore", () => {
    expect(toggled("_$: s('bd')", toggleSolo)).toBe("_S$: s('bd')");
    expect(toggled("_S$: s('bd')", toggleSolo)).toBe("_$: s('bd')");
  });

  it("un-solos a name Strudel reads as soloed", () => {
    expect(toggled("Snare: s('sd')", toggleSolo)).toBe("nare: s('sd')");
  });
});

describe("composeEvaluation", () => {
  const code = 'setcpm(30)\n$: s("bd")\n$: s("hh")\n$: s("cp")';
  const blocks = findBlocks(code);
  const texts = blocks.map((b) => code.slice(b.from, b.to));

  it("is the code itself when every block plays as written", () => {
    const result = composeEvaluation(code, blocks, texts, new Set([1]));
    expect(result.code).toBe(code);
    expect(result.included.map((i) => i.index)).toEqual([0, 1, 2]);
  });

  it("blanks blocks that aren't playing, keeping positions", () => {
    const result = composeEvaluation(code, blocks, [null, null, null], new Set([1]));
    expect(result.code.slice(0, code.length)).toBe('setcpm(30)\n          \n$: s("hh")\n          ');
    expect(result.included).toEqual([{ index: 1, text: '$: s("hh")' }]);
  });

  it("plays an edited block's old text after the end", () => {
    const evaluated = ['$: s("bd*2")', texts[1], null];
    const result = composeEvaluation(code, blocks, evaluated, new Set([2]));
    expect(result.code).toBe('setcpm(30)\n          \n$: s("hh")\n$: s("cp")\n;$: s("bd*2")');
    expect(result.code.slice(0, code.length).length).toBe(code.length);
    expect(result.included).toEqual([
      { index: 0, text: '$: s("bd*2")' },
      { index: 1, text: '$: s("hh")' },
      { index: 2, text: '$: s("cp")' },
    ]);
  });

  it("takes a muted block that isn't playing as written, unless it's broken", () => {
    const muted = '_$: s("bd")\n_$: s("hh"\n$: s("cp")';
    const mutedBlocks = findBlocks(muted);
    expect(mutedBlocks.map((b) => b.broken)).toEqual([false, true, false]);
    const result = composeEvaluation(muted, mutedBlocks, [null, null, null], new Set([2]));
    expect(result.code).toBe('_$: s("bd")\n          \n$: s("cp")\n;silence');
    expect(result.included.map((i) => i.index)).toEqual([0, 2]);
  });

  it("keeps line breaks of a blanked multi-line block", () => {
    const multi = '$: s("bd")\n  .gain(.5)\n$: s("hh")';
    const result = composeEvaluation(multi, findBlocks(multi), [null, null], new Set([1]));
    expect(result.code.slice(0, multi.length).split("\n")).toHaveLength(3);
    expect(result.code.endsWith('\n$: s("hh")\n;silence')).toBe(true);
  });

  // Strudel's transpiler needs the last statement to be an expression.
  it("ends on an expression when blanking leaves a const last", () => {
    const withConst = '$: s("bd")\nconst hh = s("hh")\n$: hh';
    const result = composeEvaluation(withConst, findBlocks(withConst), [null, null], new Set([0]));
    expect(result.code).toBe('$: s("bd")\nconst hh = s("hh")\n     \n;silence');
  });

  it("adds nothing when the code plays as written", () => {
    const all = '$: s("bd")\nconst hh = s("hh")\n$: hh';
    const blocks = findBlocks(all);
    const result = composeEvaluation(all, blocks, ['$: s("bd")', "$: hh"], new Set([0]));
    expect(result.code).toBe(all);
  });
});
