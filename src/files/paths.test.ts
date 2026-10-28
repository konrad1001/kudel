import { describe, expect, it } from "vitest";
import { baseName, isCodeFile, samePath, windowTitle, withDefaultExtension } from "./paths";

describe("baseName", () => {
  it("takes the last part of Windows and forward-slash paths", () => {
    expect(baseName("C:\\music\\songs\\acid.strudel")).toBe("acid.strudel");
    expect(baseName("C:/music/songs/")).toBe("songs");
  });
});

describe("samePath", () => {
  it("ignores case, separator style and a trailing separator", () => {
    expect(samePath("C:\\Music\\a.strudel", "c:/music/A.strudel")).toBe(true);
    expect(samePath("C:\\music\\", "C:\\music")).toBe(true);
  });

  it("is false for different paths or a missing one", () => {
    expect(samePath("C:\\a.strudel", "C:\\b.strudel")).toBe(false);
    expect(samePath(null, "C:\\a.strudel")).toBe(false);
  });
});

describe("isCodeFile", () => {
  it("accepts .strudel and .js in any case", () => {
    expect(isCodeFile("beat.strudel")).toBe(true);
    expect(isCodeFile("BEAT.JS")).toBe(true);
    expect(isCodeFile("kick.wav")).toBe(false);
    expect(isCodeFile("strudel")).toBe(false);
  });
});

describe("withDefaultExtension", () => {
  it("adds .strudel only when there is no extension", () => {
    expect(withDefaultExtension(" song ")).toBe("song.strudel");
    expect(withDefaultExtension("song.js")).toBe("song.js");
    expect(withDefaultExtension("notes.txt")).toBe("notes.txt");
  });
});

describe("windowTitle", () => {
  it("shows the file name and an unsaved marker", () => {
    expect(windowTitle("C:\\music\\acid.strudel", true)).toBe("● acid.strudel - Strudel Studio");
    expect(windowTitle("C:\\music\\acid.strudel", false)).toBe("acid.strudel - Strudel Studio");
    expect(windowTitle(null, false)).toBe("Untitled - Strudel Studio");
  });
});
