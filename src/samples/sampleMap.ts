import { stem } from "../files/paths";

// Mirrors SampleFolder in src-tauri/src/commands/samples.rs.
export interface SampleFolder {
  path: string;
  folders: SoundFolder[];
  files: string[];
}

export interface SoundFolder {
  name: string;
  path: string;
  files: string[];
}

export interface Sound {
  name: string;
  // The folder (a sound with variants) or file (a one-shot) it was made from.
  source: string;
}

// The file or folder name as a sound name, changed only where mini-notation needs it,
// so s("female-vocal-chop") works for female-vocal-chop.wav. Lower case (superdough
// looks sounds up in lower case anyway), accents dropped; letters, digits, "-" and "_"
// are kept and anything else becomes "_". "." is not kept: mini-notation also reads
// it as a separator. Names that would read as a number get an "s" in front.
export function soundName(raw: string): string {
  const name = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^[-_]+|[-_]+$/g, "");
  if (name === "") return "sample";
  return /^\d+(e\d+)?$/.test(name) ? `s${name}` : name;
}

// Sound folders first, then loose files, as the scan lists them. A name that is
// already taken gets _2, _3, ... so every source keeps a sound of its own.
export function soundsInFolder(folder: SampleFolder): Sound[] {
  const taken = new Set<string>();
  const unique = (raw: string) => {
    const base = soundName(raw);
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base}_${n}`;
    taken.add(name);
    return name;
  };
  return [
    ...folder.folders.map((sound) => ({ name: unique(sound.name), source: sound.path })),
    ...folder.files.map((file) => ({ name: unique(stem(file)), source: file })),
  ];
}

// The sample map samples() expects: sound name to the URLs of its variants.
export function buildSampleMap(
  folder: SampleFolder,
  toUrl: (path: string) => string,
): Record<string, string[]> {
  const files = new Map<string, string[]>([
    ...folder.folders.map((sound): [string, string[]] => [sound.path, sound.files]),
    ...folder.files.map((file): [string, string[]] => [file, [file]]),
  ]);
  return Object.fromEntries(
    soundsInFolder(folder).map(({ name, source }) => [name, (files.get(source) ?? []).map(toUrl)]),
  );
}
