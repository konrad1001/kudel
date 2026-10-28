export type LineEnding = "\n" | "\r\n";

export interface DecodedFile {
  code: string;
  lineEnding: LineEnding;
}

// CodeMirror keeps text with "\n" only, so files are normalised on the way in and
// written back with the line ending they came with.
export function decodeFile(raw: string): DecodedFile {
  const text = raw.startsWith("﻿") ? raw.slice(1) : raw;
  return {
    code: text.replace(/\r\n?/g, "\n"),
    lineEnding: text.includes("\r\n") ? "\r\n" : "\n",
  };
}

export function encodeFile(code: string, lineEnding: LineEnding): string {
  return lineEnding === "\n" ? code : code.replace(/\n/g, lineEnding);
}
