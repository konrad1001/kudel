import { describe, expect, it } from "vitest";
import { clampSize, DEFAULT_LAYOUT, DEFAULT_SECTION, parseRegion, parseSections, sectionOf, shownViewId } from "./layout";

describe("clampSize", () => {
  it("keeps sizes within the region's limits, in whole pixels", () => {
    expect(clampSize("sidebar", 50)).toBe(160);
    expect(clampSize("sidebar", 300.6)).toBe(301);
    expect(clampSize("panel", 5000)).toBe(800);
    expect(clampSize("section", 10)).toBe(80);
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

describe("sectionOf", () => {
  it("gives a sidebar section's saved layout, or the default", () => {
    const sections = { sounds: { collapsed: true, size: 200 } };
    expect(sectionOf(sections, "sounds")).toEqual({ collapsed: true, size: 200 });
    expect(sectionOf(sections, "explorer")).toEqual(DEFAULT_SECTION);
  });
});

describe("parseSections", () => {
  it("reads saved sections, using defaults for bad parts and clamping sizes", () => {
    expect(
      parseSections({
        explorer: { collapsed: true, size: 250 },
        sounds: { collapsed: "no", size: 5 },
        junk: 3,
      }),
    ).toEqual({
      explorer: { collapsed: true, size: 250 },
      sounds: { collapsed: false, size: 80 },
      junk: DEFAULT_SECTION,
    });
  });

  it("gives none for a missing or broken value", () => {
    expect(parseSections(undefined)).toEqual({});
    expect(parseSections("x")).toEqual({});
  });
});
