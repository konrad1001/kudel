import { describe, expect, it } from "vitest";
import { cycleText, loadingText, tempoText, trimmed } from "./format";

describe("trimmed", () => {
  it("rounds and drops trailing zeros", () => {
    expect(trimmed(0.5, 3)).toBe("0.5");
    expect(trimmed(120, 1)).toBe("120");
    expect(trimmed(0.56666, 3)).toBe("0.567");
  });
});

describe("tempoText", () => {
  it("gives cps and bpm at four beats a cycle", () => {
    expect(tempoText(0.5)).toBe("0.5 cps · 120 bpm");
    expect(tempoText(140 / 4 / 60)).toBe("0.583 cps · 140 bpm");
  });
});

describe("cycleText", () => {
  it("counts down to the tenth, keeping the tenth", () => {
    expect(cycleText(0)).toBe("0.0");
    expect(cycleText(12.49)).toBe("12.4");
    expect(cycleText(3)).toBe("3.0");
  });
});

describe("loadingText", () => {
  it("counts samples", () => {
    expect(loadingText(1)).toBe("loading 1 sample");
    expect(loadingText(3)).toBe("loading 3 samples");
  });
});
