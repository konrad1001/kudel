// Writes docs/strudel-api.json and docs/strudel-api.md: the Strudel function reference
// for the installed @strudel/* and superdough versions. Run after upgrading Strudel:
//   npm run docs:strudel
//
// @strudel/codemirror's bundle embeds Strudel's whole jsdoc output (it drives the
// hover tooltips and autocomplete) as one JSON.parse(`...`) string. We pull it out,
// keep only entries whose jsdoc comment appears verbatim in an installed package (which
// drops packages we don't install and anything stale), and point each at its installed
// file and line. @name tags in the installed source that the bundle lacks are listed too.
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const modules = join(root, 'node_modules');
const outDir = join(root, 'docs');
const BUNDLE = '@strudel/codemirror/dist/index.mjs';

function fail(message) {
  console.error(`strudel-docs: ${message}`);
  process.exit(1);
}

// ---- 1. Extract the jsdoc array from the bundle ----

function templateLiteralEnd(text, from) {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === '`') return i;
  }
  return -1;
}

function extractBundledDocs() {
  const bundle = readFileSync(join(modules, BUNDLE), 'utf8');
  const opener = 'JSON.parse(`';
  for (let at = bundle.indexOf(opener); at !== -1; at = bundle.indexOf(opener, at + 1)) {
    const start = at + opener.length;
    const end = templateLiteralEnd(bundle, start);
    if (end === -1) break;
    // Evaluating the literal applies exactly the escapes the bundler wrote.
    const text = new Function(`return \`${bundle.slice(start, end)}\`;`)();
    if (!text.includes('"longname"')) continue;
    const docs = JSON.parse(text);
    if (Array.isArray(docs) && docs.length > 100 && docs.every((d) => d.longname)) return docs;
  }
  fail(`no embedded jsdoc array found in ${BUNDLE}; the bundle format has changed. ` +
    'Fall back to running jsdoc over the installed sources.');
}

// ---- 2. Index the installed sources ----

function installedPackages() {
  const pkgs = new Map(); // short name ("core") -> { name, version, dir }
  const add = (name, dir) => {
    const { version } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    pkgs.set(basename(dir), { name, version, dir });
  };
  for (const short of readdirSync(join(modules, '@strudel'))) add(`@strudel/${short}`, join(modules, '@strudel', short));
  if (existsSync(join(modules, 'superdough'))) add('superdough', join(modules, 'superdough'));
  return pkgs;
}

function sourceFiles(dir) {
  const files = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (f === 'node_modules' || f === 'dist' || f === 'test') continue;
    if (statSync(p).isDirectory()) files.push(...sourceFiles(p));
    else if (/\.m?js$/.test(f)) files.push({ path: p, text: readFileSync(p, 'utf8') });
  }
  return files;
}

const lineAt = (text, index) => text.slice(0, index).split('\n').length;
const squash = (s) => s.replace(/\s+/g, ' ').trim();

