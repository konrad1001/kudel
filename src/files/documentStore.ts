import { create } from "zustand";
import type { LineEnding } from "./text";

// Which file the editor text belongs to. Nothing here affects the sound.
interface DocumentState {
  // null until the text has been opened from or saved to a file.
  filePath: string | null;
  lineEnding: LineEnding;
}

export const useDocument = create<DocumentState>(() => ({
  filePath: null,
  lineEnding: "\n",
}));
