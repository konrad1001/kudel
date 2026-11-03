import { describe, expect, it } from "vitest";
import { shortcutFromEvent } from "./keys";

const press = (key: string, mods: { ctrl?: boolean; alt?: boolean; shift?: boolean } = {}) =>
  shortcutFromEvent({
    key,
    ctrlKey: mods.ctrl ?? false,
    altKey: mods.alt ?? false,
    shiftKey: mods.shift ?? false,
  });

describe("shortcutFromEvent", () => {
  it("upper-cases letters", () => {
    expect(press("s", { ctrl: true })).toBe("Ctrl+S");
  });

  it("orders modifiers Ctrl, Alt, Shift", () => {
    expect(press("S", { shift: true, ctrl: true })).toBe("Ctrl+Shift+S");
    expect(press("o", { alt: true, ctrl: true, shift: true })).toBe("Ctrl+Alt+Shift+O");
  });

  it("keeps named keys", () => {
    expect(press("Enter", { ctrl: true })).toBe("Ctrl+Enter");
    expect(press("Escape")).toBe("Escape");
  });

  it("names the space bar", () => {
    expect(press(" ")).toBe("Space");
    expect(press(" ", { shift: true })).toBe("Shift+Space");
  });
});
