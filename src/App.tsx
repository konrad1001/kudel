import * as engine from "./engine";
import { registerCommands } from "./commands/commands";
import { useKeyboard } from "./commands/useKeyboard";
import { StrudelEditor } from "./editor/StrudelEditor";
import { FILE_COMMANDS } from "./files/actions";
import { useTabs } from "./files/tabsStore";
import { useTabTracking } from "./files/useTabTracking";
import { EmptyEditor } from "./panels/EmptyEditor";
import { ErrorBar } from "./panels/ErrorBar";
import { Explorer } from "./panels/Explorer";
import { MENU_COMMANDS, MenuBar, type Menu } from "./panels/MenuBar";
import { TabBar } from "./panels/TabBar";
import { RUN_COMMANDS } from "./playback";
import { PREVIEW_COMMANDS } from "./samples/preview";
import { resolveLocalSamples } from "./samples/resolve";
import "./App.css";

// samples("./drums") in code loads that folder, relative to the file being evaluated.
engine.setLocalSampleResolver(resolveLocalSamples);

registerCommands([...FILE_COMMANDS, ...RUN_COMMANDS, ...PREVIEW_COMMANDS, ...MENU_COMMANDS]);

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
    groups: [["view.toggleExplorer"], ["editor.next", "editor.previous"]],
  },
  { label: "Run", groups: [["run.play", "run.stop"]] },
];

// The ways to get a file open, listed where the editor would be.
const START_COMMANDS = ["file.new", "file.open", "file.openFolder", "view.toggleExplorer"];

function App() {
  useKeyboard();
  useTabTracking();
  const noEditor = useTabs((s) => s.activeId === null);

  return (
    <main className="app">
      <MenuBar menus={MENUS} />
      <div className="workbench">
        <Explorer />
        <div className="editor-column">
          <TabBar />
          <StrudelEditor hidden={noEditor} />
          {noEditor && <EmptyEditor commands={START_COMMANDS} />}
          <ErrorBar />
        </div>
      </div>
    </main>
  );
}

export default App;
