import { describe, expect, it } from "vitest";
import { activeAfterClose, cycleTab, insertIndex, nextUntitled, tabTitle } from "./tabs";

describe("tabTitle", () => {
  it("uses the file name, or Untitled-n without a file", () => {
    expect(tabTitle({ filePath: "C:\\music\\acid.strudel", untitled: null })).toBe("acid.strudel");
    expect(tabTitle({ filePath: null, untitled: 3 })).toBe("Untitled-3");
  });
});

describe("nextUntitled", () => {
  it("takes the lowest free number", () => {
    expect(nextUntitled([])).toBe(1);
    expect(nextUntitled([{ untitled: 1 }, { untitled: null }, { untitled: 3 }])).toBe(2);
    expect(nextUntitled([{ untitled: 2 }, { untitled: 1 }])).toBe(3);
  });
});

describe("insertIndex", () => {
  it("goes right after the active tab", () => {
    expect(insertIndex(["a", "b", "c"], "a")).toBe(1);
  });

  it("goes at the end without an active tab", () => {
    expect(insertIndex(["a", "b"], null)).toBe(2);
    expect(insertIndex([], null)).toBe(0);
  });
});

describe("activeAfterClose", () => {
  const ids = ["a", "b", "c"];

  it("keeps the active tab when another one closes", () => {
    expect(activeAfterClose(ids, "a", "c")).toBe("c");
  });

  it("moves to the right neighbour, else the left", () => {
    expect(activeAfterClose(ids, "b", "b")).toBe("c");
    expect(activeAfterClose(ids, "c", "c")).toBe("b");
  });

  it("leaves nothing active when the last tab closes", () => {
    expect(activeAfterClose(["a"], "a", "a")).toBe(null);
  });
});

describe("cycleTab", () => {
  const ids = ["a", "b", "c"];

  it("steps both ways and wraps around", () => {
    expect(cycleTab(ids, "a", 1)).toBe("b");
    expect(cycleTab(ids, "c", 1)).toBe("a");
    expect(cycleTab(ids, "a", -1)).toBe("c");
  });

  it("handles no tabs or no active tab", () => {
    expect(cycleTab([], null, 1)).toBe(null);
    expect(cycleTab(ids, null, 1)).toBe("a");
  });
});
