// Where in the code an evaluation error points, when it says. Syntax errors come from
// acorn, which the transpiler runs over the document's text unchanged, so their
// position is the document's: `loc` on the error, and "(line:column)" in the message.

export interface ErrorPosition {
  // 1-based.
  line: number;
  // 0-based, as acorn counts.
  column: number;
}

export function errorPosition(err: unknown): ErrorPosition | null {
  if (!err || typeof err !== "object") return null;
  const loc = (err as { loc?: unknown }).loc;
  if (loc && typeof loc === "object") {
    const { line, column } = loc as Record<string, unknown>;
    if (typeof line === "number" && typeof column === "number") return { line, column };
  }
  const message = (err as { message?: unknown }).message;
  const match = typeof message === "string" ? /\((\d+):(\d+)\)\s*$/.exec(message) : null;
  return match ? { line: Number(match[1]), column: Number(match[2]) } : null;
}

// Sample loads Strudel reports through its logger: started, not yet finished. A load
// that fails never reports, so entries older than LOAD_TIMEOUT_MS no longer count.
export const LOAD_TIMEOUT_MS = 30_000;

export function loadsInProgress(started: Map<string, number>, now: number): number {
  let count = 0;
  for (const [url, at] of started) {
    if (now - at > LOAD_TIMEOUT_MS) started.delete(url);
    else count++;
  }
  return count;
}
