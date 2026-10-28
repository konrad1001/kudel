import { StrudelEditor } from "./editor/StrudelEditor";
import { ErrorBar } from "./panels/ErrorBar";
import "./App.css";

function App() {
  return (
    <main className="app">
      <StrudelEditor />
      <ErrorBar />
    </main>
  );
}

export default App;
