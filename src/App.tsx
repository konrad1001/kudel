import { StrudelEditor } from "./editor/StrudelEditor";
import { FILE_ACTIONS, VIEW_ACTIONS } from "./files/actions";
import { useDocumentTracking } from "./files/useDocumentTracking";
import { ErrorBar } from "./panels/ErrorBar";
import { Explorer } from "./panels/Explorer";
import { MenuBar, type Menu } from "./panels/MenuBar";
import { useShortcuts } from "./shortcuts";
import "./App.css";

const MENUS: Menu[] = [
  { label: "File", groups: FILE_ACTIONS },
  { label: "View", groups: VIEW_ACTIONS },
];
const ACTIONS = MENUS.flatMap((menu) => menu.groups.flat());

function App() {
  useShortcuts(ACTIONS);
  useDocumentTracking();

  return (
    <main className="app">
      <MenuBar menus={MENUS} />
      <div className="workbench">
        <Explorer />
        <div className="editor-column">
          <StrudelEditor />
          <ErrorBar />
        </div>
      </div>
    </main>
  );
}

export default App;
