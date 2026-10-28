import { describe, expect, it } from "vitest";
import {
  baseName,
  dirName,
  isAudioFile,
  isCodeFile,
  samePath,
  stem,
  windowTitle,
  withDefaultExtension,
} from "./paths";

describe("dirName", () => {
  it("drops the last part", () => {
    expect(dirName("C:\\music\\songs\\acid.strudel")).toBe("C:\\music\\songs");
    expect(dirName("C:/music/songs/")).toBe("C:/music");
  });

  it("keeps a drive root intact", () => {
    expect(dirName("C:\\acid.strudel")).toBe("C:\\");
  });
});

describe("stem", () => {
  it("drops only the last extension", () => {
    expect(stem("C:\\s\\kick.wav")).toBe("kick");
    expect(stem("C:\\s\\808.bd.WAV")).toBe("808.bd");
  });
});

describe("isAudioFile", () => {
  it("accepts what WebView2 decodes, in any case", () => {
    expect(isAudioFile("kick.WAV")).toBe(true);
    expect(isAudioFile("pad.flac")).toBe(true);
    expect(isAudioFile("pad.aif")).toBe(false);
    expect(isAudioFile("beat.strudel")).toBe(false);
  });
});

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
  it("shows the tab title and an unsaved marker", () => {
    expect(windowTitle("acid.strudel", true)).toBe("● acid.strudel - Strudel Studio");
    expect(windowTitle("Untitled-1", false)).toBe("Untitled-1 - Strudel Studio");
  });

  it("shows only the app name with no editor open", () => {
    expect(windowTitle(null, false)).toBe("Strudel Studio");
  });
});
