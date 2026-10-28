import { describe, expect, it } from "vitest";
import { decodeFile, encodeFile } from "./text";

describe("decodeFile", () => {
  it("keeps LF files as they are", () => {
    expect(decodeFile('s("bd")\nnote("c")\n')).toEqual({
      code: 's("bd")\nnote("c")\n',
      lineEnding: "\n",
    });
  });

  it("normalises CRLF and remembers it", () => {
    expect(decodeFile("a\r\nb\r\n")).toEqual({ code: "a\nb\n", lineEnding: "\r\n" });
  });

  it("drops a UTF-8 byte order mark", () => {
    expect(decodeFile("﻿a\nb").code).toBe("a\nb");
  });

  it("treats a file without line breaks as LF", () => {
    expect(decodeFile('s("bd")').lineEnding).toBe("\n");
  });
});

describe("encodeFile", () => {
  it("writes LF unchanged", () => {
    expect(encodeFile("a\nb\n", "\n")).toBe("a\nb\n");
  });

  it("restores CRLF", () => {
    expect(encodeFile("a\nb\n", "\r\n")).toBe("a\r\nb\r\n");
  });

  it("round-trips a CRLF file", () => {
    const raw = "a\r\n\r\nb";
    const { code, lineEnding } = decodeFile(raw);
    expect(encodeFile(code, lineEnding)).toBe(raw);
  });
});
