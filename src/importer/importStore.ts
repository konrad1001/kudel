import { create } from "zustand";
import type { Command } from "../commands/commands";
import { refresh, useExplorer } from "../files/explorerStore";
import {
  cancelImport,
  importTools,
  importUrl,
  pickFolder,
  placeImport,
  showError,
  updateYtDlp,
  type ImportTools,
} from "../files/native";
import { stem } from "../files/paths";
import { showView } from "../layout/layoutStore";
import {
  clockText,
  DEFAULT_IMPORT_DIR,
  importDir,
  importName,
  readClip,
  readLine,
  START,
  urlStartTime,
  type Clip,
  type Progress,
} from "./importer";

// The Import view: links being turned into .wav files in the open folder. UI-only
// state; nothing here changes what is heard. Only the destination is saved.

export type JobStatus = "running" | "done" | "failed" | "cancelled";

export interface ImportJob {
  id: number;
  url: string;
  // The part kept; null for the whole video.
  clip: Clip | null;
  status: JobStatus;
  progress: Progress;
  // The .wav, once it's in the folder.
  path: string | null;
  bytes: number | null;
  // Why it failed.
  message: string | null;
  // Everything yt-dlp printed, for [log].
  log: string[];
  showLog: boolean;
}

interface ImportState {
  url: string;
  // The clip fields as typed; both blank imports the whole video.
  from: string;
  to: string;
  // Relative to the open folder, as "./imported".
  dir: string;
  // Newest first.
  jobs: ImportJob[];
  tools: ImportTools | null;
  checking: boolean;
  updating: boolean;
  // What the last update printed, shortened to its last line.
  toolNote: string | null;
}

export const useImport = create<ImportState>(() => ({
  url: "",
  from: "",
  to: "",
  dir: DEFAULT_IMPORT_DIR,
  jobs: [],
  tools: null,
  checking: false,
  updating: false,
  toolNote: null,
}));

const set = useImport.setState;
const get = useImport.getState;

// Enough of the log to see what went wrong.
const MAX_LOG = 300;

let nextId = 1;

// A link with a start time in it (YouTube's t=) fills an empty "from".
export function setUrl(url: string): void {
  const start = urlStartTime(url);
  set((s) => ({ url, ...(start !== null && !s.from.trim() && { from: clockText(start) }) }));
}

export function setClip(change: { from?: string; to?: string }): void {
  set(change);
}

function updateJob(id: number, change: (job: ImportJob) => Partial<ImportJob>): void {
  set((s) => ({ jobs: s.jobs.map((job) => (job.id === id ? { ...job, ...change(job) } : job)) }));
}

// Imports the link in the field, or the clip of it the fields describe, into the
// destination folder.
export async function startImport(): Promise<void> {
  const url = get().url.trim();
  const root = useExplorer.getState().root;
  const read = readClip(get().from, get().to);
  if (!url || !root || "error" in read) return;
  const { clip } = read;
  const { dir } = get();
  const id = nextId++;
  const job: ImportJob = {
    id,
    url,
    clip,
    status: "running",
    progress: START,
    path: null,
    bytes: null,
    message: null,
    log: [],
    showLog: false,
  };
  set((s) => ({ url: "", from: "", to: "", jobs: [job, ...s.jobs] }));

  try {
    const temp = await importUrl(id, url, clip, (line) =>
      updateJob(id, (job) => ({
        progress: readLine(job.progress, line),
        log: [...job.log.slice(-(MAX_LOG - 1)), line],
      })),
    );
    // The file's own name keeps the title exactly; yt-dlp's printed one may not.
    const placed = await placeImport(temp, root, dir, importName(stem(temp), clip));
    updateJob(id, () => ({ status: "done", path: placed.path, bytes: placed.bytes }));
    if (useExplorer.getState().root === root) await refresh();
  } catch (err) {
    const message = String(err);
    updateJob(id, (job) =>
      message === "cancelled"
        ? { status: "cancelled" }
        : { status: "failed", message: job.progress.error ?? message },
    );
  }
}

export function cancelJob(id: number): void {
  void cancelImport(id);
}

export function toggleLog(id: number): void {
  updateJob(id, (job) => ({ showLog: !job.showLog }));
}

// Drops finished, failed and cancelled imports from the list.
export function clearFinished(): void {
  set((s) => ({ jobs: s.jobs.filter((job) => job.status === "running") }));
}

export function setImportDir(dir: string): void {
  set({ dir });
}

// Asks for the destination, which has to be inside the open folder.
export async function pickImportDir(): Promise<void> {
  const root = useExplorer.getState().root;
  if (!root) return;
  const picked = await pickFolder(root);
  if (!picked) return;
  const dir = importDir(root, picked);
  if (dir === null) {
    await showError("Imports go into the open folder. Pick a folder inside it.");
    return;
  }
  set({ dir });
}

// Looks for yt-dlp and ffmpeg on PATH.
export async function checkTools(): Promise<void> {
  if (get().checking) return;
  set({ checking: true });
  try {
    set({ tools: await importTools() });
  } catch (err) {
    set({ tools: { ytDlp: null, ffmpeg: null }, toolNote: String(err) });
  } finally {
    set({ checking: false });
  }
}

export async function updateTools(): Promise<void> {
  set({ updating: true, toolNote: null });
  let note: string;
  try {
    note = await updateYtDlp();
  } catch (err) {
    note = String(err);
  }
  set({ updating: false, toolNote: lastLine(note) });
  await checkTools();
}

const lastLine = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .pop() ?? null;

export const IMPORT_COMMANDS: Command[] = [
  { id: "view.import", label: "Show Import", run: () => showView("import", { focus: true }) },
];
