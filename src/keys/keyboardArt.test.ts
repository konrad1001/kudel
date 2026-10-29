import { describe, expect, it } from "vitest";
import { artText, keyboardArt } from "./keyboardArt";
import { KEY_LETTERS } from "./notes";

const letters = Object.fromEntries(KEY_LETTERS.map((letter, semitone) => [semitone, letter]));

describe("keyboardArt", () => {
  it("draws an octave and the next C with letters", () => {
    expect(artText(keyboardArt(13, letters))).toBe(
      [
        "┌───┬───┬─┬───┬───┬───┬───┬─┬───┬─┬───┬───┬─────┐",
        "│   │   │ │   │   │   │   │ │   │ │   │   │     │",
        "│   │   │ │   │   │   │   │ │   │ │   │   │     │",
        "│   │ W │ │ E │   │   │ T │ │ Y │ │ U │   │     │",
        "│   └─┬─┘ └─┬─┘   │   └─┬─┘ └─┬─┘ └─┬─┘   │     │",
        "│     │     │     │     │     │     │     │     │",
        "│  A  │  S  │  D  │  F  │  G  │  H  │  J  │  K  │",
        "└─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘",
      ].join("\n"),
    );
  });

  it("gives every key a face to click, and outlines none", () => {
    const art = keyboardArt(25);
    const keys = new Set(art.flat().map((run) => run.key));
    expect([...keys].filter((k) => k !== null).sort((a, b) => a! - b!)).toEqual(
      Array.from({ length: 25 }, (_, i) => i),
    );
    const outlines = art.flat().filter((run) => run.key === null);
    expect(outlines.every((run) => /^[─│┌┐└┘┬┴]+$/.test(run.text))).toBe(true);
  });

  it("marks letters apart from the face around them", () => {
    const row = keyboardArt(13, letters)[6];
    const a = row.find((run) => run.label && run.text === "A");
    expect(a).toEqual({ text: "A", key: 0, label: true });
  });
});
