import { useRef, type PointerEvent } from "react";

// Drag handle on an inner edge of its parent: the right edge sets the parent's width
// (the sidebar), the top edge its height (the panel, a sidebar section).
export function ResizeHandle({ edge, onResize }: { edge: "right" | "top"; onResize: (size: number) => void }) {
  const dragging = useRef(false);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const box = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!box) return;
    onResize(edge === "right" ? event.clientX - box.left : box.bottom - event.clientY);
  };
  return (
    <div
      className={`resize-handle ${edge}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (dragging.current = false)}
    />
  );
}
