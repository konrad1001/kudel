import { parser } from "@lezer/javascript";
import type { SyntaxNode } from "@lezer/common";

// Finding a `const name = base(…).method(…)…` in code: the call at its base (stack(…),
// s(…)), or a plain name (silence), and the methods chained after it, with the positions
// a write-back needs. Pure; what the calls mean is up to the caller (drums/drumCode.ts).

export interface PatternString {
  // The quotes included; the text between them is from + 1 to to - 1.
  from: number;
  to: number;
  value: string;
}

export interface PatternCall {
  name: string;
  from: number;
  to: number;
  // The positions of its ( and ).
  open: number;
  close: number;
  args: PatternArg[];
}

export interface PatternArg {
  from: number;
  to: number;
  string?: PatternString;
  call?: PatternCall;
}

export interface ChainedCall {
  name: string;
  // From the . before its name to the end of its arguments.
  from: number;
  to: number;
  args: PatternArg[];
}

export interface PatternDeclaration {
  base: { name: string; from: number; to: number; call: PatternCall | null };
  chain: ChainedCall[];
}

function argsOf(list: SyntaxNode | null, code: string): PatternArg[] {
  const args: PatternArg[] = [];
  for (let child = list?.firstChild; child; child = child.nextSibling) {
    if (child.name === "(" || child.name === ")" || child.name === ",") continue;
    const arg: PatternArg = { from: child.from, to: child.to };
    if (child.name === "String") arg.string = { from: child.from, to: child.to, value: code.slice(child.from + 1, child.to - 1) };
    const call = callOf(child, code);
    if (call) arg.call = call;
    args.push(arg);
  }
  return args;
}

// A call of a plain name, like s("bd") or stack(…); null for anything else.
function callOf(node: SyntaxNode, code: string): PatternCall | null {
  if (node.name !== "CallExpression") return null;
  const callee = node.firstChild;
  const list = node.getChild("ArgList");
  if (!callee || callee.name !== "VariableName" || !list) return null;
  return {
    name: code.slice(callee.from, callee.to),
    from: node.from,
    to: node.to,
    open: list.from,
    close: list.to - 1,
    args: argsOf(list, code),
  };
}

// The pattern assigned to `const name` (or let/var) at the top level of `code`, or null.
// A later declaration of the same name wins, as it would in the code.
export function findPattern(code: string, name: string): PatternDeclaration | null {
  const tree = parser.parse(code);
  let found: PatternDeclaration | null = null;
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.name !== "VariableDeclaration") continue;
    const definition = node.getChild("VariableDefinition");
    if (!definition || code.slice(definition.from, definition.to) !== name) continue;
    let value: SyntaxNode | null = node.getChild("Equals")?.nextSibling ?? null;
    if (!value) continue;
    // Walk down the chain: .bank(…) wraps stack(…), and so on.
    const chain: ChainedCall[] = [];
    while (value.name === "CallExpression" && value.firstChild?.name === "MemberExpression") {
      const member: SyntaxNode = value.firstChild;
      const property = member.getChild("PropertyName");
      const dot = member.getChild(".");
      if (!property || !dot || !member.firstChild) break;
      chain.unshift({ name: code.slice(property.from, property.to), from: dot.from, to: value.to, args: argsOf(value.getChild("ArgList"), code) });
      value = member.firstChild;
    }
    const call = callOf(value, code);
    const baseName = call?.name ?? (value.name === "VariableName" ? code.slice(value.from, value.to) : "");
    found = { base: { name: baseName, from: value.from, to: value.to, call }, chain };
  }
  return found;
}
