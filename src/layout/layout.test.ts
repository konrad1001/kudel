import { describe, expect, it } from "vitest";
import { clampSize, DEFAULT_LAYOUT, parseRegion, shownViewId } from "./layout";

describe("clampSize", () => {
  it("keeps sizes within the region's limits, in whole pixels", () => {
    expect(clampSize("sidebar", 50)).toBe(160);
    expect(clampSize("sidebar", 300.6)).toBe(301);
    expect(clampSize("panel", 5000)).toBe(800);
  });
});

describe("shownViewId", () => {
  const ids = ["keys", "log"];

  it("shows the chosen view", () => {
    expect(shownViewId({ view: "log", visible: true, size: 200 }, ids)).toBe("log");
  });

  it("falls back to the first view for none or an unknown one", () => {
    expect(shownViewId({ view: null, visible: true, size: 200 }, ids)).toBe("keys");
    expect(shownViewId({ view: "gone", visible: true, size: 200 }, ids)).toBe("keys");
    expect(shownViewId({ view: null, visible: true, size: 200 }, [])).toBe(null);
  });
});

describe("parseRegion", () => {
  it("reads a saved region", () => {
    expect(parseRegion("panel", { view: "keys", visible: true, size: 300 })).toEqual({
      view: "keys",
      visible: true,
      size: 300,
    });
  });

  it("uses the fallback for missing or invalid parts, and clamps the size", () => {
    expect(parseRegion("panel", undefined)).toEqual(DEFAULT_LAYOUT.panel);
    expect(parseRegion("panel", { view: 3, visible: "yes", size: 9999 })).toEqual({
      ...DEFAULT_LAYOUT.panel,
      size: 800,
    });
  });
});
