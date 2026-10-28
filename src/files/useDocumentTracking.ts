import { useEffect } from "react";
import * as engine from "../engine";
import { useDocument } from "./documentStore";
import { setWindowTitle } from "./native";
import { windowTitle } from "./paths";

// Keeps the dirty flag and the window title in step with the editor. Use once, in a
// component that renders after the editor (child effects run first, so the engine
// is initialised by the time this runs).
export function useDocumentTracking(): void {
  useEffect(() => {
    useDocument.setState({ savedCode: engine.getCode(), dirty: false });
    return engine.onCodeChange((code) =>
      useDocument.setState((s) => ({ dirty: code !== s.savedCode })),
    );
  }, []);

  const filePath = useDocument((s) => s.filePath);
  const dirty = useDocument((s) => s.dirty);
  useEffect(() => {
    setWindowTitle(windowTitle(filePath, dirty)).catch(() => {});
  }, [filePath, dirty]);
}
