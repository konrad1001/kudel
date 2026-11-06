import { loadAppData, saveAppData, type AppDataFile } from "./native";

// A panel's own JSON file in the app data folder (the Synth view's synths.json, the
// Drums view's drums.json): read once per page load, saved a moment after each change,
// and written once more as the window closes (flushAppFiles, from the session's close
// handler: two close handlers would race to close the window).

export interface AppFileOptions {
  name: AppDataFile;
  // Puts what was read into the panel's store (null on first run).
  restore(text: string | null): void;
  // Tells the panel the file couldn't be read.
  onReadError(message: string): void;
  // The file's contents now.
  serialize(): string;
  // Calls back on every change worth saving; returns a function that stops.
  watch(onChange: () => void): () => void;
}

export interface AppFile {
  // Reads the file, once per page load (StrictMode and hot reload mount twice).
  // Resolves false if it couldn't be read: then nothing is saved this run, so the file
  // isn't overwritten with an empty list.
  restoreOnce(): Promise<boolean>;
  // Saves a moment after each change; started once restoreOnce resolves true. Returns
  // a function that stops (writing anything still waiting).
  persist(): () => void;
}

const SAVE_DELAY_MS = 1000;
const flushes = new Map<AppDataFile, () => Promise<void>>();

export function appFile(options: AppFileOptions): AppFile {
  let loading: Promise<boolean> | null = null;
  let pending: ReturnType<typeof setTimeout> | undefined;
  const fail = (err: unknown) => console.error(`Could not save ${options.name}`, err);

  const write = () => {
    clearTimeout(pending);
    pending = undefined;
    return saveAppData(options.name, options.serialize());
  };
  const flush = () => (pending === undefined ? Promise.resolve() : write());
  flushes.set(options.name, flush);

  return {
    restoreOnce() {
      loading ??= loadAppData(options.name).then(
        (text) => {
          options.restore(text);
          return true;
        },
        (err: unknown) => {
          console.error(`Could not read ${options.name}`, err);
          options.onReadError(`Could not read ${options.name}: ${String(err)}. Changes won't be saved this run.`);
          return false;
        },
      );
      return loading;
    },
    persist() {
      const unwatch = options.watch(() => {
        clearTimeout(pending);
        pending = setTimeout(() => void write().catch(fail), SAVE_DELAY_MS);
      });
      return () => {
        unwatch();
        void flush().catch(fail);
      };
    },
  };
}

// Writes every panel file with a change still waiting to be saved.
export async function flushAppFiles(): Promise<void> {
  await Promise.all([...flushes.entries()].map(([name, flush]) => flush().catch((err) => console.error(`Could not save ${name}`, err))));
}
