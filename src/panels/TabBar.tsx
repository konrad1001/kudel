import { useEffect, useRef } from "react";
import { activateTab, closeTab } from "../files/actions";
import { tabTitle, type Tab } from "../files/tabs";
import { useTabs } from "../files/tabsStore";
import { useKeyFor, withKey } from "../commands/keybindings";
import { toggleRegion, useLayout } from "../layout/layoutStore";
import { play, stop } from "../playback";

export function TabBar() {
  const tabs = useTabs((s) => s.tabs);
  const barRef = useRef<HTMLDivElement>(null);
  const activeId = useTabs((s) => s.activeId);

  // Keep the active tab in view when there are more tabs than fit.
  useEffect(() => {
    barRef.current
      ?.querySelector(".tab.active")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);

  if (tabs.length === 0) return null;
  return (
    <div className="editor-header">
      <div
        ref={barRef}
        className="tab-bar"
        role="tablist"
        // A mouse wheel scrolls the tabs sideways.
        onWheel={(event) => {
          if (barRef.current) barRef.current.scrollLeft += event.deltaY;
        }}
      >
        {tabs.map((tab) => (
          <TabItem key={tab.id} tab={tab} />
        ))}
      </div>
      <div className="editor-actions">
        <PlayButton />
        <AsideButton />
      </div>
    </div>
  );
}

// Plays the active tab, or stops it when it is the one playing. Playing a tab while
// another plays replaces it, as Ctrl+Enter does.
function PlayButton() {
  const playingHere = useTabs(
    (s) => s.activeId !== null && s.playingId === s.activeId,
  );
  const stopKey = useKeyFor("run.stop");
  const playKey = useKeyFor("run.play");
  const label = playingHere ? withKey("Stop", stopKey) : withKey("Play", playKey);
  return (
    <button
      type="button"
      className={`play-button${playingHere ? " playing" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={playingHere}
      onClick={playingHere ? stop : play}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
        <path d={playingHere ? "M4 4h8v8H4z" : "M5 3l8 5-8 5z"} />
      </svg>
    </button>
  );
}

// Shows or hides the right side bar (the reference). Its right column fills while shown.
function AsideButton() {
  const shown = useLayout((s) => s.aside.visible);
  const key = useKeyFor("view.toggleAside");
  const label = withKey(shown ? "Hide Right Side Bar" : "Show Right Side Bar", key);
  return (
    <button
      type="button"
      className="editor-action"
      title={label}
      aria-label={label}
      aria-pressed={shown}
      onClick={() => toggleRegion("aside")}
    >
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.2">
        <rect x="2.5" y="3.5" width="11" height="9" rx="1" />
        <path d="M9.5 3.5v9" />
        {shown && <rect x="9.5" y="3.5" width="4" height="9" fill="currentColor" stroke="none" />}
      </svg>
    </button>
  );
}

function TabItem({ tab }: { tab: Tab }) {
  const active = useTabs((s) => s.activeId === tab.id);
  const playing = useTabs((s) => s.playingId === tab.id);
  const title = tabTitle(tab);
  const closeKey = useKeyFor("file.closeEditor");
  const classes = ["tab", active && "active", tab.dirty && "dirty"]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      role="tab"
      aria-selected={active}
      title={tab.filePath ?? title}
      onClick={() => activateTab(tab.id)}
      // Middle click closes, as in VS Code; preventing mousedown stops auto-scroll.
      onMouseDown={(event) => event.button === 1 && event.preventDefault()}
      onAuxClick={(event) => event.button === 1 && closeTab(tab.id)}
    >
      {playing && (
        <span className="playing-mark" title="Playing">
          ▶
        </span>
      )}
      <span className="tab-title">{title}</span>
      <button
        type="button"
        className="tab-close"
        aria-label={`Close ${title}`}
        title={withKey("Close", closeKey)}
        onClick={(event) => {
          event.stopPropagation();
          void closeTab(tab.id);
        }}
      >
        <span className="tab-dot">●</span>
        <span className="tab-x">×</span>
      </button>
    </div>
  );
}
