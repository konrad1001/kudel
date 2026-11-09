// How a patch's object is laid out in code: one line per category, in this order, each
// holding its controls in this order. Used when the whole object is written (patchCode,
// tidy) and when a control is added to one in the code (it joins its category's line,
// or starts that line in the right place). Pure.
//
//   const pad = {
//     s: 'wt_basic_shapes', wt: 0.69, unison: 4, detune: 0.4, spread: 1,   osc
//     cutoff: 326, resonance: 0,                                          filter
//     lpenv: 0.55, lpattack: 0.003, lpdecay: 0.251, lpsustain: 0.7, …     filter mod
//     attack: 0.562, decay: 0.238, sustain: 1, release: 3.026,            amp
//     room: 0.25, roomsize: 2, roomlp: 8000,                              reverb
//   }

export const CODE_LINES: string[][] = [
  ["s", "n", "wt", "warp", "warpmode", "pw", "unison", "detune", "spread", "noise", "partials"],
  ["fmi", "fmh", "fmattack", "fmdecay", "fmsustain", "fmrelease", "fmenv"],
  ["ftype", "cutoff", "resonance", "hcutoff", "hresonance", "drive"],
  ["lpenv", "lpattack", "lpdecay", "lpsustain", "lprelease", "lprate", "lpsync", "lpdepth", "lpshape", "lpskew"],
  ["attack", "decay", "sustain", "release"],
  ["tremolo", "tremolosync", "tremolodepth", "tremoloshape", "tremoloskew"],
  ["penv", "pattack", "pdecay", "prelease", "vib", "vibmod"],
  ["wtenv", "wtattack", "wtdecay", "wtsustain", "wtrelease", "wtrate", "wtsync", "wtdepth", "wtshape", "wtskew"],
  ["warpenv", "warpattack", "warpdecay", "warpsustain", "warprelease", "warprate", "warpsync", "warpdepth", "warpshape", "warpskew"],
  ["pwrate", "pwsweep"],
  ["delay", "delaysync", "delayfeedback"],
  ["room", "roomsize", "roomlp"],
  ["phaserrate", "phaserdepth", "phasersweep"],
  ["gain", "pan"],
];

const LINE_OF = new Map(CODE_LINES.flatMap((keys, line) => keys.map((key) => [key, line] as const)));
const ORDER_OF = new Map(CODE_LINES.flat().map((key, i) => [key, i] as const));

// The line a control goes on. Keys the panel doesn't know go on a line after all of
// them, as they were written.
export function lineOf(key: string): number {
  return LINE_OF.get(key) ?? CODE_LINES.length;
}

// A key's line and its place on it, for writing into an object in the code. Unknown keys
// all share the last line, after every known one.
export function placeOf(key: string): [line: number, order: number] {
  return [lineOf(key), ORDER_OF.get(key) ?? Number.MAX_SAFE_INTEGER];
}

export const UNKNOWN_LINE = CODE_LINES.length;

// Sorts keys into lines and the order within them; unknown keys keep their order, last.
export function byLine<T>(items: T[], keyOf: (item: T) => string): T[][] {
  const lines: T[][] = Array.from({ length: CODE_LINES.length + 1 }, () => []);
  for (const item of items) lines[lineOf(keyOf(item))].push(item);
  for (const line of lines.slice(0, -1)) line.sort((a, b) => ORDER_OF.get(keyOf(a))! - ORDER_OF.get(keyOf(b))!);
  return lines.filter((line) => line.length > 0);
}
