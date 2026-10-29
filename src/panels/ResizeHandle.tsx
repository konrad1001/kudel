import { useRef, type PointerEvent } from "react";
import { setRegionSize } from "../layout/layoutStore";
import type { Region } from "../layout/views";

// Drag handle on the inner edge of a region: the sidebar's right edge, the panel's top.
export function ResizeHandle({ region }: { region: Region }) {
  const dragging = useRef(false);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const box = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!box) return;
    setRegionSize(region, region === "sidebar" ? event.clientX - box.left : box.bottom - event.clientY);
  };
  return (
    <div
      className={`resize-handle ${region}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => (dragging.current = false)}
    />
  );
}
