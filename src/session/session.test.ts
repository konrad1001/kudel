import { describe, expect, it } from "vitest";
import {
  EMPTY_SESSION,
  parseSession,
  pushRecent,
  restoreTab,
  serializeSession,
  withoutPath,
  type Session,
  type SessionTab,
} from "./session";

const session: Session = {
  folder: "C:\\set",
  expanded: ["C:\\set", "C:\\set\\samples"],
  explorerVisible: false,
  explorerWidth: 300,
  tabs: [
    { filePath: "C:\\set\\a.strudel", untitled: null, lineEnding: "\r\n", code: null, selection: { anchor: 3, head: 5 } },
    { filePath: null, untitled: 2, lineEnding: "\n", code: 's("bd")', selection: { anchor: 7, head: 7 } },
  ],
  active: 1,
  recentFiles: ["C:\\set\\a.strudel"],
  recentFolders: ["C:\\set"],
};

describe("parseSession", () => {
  it("round-trips what serializeSession writes", () => {
    expect(parseSession(serializeSession(session))).toEqual(session);
  });

  it("gives an empty session for nothing, junk or another version", () => {
    expect(parseSession(null)).toEqual(EMPTY_SESSION);
    expect(parseSession("{not json")).toEqual(EMPTY_SESSION);
    expect(parseSession(JSON.stringify({ version: 99, folder: "C:\\x" }))).toEqual(EMPTY_SESSION);
  });

  it("keeps the usable parts of a damaged file", () => {
    const parsed = parseSession(
      JSON.stringify({
        version: 1,
        folder: 42,
        tabs: [{ filePath: "C:\\a.strudel" }, { nonsense: true }, "x"],
        active: 7,
        recentFiles: ["C:\\a.strudel", 3],
      }),
    );
    expect(parsed.folder).toBe(null);
    expect(parsed.tabs).toEqual([
      { filePath: "C:\\a.strudel", untitled: null, lineEnding: "\n", code: null, selection: { anchor: 0, head: 0 } },
    ]);
    expect(parsed.active).toBe(0);
    expect(parsed.recentFiles).toEqual(["C:\\a.strudel"]);
  });
});

describe("restoreTab", () => {
  const fileTab = (code: string | null): SessionTab => ({
    filePath: "C:\\a.strudel",
    untitled: null,
    lineEnding: "\n",
    code,
    selection: { anchor: 0, head: 0 },
  });
  const disk = { code: 'note("c")', lineEnding: "\r\n" as const };

  it("reopens a clean file from disk", () => {
    expect(restoreTab(fileTab(null), disk)).toEqual({ code: 'note("c")', savedCode: 'note("c")', lineEnding: "\r\n" });
  });

  it("brings back unsaved edits over the file, still dirty", () => {
    expect(restoreTab(fileTab('note("e")'), disk)).toEqual({ code: 'note("e")', savedCode: 'note("c")', lineEnding: "\r\n" });
  });

  it("keeps unsaved text for a file that is gone, and drops a clean one", () => {
    expect(restoreTab(fileTab('note("e")'), null)).toEqual({ code: 'note("e")', savedCode: "", lineEnding: "\n" });
    expect(restoreTab(fileTab(null), null)).toBe(null);
  });

  it("restores untitled text, and drops an empty untitled tab", () => {
    const untitled = { ...fileTab('s("bd")'), filePath: null, untitled: 1 };
    expect(restoreTab(untitled, null)).toEqual({ code: 's("bd")', savedCode: "", lineEnding: "\n" });
    expect(restoreTab({ ...untitled, code: "" }, null)).toBe(null);
  });
});

describe("pushRecent", () => {
  it("puts the path first, once, ignoring case", () => {
    expect(pushRecent(["C:\\b", "C:\\A"], "c:\\a")).toEqual(["c:\\a", "C:\\b"]);
  });

  it("caps the list", () => {
    expect(pushRecent(["1", "2", "3"], "4", 3)).toEqual(["4", "1", "2"]);
  });
});

describe("withoutPath", () => {
  it("removes a path in any case", () => {
    expect(withoutPath(["C:\\A", "C:\\b"], "c:\\a")).toEqual(["C:\\b"]);
  });
});
