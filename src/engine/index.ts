import { StrudelMirror } from "@strudel/codemirror";

let mirror: StrudelMirror | undefined;
let container: HTMLDivElement | undefined;

export interface InitOptions {
  initialCode: string;
}

// Creates the editor and scheduler once. Later calls are no-ops, because React
// StrictMode runs effects twice in dev and StrudelMirror has no real teardown.
export function init({ initialCode }: InitOptions): void {
  if (mirror) return;
  container = document.createElement("div");
  container.className = "strudel-root";
  mirror = new StrudelMirror({
    root: container,
    initialCode: import.meta.hot?.data.code ?? initialCode,
    prebake: async () => {},
  });
}

// Places the editor inside `parent`; the returned function takes it out again.
export function attach(parent: HTMLElement): () => void {
  if (!container) throw new Error("engine.attach called before engine.init");
  const el = container;
  parent.appendChild(el);
  return () => el.remove();
}

export async function evaluate(): Promise<void> {
  await mirror?.evaluate();
}

export async function stop(): Promise<void> {
  await mirror?.stop();
}

export function getCode(): string {
  return mirror?.code ?? "";
}

// Editing this module in dev re-runs it: silence the old instance so two
// schedulers never play at once, and carry the code over to the new one.
if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.code = mirror?.code;
    mirror?.stop();
    mirror?.clear();
    container?.remove();
  });
}
