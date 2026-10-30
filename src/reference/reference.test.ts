import { describe, expect, it } from "vitest";
import api from "../../docs/strudel-api.json";
import {
  findEntry,
  groupOf,
  groupsOf,
  parseDescription,
  parseInline,
  searchReference,
  signatureOf,
  type ReferenceData,
  type ReferenceEntry,
} from "./reference";

const entry = (name: string, more: Partial<ReferenceEntry> = {}): ReferenceEntry => ({
  name,
  synonyms: [],
  kind: "member",
  package: "@strudel/core",
  source: "node_modules/@strudel/core/pattern.mjs:1",
  description: "",
  params: [],
  returns: [],
  examples: [],
  ...more,
});

const entries = [
  entry("fast", { synonyms: ["density"], description: "Speed up a pattern by the given factor." }),
  entry("fastGap", { description: "Speed up, leaving a gap." }),
  entry("s", { synonyms: ["sound"], source: "node_modules/@strudel/core/controls.mjs:97" }),
  entry("hurry", { description: "Speed up a pattern and the sample playback speed." }),
  entry("breakfast"),
  entry("scale", { package: "@strudel/tonal", source: "node_modules/@strudel/tonal/tonal.mjs:5" }),
];
const names = (indexes: number[]) => indexes.map((i) => entries[i].name);

describe("searchReference", () => {
  it("lists everything by name for an empty query", () => {
    expect(names(searchReference(entries, "  "))).toEqual(["breakfast", "fast", "fastGap", "hurry", "s", "scale"]);
  });

  it("ranks exact names, then prefixes, then names containing it, then descriptions", () => {
    expect(names(searchReference(entries, "fast"))).toEqual(["fast", "fastGap", "breakfast"]);
    expect(names(searchReference(entries, "speed up"))).toEqual(["fast", "fastGap", "hurry"]);
  });

  it("finds aliases, case-insensitively", () => {
    expect(names(searchReference(entries, "Sound"))).toEqual(["s"]);
    expect(names(searchReference(entries, "dens"))).toEqual(["fast"]);
  });

  it("needs every word for a description match", () => {
    expect(names(searchReference(entries, "speed sample"))).toEqual(["hurry"]);
  });

  it("keeps to a group", () => {
    expect(names(searchReference(entries, "s", "@strudel/tonal — tonal"))).toEqual(["scale"]);
  });
});

describe("groupOf", () => {
  it("names the package and file", () => {
    expect(groupOf(entries[2])).toBe("@strudel/core — controls");
    expect(groupsOf(entries)).toEqual(["@strudel/core — pattern", "@strudel/core — controls", "@strudel/tonal — tonal"]);
  });
});

describe("findEntry", () => {
  it("finds by name, then alias, ignoring a trailing ()", () => {
    expect(findEntry(entries, "fast")).toBe(0);
    expect(findEntry(entries, "sound")).toBe(2);
    expect(findEntry(entries, "hurry()")).toBe(3);
    expect(findEntry(entries, "nope")).toBe(null);
    expect(findEntry(entries, "")).toBe(null);
  });
});

describe("parseInline", () => {
  it("splits out code and links", () => {
    expect(parseInline("use `note` instead, see [docs](https://x.y/z).")).toEqual([
      { text: "use " },
      { code: "note" },
      { text: " instead, see " },
      { link: "docs", url: "https://x.y/z" },
      { text: "." },
    ]);
  });

  it("leaves a link without a url as text", () => {
    expect(parseInline("[noise](made up, like this)")).toEqual([{ text: "[noise](made up, like this)" }]);
  });
});

describe("parseDescription", () => {
  it("joins wrapped lines and splits paragraphs", () => {
    expect(parseDescription("one\ntwo\n\nthree")).toEqual([
      { paragraph: [{ text: "one two" }] },
      { paragraph: [{ text: "three" }] },
    ]);
  });

  it("gathers list items, even with blank lines between them", () => {
    expect(parseDescription("A name has\n\n- a letter\n\n- an `#`\n  or b\n\nDone")).toEqual([
      { paragraph: [{ text: "A name has" }] },
      { list: [[{ text: "a letter" }], [{ text: "an " }, { code: "#" }, { text: " or b" }]] },
      { paragraph: [{ text: "Done" }] },
    ]);
  });

  it("gives nothing for an empty description", () => {
    expect(parseDescription("")).toEqual([]);
  });
});

describe("signatureOf", () => {
  it("lists top-level parameters", () => {
    expect(signatureOf(entry("fast", { params: [{ name: "factor" }] }))).toBe("fast(factor)");
    expect(signatureOf(entry("lfo", { params: [{ name: "config" }, { name: "config.rate" }, { name: "id" }] }))).toBe(
      "lfo(config, id)",
    );
    expect(signatureOf(entry("sine"))).toBe("sine");
  });
});

// The generated file is what the view reads; this catches the generator changing shape.
describe("docs/strudel-api.json", () => {
  const data = api as unknown as ReferenceData;

  it("has entries with the fields the reference view uses", () => {
    expect(data.entries.length).toBeGreaterThan(100);
    for (const e of data.entries) {
      expect(typeof e.name).toBe("string");
      expect(Array.isArray(e.synonyms)).toBe(true);
      expect(typeof e.package).toBe("string");
      expect(e.source).toMatch(/^node_modules\/.+:\d+$/);
      expect(typeof e.description).toBe("string");
      expect(Array.isArray(e.params) && Array.isArray(e.returns) && Array.isArray(e.examples)).toBe(true);
    }
  });

  it("finds common functions", () => {
    expect(findEntry(data.entries, "sound")).not.toBe(null);
    expect(data.entries[searchReference(data.entries, "fast")[0]].name).toBe("fast");
  });
});
