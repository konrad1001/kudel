import { describe, expect, it } from "vitest";
import {
  bytesText,
  clipLength,
  clipText,
  clockText,
  dirLabel,
  importDir,
  importName,
  parseTime,
  progressBar,
  readClip,
  readLine,
  START,
  statusText,
  urlStartTime,
  versionText,
  type Progress,
} from "./importer";

const read = (...lines: string[]): Progress => lines.reduce(readLine, START);

describe("readLine", () => {
  it("reads the progress template", () => {
    const p = read("[progress] 500 2000 NA 1234.5 7");
    expect(p).toMatchObject({ phase: "downloading", fraction: 0.25, speed: 1234.5, eta: 7 });
  });

  it("falls back to the estimated size, and keeps the fraction when neither is known", () => {
    expect(read("[progress] 500 NA 1000 NA NA").fraction).toBe(0.5);
    expect(read("[progress] 500 1000 NA NA NA", "[progress] 600 NA NA NA NA").fraction).toBe(0.5);
  });

  it("takes the title from the destination file", () => {
    expect(read("[download] Destination: C:\\Temp\\x\\Amen Break.webm").title).toBe("Amen Break");
  });

  it("moves to converting and clears the download figures", () => {
    const p = read("[progress] 1000 1000 NA 10 0", "[ExtractAudio] Destination: C:\\Temp\\x\\Amen Break.wav");
    expect(p).toMatchObject({ phase: "converting", fraction: null, speed: null, eta: null });
  });

  it("keeps the last error", () => {
    expect(read("ERROR: first", "WARNING: w", "ERROR: [youtube] abc: Video unavailable").error).toBe(
      "[youtube] abc: Video unavailable",
    );
  });

  it("ignores everything else", () => {
    expect(read("[youtube] Extracting URL: https://…", "[info] abc: Downloading 1 format(s): 251")).toEqual(START);
  });
});

describe("importName", () => {
  it("makes a sound name of the title", () => {
    expect(importName("Amen Break (Original) - The Winstons")).toBe("amen_break_original-the_winstons");
    expect(importName("Café Del Mar")).toBe("cafe_del_mar");
  });

  it("names titles with nothing usable, or only digits, the way soundName does", () => {
    expect(importName("「」")).toBe("sample");
    expect(importName("1999")).toBe("s1999");
  });

  it("shortens long titles at a separator", () => {
    const name = importName("Some Extremely Long Title That Goes On And On - Full Album Remastered 2011");
    expect(name.length).toBeLessThanOrEqual(48);
    expect(name).toBe("some_extremely_long_title_that_goes_on_and_on");
  });
});

