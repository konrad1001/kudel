import { identifierFor } from "../synth/patch";

// The Drums view's model: a 16-step grid, one row per sound, written into code as one
// s("…") pattern per row, stacked. Pure, so it's tested without audio.

export const STEPS = 16;

export interface DrumRow {
  // A sound as s("…") takes it: "bd", or "bd:3" for its fourth sample.
  sound: string;
  steps: boolean[];
}

export interface Loop {
  name: string;
  // A drum machine's bank, as .bank("…") takes it, or "" for none.
  bank: string;
  rows: DrumRow[];
}

// Not "beat" or "loop": those are Strudel functions the const would hide.
export const DEFAULT_NAME = "drums";
export const DEFAULT_SOUNDS = ["bd", "sd", "cp", "hh", "oh", "rim", "lt", "ht"];

export const emptySteps = (): boolean[] => new Array<boolean>(STEPS).fill(false);

export function defaultLoop(name = DEFAULT_NAME): Loop {
  return { name, bank: "", rows: DEFAULT_SOUNDS.map((sound) => ({ sound, steps: emptySteps() })) };
}

// A name that's one step of mini-notation: letters, digits and _, optionally :n.
export function isSoundName(sound: string): boolean {
  return /^[A-Za-z0-9_]+(:\d+)?$/.test(sound);
}

// One row as mini-notation: a sound on its steps and ~ between, shortened when it
// repeats ("bd ~ ~ ~" four times is "[bd ~ ~ ~]*4", every step is "hh*16"). Null for a
// row with no steps on.
export function rowMini(row: DrumRow): string | null {
  if (!row.steps.some(Boolean)) return null;
  const tokens = row.steps.map((on) => (on ? row.sound : "~"));
  for (const period of [1, 2, 4, 8]) {
    if (tokens.length % period !== 0) continue;
    if (!tokens.every((token, i) => token === tokens[i % period])) continue;
    const repeats = tokens.length / period;
    return period === 1 ? `${tokens[0]}*${repeats}` : `[${tokens.slice(0, period).join(" ")}]*${repeats}`;
  }
  return tokens.join(" ");
}

// A row read back from mini-notation (code → panel), or null if the grid can't show it.
// It takes what rowMini writes, and simple rows like it: one sound and rests (~ or -),
// as 1, 2, 4, 8 or 16 steps, optionally a [group] or step repeated with *n, stretched
// onto 16 steps ("bd*4" is a kick on every beat). Anything else (several sounds,
// <alternation>, nested groups, other lengths) is null.
export function parseRowMini(mini: string): DrumRow | null {
  const text = mini.trim();
  const repeat = /^(\[([^[\]]*)\]|[^\s[\]*]+)\*(\d+)$/.exec(text);
  const tokens = repeat
    ? Array.from({ length: Number(repeat[3]) }, () => (repeat[2] ?? repeat[1]).trim().split(/\s+/)).flat()
    : text.split(/\s+/);
  if (![1, 2, 4, 8, 16].includes(tokens.length)) return null;
  const sounds = new Set(tokens.filter((token) => token !== "~" && token !== "-"));
  if (sounds.size !== 1) return null;
  const [sound] = sounds;
  if (!isSoundName(sound)) return null;
  const stride = STEPS / tokens.length;
  const steps = emptySteps();
  tokens.forEach((token, i) => {
    if (token === sound) steps[i * stride] = true;
  });
  return { sound, steps };
}

// The loop's code: a const pattern, one s("…") per row that has steps on, played as it
// is ($: beat) or stacked with other patterns.
//
//   const beat = stack(
//     s("[bd ~ ~ ~]*4"),
//     s("[~ ~ ~ ~ sd ~ ~ ~]*2"),
//     s("hh*16"),
//   ).bank("rolandtr909")
export function loopCode(loop: Loop): string {
  const rows = loop.rows.filter((row) => isSoundName(row.sound)).flatMap((row) => rowMini(row) ?? []);
  const bank = loop.bank ? `.bank("${loop.bank}")` : "";
  const name = identifierFor(loop.name);
  if (rows.length === 0) return `const ${name} = silence\n`;
  if (rows.length === 1) return `const ${name} = s("${rows[0]}")${bank}\n`;
  return `const ${name} = stack(\n${rows.map((row) => `  s("${row}"),`).join("\n")}\n)${bank}\n`;
}

