import { getCommand } from "../commands/commands";
import { keyFor, useKeybindings } from "../commands/keybindings";
import { useRecent } from "../files/recentStore";
import { RecentList } from "./RecentList";

// Shown in place of the editor when no file is open: `commands` (ids) to start
// from, and what was opened recently.
export function EmptyEditor({ commands }: { commands: string[] }) {
  const bindings = useKeybindings((s) => s.bindings);
  const hasRecent = useRecent((s) => s.files.length + s.folders.length > 0);
  return (
    <div className="editor-empty">
      <div className="editor-empty-name">Strudel Studio</div>
      <dl className="editor-empty-actions">
        {commands.map((id) => {
          const command = getCommand(id);
          if (!command) return null;
          return (
            <div key={id} className="editor-empty-action" onClick={() => command.run()}>
              <dt>{command.label.replace(/…$/, "")}</dt>
              <dd>{keyFor(bindings, id)}</dd>
            </div>
          );
        })}
      </dl>
      {hasRecent && (
        <div className="editor-empty-recent">
          <div className="editor-empty-heading">Recent</div>
          <RecentList kind="folders" />
          <RecentList kind="files" />
        </div>
      )}
    </div>
  );
}
