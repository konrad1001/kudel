import type { EditorSettings } from "../engine";
import { TERMINAL_THEME } from "../editor/terminalTheme";

// Hard-coded for now; these become the defaults of the settings file once it exists.
export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  theme: TERMINAL_THEME,
  // Cascadia Mono ships with Windows Terminal
  fontFamily: '"Cascadia Mono", Consolas, monospace',
  fontSize: 12,
  keybindings: "codemirror",
  isLineNumbersDisplayed: true,
  isActiveLineHighlighted: true,
  isBracketMatchingEnabled: true,
  isBracketClosingEnabled: true,
  isPatternHighlightingEnabled: true,
  isFlashEnabled: true,
  isAutoCompletionEnabled: true,
  isTooltipEnabled: false,
  isLineWrappingEnabled: false,
  isTabIndentationEnabled: false,
  isMultiCursorEnabled: false,
};