// What one step of a row plays, as a hap's value: "bd:3" is s "bd", n 3, as
// mini-notation splits it, and the bank goes along for superdough to prepend.
export function stepValue(sound: string, bank: string): Record<string, string | number> {
  const [s, n] = sound.split(":");
  return { s, ...(n !== undefined && { n: Number(n) }), ...(bank && { bank }) };
}

// The sounds a row's step plays at `step`, for the preview.
export function valuesAt(loop: Loop, step: number): Record<string, string | number>[] {
  return loop.rows.filter((row) => row.steps[step] && isSoundName(row.sound)).map((row) => stepValue(row.sound, loop.bank));
}

// The drum machine banks among the loaded sounds: what comes before "_" in the names of
// those tagged drum-machines ("rolandtr909_bd" → "rolandtr909"), each once, sorted.
export function drumBanks(sounds: { name: string; tag?: string }[]): string[] {
  const banks = new Set<string>();
  for (const sound of sounds) {
    const at = sound.name.indexOf("_");
    if (sound.tag === "drum-machines" && at > 0) banks.add(sound.name.slice(0, at));
  }
  return [...banks].sort();
}

// Whether a row's sound exists in the bank (or, without one, by itself), so the view can
// mark rows that would play nothing.
export function soundExists(names: Set<string>, sound: string, bank: string): boolean {
  const s = sound.split(":")[0].toLowerCase();
  return names.has(bank ? `${bank.toLowerCase()}_${s}` : s);
}

// ---------------------------------------------------------------- saved file

function parseRow(raw: unknown): DrumRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.sound !== "string" || !r.sound.trim()) return null;
  const steps = Array.isArray(r.steps) ? r.steps : [];
  return { sound: r.sound.trim(), steps: Array.from({ length: STEPS }, (_, i) => steps[i] === true) };
}

export function parseLoop(raw: unknown): Loop | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== "string" || !r.name.trim()) return null;
  const rows = (Array.isArray(r.rows) ? r.rows : []).flatMap((row) => parseRow(row) ?? []);
  return { name: r.name, bank: typeof r.bank === "string" ? r.bank : "", rows };
}

// What drums.json in the app data folder holds: the loop being edited and the saved
// ones, by name (a later one with the same name wins).
export interface DrumFile {
  current: Loop;
  saved: Loop[];
}

export function parseDrumFile(text: string | null): DrumFile {
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = text ? JSON.parse(text) : {};
    if (parsed && typeof parsed === "object") raw = parsed as Record<string, unknown>;
  } catch {
    // A broken file starts over, like a missing one.
  }
  const saved = new Map<string, Loop>();
  for (const item of Array.isArray(raw.saved) ? raw.saved : []) {
    const loop = parseLoop(item);
    if (loop) saved.set(loop.name, loop);
  }
  return { current: parseLoop(raw.current) ?? defaultLoop(), saved: [...saved.values()] };
}

export function serializeDrumFile(file: DrumFile): string {
  return JSON.stringify({ version: 1, ...file }, null, 2);
}

export const copyLoop = (loop: Loop): Loop => ({ ...loop, rows: loop.rows.map((row) => ({ ...row, steps: [...row.steps] })) });

// Adds a loop to the saved list, replacing one of the same name in place.
export function saveLoop(saved: Loop[], loop: Loop): Loop[] {
  const at = saved.findIndex((l) => l.name === loop.name);
  if (at === -1) return [...saved, copyLoop(loop)];
  return saved.map((l, i) => (i === at ? copyLoop(loop) : l));
}

