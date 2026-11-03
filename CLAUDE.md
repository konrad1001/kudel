# Strudel Studio

A personal desktop live-coding environment built on [Strudel](https://strudel.cc), the JavaScript port of TidalCycles. The goal is a fully personalisable Strudel interface first, with DAW-like conveniences layered on later. The final product will be a live-coding/daw hybrid.

This is a **single-user, personal project**. It will not be distributed. Optimise for my workflow, not for general users.

## Core principles

1. **Code is the source of truth.** Anything that affects sound must be visible in the code text. UI elements (sliders, faders, sample browser, arrangement views) are _views onto the code_: a UI edit writes back into the editor text. Never introduce hidden UI state that changes what is heard.
2. **Don't fork Strudel.** Consume the published `@strudel/*` npm packages. Wrap them; don't patch them. If a patch is unavoidable, use `patch-package` and leave a comment explaining why.
3. **Personalisable by default.** Themes, keybindings, fonts and layout should be driven by a settings file, not hard-coded.
4. **Small working increments.** Each change should leave the app runnable.

## Stack

- **Shell:** Tauri 2 (Rust backend, WebView2 front end)
- **UI:** React + TypeScript + Vite
- **Editor:** CodeMirror 6 via `StrudelMirror` from `@strudel/codemirror`
- **Engine:** `@strudel/core`, `@strudel/mini`, `@strudel/transpiler`, `@strudel/tonal`, `@strudel/webaudio` (superdough), `@strudel/soundfonts`
- **UI state:** zustand (UI-only state; never sound-affecting state, see principle 1)
- **Tests:** vitest for TypeScript; `cargo test` for Rust

## Environment

- Windows 11. **All shell commands must be PowerShell / Windows syntax** (no bash-isms; use `;` or separate commands instead of `&&` unless running PowerShell 7).
- Prerequisites: Node LTS, Rust via rustup, Visual Studio C++ Build Tools, WebView2 (built in).

## Commands

```powershell
npm install                 # install JS deps
npm run tauri dev           # run the app in dev mode (first run compiles Rust; slow)
npm run tauri build         # production build
npx tsc --noEmit            # typecheck
npx vitest run              # JS tests
cd src-tauri; cargo check; cd ..   # Rust check
npm run docs:strudel        # regenerate docs/strudel-api.{md,json} from installed Strudel
```

## Project layout

```
src/
  engine/      THE ONLY place that imports @strudel/*; exposes a narrow API
               (init, evaluate, stop, getCode, dispatch, registerSamples, onError, ...)
  editor/      React wrapper around StrudelMirror, custom CodeMirror extensions,
               and pure functions that rewrite code text (UI → code write-back)
  files/       file, folder and tab actions, the tabs and explorer stores, pure
               path/text/tab helpers; native.ts is the only file here that calls Tauri
  samples/     local samples: folder → sample map and sound names, the samples('./…')
               resolver, explorer previews, and drag-to-insert
  session/     what was open (folder, tabs, unsaved text, cursors, recents), saved to
               %APPDATA%\dev.konrad.strudel-studio\session.json a second after each
               change and on close, and restored on start ("hot exit"). Closing the app
               never writes the user's files and never asks to save
  layout/      the view registry ({ id, title, region, component }) and the layout store:
               which view the bottom panel and the right-hand aside show, region sizes,
               whether they're visible, and whether the aside is maximised over the
               editor column. The sidebar stacks all its views as foldable, resizable
               sections. A new panel registers a view and a command; App.tsx doesn't change
  sounds/      the Sounds view's logic: categories and search over the registered sounds
               (pure, tested) and its store. Clicking a sound is an audition through
               engine.auditionNote, like the Keys view
  reference/   the Reference view's logic (search, lookup by name, description markup;
               pure, tested) and its store. It reads docs/strudel-api.json, loaded on
               first use. Examples open as new tabs; the reference never plays anything
  status/      the status bar's store (what was last evaluated and whether it's been
               edited since, evaluation count, the current error) and its formatting.
               Playback state, tempo, cycle, audio and sample loading are polled from
               engine.getTransport; loads are counted from Strudel's logger events
  keys/        the Keys view's logic: letter → note names, the note buffer, the
               keyboard drawing (pure, tested) and its store and commands. Playing a key
               is an audition through engine.auditionNote, never part of the pattern
  importer/    the Import view's logic: reading yt-dlp's output into progress, naming
               the file as a sound name, formatting (pure, tested) and its store. The
               destination is relative to the open folder and saved in the session
  panels/      UI panels (menu bar, sidebar, bottom panel, explorer, keys, ...)
  settings/    settings schema, defaults, zustand store
  commands/    the command registry (id, label, run), keybindings (key, command id,
               optional "when" clause over context keys) and the one keyboard
               dispatcher. Features export their commands; menus and lists use ids.
               Never add a keydown listener for a shortcut: add a command and a binding
src-tauri/
  src/commands/   Rust commands, one file per area (settings.rs, files.rs, samples.rs,
                  import.rs)
```

## Strudel API: verify, don't recall

Strudel changes quickly and its APIs shift between versions. **Do not rely on memory for Strudel function names or signatures.** Look functions up in `docs/strudel-api.md` first (`docs/strudel-api.json` has the same data). It's generated from the installed packages by `npm run docs:strudel`, and each entry names its source file and line. For behaviour the comment doesn't cover, and for internals, read the actual source in `node_modules/@strudel/<package>/` (for example `codemirror.mjs`, `repl.mjs`, and the superdough output and sample-loading code). If the docs at strudel.cc disagree with the installed source, the installed source wins.

Pin **exact** versions of every `@strudel/*` package and `superdough` in `package.json` (no `^` or `~`). The packages don't always bump in lockstep; upgrade them deliberately, together, and test. After an upgrade, rerun `npm run docs:strudel` and read the diff of `docs/strudel-api.md` to see what changed.

## Known gotchas

- **React StrictMode double-mounts effects** in dev. The `StrudelMirror` instance must be created once (guard with a ref or module-level singleton), or you get two editors and two schedulers playing at once.
- **Audio requires a user gesture.** WebView2 follows Chromium autoplay rules. `initAudioOnFirstClick` only listens for `mousedown`, so the engine instead runs `initAudio` in `beforeEval` (every evaluation follows a key press or click). superdough 1.3.0's `initAudio` never actually calls `resume()` (its `OfflineAudioContext` check is always false), so the engine resumes the context itself.
- **Tauri CSP** can block remote sample fetches and blob URLs. If sounds silently fail to load, check `app.security` in `tauri.conf.json` first. The policy needs `'unsafe-eval'` (Strudel evaluates code with `Function`) and `data:` in `script-src` (superdough's AudioWorklets are `data:` URLs), and `'unsafe-inline'` in `style-src` (CodeMirror style tags). Tauri's nonce injection is disabled for those two directives because a nonce makes `'unsafe-inline'` ignored. Add new hosts to `connect-src` in both `csp` and `devCsp`.
- **No TypeScript types.** No `@strudel/*` package ships declarations. `src/engine/strudel.d.ts` declares only what the engine uses; extend it from the installed source, not from memory.
- **Runtime errors bypass repl state.** In core 1.2.6 `repl` doesn't pass `onError` to the scheduler, so errors while playing (a throwing pattern, an unknown sound) only reach Strudel's logger. The engine listens for its `strudel.log` document event to show them.
- **Hidden editor settings.** `@strudel/codemirror` persists its editor settings (theme, font, keybindings) in `localStorage` under `codemirror-settings`, and the StrudelMirror constructor builds the editor from them. `engine.init` writes our `EditorSettings` (currently `src/settings/defaults.ts`) there first so ours always win; changing them while running goes through StrudelMirror's `updateSettings`/`changeSetting`.
- **Custom editor themes** are registered by name with `engine.registerTheme` (it adds to `@strudel/codemirror`'s exported `themes`/`settings` registries), before `init` if it's the starting theme. A theme's settings become CSS variables (`--background`, `--foreground`, ...) that `App.css` also uses. `@codemirror/view`, `@codemirror/language` and `@lezer/highlight` are direct dependencies pinned to the versions `@strudel/codemirror` resolves; keep them in step, because two copies of a CodeMirror package break the editor.
- **One editor, many documents.** Tabs share the single StrudelMirror. The engine keeps each open document's whole `EditorState` (text, cursor, undo history, Strudel's highlights) and swaps it in with `view.setState` (`openDoc`/`showDoc`/`closeDoc`). New documents derive from a blank state captured at init, so they get every extension. `setState` skips update listeners, so `showDoc` syncs `mirror.code` by hand (that's what `evaluate` reads). Anything that reconfigures the editor live (theme, font, keybindings in milestone 3) only reaches the shown state, so stored states need the same reconfiguration when they're shown. Closing the document whose code is playing stops the sound (principle 1).
- **HTML5 drag and drop needs `dragDropEnabled: false`** on the window in `tauri.conf.json`. Tauri replaces WebView2's drag-drop handler by default (for its native file-drop events, which we don't use), and every in-page drag then shows the "not allowed" cursor.
- **First sounds get lost two ways.** (1) superdough fixes a note's start time before loading its sample or soundfont and skips it if the file arrives late ("skip hap: still loading"), so `engine.auditionNote` loads the file first (`getSampleBuffer` / `getFontBufferSource`) and only then schedules. (2) `resume()` resolves before the output device actually plays (about 100ms in WebView2, longer on some hardware), and sound scheduled in that gap is never heard, so `ensureAudio` also waits until `getOutputTimestamp().contextTime` moves. The Keys view calls `engine.warmUpAudio` on focus, so audio is already running before the first key; it only starts audio during a user gesture (`navigator.userActivation.isActive`), because outside one `resume()` never settles.
- **Stopping only stops the scheduler.** Notes already handed to superdough (scheduled ahead, long samples, release, reverb and delay tails) play out. On stop the engine's `cutSound` gives superdough's audio controller a fresh output and orbits, then fades the old ones out over 30ms and disconnects them. That reaches into `SuperdoughAudioController` internals (`nodes`, `buses`, `output.initializeAudio`), so re-check it when upgrading superdough.
- **yt-dlp and ffmpeg come from PATH** (`winget install yt-dlp.yt-dlp` also installs `yt-dlp.FFmpeg` and deno, which yt-dlp uses for YouTube's JS challenges), as the app saw PATH when it started: after installing, start `npm run tauri dev` from a new terminal. `import.rs` starts them with `CREATE_NO_WINDOW` and cancels with `taskkill /T`, because yt-dlp's Windows build runs as two processes and starts ffmpeg as a third. Clips are cut by ffmpeg during the wav conversion (`--postprocessor-args "ExtractAudio:-ss … -to …"`), not with `--download-sections`: that cuts at the stream's blocks (seconds early) unless `--force-keyframes-at-cuts`, which re-encodes to low-bitrate opus first. The progress template's `progress.*` field names aren't in yt-dlp's README; if one changes it prints `NA` and the Import view shows no bar, but imports still work.
- **Asset protocol scope.** Local files are only reachable via `convertFileSrc` if their path is inside the configured `assetProtocol.scope`.
- **Default sounds mirror strudel.cc**, so code behaves the same here as on the site. `src/engine/soundSources.ts` copies the sample banks from strudel.cc's `website/src/repl/prebake.mjs` (not published to npm; read it at the git tag matching our versions), and `src/engine/piano.ts` reproduces its `.piano()`. Re-sync both when upgrading Strudel. They load from the network (`strudel.b-cdn.net`, `felixroos.github.io` for GM soundfonts), so the app isn't offline-capable until local samples are added.

## Verifying work

You cannot hear audio. After any change that could affect playback, run the app and **ask me to confirm what I hear** rather than assuming it works. Typecheck and tests passing is necessary but not sufficient.

Where possible, make sound-related logic testable without audio: pure functions that build sample maps, rewrite code text, parse settings, etc.

## Conventions

- TypeScript `strict` mode on.
- **Only `src/engine/` imports `@strudel/*`.** React components talk to the engine through its exported API, which keeps Strudel version churn contained in one place.
- UI-to-code write-back must use minimal CodeMirror transactions (find the literal, replace its value), never full-text replacement, so undo history and cursor position survive.
- User settings live in Tauri's app config directory (`%APPDATA%\<app-id>\settings.json`), never in the repo.
- Keep components small; prefer composition over large prop lists.
- Do not write claude as an author of any commits

## Licence

Strudel is AGPL-3.0. This project uses it as a library and should stay AGPL-compatible. It's personal and not distributed, so no further action is needed unless that changes.
