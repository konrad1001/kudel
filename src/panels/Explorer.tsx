import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createFileIn, openFile, openFolder, openPath, renameEntry } from "../files/actions";
import { selectActiveTab, useTabs } from "../files/tabsStore";
import {
  cancelNewFile,
  cancelRename,
  collapseAll,
  refresh,
  selectFile,
  startNewFile,
  toggleDir,
  useExplorer,
} from "../files/explorerStore";
import type { DirEntry } from "../files/native";
import { baseName, isAudioFile, isCodeFile, renameSelection, samePath } from "../files/paths";
import { openContextMenu } from "./ContextMenu";
import { SAMPLE_DRAG_TYPE, type DraggedSample } from "../editor/sampleDrop";
import { usePreview } from "../samples/preview";
import { openSample, useWaveform } from "../waveform/waveformStore";
import { RecentList } from "./RecentList";

// The sidebar's view of the open folder.
export function Explorer() {
  const root = useExplorer((s) => s.root);

  // Pick up files added or removed outside the app when the window comes back, and
  // whatever changed while the sidebar was hidden.
  useEffect(() => {
    void refresh();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  return <div className="explorer">{root ? <FolderView root={root} /> : <NoFolder />}</div>;
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
      <RecentList kind="folders" />
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
      {/* Focusable, so F2 and Delete reach the selected entry ("explorerFocus"). */}
      <div className="explorer-tree" role="tree" tabIndex={0}>
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
  const audio = !entry.isDir && isAudioFile(entry.name);
  // Shown in the Sample view, and sounding there (or in Import's [play]).
  const sampled = useWaveform((s) => samePath(s.path, entry.path));
  const sampling = useWaveform((s) => s.playing !== null && samePath(s.path, entry.path));
  const previewing = usePreview((s) => samePath(s.path, entry.path)) || sampling;
  const openable = entry.isDir || isCodeFile(entry.name) || audio;
  const isStrudel = entry.name.endsWith(".strudel");
  const selected = useExplorer((s) => samePath(s.selected, entry.path));
  const renaming = useExplorer((s) => samePath(s.renaming, entry.path));

  // An audio file opens in the Sample view, focused, ready for Space to play it.
  const onClick = () => {
    if (renaming) return;
    if (entry.isDir) {
      void toggleDir(entry.path);
      return;
    }
    selectFile(parent, entry.path);
    if (audio) openSample(entry.path, { focus: true });
    else if (openable) void openPath(entry.path);
  };

  // Selects the entry without opening it, then offers what F2 and Delete do.
  const onContextMenu = (event: MouseEvent) => {
    event.preventDefault();
    if (entry.isDir) useExplorer.setState({ selected: entry.path, targetDir: entry.path });
    else selectFile(parent, entry.path);
    openContextMenu(event.clientX, event.clientY, ["explorer.rename", "explorer.delete"]);
  };

  const entryName = !isStrudel ? entry.name : entry.name.slice(0, -8);

  const classes = [
    "explorer-row",
    active && "active",
    !openable && "dim",
    previewing && "previewing",
    sampled && "sampled",
    selected && "selected",
  ]
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
        onContextMenu={onContextMenu}
        // Audio files and folders drag into the editor as samples('./…') plus a sound name.
        draggable={!renaming && (entry.isDir || audio)}
        onDragStart={(event) => {
          const sample: DraggedSample = {
            path: entry.path,
            isDir: entry.isDir,
          };
          event.dataTransfer.setData(SAMPLE_DRAG_TYPE, JSON.stringify(sample));
          event.dataTransfer.effectAllowed = "copy";
        }}
      >
        <span
          className={["chevron", expanded && "open", audio && "audio", isStrudel && "strudel"]
            .filter(Boolean)
            .join(" ")}
        >
          {entry.isDir && CHEVRON}
          {audio && WAVE}
          {isStrudel && SPIRAL}
        </span>
        {renaming ? (
          <RenameInput entry={entry} />
        ) : (
          <span className="explorer-name">
            {entryName}
            <span className="explorer-file-extension">.strudel</span>
          </span>
        )}

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

// The entry's full name, its name before the extension selected (as in VS Code).
// Enter renames; Escape, or clicking elsewhere, leaves it as it was. Either way focus
// goes back to the tree, so F2 and Delete keep working.
function RenameInput({ entry }: { entry: DirEntry }) {
  const [name, setName] = useState(entry.name);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(...renameSelection(entry.name, entry.isDir));
  }, [entry]);

  const finish = () => {
    cancelRename();
    document.querySelector<HTMLElement>(".explorer-tree")?.focus();
  };
  return (
    <input
      ref={ref}
      className="explorer-input"
      spellCheck={false}
      value={name}
      onChange={(event) => setName(event.target.value)}
      onBlur={cancelRename}
      // Clicks in the box stay in the box (the row would open or toggle).
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") finish();
        if (event.key !== "Enter") return;
        const next = name.trim();
        finish();
        if (next && next !== entry.name) void renameEntry(entry.path, next);
      }}
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
const WAVE = svg("M2 8h1.5M4.5 5.5v5M7 3v10M9.5 5v6M12 6.5v3M14 8h0.5");
// Strudel's ꩜, drawn as quarter arcs of growing radius so it matches the other icons.
const SPIRAL = svg("M7.5 8.5a1 1 0 0 1 1 1a2 2 0 0 1-2 2a3 3 0 0 1-3-3a4 4 0 0 1 4-4a5 5 0 0 1 5 5");
const NEW_FILE = svg("M9.5 1.5H3.5v13h9V4.5zM9.5 1.5v3h3M8 7.5v5M5.5 10h5");
const REFRESH = svg("M13 8a5 5 0 1 1-1.5-3.6M13 2v3h-3");
const COLLAPSE = svg("M2.5 4.5h8v8h-8zM4.5 2.5h9v9M4.5 8.5h4");
