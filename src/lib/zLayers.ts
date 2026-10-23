/**
 * The app's stacking ladder, in one place.
 *
 * Every `fixed`-positioned surface — page chrome, the floating nav, modals,
 * side panels, banners, dropdowns — competes for the same z-axis, and the
 * order between them is a whole-app decision that cannot be read off any
 * single component. Scattered as `z-50` / `z-[70]` Tailwind utilities it was
 * exactly that: unreadable, and impossible to change without grepping.
 *
 * These are applied as an inline `zIndex` rather than a generated class name
 * on purpose. Tailwind only emits the utilities it can find as literal text in
 * the source, so a computed `` `z-[${...}]` `` silently produces no CSS at
 * all — the one failure mode this file would otherwise invite.
 *
 * Local stacking *inside* a component (a dropdown over its own card, a header
 * over its own scroll area) is not part of this ladder and stays as a plain
 * `relative z-10`-style utility where it is used.
 */
export const Z = {
  /**
   * Fixed page chrome: the top-left Back/Home controls, the Home header, the
   * corner "capture" buttons. Deliberately the lowest rung — everything below
   * is page content, everything above is something the user opened.
   */
  chrome: 40,

  /**
   * A deleted row's dust (idea 48, `lib/dust.ts`). Over the page it was on and
   * under everything opened over it: deleted from a sheet, the dust drifts out
   * from behind the sheet as it closes rather than across its face.
   */
  dust: 39,

  /**
   * The dotted line from a blocked task to what it waits on (idea 164,
   * `project/BlockWires.tsx`). Over the cards it joins, under the dust and
   * everything opened over the board.
   */
  wires: 38,

  /**
   * The chat page's edge light while Atlas works (idea 67, `ui/feedback/
   * EdgeLight.tsx`). Over the page and its chrome, under the nav and
   * everything opened over the page; it cannot be pressed.
   */
  edgeLight: 45,

  /** The floating bottom nav. Sits above page chrome, below anything opened. */
  nav: 50,

  /** Transient toasts that ride above the page but under nothing else. */
  toast: 50,

  /** A standard full-screen modal — backdrop and dialog share the rung. */
  modal: 50,

  /**
   * Side panels, app-level sync banners, and the modals that have to clear
   * them. A banner reporting that sync is broken must stay readable over an
   * open modal, which is why this rung exists at all.
   */
  panel: 60,

  /** A modal opened *from* a modal (PERT from task detail, repeat from Needs Attention). */
  modalOverModal: 70,

  /** The `?` shortcut sheet — a global surface, above every overlay. */
  shortcuts: 100,

  /**
   * The command palette (BUILD-9). Global like the shortcut sheet, and a step
   * above it: Ctrl+K works from inside any sheet, the `?` one included, and
   * whatever it was pressed over has to sit under what it opened.
   */
  palette: 110,

  /**
   * Dock mode (items 24/25). Not an overlay on a screen — it *is* the screen
   * while it is on, and the tablet is across the room, so nothing the app
   * happens to have left open may show through or sit on top of it. Above the
   * shortcut sheet for that reason and below the drag ghost, which cannot be
   * flying while a tablet is docked.
   */
  dock: 200,

  /** The cursor-following drag ghost, which must outrank whatever it flies over. */
  dragGhost: 999,

  /**
   * Portalled dropdowns. Escapes the ladder entirely: it renders into
   * `document.body` from inside surfaces at any rung, so it has to clear all
   * of them, including a drag ghost.
   */
  dropdown: 99999,

  /**
   * The keyboard focus ring that glides between controls (idea 70, 29-1P1,
   * `ui/core/FocusGlide.tsx`). Above everything, dropdowns included, because it
   * marks whatever is focused wherever it sits; it takes no pointer events.
   */
  focusRing: 100000,
} as const;
