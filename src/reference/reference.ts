// The Strudel API reference (docs/strudel-api.json, made by `npm run docs:strudel`):
// searching it, finding an entry by name, and reading its descriptions' markup.

export interface ReferenceParam {
  name?: string;
  type?: string;
  description?: string;
}

export interface ReferenceEntry {
  name: string;
  synonyms: string[];
  kind: string;
  // The class it belongs to, e.g. "Pattern" for pattern methods.
  memberof?: string;
  package: string;
  // "node_modules/<package>/<file>:<line>".
  source: string;
  description: string;
  params: ReferenceParam[];
  returns: ReferenceParam[];
  examples: string[];
  deprecated?: string | boolean;
}

export interface ReferenceData {
  versions: Record<string, string>;
  entries: ReferenceEntry[];
}

// Where an entry comes from, as the reference's index groups them: "@strudel/core — signal".
export function groupOf(entry: ReferenceEntry): string {
  const file = entry.source.replace(/:\d+$/, "").split("/").pop() ?? "";
  return `${entry.package} — ${file.replace(/\.m?js$/, "")}`;
}

export function groupsOf(entries: ReferenceEntry[]): string[] {
  return [...new Set(entries.map(groupOf))];
}

// How well an entry matches a lowercased query; lower is better, null is no match.
// Its name, then its aliases: exact, then starting with the query, then containing it.
// Failing those, every word of the query appears in its text (description, parameters).
function rank(entry: ReferenceEntry, query: string, words: string[]): number | null {
  const name = entry.name.toLowerCase();
  const synonyms = entry.synonyms.map((s) => s.toLowerCase());
  if (name === query) return 0;
  if (synonyms.includes(query)) return 1;
  if (name.startsWith(query)) return 2;
  if (synonyms.some((s) => s.startsWith(query))) return 3;
  if (name.includes(query)) return 4;
  if (synonyms.some((s) => s.includes(query))) return 5;
  const text = [name, ...synonyms, entry.description, ...entry.params.map((p) => `${p.name} ${p.description}`)]
    .join(" ")
    .toLowerCase();
  return words.every((word) => text.includes(word)) ? 6 : null;
}

// The indexes of the entries matching `query` within `group` (null for every group),
// best first, then by name. An empty query lists them all by name.
export function searchReference(entries: ReferenceEntry[], query: string, group: string | null = null): number[] {
  const q = query.trim().toLowerCase();
  const words = q.split(/\s+/);
  const ranked: { index: number; rank: number }[] = [];
  entries.forEach((entry, index) => {
    if (group !== null && groupOf(entry) !== group) return;
    const r = q ? rank(entry, q, words) : 0;
    if (r !== null) ranked.push({ index, rank: r });
  });
  return ranked
    .sort((a, b) => a.rank - b.rank || entries[a.index].name.localeCompare(entries[b.index].name))
    .map(({ index }) => index);
}

// The entry a word in code refers to, by name or alias ("sound" finds s), ignoring a
// trailing "()". Its index, or null.
export function findEntry(entries: ReferenceEntry[], word: string): number | null {
  const w = word.trim().replace(/\(\)$/, "");
  if (!w) return null;
  const byName = entries.findIndex((entry) => entry.name === w);
  if (byName >= 0) return byName;
  const byAlias = entries.findIndex((entry) => entry.synonyms.includes(w));
  return byAlias >= 0 ? byAlias : null;
}

// Descriptions are jsdoc text with a little markdown: paragraphs split by blank lines,
// "- " list items, `code` and [links](url). Single line breaks are just wrapping.
export type Inline = { text: string } | { code: string } | { link: string; url: string };
export type Block = { paragraph: Inline[] } | { list: Inline[][] };

export function parseInline(text: string): Inline[] {
  const parts: Inline[] = [];
  const pattern = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    parts.push(match[1] !== undefined ? { code: match[1] } : { link: match[2], url: match[3] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

const unwrap = (lines: string[]) => lines.map((line) => line.trim()).join(" ");

export function parseDescription(description: string): Block[] {
  const blocks: Block[] = [];
  for (const chunk of description.split(/\n\s*\n/)) {
    const lines = chunk.split("\n").filter((line) => line.trim());
    if (!lines.length) continue;
    const isItem = (line: string) => /^\s*[-*] /.test(line);
    if (!lines.some(isItem)) {
      blocks.push({ paragraph: parseInline(unwrap(lines)) });
      continue;
    }
    // Lines before the first item are a paragraph; later unmarked lines continue an item.
    const lead: string[] = [];
    const items: string[][] = [];
    for (const line of lines) {
      if (isItem(line)) items.push([line.replace(/^\s*[-*] /, "")]);
      else if (items.length) items[items.length - 1].push(line);
      else lead.push(line);
    }
    if (lead.length) blocks.push({ paragraph: parseInline(unwrap(lead)) });
    const list = items.map((item) => parseInline(unwrap(item)));
    // Strudel writes a list with a blank line between items, so each is its own chunk:
    // join it onto the list just before it.
    const prev = blocks[blocks.length - 1];
    if (!lead.length && prev && "list" in prev) prev.list.push(...list);
    else blocks.push({ list });
  }
  return blocks;
}

// How the entry is called: "fast(factor)". Just the name when no parameters are
// documented, which includes many functions, so "()" would mislead. Fields of an
// options object ("config.rate") aren't arguments of their own.
export function signatureOf(entry: ReferenceEntry): string {
  const params = entry.params.map((p) => p.name).filter((name) => name && !name.includes("."));
  return params.length ? `${entry.name}(${params.join(", ")})` : entry.name;
}
