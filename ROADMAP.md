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

- [x] **Views and regions:** a view registry (`{ id, title, region, component }`) and a layout store recording which view each region shows, its size and whether it's visible. The explorer becomes the sidebar's first view. Adding a panel later means registering a view and a command, not editing `App.tsx`.
- [x] **Bottom panel** under the editor column: toggled with Ctrl+J (`view.togglePanel`), resized by dragging its top edge, with small text tabs once there's more than one view. Visibility, height and the shown view are saved in the session.
- [x] **Focus awareness:** a `panelFocus` context key (focus inside the panel), and `keysFocus` for the Keys view. The keyboard plays notes only while the Keys view has focus. Clicking into the editor gives typing back immediately, and Escape in the panel returns focus to the editor. The panel shows clearly when it has focus, so it's obvious whether letters will type or play.
- [x] **Keys view:** about two octaves of on-screen keys, playable by mouse. Each key shows its letter faintly while the panel has focus.
- [x] **Terminal look:** the keyboard looks like ASCII art in a terminal, drawn in the editor's monospace font. Every key, white and black, is the app background colour; keys are told apart only by their outlines (box-drawing style borders, black keys shorter and inset between the white ones) and their letters. A pressed key lights in `--playing`. No gradients, shadows or rounded corners.
- [x] **Computer keyboard:**

  | Keys                        | Action                                                |
  | --------------------------- | ----------------------------------------------------- |
  | `A W S E D F T G Y H U J K` | C up to the next C (white and black keys, DAW layout) |
  | `N` / `M`                   | octave down / up                                      |
  | `X`                         | rest (`~`)                                            |
  | `C`                         | clear the buffer                                      |

  Auto-repeat is ignored. The panel's own key handling stays scoped to the panel element, never `window`.

- [x] **Sound:** notes go through superdough with an engine call (`engine.auditionNote({ note, s, duration })`), so they sound like patterns and share their audio context. They have a fixed length, because superdough sets duration at trigger time and has no note-off. The panel has a small sound field (default `piano`, any loaded sound or sample works) and a length field.
- [x] **Note buffer:** every played note is appended to a one-line string in mini-notation (`"b5 c5 ~ d4"`), using lowercase note names with octave and sharps as `#` (`c#4`), and `X` adds `~`. It has a copy button, and Ctrl+C copies it while the panel has focus. `C` or a clear button empties it. The buffer is UI-only and isn't saved with the session.
- [x] **Pure, tested functions:** key letter + octave → note name, octave limits, and buffer append/rest/clear formatting.
- [ ] **Hardware MIDI (stretch):** Web MIDI input (`navigator.requestMIDIAccess`), whose notes play and fill the buffer the same way. Check first that WebView2/Tauri allows the MIDI permission.

**Done when:** Ctrl+J shows and hides the panel at the size it was left, and that survives a restart. With the Keys view focused, `A`–`K` play notes in the chosen sound, `N`/`M` shift octave, `X` adds `~`, `C` clears, and the buffer copies as a mini-notation string that plays back the same line when pasted into `note("…")`. With the editor focused, every one of those keys types normally. The keyboard is all background-coloured keys with terminal-style outlines, lighting only when pressed.

---

## 7. Playing live

Hands-on control while the music runs. Every control is a minimal edit to the code, so undo works and nothing is heard that isn't written.

- [ ] **Number scrubbing:** hold a modifier and drag any number literal in the editor (`.gain(0.8)`, `.lpf(800)`) to change it, re-evaluating as it moves. One drag is one undo step. Step size follows the number's own precision; another modifier gives fine steps.
- [ ] **Mute/solo per `$:` block:** a small strip of `$:` blocks with M/S toggles that rewrite the code (check the installed source for Strudel's own mute syntax for labels first; otherwise comment the block out). Solo is muting all the others, so it stays visible in the text.
- [ ] **Evaluate on the next cycle:** Ctrl+Enter waits for the next cycle boundary (optionally every n cycles) before swapping in the new code, like Ableton's launch quantisation, so changes land on the beat. A visible "queued" state until it lands; a second key evaluates immediately.

**Done when:** dragging a number changes the sound live and undoes in one step; muting and soloing a block shows in the code and is heard; an edit evaluated mid-cycle starts exactly at the next cycle.

---

## 8. Audio in and out

Getting audio files into the open folder, where the explorer, previews and `samples('./…')` already work with them.

- [ ] **Import from URL:** paste a link (YouTube, SoundCloud, Bandcamp, anything yt-dlp supports) and get a `.wav` in the open folder (e.g. `samples/imported/`). A Rust command runs `yt-dlp -x --audio-format wav`, streaming its progress to a small panel view, then refreshes the explorer. yt-dlp and ffmpeg are installed with winget and found on PATH, not bundled, so `yt-dlp -U` keeps up with YouTube changes. Local files can be imported the same way.
- [ ] **Bounce to the folder:** record N cycles of what's playing to a `.wav` in the open folder (e.g. `bounces/`), by tapping superdough's output. It shows up in the explorer, ready to preview, chop, or load again with `samples('./bounces')`.

**Done when:** a pasted URL ends up as a playable `.wav` in the explorer with progress shown on the way; bouncing 4 cycles gives a file exactly 4 cycles long that sounds like what was playing.

---

## 9. Sample editor

A bottom-panel view for one audio file, opened from the explorer (double-click an audio file). Edits never overwrite the original: they write new files, or write positions into the code.

- [ ] **Waveform and markers:** the decoded file drawn in the terminal style, with transients marked. Click to add markers, drag to move them; markers snap to transients. Clicking a region auditions it through superdough. Transient detection is a pure, tested function over the samples (energy jumps, threshold, minimum gap).
- [ ] **Loop editing:** set the start (snaps to the nearest transient, usually the first downbeat) and the length in bars; the end snaps to where the loop wraps. A beat grid overlays the region so it's visible whether hits sit on the beat; nudge the end until they do. Loop audition plays just the region on repeat, optionally with a click at the code's tempo. Commit as a trimmed new file with short fades plus `s("name").loopAt(n)`, or non-destructively as `.begin(…).end(…).loopAt(n)` on the original. Offer `.splice(n, "0 1 2 …")` for breaks (each slice re-speeded to its step). `loopAt` and `splice` change pitch with tempo; test superdough's phase-vocoder `stretch` before relying on it for pitch-preserving loops (its doc comment and source disagree).
- [ ] **Slice export:** markers or equal divisions (8, 16, 32) become files (`chops/name/01.wav`, …) with short fades, so `s("name:3")` picks a chop; or, for equal divisions, write `.slice(n, "…")` on the whole file instead. The WAV encoder is a pure, tested function; Rust writes the bytes.
- [ ] **Tempo estimate:** guess the loop's tempo from transient spacing ("≈ 87.5 bpm → 2 bars") to suggest the loop length, and offer `setcpm(bpm/4)` to match the song to the loop instead of the other way round.

**Done when:** an imported break opens from the explorer, its loop is set in a few clicks with the grid confirming it, and the inserted code plays it in time at any `cps`; exported slices play as `s("name:n")`; the original file is untouched.

# Known Bugs

- [ ] Horizontal scrolling along octaves interferes with horizontal scrolling the view in the keyboard panel when the screen is too small to display the full keyboard width.
