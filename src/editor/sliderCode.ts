import { formatNumber, numberAt } from "./scrubNumber";

// Turning a number into Strudel's slider(value, min, max[, step]) and back. Strudel's
// transpiler only makes a slider of slider() with a literal first argument, outside
// strings, and evaluation then draws the widget beside it.

export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

export interface SliderRange {
  min: number;
  max: number;
  // Only for whole numbers, which a slider would otherwise make fractional.
  step?: number;
}

// 1, 2 or 5 times a power of ten, at least `n`.
function niceCeil(n: number): number {
  const power = 10 ** Math.floor(Math.log10(n));
  return [1, 2, 5, 10].map((m) => m * power).find((nice) => nice >= n - 1e-9)!;
}

// A range around `value` with room to move both ways: 0–1 for amounts like gain or pan,
// otherwise up to a round number at least twice the value (from 0, or symmetric around
// it for negatives). Whole numbers below 100 step by 1.
export function sliderRange(value: number, decimals: number): SliderRange {
  if (value >= 0 && value <= 1 && decimals > 0) return { min: 0, max: 1 };
  if (value >= -1 && value < 0) return { min: -1, max: 1 };
  const max = value === 0 ? 1 : niceCeil(Math.abs(value) * 2);
  const range: SliderRange = { min: value < 0 ? -max : 0, max };
  if (decimals === 0 && Math.abs(value) < 100) range.step = 1;
  return range;
}

// slider( value , anything else ) with a plain number first, as the transpiler needs.
const SLIDER_CALL = /\bslider\(\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*(?:,[^()]*)?\)/g;

// The edits that toggle a slider at `pos` in `line` (offsets within the line): unwrap
// the slider() call around `pos` back to its current value, or wrap the number at
// `pos`. Null when there's neither, or the number is in a string (mini-notation),
// where slider() can't go.
export function toggleSlider(line: string, pos: number, inString: (offset: number) => boolean): TextChange[] | null {
  for (const match of line.matchAll(SLIDER_CALL)) {
    const from = match.index;
    const to = from + match[0].length;
    if (pos >= from && pos <= to) return [{ from, to, insert: match[1] }];
  }
  const found = numberAt(line, pos);
  if (!found || inString(found.from)) return null;
  const { min, max, step } = sliderRange(found.value, found.decimals);
  const bounds = [min, max, ...(step === undefined ? [] : [step])].map((n) => formatNumber(n, 0)).join(", ");
  return [
    { from: found.from, to: found.from, insert: "slider(" },
    { from: found.to, to: found.to, insert: `, ${bounds})` },
  ];
}
