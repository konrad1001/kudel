import { describe, expect, it } from "vitest";
import { clipCode, clipFileName, fractionDecimals } from "./clipCode";

describe("fractionDecimals", () => {
  it("keeps the last digit under a millisecond", () => {
    expect(fractionDecimals(3)).toBe(4);
    expect(fractionDecimals(10)).toBe(4);
    expect(fractionDecimals(180)).toBe(6);
    expect(fractionDecimals(0.5)).toBe(3);
    expect(fractionDecimals(0.05)).toBe(2);
  });
});

describe("clipFileName", () => {
  it("names a clip by where it starts, to the millisecond", () => {
    expect(clipFileName("amen_break", 0.376)).toBe("amen_break-0s376");
    expect(clipFileName("amen_break", 12.05)).toBe("amen_break-12s050");
    expect(clipFileName("amen_break", 90.5)).toBe("amen_break-1m30s500");
    expect(clipFileName("mix", 3723.0004)).toBe("mix-1h02m03s000");
    expect(clipFileName("amen_break", 0)).toBe("amen_break-0s000");
  });
});

describe("clipCode", () => {
  it("writes begin and end as fractions of the file", () => {
    expect(clipCode("amen_break", { start: 0.375, end: 1.125 }, 3)).toBe('s("amen_break").begin(0.125).end(0.375)');
  });

  it("rounds to the file's decimals", () => {
    expect(clipCode("amen", { start: 0.376185, end: 1.126976 }, 3)).toBe('s("amen").begin(0.1254).end(0.3757)');
    expect(clipCode("mix", { start: 61.2345, end: 92.5 }, 180)).toBe('s("mix").begin(0.340192).end(0.513889)');
  });

  it("leaves out an end at the file's edge", () => {
    expect(clipCode("amen", { start: 0, end: 1.5 }, 3)).toBe('s("amen").end(0.5)');
    expect(clipCode("amen", { start: 1.5, end: 3 }, 3)).toBe('s("amen").begin(0.5)');
    expect(clipCode("amen", { start: 0.00001, end: 2.99999 }, 3)).toBe('s("amen")');
  });

  it("is just the sound without a selection", () => {
    expect(clipCode("amen", null, 3)).toBe('s("amen")');
  });
});
