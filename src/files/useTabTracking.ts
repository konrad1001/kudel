import { useEffect } from "react";
import * as engine from "../engine";
import { setWindowTitle } from "./native";
import { windowTitle } from "./paths";
import { tabTitle } from "./tabs";
import { selectActiveTab, updateTab, useTabs } from "./tabsStore";

// Keeps the tabs' dirty flags, the playing tab and the window title in step with
// the engine. Use once, in a component that renders after the editor (child effects
// run first, so the engine is initialised by the time this runs).
export function useTabTracking(): void {
  useEffect(
    () =>
      engine.onCodeChange((code) => {
        const tab = selectActiveTab(useTabs.getState());
        const dirty = !!tab && code !== tab.savedCode;
        if (tab && tab.dirty !== dirty) updateTab(tab.id, { dirty });
      }),
    [],
  );

  useEffect(() => engine.onPlayingChange((playingId) => useTabs.setState({ playingId })), []);

  const title = useTabs((s) => {
    const tab = selectActiveTab(s);
    return windowTitle(tab && tabTitle(tab), !!tab?.dirty);
  });
  useEffect(() => {
    setWindowTitle(title).catch(() => {});
  }, [title]);
}