// Where the entry's comment sits in the installed package, or null if it isn't there.
function locate(entry, files) {
  const candidates = files.filter((f) => basename(f.path) === entry.meta.filename);
  for (const f of candidates) {
    const i = f.text.indexOf(entry.comment);
    if (i !== -1) return { file: f, line: lineAt(f.text, i) };
  }
  const wanted = squash(entry.comment);
  for (const f of candidates) {
    for (const m of f.text.matchAll(/\/\*\*[\s\S]*?\*\//g)) {
      if (squash(m[0]) === wanted) return { file: f, line: lineAt(f.text, m.index) };
    }
  }
  return null;
}

// ---- 3. Normalise entries ----

const ENTITIES = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'" };
const decode = (s) => s.replace(/&(lt|gt|amp|quot|#39);/g, (e) => ENTITIES[e]);

// jsdoc's HTML (p, code, pre, ul/ol/li, strong, em, a) as Markdown.
function markdown(html = '') {
  return decode(
    html
      .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/g, (_, code) => `\n\`\`\`js\n${code.trim()}\n\`\`\`\n`)
      .replace(/<code>([\s\S]*?)<\/code>/g, '`$1`')
      .replace(/<\/?strong>/g, '**')
      .replace(/<\/?em>/g, '*')
      .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, '[$2]($1)')
      .replace(/<li>/g, '\n- ')
      .replace(/<\/li>|<\/?[uo]l>/g, '\n')
      .replace(/<p>/g, '\n\n')
      .replace(/<\/p>/g, '\n\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const types = (t) => t?.names?.join(' | ');

function normalise(entry, pkg, where) {
  return {
    name: entry.name,
    synonyms: entry.synonyms ?? [],
    kind: entry.kind,
    memberof: entry.memberof,
    package: pkg.name,
    source: `${relative(root, where.file.path).replaceAll('\\', '/')}:${where.line}`,
    description: markdown(entry.description),
    params: (entry.params ?? []).map((p) => ({
      name: p.name,
      type: types(p.type),
      description: markdown(p.description),
      ...(p.optional && { optional: true }),
      ...(p.defaultvalue !== undefined && { default: p.defaultvalue }),
    })),
    returns: (entry.returns ?? []).map((r) => ({ type: types(r.type), description: markdown(r.description) })),
    examples: entry.examples ?? [],
    ...(entry.deprecated && { deprecated: entry.deprecated === true ? true : markdown(entry.deprecated) }),
  };
}

// Internal classes (worklets, voices) and private helpers aren't part of the pattern API.
const isPublic = (e) =>
  e.kind !== 'package' && e.access !== 'private' && !e.name?.startsWith('_') && [undefined, 'Pattern', 'repl'].includes(e.memberof);

function build() {
  const bundled = extractBundledDocs();
  const pkgs = installedPackages();
  const files = new Map([...pkgs].map(([short, p]) => [short, sourceFiles(p.dir)]));

  const entries = [];
  const dropped = { notInstalled: new Set(), stale: [], internal: 0 };
  for (const e of bundled) {
    if (!isPublic(e)) { dropped.internal++; continue; }
    const short = e.meta?.path?.split(/[\\/]/).at(-1);
    const pkg = pkgs.get(short);
    if (!pkg) { dropped.notInstalled.add(short); continue; }
    const where = e.comment && locate(e, files.get(short));
    if (!where) { dropped.stale.push(`${e.name} (${short}/${e.meta.filename})`); continue; }
    entries.push(normalise(e, pkg, where));
  }

  // @name tags in the installed packages that the bundled reference doesn't have.
  const known = new Set(bundled.map((e) => e.name));
  const missing = [];
  for (const [short, list] of files) {
    for (const f of list) {
      for (const m of f.text.matchAll(/\/\*\*([\s\S]*?)\*\//g)) {
        const name = m[1].match(/@name\s+(\w+)/)?.[1];
        if (!name || known.has(name) || f.path.includes(`${join('codemirror', 'themes')}`)) continue;
        missing.push({
          name,
          package: pkgs.get(short).name,
          source: `${relative(root, f.path).replaceAll('\\', '/')}:${lineAt(f.text, m.index)}`,
          comment: m[1].split('\n').map((l) => l.replace(/^\s*\* ?/, '')).join('\n').trim(),
        });
      }
    }
  }

  const versions = Object.fromEntries([...pkgs.values()].map((p) => [p.name, p.version]).sort());
  return { versions, entries, missing, dropped };
}

// ---- 4. Write ----

const ORDER = ['@strudel/core', '@strudel/tonal', '@strudel/webaudio', 'superdough', '@strudel/draw', '@strudel/codemirror'];

function grouped(entries) {
  const groups = new Map();
  for (const e of entries) {
    const key = `${e.package} — ${e.source.split(':')[0].split('/').at(-1)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const rank = (key) => {
    const i = ORDER.indexOf(key.split(' — ')[0]);
    return i === -1 ? ORDER.length : i;
  };
  const line = (e) => Number(e.source.split(':')[1]);
  return [...groups]
    .sort(([a, x], [b, y]) => rank(a) - rank(b) || y.length - x.length)
    .map(([key, list]) => [key, list.sort((a, b) => line(a) - line(b))]);
}

function entryMarkdown(e) {
  const out = [`### ${e.name}`, ''];
  const meta = [];
  if (e.synonyms.length) meta.push(`Aliases: ${e.synonyms.map((s) => `\`${s}\``).join(', ')}`);
  if (e.memberof) meta.push(`Member of \`${e.memberof}\``);
  meta.push(`Source: \`${e.source}\``);
  out.push(meta.join(' · '), '');
  if (e.deprecated) out.push(`**Deprecated.** ${e.deprecated === true ? '' : e.deprecated}`.trim(), '');
  if (e.description) out.push(e.description, '');
  if (e.params.length) {
    out.push('Parameters:', '');
    for (const p of e.params) {
      const extra = [p.type, p.optional && 'optional', p.default !== undefined && `default ${p.default}`].filter(Boolean).join(', ');
      out.push(`- \`${p.name}\`${extra ? ` (${extra})` : ''}${p.description ? `: ${p.description.replace(/\n+/g, ' ')}` : ''}`);
    }
    out.push('');
  }
  for (const r of e.returns) out.push(`Returns${r.type ? ` \`${r.type}\`` : ''}${r.description ? `: ${r.description}` : ''}`, '');
  for (const ex of e.examples) out.push('```js', ex, '```', '');
  return out.join('\n');
}

function writeMarkdown({ versions, entries, missing }) {
  const groups = grouped(entries);
  const lines = [
    '# Strudel API reference',
    '',
    '<!-- Generated by `npm run docs:strudel` (scripts/strudel-docs.mjs). Do not edit by hand. -->',
    '',
    'The jsdoc reference for the installed Strudel packages, taken from the data that drives',
    "Strudel's own tooltips and autocomplete, and checked against the installed source. Every entry",
    'links to its comment in `node_modules`.',
    '',
    `Versions: ${Object.entries(versions).map(([n, v]) => `\`${n}@${v}\``).join(', ')}`,
    '',
    `${entries.length} entries. Mini-notation syntax is documented at https://strudel.cc/learn/mini-notation/, not here.`,
    '',
    '## Index',
    '',
  ];
  for (const [key, list] of groups) lines.push(`- **${key}**: ${list.map((e) => `\`${e.name}\``).join(', ')}`);
  if (missing.length) lines.push(`- **Not in the bundled reference**: ${missing.map((m) => `\`${m.name}\``).join(', ')}`);
  lines.push('');
  for (const [key, list] of groups) {
    lines.push(`## ${key}`, '');
    for (const e of list) lines.push(entryMarkdown(e));
  }
  if (missing.length) {
    lines.push('## Not in the bundled reference', '',
      "These have `@name` comments in the installed source but aren't in Strudel's generated reference.",
      'Their raw comments follow.', '');
    for (const m of missing) lines.push(`### ${m.name}`, '', `Source: \`${m.source}\``, '', '```', m.comment, '```', '');
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

const result = build();
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'strudel-api.json'),
  JSON.stringify({ generatedBy: 'npm run docs:strudel', versions: result.versions, entries: result.entries, missing: result.missing }, null, 2) + '\n');
writeFileSync(join(outDir, 'strudel-api.md'), writeMarkdown(result));

const { entries, missing, dropped } = result;
console.log(`strudel-docs: ${entries.length} entries, ${missing.length} only in source -> docs/strudel-api.{md,json}`);
console.log(`  skipped: ${dropped.internal} internal, packages not installed: ${[...dropped.notInstalled].join(', ') || 'none'}`);
if (dropped.stale.length) console.log(`  stale (comment not in installed source): ${dropped.stale.join(', ')}`);
