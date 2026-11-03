import { describe, expect, it } from "vitest";
import {
  baseName,
  dirName,
  isAudioFile,
  isCodeFile,
  isWithin,
  movedPath,
  relativePath,
  renameSelection,
  samePath,
  stem,
  windowTitle,
  withDefaultExtension,
} from "./paths";

describe("isWithin", () => {
  it("is true for the folder itself and anything inside it, in any case", () => {
    expect(isWithin("C:\\set\\drums", "C:\\set\\drums")).toBe(true);
    expect(isWithin("C:\\Set\\drums\\kick.wav", "c:\\set\\drums\\")).toBe(true);
    expect(isWithin("C:/set/drums/a/b.wav", "C:\\set\\drums")).toBe(true);
  });

  it("is false for a sibling that only starts with the same letters", () => {
    expect(isWithin("C:\\set\\drums2\\kick.wav", "C:\\set\\drums")).toBe(false);
    expect(isWithin(null, "C:\\set")).toBe(false);
  });
});

describe("movedPath", () => {
  it("moves the renamed path itself", () => {
    expect(movedPath("C:\\set\\a.strudel", "c:\\set\\A.strudel", "C:\\set\\b.strudel")).toBe("C:\\set\\b.strudel");
  });

  it("moves what was inside a renamed folder, keeping the rest", () => {
    expect(movedPath("C:\\set\\drums\\Kick.wav", "C:\\set\\drums", "C:\\set\\perc")).toBe("C:\\set\\perc\\Kick.wav");
  });

  it("leaves everything else alone", () => {
    expect(movedPath("C:\\set\\drums2\\kick.wav", "C:\\set\\drums", "C:\\set\\perc")).toBe(
      "C:\\set\\drums2\\kick.wav",
    );
  });
});

describe("renameSelection", () => {
  it("selects a file's name up to its extension", () => {
    expect(renameSelection("acid.strudel", false)).toEqual([0, 4]);
    expect(renameSelection("808.bd.wav", false)).toEqual([0, 6]);
  });

  it("selects all of a folder, or a name without an extension", () => {
    expect(renameSelection("drums.old", true)).toEqual([0, 9]);
    expect(renameSelection("README", false)).toEqual([0, 6]);
    expect(renameSelection(".env", false)).toEqual([0, 4]);
  });
});

describe("dirName", () => {
  it("drops the last part", () => {
    expect(dirName("C:\\music\\songs\\acid.strudel")).toBe("C:\\music\\songs");
    expect(dirName("C:/music/songs/")).toBe("C:/music");
  });

  it("keeps a drive root intact", () => {
    expect(dirName("C:\\acid.strudel")).toBe("C:\\");
  });
});

describe("relativePath", () => {
  it("goes down into subfolders", () => {
    expect(relativePath("C:\\set", "C:\\set\\samples\\drums")).toBe("./samples/drums");
  });

  it("goes up and across, ignoring case", () => {
    expect(relativePath("C:\\Set\\songs", "c:\\set\\samples")).toBe("../samples");
    expect(relativePath("C:\\set\\a\\b", "C:\\lib")).toBe("../../../lib");
  });

  it("names the folder itself ./", () => {
    expect(relativePath("C:\\set\\", "C:\\set")).toBe("./");
  });

  it("gives up across drives", () => {
    expect(relativePath("C:\\set", "D:\\samples")).toBe(null);
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
