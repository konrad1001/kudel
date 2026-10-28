import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { createFileIn, openFile, openFolder, openPath } from "../files/actions";
import { selectActiveTab, useTabs } from "../files/tabsStore";
import {
  cancelNewFile,
  collapseAll,
  refresh,
  selectFile,
  setWidth,
  startNewFile,
  toggleDir,
  useExplorer,
} from "../files/explorerStore";
import type { DirEntry } from "../files/native";
import { baseName, isCodeFile, samePath } from "../files/paths";

export function Explorer() {
  const root = useExplorer((s) => s.root);
  const visible = useExplorer((s) => s.visible);
  const width = useExplorer((s) => s.width);

  // Pick up files added or removed outside the app when the window comes back.
  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  if (!visible) return null;
  return (
    <aside className="explorer" style={{ width }}>
      <div className="explorer-title">Explorer</div>
      {root ? <FolderView root={root} /> : <NoFolder />}
      <ResizeHandle />
    </aside>
  );
}

function NoFolder() {
  return (
    <div className="explorer-empty">
      <p>No folder is open.</p>
      <button type="button" onClick={openFolder}>
        Open Folder
      </button>
      <button type="button" onClick={openFile}>
        Open File
      </button>
    </div>
  );
}

function FolderView({ root }: { root: string }) {
  const missing = useExplorer((s) => s.rootMissing);
  return (
    <>
      <div className="explorer-header" title={root}>
        <span className="explorer-folder">{baseName(root)}</span>
        <IconButton title="New File" onClick={startNewFile} icon={NEW_FILE} />
        <IconButton title="Refresh" onClick={refresh} icon={REFRESH} />
        <IconButton
          title="Collapse Folders"
          onClick={collapseAll}
          icon={COLLAPSE}
        />
      </div>
      <div className="explorer-tree" role="tree">
        {missing ? (
          <p className="explorer-empty">Folder not found.</p>
        ) : (
          <DirChildren dir={root} depth={0} />
        )}
      </div>
    </>
  );
}

function DirChildren({ dir, depth }: { dir: string; depth: number }) {
  const entries = useExplorer((s) => s.children[dir]);
  const creating = useExplorer((s) => s.creatingIn === dir);
  return (
    <>
      {creating && <NewFileInput dir={dir} depth={depth} />}
      {entries?.map((entry) => (
        <EntryRow key={entry.path} entry={entry} parent={dir} depth={depth} />
      ))}
    </>
  );
}

function EntryRow({
  entry,
  parent,
  depth,
}: {
  entry: DirEntry;
  parent: string;
  depth: number;
}) {
  const expanded = useExplorer((s) => !!s.expanded[entry.path]);
  const active = useTabs((s) =>
    samePath(selectActiveTab(s)?.filePath ?? null, entry.path),
  );
  const dirty = useTabs((s) =>
    s.tabs.some((tab) => tab.dirty && samePath(tab.filePath, entry.path)),
  );
  const playing = useTabs((s) =>
    s.tabs.some(
      (tab) => tab.id === s.playingId && samePath(tab.filePath, entry.path),
    ),
  );
  const openable = entry.isDir || isCodeFile(entry.name);

  const onClick = () => {
    if (entry.isDir) {
      void toggleDir(entry.path);
      return;
    }
    selectFile(parent);
    if (openable) void openPath(entry.path);
  };

  const entryName = !entry.name.endsWith(".strudel")
    ? entry.name
    : entry.name.slice(0, -8);

  console.log(entryName);

  const classes = ["explorer-row", active && "active", !openable && "dim"]
    .filter(Boolean)
    .join(" ");
  return (
    <>
      <div
        className={classes}
        role="treeitem"
        aria-expanded={entry.isDir ? expanded : undefined}
        aria-selected={active}
        style={{ paddingLeft: indent(depth) }}
        title={entry.path}
        onClick={onClick}
      >
        <span className={`chevron${expanded ? " open" : ""}`}>
          {entry.isDir && CHEVRON}
        </span>
        <span className="explorer-name">
          {entryName}
          <span className="explorer-file-extension">.strudel</span>
        </span>

        {playing && (
          <span className="playing-mark" title="Playing">
            ▶
          </span>
        )}
        {dirty && <span className="dirty-dot">●</span>}
      </div>
      {entry.isDir && expanded && (
        <DirChildren dir={entry.path} depth={depth + 1} />
      )}
    </>
  );
}

function NewFileInput({ dir, depth }: { dir: string; depth: number }) {
  const [name, setName] = useState("");
  return (
    <div className="explorer-row" style={{ paddingLeft: indent(depth) }}>
      <span className="chevron" />
      <input
        className="explorer-input"
        autoFocus
        spellCheck={false}
        placeholder="name.strudel"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={cancelNewFile}
        onKeyDown={(event) => {
          if (event.key === "Escape") cancelNewFile();
          if (event.key !== "Enter") return;
          cancelNewFile();
          if (name.trim()) void createFileIn(dir, name);
        }}
      />
    </div>
  );
}

function ResizeHandle() {
  const dragging = useRef(false);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const left =
      event.currentTarget.parentElement?.getBoundingClientRect().left ?? 0;
    setWidth(event.clientX - left);
  };
  return (
    <div
      className="explorer-resize"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (dragging.current = false)}
    />
  );
}

function IconButton({
  title,
  onClick,
  icon,
}: {
  title: string;
  onClick: () => unknown;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      className="icon-button"
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

const indent = (depth: number) => 8 + depth * 12;

const svg = (path: string) => (
  <svg
    viewBox="0 0 16 16"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2"
  >
    <path d={path} />
  </svg>
);

const CHEVRON = svg("M6 4l4 4-4 4");
const NEW_FILE = svg("M9.5 1.5H3.5v13h9V4.5zM9.5 1.5v3h3M8 7.5v5M5.5 10h5");
const REFRESH = svg("M13 8a5 5 0 1 1-1.5-3.6M13 2v3h-3");
const COLLAPSE = svg("M2.5 4.5h8v8h-8zM4.5 2.5h9v9M4.5 8.5h4");
