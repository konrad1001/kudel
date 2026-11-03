import { useEffect } from "react";
import * as engine from "./engine";
import { registerCommands } from "./commands/commands";
import { useKeyboard } from "./commands/useKeyboard";
import { SCRUB_COMMANDS } from "./editor/scrub";
import { SLIDER_COMMANDS } from "./editor/sliderToggle";
import { StrudelEditor } from "./editor/StrudelEditor";
import { FILE_COMMANDS } from "./files/actions";
import { useTabs } from "./files/tabsStore";
import { useTabTracking } from "./files/useTabTracking";
import { IMPORT_COMMANDS } from "./importer/importStore";
import { KEYS_COMMANDS } from "./keys/keysStore";
import { LAYOUT_COMMANDS, useLayout } from "./layout/layoutStore";
import { registerViews } from "./layout/views";
import { Aside } from "./panels/Aside";
import { CONTEXT_MENU_COMMANDS, ContextMenu } from "./panels/ContextMenu";
import { EmptyEditor } from "./panels/EmptyEditor";
import { ErrorBar } from "./panels/ErrorBar";
import { Explorer } from "./panels/Explorer";
import { Import } from "./panels/Import";
import { Keys } from "./panels/Keys";
import { MENU_COMMANDS, MenuBar, type Menu } from "./panels/MenuBar";
import { Panel } from "./panels/Panel";
import { Reference } from "./panels/Reference";
import { Sample, SampleTitle } from "./panels/Sample";
import { Sidebar } from "./panels/Sidebar";
import { Sounds } from "./panels/Sounds";
import { StatusBar } from "./panels/StatusBar";
import { TabBar } from "./panels/TabBar";
import { useNoPageZoom } from "./pageZoom";
import { RUN_COMMANDS } from "./playback";
import { REFERENCE_COMMANDS } from "./reference/referenceStore";
import { PREVIEW_COMMANDS } from "./samples/preview";
import { resolveLocalSamples } from "./samples/resolve";
import { SOUNDS_COMMANDS } from "./sounds/soundsStore";
import { STATUS_COMMANDS } from "./status/statusStore";
import { persistSession, restoreSessionOnce } from "./session/persist";
import { SAMPLE_COMMANDS } from "./waveform/waveformStore";
import "./App.css";

// samples("./drums") in code loads that folder, relative to the file being evaluated.
engine.setLocalSampleResolver(resolveLocalSamples);

registerCommands([
  ...FILE_COMMANDS,
  ...RUN_COMMANDS,
  ...PREVIEW_COMMANDS,
  ...MENU_COMMANDS,
  ...CONTEXT_MENU_COMMANDS,
  ...LAYOUT_COMMANDS,
  ...KEYS_COMMANDS,
  ...IMPORT_COMMANDS,
  ...SAMPLE_COMMANDS,
  ...SOUNDS_COMMANDS,
  ...REFERENCE_COMMANDS,
  ...STATUS_COMMANDS,
  ...SCRUB_COMMANDS,
  ...SLIDER_COMMANDS,
]);

registerViews([
  { id: "explorer", title: "Explorer", region: "sidebar", component: Explorer },
  { id: "sounds", title: "Sounds", region: "sidebar", component: Sounds },
  { id: "keys", title: "Keys", region: "panel", component: Keys },
  { id: "import", title: "Import", region: "panel", component: Import },
  { id: "sample", title: "Sample", region: "panel", component: Sample, Title: SampleTitle },
  { id: "reference", title: "Reference", region: "aside", component: Reference },
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
    groups: [
      ["view.toggleSidebar", "view.togglePanel", "view.toggleAside", "view.toggleMaximised"],
      ["view.sounds", "view.keys", "view.import", "view.sample", "view.reference", "reference.lookUp"],
      ["editor.next", "editor.previous"],
    ],
  },
  { label: "Run", groups: [["run.play", "run.stop"], ["run.revealError"]] },
];

// The ways to get a file open, listed where the editor would be.
const START_COMMANDS = ["file.new", "file.open", "file.openFolder", "view.toggleSidebar"];

function App() {
  useKeyboard();
  useNoPageZoom();
  useTabTracking();
  const noEditor = useTabs((s) => s.activeId === null);
  const maximised = useLayout((s) => s.maximised && s.aside.visible);

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
      <div className={maximised ? "workbench maximised" : "workbench"}>
        <Sidebar />
        <div className="editor-column">
          <TabBar />
          <StrudelEditor hidden={noEditor} />
          {noEditor && <EmptyEditor commands={START_COMMANDS} />}
          <ErrorBar />
          <Panel />
        </div>
        <Aside />
      </div>
      <StatusBar />
      <ContextMenu />
    </main>
  );
}

export default App;
