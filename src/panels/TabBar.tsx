import { useEffect, useRef } from "react";
import { activateTab, closeTab } from "../files/actions";
import { tabTitle, type Tab } from "../files/tabs";
import { useTabs } from "../files/tabsStore";

export function TabBar() {
  const tabs = useTabs((s) => s.tabs);
  const barRef = useRef<HTMLDivElement>(null);
  const activeId = useTabs((s) => s.activeId);

  // Keep the active tab in view when there are more tabs than fit.
  useEffect(() => {
    barRef.current?.querySelector(".tab.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);

  if (tabs.length === 0) return null;
  return (
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
  );
}

function TabItem({ tab }: { tab: Tab }) {
  const active = useTabs((s) => s.activeId === tab.id);
  const playing = useTabs((s) => s.playingId === tab.id);
  const title = tabTitle(tab);
  const classes = ["tab", active && "active", tab.dirty && "dirty"].filter(Boolean).join(" ");

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
        <span className="tab-playing" title="Playing">
          ▶
        </span>
      )}
      <span className="tab-title">{title}</span>
      <button
        type="button"
        className="tab-close"
        aria-label={`Close ${title}`}
        title="Close (Ctrl+W)"
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