describe("clips", () => {
  it("parses times", () => {
    expect(parseTime("90")).toBe(90);
    expect(parseTime(" 1:30 ")).toBe(90);
    expect(parseTime("1:30.5")).toBe(90.5);
    expect(parseTime("1:02:03")).toBe(3723);
    expect(parseTime("0:05")).toBe(5);
  });

  it("refuses what isn't a time", () => {
    for (const text of ["", "abc", "1:60", "1:75:00", "1::30", "-5", "1:30:00:00", "1m30s"]) {
      expect(parseTime(text)).toBeNull();
    }
  });

  it("reads the two fields into a clip", () => {
    expect(readClip("", "")).toEqual({ clip: null });
    expect(readClip("1:30", "2:05")).toEqual({ clip: { from: 90, to: 125 } });
    expect(readClip("1:30", "")).toEqual({ clip: { from: 90, to: null } });
    expect(readClip("", "35")).toEqual({ clip: { from: null, to: 35 } });
    expect(readClip("0", "35")).toEqual({ clip: { from: null, to: 35 } });
  });

  it("says why the fields aren't a clip", () => {
    expect(readClip("1:3x", "")).toEqual({ error: '"1:3x" isn\'t a time' });
    expect(readClip("", "soon")).toEqual({ error: '"soon" isn\'t a time' });
    expect(readClip("2:05", "1:30")).toEqual({ error: '"to" is before "from"' });
    expect(readClip("10", "10")).toEqual({ error: '"to" is before "from"' });
    expect(readClip("", "0")).toEqual({ error: '"to" is at the start' });
  });

  it("describes a clip", () => {
    expect(clipText(null)).toBe("whole");
    expect(clipText({ from: 90, to: 125 })).toBe("1:30–2:05");
    expect(clipText({ from: 90, to: null })).toBe("1:30–end");
    expect(clipText({ from: null, to: 35 })).toBe("0:00–0:35");
    expect(clipLength({ from: 90, to: 125 })).toBe("0:35");
    expect(clipLength({ from: null, to: 35 })).toBe("0:35");
    expect(clipLength({ from: 90, to: null })).toBeNull();
  });

  it("reads a start time from a link", () => {
    expect(urlStartTime("https://www.youtube.com/watch?v=abc&t=90s")).toBe(90);
    expect(urlStartTime("https://youtu.be/abc?t=90")).toBe(90);
    expect(urlStartTime("https://www.youtube.com/watch?v=abc&t=1m30s")).toBe(90);
    expect(urlStartTime("https://www.youtube.com/watch?v=abc&t=1h2m3s")).toBe(3723);
    expect(urlStartTime("https://www.youtube.com/watch?v=abc#t=45")).toBe(45);
    expect(urlStartTime("https://www.youtube.com/embed/abc?start=12")).toBe(12);
  });

  it("finds no start time where there is none", () => {
    expect(urlStartTime("https://www.youtube.com/watch?v=abc")).toBeNull();
    expect(urlStartTime("https://www.youtube.com/watch?v=abc&t=0")).toBeNull();
    expect(urlStartTime("https://www.youtube.com/watch?v=abc&t=soon")).toBeNull();
    expect(urlStartTime("not a link")).toBeNull();
  });

  it("names clips by where they start", () => {
    expect(importName("Amen Break", { from: 90, to: 125 })).toBe("amen_break-1m30s");
    expect(importName("Amen Break", { from: 5.7, to: null })).toBe("amen_break-5s");
    expect(importName("Amen Break", { from: null, to: 35 })).toBe("amen_break-0s");
    expect(importName("Long Mix", { from: 3723, to: null })).toBe("long_mix-1h02m03s");
    expect(importName("Amen Break", null)).toBe("amen_break");
  });
});

describe("importDir", () => {
  it("keeps folders inside the open folder relative to it", () => {
    expect(importDir("C:\\music", "C:\\music\\samples\\new")).toBe("./samples/new");
    expect(importDir("C:\\music", "C:\\Music")).toBe("./");
  });

  it("refuses folders outside it", () => {
    expect(importDir("C:\\music", "C:\\other")).toBeNull();
    expect(importDir("C:\\music", "D:\\music")).toBeNull();
  });

  it("labels it as a folder", () => {
    expect(dirLabel("./imported")).toBe("./imported/");
    expect(dirLabel("./")).toBe("./");
  });
});

describe("formatting", () => {
  it("draws the progress bar", () => {
    expect(progressBar(0.5, 10)).toBe("[#####.....]");
    expect(progressBar(1.2, 4)).toBe("[####]");
    expect(progressBar(0, 4)).toBe("[....]");
  });

  it("formats sizes and times", () => {
    expect(bytesText(512)).toBe("512 B");
    expect(bytesText(1_940_000)).toBe("1.9 MB");
    expect(bytesText(12_960_000)).toBe("13.0 MB");
    expect(clockText(75)).toBe("1:15");
    expect(clockText(4)).toBe("0:04");
    expect(clockText(3723)).toBe("1:02:03");
    expect(clockText(90.5)).toBe("1:30.5");
    expect(clockText(90.25)).toBe("1:30.25");
  });

  it("sums up running imports for the status bar", () => {
    expect(statusText([])).toBeNull();
    expect(statusText([START])).toBe("↓ importing");
    expect(statusText([{ ...START, phase: "downloading", fraction: 0.527 }])).toBe("↓ 52%");
    expect(statusText([{ ...START, phase: "converting" }])).toBe("↓ converting");
    expect(statusText([START, START])).toBe("↓ 2 imports");
  });

  it("reads tool versions", () => {
    expect(versionText("ffmpeg version 7.1-full_build-www.gyan.dev Copyright (c) 2000-2024")).toBe(
      "7.1-full_build-www.gyan.dev",
    );
    expect(versionText("2026.10.22")).toBe("2026.10.22");
  });
});
