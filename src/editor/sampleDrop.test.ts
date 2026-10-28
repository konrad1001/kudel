import { javascript } from "@codemirror/lang-javascript";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { isInString } from "./sampleDrop";

const state = (doc: string) => EditorState.create({ doc, extensions: [javascript()] });

describe("isInString", () => {
  const code = 's("bd sd").fast(2) + `hh`';

  it("is true inside double-quoted and template strings", () => {
    expect(isInString(state(code), code.indexOf("sd"))).toBe(true);
    expect(isInString(state(code), code.indexOf("hh"))).toBe(true);
  });

  it("is false outside strings and on their quotes", () => {
    expect(isInString(state(code), code.indexOf("fast"))).toBe(false);
    expect(isInString(state(code), code.indexOf('"'))).toBe(false);
    expect(isInString(state(code), code.length)).toBe(false);
  });
});
