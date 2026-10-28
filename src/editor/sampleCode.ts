// Pure code rewrites for dropping a sample into the editor. Positions refer to the
// code before any of the changes, as CodeMirror expects for one transaction.

export interface CodeChange {
  from: number;
  insert: string;
}

export interface SampleInsert {
  // The path written in samples('...'), e.g. "./samples".
  samplesPath: string;
  // The sound to write at `pos`, or null to add only the samples() line.
  name: string | null;
  pos: number;
  // Whether `pos` is inside a string literal (then the bare name goes in, not s("...")).
  inString: boolean;
}

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function hasSamplesCall(code: string, samplesPath: string): boolean {
  const path = escapeRegExp(samplesPath);
  return new RegExp(`samples\\(\\s*(['"\`])${path}\\1\\s*\\)`).test(code);
}

// Where a new samples() line goes: after the last samples() line at the top of the
// file, else before the first line of code (after a leading comment block).
export function samplesLinePosition(code: string): number {
  let offset = 0;
  let afterSamples: number | null = null;
  let firstCode: number | null = null;
  for (const line of code.split("\n")) {
    const text = line.trim();
    const end = offset + line.length;
    if (/^(await\s+)?samples\(/.test(text)) {
      afterSamples = Math.min(end + 1, code.length);
    } else if (text !== "" && !text.startsWith("//")) {
      firstCode = offset;
      break;
    }
    offset = end + 1;
  }
  return afterSamples ?? firstCode ?? code.length;
}

// The changes for a drop: a samples('...') line unless one with that path is there,
// and the sound name at `pos`. `cursor` (in the original code) ends up after the name.
export function sampleInsertChanges(
  code: string,
  { samplesPath, name, pos, inString }: SampleInsert,
): { changes: CodeChange[]; cursor: number } {
  const changes: CodeChange[] = [];
  if (!hasSamplesCall(code, samplesPath)) {
    const at = samplesLinePosition(code);
    // At the very end of code that doesn't end in a newline, start a new line first.
    const before =
      at === code.length && code !== "" && !code.endsWith("\n") ? "\n" : "";
    changes.push({
      from: at,
      insert: `${before}samples('${samplesPath}')\n\n`,
    });
  }
  if (name !== null) {
    let text = inString ? name : `s("${name}")`;
    if (inString) {
      // Keep the name its own step inside a pattern like "bd sd".
      if (/\w/.test(code[pos - 1] ?? "")) text = ` ${text}`;
      if (/\w/.test(code[pos] ?? "")) text = `${text} `;
    } else if (/^[ \t]*(\n|$)/.test(code.slice(pos))) {
      // Dropped at the end of a line: finish the line, ready for the next.
      text = `${text}\n`;
    }
    changes.push({ from: pos, insert: text });
  }
  return { changes, cursor: pos };
}
