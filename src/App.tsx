import { StrudelEditor } from "./editor/StrudelEditor";
import { FILE_ACTIONS } from "./files/actions";
import { ErrorBar } from "./panels/ErrorBar";
import { MenuBar, type Menu } from "./panels/MenuBar";
import { useShortcuts } from "./shortcuts";
import "./App.css";

const MENUS: Menu[] = [{ label: "File", actions: FILE_ACTIONS }];
const ACTIONS = MENUS.flatMap((menu) => menu.actions);

function App() {
  useShortcuts(ACTIONS);

  return (
    <main className="app">
      <MenuBar menus={MENUS} />
      <StrudelEditor />
      <ErrorBar />
    </main>
  );
}

export default App;
