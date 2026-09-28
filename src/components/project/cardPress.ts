/**
 * Project board — "was this press the card's, or a control's?" (UI-29)
 *
 * `screens/project.html` makes the whole task card the door into the sheet and
 * guards it with one line:
 *
 *     if (e.target.closest('button, a, label, input, [role="button"]')) return;
 *
 * In the prototype that is enough. In the app it is wrong twice, in opposite
 * directions, and both were measured — each one silently broke a screenshot
 * the moment the card became clickable:
 *
 * 1. **`closest()` escapes upwards, into dnd-kit.** With no dedicated handle,
 *    `SortableRow`'s wrapper carries dnd-kit's `attributes`, and those include
 *    `role="button"` so the row is focusable and draggable from the keyboard.
 *    A bare `closest()` therefore matches that wrapper from *anywhere* inside
 *    the card, and nothing ever opened.
 *
 * 2. **A React portal bubbles here even though it is not inside here.** The
 *    row's ⋯ panel is portalled to `<body>` (a list card is `overflow: hidden`,
 *    so an in-flow panel is clipped by the column — MorphMenu's port note 4),
 *    but React propagates events along the COMPONENT tree, not the DOM tree.
 *    So a press on "Delete task" inside that panel reaches the card's
 *    `onClick`, where a DOM containment test says it came from outside and
 *    lets it through — arming the delete confirm *and* opening the sheet
 *    behind it.
 *
 * So the walk runs from the target up to the card and stops there, and
 * anything that did not start inside the card is not the card's press.
 *
 * It starts from `Element`, not `HTMLElement`, for the reason CLAUDE.md
 * records: an icon-only button contains an `<svg>`, and an `SVGElement` is not
 * an `HTMLElement`. Narrowing the type there once made every glyph in the app
 * a drag handle for the row behind it.
 */
import type { MouseEvent } from 'react';

/** Everything that owns its own press. The prototype's list, plus the two the
 *  app actually has inside a row (`textarea`, `select`) and the menu panel. */
const CONTROLS = 'button, a, label, input, textarea, select, [role="button"], [role="menu"]';

/**
 * True when the press belongs to something other than the card — a control
 * inside it, or a portalled panel that only *looks* like a descendant.
 */
export function pressedAControl(e: MouseEvent<HTMLElement>): boolean {
  const card = e.currentTarget;
  let node: Element | null = e.target as Element;

  if (!card.contains(node)) return true;

  while (node && node !== card) {
    if (node.matches(CONTROLS)) return true;
    node = node.parentElement;
  }
  return false;
}
