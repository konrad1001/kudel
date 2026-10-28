# Roadmap: a smooth editor

The next five milestones, in order. Each leaves the app runnable and ends with a "Done when" check. The principles in `CLAUDE.md` apply throughout, especially *code is the source of truth* and *only `src/engine/` imports `@strudel/*`*.

---

## 1. Don't lose work

A reload, crash or closed window currently throws the code away. Fix that before anything else.

- [x] Set up vitest (`npx vitest run`) so the pure functions below are tested from the start.
- [x] First Rust commands in `src-tauri/src/commands/files.rs`: read and write a file, called from the front end through `invoke`.
- [ ] **Autosave and restore:** save the buffer to the app data directory a few seconds after each edit and on close; reopen it, with the cursor position, on startup.
- [x] **Open / Save / Save As / New** with native dialogs (Ctrl+O, Ctrl+S, Ctrl+Shift+S, Ctrl+N). Pick a file extension (`.strudel` or `.js`).
- [x] **Explorer sidebar** (VS Code style): open a folder (Ctrl+Shift+O), browse it, click to open, New File, toggle with Ctrl+B.
- [x] **Tabs**: open files stay open in a tab bar (Ctrl+Tab / Ctrl+Shift+Tab, Ctrl+W, middle-click), each with its own undo history; a centred message when none is open; ▶ marks the tab that is playing.
- [ ] **Recent files** list (and recent folders; reopen the last folder on startup).
- [x] **Window title** shows the file name and an unsaved-changes marker (`● name.strudel - Strudel Studio`).
- [ ] Ask before closing or opening another file over unsaved changes. (Opening another file asks; closing the window doesn't yet.)
- [x] Loading a file never evaluates it. (Superseded: each file opens in its own tab with a fresh undo history, rather than replacing the editor text as an undoable edit.)

**Done when:** killing the app mid-edit and restarting brings back the exact code and cursor position; files open and save through native dialogs; the title shows the file and whether it's dirty; `npx vitest run` passes.

---

## 2. Your own samples

Audio files sit in the same folder as the code, show up in the explorer, and load with a `samples(...)` call that names them, so the code still says where every sound comes from. Strudel normally fetches samples from URLs; superdough's `registerSamplesPrefix(prefix, resolve)` (in `sampler.mjs`, checked before its built-in `github:`/`local:`/`shabda:` handling) lets the engine resolve a local path into a sample map instead, with no patching.

- [ ] **Audio files in the explorer:** `.wav`, `.mp3`, `.ogg`, `.flac` and `.m4a` (what WebView2 can decode; not `.aif`) appear undimmed, with their own icon, and don't open as text.
- [ ] **Preview on click:** play a sample once, outside the pattern, to hear what it is. It never changes the music; a second click or Escape stops it.
- [ ] **Serve local files to Strudel:** enable Tauri's asset protocol, and widen its scope at runtime to the open folder (and the folders of open files) rather than the whole disk. Add the asset origin to `connect-src` in both `csp` and `devCsp`.
- [ ] **Folder → sample map**, as a Rust command: each subfolder becomes a sound named after it, its audio files (sorted) are that sound's variants for `n`, and loose files in the folder become one sound each. A pure name function turns file and folder names into valid sound names and handles clashes. Both unit-tested.
- [ ] **A path prefix in code:** register a prefix handler in the engine so code like `samples('./drums')` loads a local folder. Decide the path form first: relative to the file being evaluated (recommended: it survives moving the project folder) or to the open folder. Unknown or empty folders show in the error bar.
- [ ] **Write-back from the explorer:** drag a sample folder or file into the editor, or use a context-menu entry, to insert the `samples('./…')` line at the top (skipped if it's already there) and the sound name at the cursor. Minimal transactions, so undo works.
- [ ] **New files are picked up** on the next evaluation, without restarting.

**Done when:** a folder of `.wav` files next to a `.strudel` file is audible through `samples('./that-folder')` and `s("name")`; dragging a folder from the explorer writes that line into the code; clicking a sample previews it; nothing outside the open folder is reachable through the asset protocol; the sample-map and naming functions are tested.

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
