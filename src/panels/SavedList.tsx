import type { DragEvent } from "react";

// A panel's saved items (the Synth view's sounds, the Drums view's loops), by name:
// click one to edit it, drag it into the editor as code, x to remove it.
export function SavedList<T extends { name: string }>({
  items,
  current,
  codeFor,
  onOpen,
  onRemove,
  empty,
}: {
  items: T[];
  // The name being edited, marked in the list.
  current: string;
  codeFor(item: T): string;
  onOpen(name: string): void;
  onRemove(name: string): void;
  // Shown while nothing is saved.
  empty: string;
}) {
  return (
    <>
      <ul className="saved-list">
        {items.map((item) => (
          <li
            key={item.name}
            className={item.name === current ? "saved-item current" : "saved-item"}
            draggable
            onDragStart={(event) => dragCode(event, codeFor(item))}
            onClick={() => onOpen(item.name)}
            title={`Click to edit, drag into the code\n\n${codeFor(item)}`}
          >
            <span className="saved-name">{item.name}</span>
            <button
              type="button"
              className="ascii-button saved-remove"
              aria-label={`Remove ${item.name}`}
              title="Remove from saved"
              onClick={(event) => {
                event.stopPropagation();
                onRemove(item.name);
              }}
            >
              x
            </button>
          </li>
        ))}
      </ul>
      {items.length === 0 && <div className="saved-empty">{empty}</div>}
    </>
  );
}

// Dragging carries code as plain text, which CodeMirror inserts where it's dropped, as
// one undoable change.
export function dragCode(event: DragEvent, code: string): void {
  event.dataTransfer.setData("text/plain", code);
  event.dataTransfer.effectAllowed = "copy";
}
