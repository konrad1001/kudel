import { describe, expect, it } from "vitest";
import { errorPosition, LOAD_TIMEOUT_MS, loadsInProgress } from "./errors";

describe("errorPosition", () => {
  it("reads acorn's loc", () => {
    const err = Object.assign(new SyntaxError("Unexpected token (6:6)"), { loc: { line: 6, column: 6 } });
    expect(errorPosition(err)).toEqual({ line: 6, column: 6 });
  });

  it("falls back to the position at the end of the message", () => {
    expect(errorPosition(new Error("Unexpected token (2:14)"))).toEqual({ line: 2, column: 14 });
  });

  it("gives null when there's no position", () => {
    expect(errorPosition(new Error("sound nope not found! Is it loaded?"))).toBe(null);
    expect(errorPosition(new Error("bad (1:2) in the middle"))).toBe(null);
    expect(errorPosition("text")).toBe(null);
    expect(errorPosition(undefined)).toBe(null);
  });
});

describe("loadsInProgress", () => {
  it("counts recent loads and forgets ones that never finished", () => {
    const started = new Map([
      ["a.wav", 1000],
      ["b.wav", 2000],
      ["stuck.wav", 0],
    ]);
    expect(loadsInProgress(started, LOAD_TIMEOUT_MS + 500)).toBe(2);
    expect([...started.keys()]).toEqual(["a.wav", "b.wav"]);
  });
});
