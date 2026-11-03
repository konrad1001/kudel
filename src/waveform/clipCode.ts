import type { Span } from "./waveform";

// The line of code that plays a selection of a sample: s("name").begin(…).end(…).
// Strudel's begin and end are fractions of the file's length (0 to 1), not seconds.

// Decimals enough that the last digit is under a millisecond of this file: 4 for a
// few seconds, 6 for a few minutes.
export function fractionDecimals(duration: number): number {
  return Math.max(2, Math.ceil(Math.log10(Math.max(duration, 0.001) * 1000)));
}

// 0.25 → "0.25", not "0.2500".
function fraction(value: number, decimals: number): string {
  return String(Number(value.toFixed(decimals)));
}

// s("name"), with .begin(…) unless the selection starts at the start, and .end(…)
// unless it runs to the end.
export function clipCode(name: string, selection: Span | null, duration: number): string {
  let code = `s("${name}")`;
  if (!selection || duration <= 0) return code;
  const decimals = fractionDecimals(duration);
  const begin = fraction(selection.start / duration, decimals);
  const end = fraction(selection.end / duration, decimals);
  if (begin !== "0") code += `.begin(${begin})`;
  if (end !== "1") code += `.end(${end})`;
  return code;
}
