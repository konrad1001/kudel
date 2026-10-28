import type { Action } from "../shortcuts";

// Shown in place of the editor when no file is open.
export function EmptyEditor({ actions }: { actions: Action[] }) {
  return (
    <div className="editor-empty">
      <div className="editor-empty-name">Strudel Studio</div>
      <dl className="editor-empty-actions">
        {actions.map((action) => (
          <div key={action.label} className="editor-empty-action" onClick={() => action.run()}>
            <dt>{action.label.replace(/…$/, "")}</dt>
            <dd>{action.shortcut}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
