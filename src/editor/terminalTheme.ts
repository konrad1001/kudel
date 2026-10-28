import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { ThemeSettings } from "../engine";

export const TERMINAL_THEME = "studioTerminal";

// A dark terminal look, close to Windows Terminal's default colours.
const c = {
  background: "#0c0c0c",
  foreground: "#cccccc",
  dim: "#6b6b6b",
  gutter: "#3c3c3c",
  caret: "#f2f2f2",
  green: "#8fd16a",
  amber: "#e5c07b",
  blue: "#6cb6ff",
  magenta: "#c792ea",
  cyan: "#5fd7d7",
  red: "#f14c4c",
};

export const terminalThemeSettings: ThemeSettings = {
  background: c.background,
  foreground: c.foreground,
  caret: c.caret,
  selection: "#ffffff26",
  selectionMatch: "#ffffff14",
  lineHighlight: "#ffffff08",
  gutterBackground: "transparent",
  gutterForeground: c.gutter,
};

export const terminalTheme = [
  EditorView.theme(
    {
      "&": { color: c.foreground, backgroundColor: c.background },
      "&.cm-focused": { outline: "none" },
      ".cm-content": { caretColor: c.caret },
      ".cm-cursor, .cm-dropCursor": { borderLeft: `2px solid ${c.caret}` },
      ".cm-gutters": { backgroundColor: "transparent", color: c.gutter, border: "none" },
      ".cm-activeLine": { backgroundColor: terminalThemeSettings.lineHighlight },
      ".cm-activeLineGutter": { backgroundColor: "transparent", color: c.dim },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        background: `${terminalThemeSettings.selection} !important`,
      },
      ".cm-selectionMatch": { backgroundColor: terminalThemeSettings.selectionMatch },
      ".cm-matchingBracket": { color: c.caret, backgroundColor: "#ffffff1a", outline: "none" },
    },
    { dark: true },
  ),
  syntaxHighlighting(
    HighlightStyle.define([
      { tag: [t.string, t.special(t.string)], color: c.green },
      { tag: [t.number, t.bool, t.null, t.atom], color: c.amber },
      { tag: [t.function(t.variableName), t.function(t.propertyName)], color: c.blue },
      { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.definitionKeyword], color: c.magenta },
      { tag: [t.labelName, t.definition(t.variableName)], color: c.cyan },
      { tag: [t.propertyName, t.variableName], color: c.foreground },
      { tag: [t.operator, t.punctuation, t.bracket, t.separator], color: c.dim },
      { tag: [t.comment, t.meta], color: c.dim, fontStyle: "italic" },
      { tag: t.invalid, color: c.red },
    ]),
  ),
];
