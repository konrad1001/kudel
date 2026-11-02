import { describe, expect, it } from "vitest";
import { sliderRange, toggleSlider, type TextChange } from "./sliderCode";

// Applies changes (positions in the original text) back to front.
const apply = (text: string, changes: TextChange[] | null) =>
  changes === null
    ? null
    : [...changes].sort((a, b) => b.from - a.from).reduce((t, c) => t.slice(0, c.from) + c.insert + t.slice(c.to), text);

const never = () => false;

describe("sliderRange", () => {
  it("uses 0–1 for amounts and -1–1 for small negatives", () => {
    expect(sliderRange(0.5, 1)).toEqual({ min: 0, max: 1 });
    expect(sliderRange(-0.3, 1)).toEqual({ min: -1, max: 1 });
  });

  it("goes up to a round number at least twice the value", () => {
    expect(sliderRange(800, 0)).toEqual({ min: 0, max: 2000 });
    expect(sliderRange(2.5, 1)).toEqual({ min: 0, max: 5 });
    expect(sliderRange(-20, 0)).toEqual({ min: -50, max: 50, step: 1 });
  });

  it("steps whole numbers below 100 by 1", () => {
    expect(sliderRange(4, 0)).toEqual({ min: 0, max: 10, step: 1 });
    expect(sliderRange(1, 0)).toEqual({ min: 0, max: 2, step: 1 });
    expect(sliderRange(0, 0)).toEqual({ min: 0, max: 1, step: 1 });
  });
});

describe("toggleSlider", () => {
  it("wraps the number at the cursor", () => {
    expect(apply("s('bd').lpf(800)", toggleSlider("s('bd').lpf(800)", 13, never))).toBe(
      "s('bd').lpf(slider(800, 0, 2000))",
    );
    expect(apply(".gain(0.5)", toggleSlider(".gain(0.5)", 9, never))).toBe(".gain(slider(0.5, 0, 1))");
    expect(apply(".fast(4)", toggleSlider(".fast(4)", 6, never))).toBe(".fast(slider(4, 0, 10, 1))");
  });

  it("unwraps a slider around the cursor to its current value", () => {
    const line = ".lpf(slider(1234.5, 0, 2000)).gain(.5)";
    expect(apply(line, toggleSlider(line, 8, never))).toBe(".lpf(1234.5).gain(.5)");
    expect(apply(line, toggleSlider(line, 14, never))).toBe(".lpf(1234.5).gain(.5)");
    expect(apply("slider(3)", toggleSlider("slider(3)", 0, never))).toBe("3");
  });

  it("does nothing away from a number or inside a string", () => {
    expect(toggleSlider(".lpf(800)", 1, never)).toBe(null);
    expect(toggleSlider('s("bd*4")', 6, () => true)).toBe(null);
  });
});
