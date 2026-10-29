import { describe, expect, it } from "vitest";
import { bindingFor, keyFor, withKey, type KeyBinding } from "./keybindings";
import { evaluateWhen } from "./when";

describe("evaluateWhen", () => {
  const value = (key: string) => ({ previewing: true, inputFocus: false })[key] ?? false;

  it("holds with no clause", () => {
    expect(evaluateWhen(undefined, value)).toBe(true);
    expect(evaluateWhen("  ", value)).toBe(true);
  });

  it("needs every term, with ! negating", () => {
    expect(evaluateWhen("previewing && !inputFocus", value)).toBe(true);
    expect(evaluateWhen("previewing && inputFocus", value)).toBe(false);
    expect(evaluateWhen("!previewing", value)).toBe(false);
  });

  it("reads unknown keys as false", () => {
    expect(evaluateWhen("somethingElse", value)).toBe(false);
    expect(evaluateWhen("!somethingElse", value)).toBe(true);
  });
});

const bindings: KeyBinding[] = [
  { key: "Ctrl+S", command: "file.save" },
  { key: "Escape", command: "samples.stopPreview", when: "previewing" },
  { key: "Escape", command: "menu.close", when: "menuOpen" },
  { key: "Ctrl+S", command: "user.save" },
];

describe("bindingFor", () => {
  const only = (...keys: string[]) => (key: string) => keys.includes(key);

  it("lets a later binding for the same key win", () => {
    expect(bindingFor(bindings, "Ctrl+S", only())?.command).toBe("user.save");
  });

  it("skips bindings whose when clause fails", () => {
    expect(bindingFor(bindings, "Escape", only("previewing"))?.command).toBe("samples.stopPreview");
    expect(bindingFor(bindings, "Escape", only("previewing", "menuOpen"))?.command).toBe("menu.close");
    expect(bindingFor(bindings, "Escape", only())).toBe(undefined);
  });
});

describe("keyFor", () => {
  it("shows a command's last binding", () => {
    expect(keyFor(bindings, "menu.close")).toBe("Escape");
    expect(keyFor(bindings, "file.closeFolder")).toBe(undefined);
  });
});

describe("withKey", () => {
  it("adds the key in brackets when there is one", () => {
    expect(withKey("Stop", "Ctrl+.")).toBe("Stop (Ctrl+.)");
    expect(withKey("Close Folder", undefined)).toBe("Close Folder");
  });
});
