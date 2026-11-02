import { useEffect, useRef } from "react";
import * as engine from "../engine";
import { insertDroppedSample } from "../samples/insert";
import { DEFAULT_EDITOR_SETTINGS } from "../settings/defaults";
import { SAMPLE_DROP_EVENT, sampleDrop, type SampleDropEvent } from "./sampleDrop";
import { scrub } from "./scrub";
import { TERMINAL_THEME, terminalTheme, terminalThemeSettings } from "./terminalTheme";

// `hidden` while no document is open; the editor stays mounted so its state survives.
export function StrudelEditor({ hidden }: { hidden: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    engine.registerTheme(TERMINAL_THEME, terminalTheme, terminalThemeSettings);
    engine.init({
      editorSettings: DEFAULT_EDITOR_SETTINGS,
      extensions: [sampleDrop(), scrub()],
    });
    return engine.attach(host);
  }, []);

  // A separate effect, so hot reload re-subscribes with the current insertDroppedSample.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onDrop = (event: Event) => {
      const { sample, target } = (event as SampleDropEvent).detail;
      void insertDroppedSample(sample, target);
    };
    host.addEventListener(SAMPLE_DROP_EVENT, onDrop);
    return () => host.removeEventListener(SAMPLE_DROP_EVENT, onDrop);
  }, []);

  // A hidden element can't take focus, so focus once the editor is visible again.
  useEffect(() => {
    if (!hidden) engine.focusEditor();
  }, [hidden]);

  return <div ref={hostRef} className="editor-host" hidden={hidden} />;
}
