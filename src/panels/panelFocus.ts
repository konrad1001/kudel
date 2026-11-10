import type { MouseEvent } from "react";

// Keeping focus on a panel (the Synth and Drums views) while its controls are clicked.
// A focused button or checkbox takes Space for itself (it clicks or toggles), so the
// panel's own Space (play) would toggle the effect you just clicked instead; and while
// a checkbox has focus, the panel's letter keys don't reach the panel. So clicks on
// those don't take focus, and focus goes to the panel instead.

const CLICK_ONLY = "button, input[type=checkbox], input[type=radio], label";

// For the panel root's onMouseDown. Text fields and dropdowns still take focus: they
// need it to be typed in or opened.
export function keepFocusOnPanel(event: MouseEvent<HTMLElement>): void {
  const target = event.target as HTMLElement;
  if (!target.closest(CLICK_ONLY) || target.closest("input:not([type=checkbox]):not([type=radio]), select, textarea")) return;
  event.preventDefault();
  event.currentTarget.focus();
}

// Gives focus back to the panel an element is in (after picking from a dropdown).
export function focusPanelOf(element: Element): void {
  element.closest<HTMLElement>("[data-autofocus]")?.focus();
}
