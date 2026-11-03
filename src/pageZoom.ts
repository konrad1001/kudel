import { useEffect } from "react";

// WebView2 only passes a trackpad pinch to the page (as wheel events with ctrlKey) while
// its own zoom is on, so tauri.conf.json turns it on (zoomHotkeysEnabled). This keeps
// that zoom from ever zooming the app: every ctrl+wheel and pinch has its default
// prevented, as do Ctrl+= / Ctrl+- / Ctrl+0. Views still get the events, so the Sample
// view's waveform zooms on a pinch.
export function useNoPageZoom(): void {
  useEffect(() => {
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && ZOOM_KEYS.has(event.key)) event.preventDefault();
    };
    // Not passive, or preventDefault would be ignored.
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}

// "+" and "_" are the same keys with Shift; the numpad's give "+" and "-" too.
const ZOOM_KEYS = new Set(["=", "+", "-", "_", "0"]);
