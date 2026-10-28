import { useEffect, useRef } from "react";
import * as engine from "../engine";
import { DEFAULT_EDITOR_SETTINGS } from "../settings/defaults";
import { TERMINAL_THEME, terminalTheme, terminalThemeSettings } from "./terminalTheme";

const INITIAL_CODE = 's("bd sd [~ bd] sd")';

export function StrudelEditor() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    engine.registerTheme(TERMINAL_THEME, terminalTheme, terminalThemeSettings);
    engine.init({ initialCode: INITIAL_CODE, editorSettings: DEFAULT_EDITOR_SETTINGS });
    return engine.attach(host);
  }, []);

  return <div ref={hostRef} className="editor-host" />;
}
