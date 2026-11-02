// Number scrubbing's text side: which number is under a position, what it becomes after
// some steps, and how it's written back. Pure, so the feel is tested without an editor.

export interface NumberLiteral {
  // Offsets into the text searched.
  from: number;
  to: number;
  text: string;
  value: number;
  // Digits after the point: 0 for 800, 2 for 0.25.
  decimals: number;
}

// Optional sign, then 12, 1.5 or .5.
const NUMBER = /-?(?:\d+(?:\.\d*)?|\.\d+)/g;

// The number at `pos` in `text` (a line), touching it from either side. Numbers in code
// (.lpf(800)) and in mini-notation ("bd*4 0.5") count; digits in names (tr909, bd2) and
// other literals (1e3, 0x1f, 4n) don't. A minus is the number's own only where it can't
// be subtraction: not after a name, a digit or a closing bracket.
export function numberAt(text: string, pos: number): NumberLiteral | null {
  for (const match of text.matchAll(NUMBER)) {
    let from = match.index;
    let raw = match[0];
    if (raw.startsWith("-") && from > 0 && /[\w$)\].]/.test(text[from - 1])) {
      from++;
      raw = raw.slice(1);
    }
    // "1." before a method call: the dot belongs to the call.
    if (raw.endsWith(".")) raw = raw.slice(0, -1);
    const to = from + raw.length;
    if (pos < from || pos > to) continue;
    const before = text[from - 1] ?? "";
    const after = text[to] ?? "";
    if (/[\w$.]/.test(before) && !raw.startsWith("-")) return null;
    if (/[\w$]/.test(after) || (after === "." && /\d/.test(text[to + 1] ?? ""))) return null;
    const point = raw.indexOf(".");
    return { from, to, text: raw, value: Number(raw), decimals: point < 0 ? 0 : raw.length - point - 1 };
  }
  return null;
}

// Pixels of dragging per step.
export const PX_PER_STEP = 6;
// Whole numbers from this size up (frequencies, mostly) scale in proportion instead.
export const PROPORTIONAL_FROM = 100;
// Steps per doubling, for those.
export const STEPS_PER_OCTAVE = 32;

// The number `steps` steps from `start` (fractional steps are fine), written in its own
// style. Steps are one unit of its last decimal place, or with `fine` one place
// finer. Whole numbers of PROPORTIONAL_FROM and up change in proportion, so a filter
// sweep moves as evenly at 4000 as at 400.
export function stepNumber(start: NumberLiteral, steps: number, fine = false): string {
  if (!fine && start.decimals === 0 && start.value >= PROPORTIONAL_FROM) {
    return formatNumber(Math.round(start.value * 2 ** (steps / STEPS_PER_OCTAVE)), 0, start.text);
  }
  const decimals = start.decimals + (fine ? 1 : 0);
  return formatNumber(start.value + Math.round(steps) * 10 ** -decimals, decimals, start.text);
}

// `value` to `decimals` places, without a "-0", and without a leading zero when the
// original had none (.5 stays .5).
export function formatNumber(value: number, decimals: number, like = ""): string {
  let text = value.toFixed(decimals);
  if (/^-0(\.0*)?$/.test(text)) text = text.slice(1);
  if (/^-?\./.test(like)) text = text.replace(/^(-?)0\./, "$1.");
  return text;
}
