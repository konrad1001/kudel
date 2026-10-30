import { useEffect } from "react";
import * as engine from "./engine";
import { registerCommands } from "./commands/commands";
import { useKeyboard } from "./commands/useKeyboard";
import { StrudelEditor } from "./editor/StrudelEditor";
import { FILE_COMMANDS } from "./files/actions";
import { useTabs } from "./files/tabsStore";
import { useTabTracking } from "./files/useTabTracking";
import { KEYS_COMMANDS } from "./keys/keysStore";
import { LAYOUT_COMMANDS } from "./layout/layoutStore";
import { registerViews } from "./layout/views";
import { EmptyEditor } from "./panels/EmptyEditor";
import { ErrorBar } from "./panels/ErrorBar";
import { Explorer } from "./panels/Explorer";
import { Keys } from "./panels/Keys";
import { MENU_COMMANDS, MenuBar, type Menu } from "./panels/MenuBar";
import { Panel } from "./panels/Panel";
import { Sidebar } from "./panels/Sidebar";
import { Sounds } from "./panels/Sounds";
import { TabBar } from "./panels/TabBar";
import { RUN_COMMANDS } from "./playback";
import { PREVIEW_COMMANDS } from "./samples/preview";
import { resolveLocalSamples } from "./samples/resolve";
import { SOUNDS_COMMANDS } from "./sounds/soundsStore";
import { persistSession, restoreSessionOnce } from "./session/persist";
import "./App.css";

// samples("./drums") in code loads that folder, relative to the file being evaluated.
engine.setLocalSampleResolver(resolveLocalSamples);

registerCommands([
  ...FILE_COMMANDS,
  ...RUN_COMMANDS,
  ...PREVIEW_COMMANDS,
  ...MENU_COMMANDS,
  ...LAYOUT_COMMANDS,
  ...KEYS_COMMANDS,
  ...SOUNDS_COMMANDS,
]);

registerViews([
  { id: "explorer", title: "Explorer", region: "sidebar", component: Explorer },
  { id: "sounds", title: "Sounds", region: "sidebar", component: Sounds },
  { id: "keys", title: "Keys", region: "panel", component: Keys },
]);

const MENUS: Menu[] = [
  {
    label: "File",
    groups: [
      ["file.new", "file.open", "file.openFolder"],
      ["file.save", "file.saveAs"],
      ["file.closeEditor", "file.closeFolder"],
    ],
  },
  {
    label: "View",
    groups: [["view.toggleSidebar", "view.togglePanel"], ["view.sounds", "view.keys"], ["editor.next", "editor.previous"]],
  },
  { label: "Run", groups: [["run.play", "run.stop"]] },
];

// The ways to get a file open, listed where the editor would be.
const START_COMMANDS = ["file.new", "file.open", "file.openFolder", "view.toggleSidebar"];

function App() {
  useKeyboard();
  useTabTracking();
  const noEditor = useTabs((s) => s.activeId === null);

  // Reopen what was open last time, then keep the session saved. Saving starts only
  // after restoring, so an empty start can never overwrite the saved session.
  useEffect(() => {
    let live = true;
    let stop: (() => void) | undefined;
    void restoreSessionOnce().then(() => {
      if (live) stop = persistSession();
    });
    return () => {
      live = false;
      stop?.();
    };
  }, []);

  return (
    <main className="app">
      <MenuBar menus={MENUS} />
      <div className="workbench">
        <Sidebar />
        <div className="editor-column">
          <TabBar />
          <StrudelEditor hidden={noEditor} />
          {noEditor && <EmptyEditor commands={START_COMMANDS} />}
          <ErrorBar />
          <Panel />
        </div>
      </div>
    </main>
  );
}

export default App;
