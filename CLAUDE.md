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
```

## Project layout

```
src/
  engine/      THE ONLY place that imports @strudel/*; exposes a narrow API
               (init, evaluate, stop, getCode, dispatch, registerSamples, onError, ...)
  editor/      React wrapper around StrudelMirror, custom CodeMirror extensions,
               and pure functions that rewrite code text (UI → code write-back)
  panels/      UI panels (settings, transport, sample browser, ...)
  settings/    settings schema, defaults, zustand store
src-tauri/
  src/commands/   Rust commands, one file per area (settings.rs, files.rs, samples.rs)
```

## Strudel API: verify, don't recall

Strudel changes quickly and its APIs shift between versions. **Do not rely on memory for Strudel function names or signatures.** Before using a Strudel API, read the actual source in `node_modules/@strudel/<package>/` (for example `codemirror.mjs`, `repl.mjs`, and the superdough output and sample-loading code). If the docs at strudel.cc disagree with the installed source, the installed source wins.

Pin **exact** versions of every `@strudel/*` package and `superdough` in `package.json` (no `^` or `~`). The packages don't always bump in lockstep; upgrade them deliberately, together, and test.

## Known gotchas

- **React StrictMode double-mounts effects** in dev. The `StrudelMirror` instance must be created once (guard with a ref or module-level singleton), or you get two editors and two schedulers playing at once.
- **Audio requires a user gesture.** WebView2 follows Chromium autoplay rules. `initAudioOnFirstClick` only listens for `mousedown`, so the engine instead runs `initAudio` in `beforeEval` (every evaluation follows a key press or click). superdough 1.3.0's `initAudio` never actually calls `resume()` (its `OfflineAudioContext` check is always false), so the engine resumes the context itself.
- **Tauri CSP** can block remote sample fetches and blob URLs. If sounds silently fail to load, check `app.security` in `tauri.conf.json` first. The policy needs `'unsafe-eval'` (Strudel evaluates code with `Function`) and `data:` in `script-src` (superdough's AudioWorklets are `data:` URLs), and `'unsafe-inline'` in `style-src` (CodeMirror style tags). Tauri's nonce injection is disabled for those two directives because a nonce makes `'unsafe-inline'` ignored. Add new hosts to `connect-src` in both `csp` and `devCsp`.
- **No TypeScript types.** No `@strudel/*` package ships declarations. `src/engine/strudel.d.ts` declares only what the engine uses; extend it from the installed source, not from memory.
- **Runtime errors bypass repl state.** In core 1.2.6 `repl` doesn't pass `onError` to the scheduler, so errors while playing (a throwing pattern, an unknown sound) only reach Strudel's logger. The engine listens for its `strudel.log` document event to show them.
- **Hidden editor settings.** `@strudel/codemirror` persists its editor settings (theme, font, keybindings) in `localStorage` under `codemirror-settings`, and the StrudelMirror constructor builds the editor from them. `engine.init` writes our `EditorSettings` (currently `src/settings/defaults.ts`) there first so ours always win; changing them while running goes through StrudelMirror's `updateSettings`/`changeSetting`.
- **Custom editor themes** are registered by name with `engine.registerTheme` (it adds to `@strudel/codemirror`'s exported `themes`/`settings` registries), before `init` if it's the starting theme. A theme's settings become CSS variables (`--background`, `--foreground`, ...) that `App.css` also uses. `@codemirror/view`, `@codemirror/language` and `@lezer/highlight` are direct dependencies pinned to the versions `@strudel/codemirror` resolves; keep them in step, because two copies of a CodeMirror package break the editor.
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

## Licence

Strudel is AGPL-3.0. This project uses it as a library and should stay AGPL-compatible. It's personal and not distributed, so no further action is needed unless that changes.
