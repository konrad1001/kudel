import { create } from "zustand";
import type { Command } from "../commands/commands";
import { registerContextKey } from "../commands/when";
import { assetUrl, showError } from "../files/native";
import { baseName, samePath } from "../files/paths";

// Auditioning one sample from the explorer. This is the one sound that isn't in the
// code: it plays once, outside Strudel's audio graph, and never changes the music.
export const usePreview = create<{ path: string | null }>(() => ({ path: null }));

registerContextKey("previewing", () => usePreview.getState().path !== null);

let audio: HTMLAudioElement | null = null;

export function stopPreview(): void {
  audio?.pause();
  audio = null;
  usePreview.setState({ path: null });
}

// Plays `path`, or stops it if it is the one already playing.
export function togglePreview(path: string): void {
  const wasPlaying = samePath(usePreview.getState().path, path);
  stopPreview();
  if (wasPlaying) return;

  const el = new Audio(assetUrl(path));
  audio = el;
  usePreview.setState({ path });
  const finish = () => {
    if (audio === el) stopPreview();
  };
  const fail = () => {
    if (audio !== el) return;
    stopPreview();
    void showError(`Could not play ${baseName(path)}.`);
  };
  el.addEventListener("ended", finish);
  el.addEventListener("error", fail);
  el.play().catch(fail);
}

export const PREVIEW_COMMANDS: Command[] = [
  { id: "samples.stopPreview", label: "Stop Sample Preview", run: stopPreview },
];
