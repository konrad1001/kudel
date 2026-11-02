import { describe, expect, it } from "vitest";
import { formatNumber, numberAt, PX_PER_STEP, stepNumber, STEPS_PER_OCTAVE } from "./scrubNumber";

const at = (text: string, pos: number) => numberAt(text, pos)?.text ?? null;

describe("numberAt", () => {
  const line = 's("bd*4 0.25").lpf(800).gain(.5)';

  it("finds numbers in code and in mini-notation, from either side", () => {
    expect(numberAt(line, line.indexOf("800"))).toEqual({ from: 19, to: 22, text: "800", value: 800, decimals: 0 });
    expect(at(line, line.indexOf("800") + 3)).toBe("800");
    expect(at(line, line.indexOf("4"))).toBe("4");
    expect(numberAt(line, line.indexOf("0.25") + 2)).toMatchObject({ value: 0.25, decimals: 2 });
    expect(numberAt(line, line.indexOf(".5)") + 1)).toMatchObject({ text: ".5", value: 0.5, decimals: 1 });
  });

  it("gives null away from a number", () => {
    expect(at(line, 0)).toBe(null);
    expect(at(line, line.indexOf("lpf"))).toBe(null);
  });

  it("skips digits in names and other literals", () => {
    expect(at('s("tr909 bd2")', 6)).toBe(null);
    expect(at('s("tr909 bd2")', 11)).toBe(null);
    expect(at("x = 1e3", 4)).toBe(null);
    expect(at("x = 0x1f", 4)).toBe(null);
    expect(at("x = 4n", 4)).toBe(null);
  });

  it("takes a minus as a sign only where it can't be subtraction", () => {
    expect(at("pan(-0.5)", 5)).toBe("-0.5");
    expect(at('n("0 -1 2")', 6)).toBe("-1");
    expect(at("x-1", 2)).toBe("1");
    expect(at("f(2)-1", 5)).toBe("1");
  });

  it("leaves a trailing dot out of the number", () => {
    expect(numberAt("x = 2.", 4)).toMatchObject({ text: "2", to: 5, decimals: 0 });
    expect(at("[1].map", 1)).toBe("1");
  });
});

describe("stepNumber", () => {
  const lit = (text: string, pos = 0) => numberAt(text, pos)!;

  it("steps by the last decimal place", () => {
    expect(stepNumber(lit("0.8"), 1)).toBe("0.9");
    expect(stepNumber(lit("0.25"), -3)).toBe("0.22");
    expect(stepNumber(lit("4"), 2)).toBe("6");
  });

  it("goes one place finer with fine", () => {
    expect(stepNumber(lit("0.8"), 1, true)).toBe("0.81");
    expect(stepNumber(lit("4"), 1, true)).toBe("4.1");
  });

  it("rounds fractional steps", () => {
    expect(stepNumber(lit("0.5"), 13 / PX_PER_STEP)).toBe("0.7");
  });

  it("scales big whole numbers in proportion", () => {
    expect(stepNumber(lit("800"), STEPS_PER_OCTAVE)).toBe("1600");
    expect(stepNumber(lit("800"), -STEPS_PER_OCTAVE)).toBe("400");
    expect(stepNumber(lit("800"), 1, true)).toBe("800.1");
  });

  it("crosses zero cleanly and keeps the literal's style", () => {
    expect(stepNumber(lit("0.1"), -1)).toBe("0.0");
    expect(stepNumber(lit("0.1"), -2)).toBe("-0.1");
    expect(stepNumber(lit(".5"), 1)).toBe(".6");
  });
});

describe("formatNumber", () => {
  it("drops -0 and keeps a missing leading zero", () => {
    expect(formatNumber(-0.0001, 2)).toBe("0.00");
    expect(formatNumber(0.25, 2, ".5")).toBe(".25");
    expect(formatNumber(-0.25, 2, ".5")).toBe("-.25");
  });
});
