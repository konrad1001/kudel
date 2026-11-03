import type { ReactNode } from "react";
import { useKeyFor, withKey } from "../commands/keybindings";
import { showView, toggleRegion } from "../layout/layoutStore";
import { viewsIn, type Region, type View } from "../layout/views";

// The header of the panel and the aside: their views as tabs (or the one view's title),
// any extra buttons, and a close button.
export function RegionHeader({
  region,
  shown,
  closeCommand,
  closeLabel,
  children,
}: {
  region: Region;
  shown: View;
  closeCommand: string;
  closeLabel: string;
  children?: ReactNode;
}) {
  const closeKey = useKeyFor(closeCommand);
  const views = viewsIn(region);
  return (
    <header className="panel-header">
      {views.length > 1 ? (
        <div className="panel-tabs" role="tablist">
          {views.map((view) => (
            <button
              key={view.id}
              type="button"
              role="tab"
              aria-selected={view.id === shown.id}
              className="panel-tab"
              onClick={() => showView(view.id, { focus: true })}
            >
              {view.Title ? <view.Title /> : view.title}
            </button>
          ))}
        </div>
      ) : (
        <span className="panel-title">{shown.Title ? <shown.Title /> : shown.title}</span>
      )}
      <div className="panel-buttons">
        {children}
        <button
          type="button"
          className="panel-button"
          title={withKey(closeLabel, closeKey)}
          aria-label={closeLabel}
          onClick={() => toggleRegion(region)}
        >
          ×
        </button>
      </div>
    </header>
  );
}
