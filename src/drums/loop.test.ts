import { describe, expect, it } from "vitest";
import {
  defaultLoop,
  drumBanks,
  isSoundName,
  loopCode,
  parseDrumFile,
  rowMini,
  saveLoop,
  serializeDrumFile,
  soundExists,
  STEPS,
  stepValue,
  valuesAt,
  type Loop,
} from "./loop";

// A row from a 16-character string: x for on, anything else off.
const row = (sound: string, pattern: string) => ({ sound, steps: [...pattern].map((c) => c === "x") });

describe("rowMini", () => {
  it("leaves out an empty row", () => {
    expect(rowMini(row("bd", "................"))).toBeNull();
  });

  it("shortens rows that repeat", () => {
    expect(rowMini(row("hh", "xxxxxxxxxxxxxxxx"))).toBe("hh*16");
    expect(rowMini(row("hh", ".x.x.x.x.x.x.x.x"))).toBe("[~ hh]*8");
    expect(rowMini(row("bd", "x...x...x...x..."))).toBe("[bd ~ ~ ~]*4");
    expect(rowMini(row("sd", "....x.......x..."))).toBe("[~ ~ ~ ~ sd ~ ~ ~]*2");
  });

  it("writes every step of a row that doesn't repeat", () => {
    expect(rowMini(row("bd", "x.....x...x....."))).toBe("bd ~ ~ ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~ ~ ~");
  });
});

describe("loopCode", () => {
  const loop = (rows: Loop["rows"], bank = ""): Loop => ({ name: "beat", bank, rows });

  it("stacks the rows that have steps, with the bank after", () => {
    expect(loopCode(loop([row("bd", "x...x...x...x..."), row("sd", "....x.......x..."), row("cp", "................")], "rolandtr909"))).toBe(
      ['const beat = stack(', '  s("[bd ~ ~ ~]*4"),', '  s("[~ ~ ~ ~ sd ~ ~ ~]*2"),', ')', ].join("\n") + '.bank("rolandtr909")\n',
    );
  });

  it("writes one row without a stack, and silence for none", () => {
    expect(loopCode(loop([row("hh", "xxxxxxxxxxxxxxxx")]))).toBe('const beat = s("hh*16")\n');
    expect(loopCode(defaultLoop())).toBe("const drums = silence\n");
  });

  it("leaves out rows whose sound isn't one step of mini-notation", () => {
    expect(loopCode(loop([row("bd sd", "x...............")]))).toBe("const beat = silence\n");
  });
});

describe("sounds", () => {
  it("accepts names and name:n", () => {
    expect(isSoundName("bd")).toBe(true);
    expect(isSoundName("bd:3")).toBe(true);
    expect(isSoundName("bd sd")).toBe(false);
    expect(isSoundName("bd*2")).toBe(false);
  });

  it("splits name:n into s and n, with the bank alongside", () => {
    expect(stepValue("bd:3", "")).toEqual({ s: "bd", n: 3 });
    expect(stepValue("hh", "rolandtr808")).toEqual({ s: "hh", bank: "rolandtr808" });
  });

  it("lists what each step plays", () => {
    const loop: Loop = { name: "b", bank: "", rows: [row("bd", "x...x..........."), row("hh", "x.x.x.x.x.x.x.x.")] };
    expect(valuesAt(loop, 0)).toEqual([{ s: "bd" }, { s: "hh" }]);
    expect(valuesAt(loop, 1)).toEqual([]);
    expect(valuesAt(loop, 2)).toEqual([{ s: "hh" }]);
  });

  it("finds the drum machine banks and which sounds they have", () => {
    const sounds = [
      { name: "rolandtr909_bd", tag: "drum-machines" },
      { name: "rolandtr909_sd", tag: "drum-machines" },
      { name: "linndrum_bd", tag: "drum-machines" },
      { name: "bd" },
    ];
    expect(drumBanks(sounds)).toEqual(["linndrum", "rolandtr909"]);
    const names = new Set(sounds.map((s) => s.name));
    expect(soundExists(names, "sd", "rolandtr909")).toBe(true);
    expect(soundExists(names, "sd", "linndrum")).toBe(false);
    expect(soundExists(names, "bd:2", "")).toBe(true);
  });
});

describe("drum file", () => {
  it("starts with the default loop when there's no file or a broken one", () => {
    expect(parseDrumFile(null)).toEqual({ current: defaultLoop(), saved: [] });
    expect(parseDrumFile("{nope")).toEqual({ current: defaultLoop(), saved: [] });
  });

  it("round-trips, padding short rows and dropping bad ones", () => {
    const file = { current: { name: "a", bank: "linndrum", rows: [row("bd", "x...x...x...x...")] }, saved: [defaultLoop("b")] };
    expect(parseDrumFile(serializeDrumFile(file))).toEqual(file);
    const repaired = parseDrumFile(JSON.stringify({ current: { name: "a", rows: [{ sound: "bd", steps: [true] }, { steps: [] }] } }));
    expect(repaired.current.rows).toHaveLength(1);
    expect(repaired.current.rows[0].steps).toHaveLength(STEPS);
    expect(repaired.current.bank).toBe("");
  });

  it("saves by name, replacing in place, as a copy", () => {
    const a = defaultLoop("a");
    const saved = saveLoop([], a);
    a.rows[0].steps[0] = true;
    expect(saved[0].rows[0].steps[0]).toBe(false);
    expect(saveLoop([defaultLoop("a"), defaultLoop("b")], a).map((l) => l.name)).toEqual(["a", "b"]);
  });
});
