# Roadmap: a smooth editor

Each leaves the app runnable and ends with a "Done when" check. The principles in `CLAUDE.md` apply throughout, especially _code is the source of truth_ and _only `src/engine/` imports `@strudel/_`\*.

---

## 1. Don't lose work

A reload, crash or closed window currently throws the code away. Fix that before anything else.

- [x] Set up vitest (`npx vitest run`) so the pure functions below are tested from the start.
- [x] First Rust commands in `src-tauri/src/commands/files.rs`: read and write a file, called from the front end through `invoke`.
- [x] **Autosave and restore:** save the buffer to the app data directory a few seconds after each edit and on close; reopen it, with the cursor position, on startup.
- [x] **Open / Save / Save As / New** with native dialogs (Ctrl+O, Ctrl+S, Ctrl+Shift+S, Ctrl+N). Pick a file extension (`.strudel` or `.js`).
- [x] **Explorer sidebar** (VS Code style): open a folder (Ctrl+Shift+O), browse it, click to open, New File, toggle with Ctrl+B.
- [x] **Tabs**: open files stay open in a tab bar (Ctrl+Tab / Ctrl+Shift+Tab, Ctrl+W, middle-click), each with its own undo history; a centred message when none is open; ▶ marks the tab that is playing.
- [x] **Recent files** list (and recent folders; reopen the last folder on startup).
- [x] **Window title** shows the file name and an unsaved-changes marker (`● name.strudel - Strudel Studio`).
- [ ] Ask before closing or opening another file over unsaved changes. (Opening another file asks; closing the window doesn't yet.)
- [x] Loading a file never evaluates it. (Superseded: each file opens in its own tab with a fresh undo history, rather than replacing the editor text as an undoable edit.)

**Done when:** killing the app mid-edit and restarting brings back the exact code and cursor position; files open and save through native dialogs; the title shows the file and whether it's dirty; `npx vitest run` passes.

---

## 2. ~~Your own samples~~

**Done when:** ~~a folder of `.wav` files next to a `.strudel` file is audible through `samples('./that-folder')` and `s("name")`; dragging a folder from the explorer writes that line into the code; clicking a sample previews it; nothing outside the open folder is reachable through the asset protocol; the sample-map and naming functions are tested.~~

**Done**

---

## 3. Settings file

Everything personalisable comes from one file, applied live.

- [ ] Settings schema and defaults in `src/settings/` (today's `defaults.ts` becomes the defaults), with a parser that tolerates missing or invalid keys and reports them rather than failing. Unit-tested.
- [ ] `src-tauri/src/commands/settings.rs`: read and write `%APPDATA%\dev.konrad.strudel-studio\settings.json`, creating it from defaults on first run.
- [ ] **Live reload:** watch the file and apply changes without restarting. Editor settings go through StrudelMirror's `updateSettings` / `changeSetting` via the engine.
- [ ] zustand store for UI-only state derived from settings (never anything that changes the sound).
- [ ] Settings cover: editor theme, font family and size, keybinding mode (`codemirror`, `vim`, `emacs`, `vscode`), the editor on/off switches, app shortcuts, and window start size (moving the 75% rule out of Rust).
- [ ] A shortcut or menu entry to open `settings.json` in the editor or the default app.
- [ ] Custom themes can be defined in the settings file, not only in code.

**Done when:** editing and saving `settings.json` changes the theme, font and keybindings in the running app; deleting the file recreates it from defaults; a typo in it shows a warning and falls back to defaults for that key.

---

## 4. Know what's playing

Make the state of the music visible at a glance.

- [ ] **Status bar** under the editor: playing / stopped, cps and bpm, current cycle, sample-loading progress, audio context state.
- [ ] **"Edited but not evaluated" indicator.** The repl already tracks this (`isDirty` in its state, `code !== activeCode`); expose it through the engine and show it in the status bar.
- [ ] **Errors at the right place:** parse the position Strudel reports (e.g. `Unexpected token (6:6)`), mark that line in the editor, and let a click on the error bar jump to it.
- [ ] Keep showing which code is actually playing while the error is displayed (the last good evaluation keeps running).
- [ ] Flash or mark the status bar on each successful evaluation.

**Done when:** the status bar always shows whether sound is running, at what tempo and cycle; editing after an evaluation visibly marks the code as not yet evaluated; a syntax error highlights its line and clicking the error moves the cursor there.

---

## 5. Write faster

Editing comfort for live-coding.

- [ ] **Search and replace** (Ctrl+F, Ctrl+H). StrudelMirror has CodeMirror search commented out in `initEditor`, so add it as our own editor extension.
- [ ] **Autocomplete and hover docs** for Strudel functions. Both are existing switches (`isAutoCompletionEnabled`, `isTooltipEnabled`); turn them on, judge the quality, and fill gaps if needed.
- [ ] **Evaluate a single block** using Strudel's `$:` labelled patterns, alongside evaluating everything.
- [ ] **Hush / panic** key that silences everything immediately.
- [ ] **Command palette** (Ctrl+Shift+P) listing every action with its shortcut, driven by the same keybinding settings as milestone 3.
- [ ] **Snippets** for patterns used often, defined in the settings file.

**Done when:** search and replace work with undo; autocomplete and hover docs show for Strudel functions; a single `$:` block can be evaluated on its own; every action is reachable from the command palette.

---

## 6. Bottom panel and keys

A hideable panel under the editor, and a small keyboard in it for hearing notes and sketching lines to paste into code. Playing keys is an audition, like sample preview: it never changes what the pattern plays. What reaches the code is the note string you copy.

- [ ] **Views and regions:** a view registry (`{ id, title, region, component }`) and a layout store recording which view each region shows, its size and whether it's visible. The explorer becomes the sidebar's first view. Adding a panel later means registering a view and a command, not editing `App.tsx`.
- [ ] **Bottom panel** under the editor column: toggled with Ctrl+J (`view.togglePanel`), resized by dragging its top edge, with small text tabs once there's more than one view. Visibility, height and the shown view are saved in the session.
- [ ] **Focus awareness:** a `panelFocus` context key (focus inside the panel), and `keysFocus` for the Keys view. The keyboard plays notes only while the Keys view has focus. Clicking into the editor gives typing back immediately, and Escape in the panel returns focus to the editor. The panel shows clearly when it has focus, so it's obvious whether letters will type or play.
- [ ] **Keys view:** about two octaves of on-screen keys, playable by mouse. Each key shows its letter faintly while the panel has focus.
- [ ] **Terminal look:** the keyboard looks like ASCII art in a terminal, drawn in the editor's monospace font. Every key, white and black, is the app background colour; keys are told apart only by their outlines (box-drawing style borders, black keys shorter and inset between the white ones) and their letters. A pressed key lights in `--playing`. No gradients, shadows or rounded corners.
- [ ] **Computer keyboard:**

  | Keys | Action |
  |---|---|
  | `A W S E D F T G Y H U J K` | C up to the next C (white and black keys, DAW layout) |
  | `N` / `M` | octave down / up |
  | `X` | rest (`~`) |
  | `C` | clear the buffer |

  Auto-repeat is ignored. The panel's own key handling stays scoped to the panel element, never `window`.
- [ ] **Sound:** notes go through superdough with an engine call (`engine.auditionNote({ note, s, duration })`), so they sound like patterns and share their audio context. They have a fixed length, because superdough sets duration at trigger time and has no note-off. The panel has a small sound field (default `piano`, any loaded sound or sample works) and a length field.
- [ ] **Note buffer:** every played note is appended to a one-line string in mini-notation (`"b5 c5 ~ d4"`), using lowercase note names with octave and sharps as `#` (`c#4`), and `X` adds `~`. It has a copy button, and Ctrl+C copies it while the panel has focus. `C` or a clear button empties it. The buffer is UI-only and isn't saved with the session.
- [ ] **Pure, tested functions:** key letter + octave → note name, octave limits, and buffer append/rest/clear formatting.
- [ ] **Hardware MIDI (stretch):** Web MIDI input (`navigator.requestMIDIAccess`), whose notes play and fill the buffer the same way. Check first that WebView2/Tauri allows the MIDI permission.

**Done when:** Ctrl+J shows and hides the panel at the size it was left, and that survives a restart. With the Keys view focused, `A`–`K` play notes in the chosen sound, `N`/`M` shift octave, `X` adds `~`, `C` clears, and the buffer copies as a mini-notation string that plays back the same line when pasted into `note("…")`. With the editor focused, every one of those keys types normally. The keyboard is all background-coloured keys with terminal-style outlines, lighting only when pressed.
