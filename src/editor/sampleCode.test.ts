import { describe, expect, it } from "vitest";
import { hasSamplesCall, sampleInsertChanges, samplesLinePosition, type CodeChange } from "./sampleCode";

// Applies changes the way CodeMirror does: positions refer to the original code.
function apply(code: string, changes: CodeChange[]): string {
  return [...changes]
    .map((c, i) => ({ ...c, i }))
    .sort((a, b) => b.from - a.from || b.i - a.i)
    .reduce((text, c) => text.slice(0, c.from) + c.insert + text.slice(c.from), code);
}

describe("hasSamplesCall", () => {
  it("finds the call with any quote style", () => {
    expect(hasSamplesCall(`samples("./drums")`, "./drums")).toBe(true);
    expect(hasSamplesCall("samples( `./drums` )", "./drums")).toBe(true);
    expect(hasSamplesCall(`samples('./drums2')`, "./drums")).toBe(false);
  });
});

describe("samplesLinePosition", () => {
  it("goes after existing samples lines", () => {
    const code = "samples('./a')\nsamples('./b')\ns(\"x\")";
    expect(samplesLinePosition(code)).toBe(code.indexOf("s(\"x\")"));
  });

  it("goes after a leading comment block, before the code", () => {
    const code = "// my song\n\nsetcps(1)";
    expect(samplesLinePosition(code)).toBe(code.indexOf("setcps"));
  });

  it("goes at the end of code with only comments", () => {
    expect(samplesLinePosition("// todo")).toBe(7);
  });
});

describe("sampleInsertChanges", () => {
  it("adds the samples line and s(\"name\") outside a string", () => {
    const code = 'setcps(1)\n';
    const { changes } = sampleInsertChanges(code, { samplesPath: "./samples", name: "kick", pos: code.length, inString: false });
    expect(apply(code, changes)).toBe("samples('./samples')\nsetcps(1)\ns(\"kick\")\n");
  });

  it("ends s(\"name\") with a new line only at the end of a line", () => {
    const code = "a\n\nb";
    const atEmptyLine = sampleInsertChanges(code, { samplesPath: "./x", name: "kick", pos: 2, inString: false });
    expect(apply(code, atEmptyLine.changes)).toBe("samples('./x')\na\ns(\"kick\")\n\nb");
    const midLine = sampleInsertChanges("ab", { samplesPath: "./x", name: "kick", pos: 1, inString: false });
    expect(apply("ab", midLine.changes)).toBe("samples('./x')\nas(\"kick\")b");
  });

  it("adds only the name inside a string, spaced from neighbours", () => {
    const code = "samples('./samples')\ns(\"bd sd\")";
    const pos = code.indexOf("sd");
    const { changes } = sampleInsertChanges(code, { samplesPath: "./samples", name: "kick", pos, inString: true });
    expect(apply(code, changes)).toBe("samples('./samples')\ns(\"bd kick sd\")");
  });

  it("adds only the samples line for a whole bank", () => {
    const { changes } = sampleInsertChanges("", { samplesPath: "./samples", name: null, pos: 0, inString: false });
    expect(apply("", changes)).toBe("samples('./samples')\n");
  });

  it("starts a new line when the code doesn't end with one", () => {
    const { changes } = sampleInsertChanges("// hi", { samplesPath: "./x", name: null, pos: 0, inString: false });
    expect(apply("// hi", changes)).toBe("// hi\nsamples('./x')\n");
  });

  it("puts the cursor after the inserted name", () => {
    expect(sampleInsertChanges("", { samplesPath: "./x", name: "kick", pos: 0, inString: false }).cursor).toBe(0);
  });
});
