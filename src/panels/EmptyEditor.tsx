import { getCommand } from "../commands/commands";
import { keyFor, useKeybindings } from "../commands/keybindings";

// Shown in place of the editor when no file is open, listing `commands` (ids).
export function EmptyEditor({ commands }: { commands: string[] }) {
  const bindings = useKeybindings((s) => s.bindings);
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
    </div>
  );
}
