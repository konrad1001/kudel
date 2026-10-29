import { isBlackKey } from "./notes";

// The Keys view's keyboard, drawn as box-drawing text like ASCII art in a terminal.
// Every key is empty space inside an outline; black keys are shorter outlines inset
// over the line between two white keys.

// A stretch of one row. `key` is the semitone (from the lowest C) whose face the
// characters belong to, null for outlines; `label` marks a key's letter.
export interface ArtRun {
  text: string;
  key: number | null;
  label: boolean;
}

// Columns per white key, counting the outline on its left.
const WHITE_WIDTH = 6;
// How far a black key reaches either side of the outline it covers.
const BLACK_HALF = 2;
const BLACK_ROWS = 3;
// Rows of white key below the black keys.
const LOWER_ROWS = 2;

// Top outline, black key faces, their bottom outline, lower white faces, bottom outline.
const ROWS = 1 + BLACK_ROWS + 1 + LOWER_ROWS + 1;

interface Cell {
  ch: string;
  key: number | null;
  label: boolean;
}

// `keyCount` keys from C up, ending on a white key; `labels` puts a letter on keys
// by semitone.
export function keyboardArt(keyCount: number, labels: Record<number, string> = {}): ArtRun[][] {
  const whites: number[] = [];
  for (let s = 0; s < keyCount; s++) if (!isBlackKey(s)) whites.push(s);
  const width = whites.length * WHITE_WIDTH + 1;
  const last = ROWS - 1;
  const grid: Cell[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: width }, () => ({ ch: " ", key: null, label: false })),
  );
  const put = (row: number, col: number, ch: string, key: number | null = null) => {
    grid[row][col] = { ch, key, label: false };
  };

  // White keys and the outlines between them.
  whites.forEach((s, w) => {
    const left = w * WHITE_WIDTH;
    for (let row = 1; row < last; row++) {
      for (let col = left + 1; col < left + WHITE_WIDTH; col++) put(row, col, " ", s);
    }
  });
  for (let col = 0; col < width; col++) {
    const edge = col % WHITE_WIDTH === 0;
    const first = col === 0;
    const end = col === width - 1;
    put(0, col, !edge ? "─" : first ? "┌" : end ? "┐" : "┬");
    put(last, col, !edge ? "─" : first ? "└" : end ? "┘" : "┴");
    if (edge) for (let row = 1; row < last; row++) put(row, col, "│");
  }

  // Black keys, each over the outline left of the white key above it.
  const blackCentre = (s: number) => whites.indexOf(s + 1) * WHITE_WIDTH;
  for (let s = 0; s < keyCount; s++) {
    if (!isBlackKey(s)) continue;
    const c = blackCentre(s);
    const left = c - BLACK_HALF;
    const right = c + BLACK_HALF;
    put(0, left, "┬");
    put(0, c, "─");
    put(0, right, "┬");
    for (let row = 1; row <= BLACK_ROWS; row++) {
      put(row, left, "│");
      put(row, right, "│");
      for (let col = left + 1; col < right; col++) put(row, col, " ", s);
    }
    const bottom = BLACK_ROWS + 1;
    put(bottom, left, "└");
    put(bottom, right, "┘");
    for (let col = left + 1; col < right; col++) put(bottom, col, col === c ? "┬" : "─");
  }

  // Letters, centred low on each key's face.
  for (const [semitone, text] of Object.entries(labels)) {
    const s = Number(semitone);
    if (s < 0 || s >= keyCount) continue;
    const black = isBlackKey(s);
    const row = black ? BLACK_ROWS : last - 1;
    const col = black ? blackCentre(s) : whites.indexOf(s) * WHITE_WIDTH + WHITE_WIDTH / 2;
    grid[row][col] = { ch: text, key: s, label: true };
  }

  return grid.map(toRuns);
}

function toRuns(cells: Cell[]): ArtRun[] {
  const runs: ArtRun[] = [];
  for (const { ch, key, label } of cells) {
    const prev = runs[runs.length - 1];
    if (prev && prev.key === key && prev.label === label && !label) prev.text += ch;
    else runs.push({ text: ch, key, label });
  }
  return runs;
}

// The drawing as plain text, for tests.
export function artText(art: ArtRun[][]): string {
  return art.map((row) => row.map((run) => run.text).join("")).join("\n");
}
