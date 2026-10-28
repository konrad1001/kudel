import { StrudelEditor } from "./editor/StrudelEditor";
import { FILE_ACTIONS, VIEW_ACTIONS } from "./files/actions";
import { useTabs } from "./files/tabsStore";
import { useTabTracking } from "./files/useTabTracking";
import { EmptyEditor } from "./panels/EmptyEditor";
import { ErrorBar } from "./panels/ErrorBar";
import { Explorer } from "./panels/Explorer";
import { MenuBar, type Menu } from "./panels/MenuBar";
import { TabBar } from "./panels/TabBar";
import { RUN_ACTIONS } from "./playback";
import { useShortcuts } from "./shortcuts";
import "./App.css";

const MENUS: Menu[] = [
  { label: "File", groups: FILE_ACTIONS },
  { label: "View", groups: VIEW_ACTIONS },
  { label: "Run", groups: RUN_ACTIONS },
];
const ACTIONS = MENUS.flatMap((menu) => menu.groups.flat());
// The ways to get a file open, listed where the editor would be.
const START_ACTIONS = [...FILE_ACTIONS[0], ...VIEW_ACTIONS[0]];

function App() {
  useShortcuts(ACTIONS);
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
          {noEditor && <EmptyEditor actions={START_ACTIONS} />}
          <ErrorBar />
        </div>
      </div>
    </main>
  );
}

export default App;
