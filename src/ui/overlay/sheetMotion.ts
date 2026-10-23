/**
 * How a sheet arrives (29-1P6a, BIG-15): ideas 54 and 58.
 *
 * 58 THE PAGE SINKS BEHIND A SHEET (iOS sheets). While any `Dialog` is open
 *    the whole app behind it shrinks back a little and rounds its corners, so
 *    it is plain what is on top; the scrim already dims it. It is one rule in
 *    `core/motionPieces.css` on `#root`, switched by `data-sheet-sunk` on
 *    <html>, which `sinkPage` counts (a sheet over a sheet keeps it down).
 *    `#root` is the viewport's own size and the page never scrolls the window
 *    (every screen scrolls an inner box), so a `scale` there moves the rail,
 *    the floating nav and every fixed bar with the page and none of them
 *    jumps. Dialogs, menus and toasts are portalled to <body>, outside it, so
 *    nothing on top shrinks. At rest the property is `none`: any other value
 *    would make `#root` the containing block of every fixed thing for good.
 *
 * 54 A TASK OPENS FROM ITS ROW (App Store's Today cards). The sheet starts as
 *    the row's own box and grows into place, then shrinks back into the same
 *    spot when it closes, so he never loses his place. `findOrigin` picks the
 *    row: of the elements matching the sheet's selector (a task's rows all
 *    carry `data-dust="task:<id>"` already, 29-1P4c), the one he just pressed,
 *    else the first one on screen; none, and the sheet arrives as before.
 *
 * Measured, not assumed: the row's box is read before the page sinks on the
 * way in, and un-scaled out of the sunk page on the way out (`unsunk`), so the
 * sheet lands where the row will be once the page has risen, not where it is
 * for that one frame.
 */

const SUNK_ATTR = 'data-sheet-sunk';
/** Where the page shrinks towards, down the screen — `transform-origin` in motionPieces.css. */
const SINK_ORIGIN_Y = 0.4;

let sunkCount = 0;

/** One sheet opening (`true`) or closing (`false`). Counted, so the page rises only after the last. */
export function sinkPage(on: boolean): void {
  if (typeof document === 'undefined') return;
  sunkCount = Math.max(0, sunkCount + (on ? 1 : -1));
  if (sunkCount > 0) document.documentElement.setAttribute(SUNK_ATTR, '');
  else document.documentElement.removeAttribute(SUNK_ATTR);
}

/* The last thing he pressed, so a task shown twice on one screen (a shared
   list, the Dashboard's Today and Overdue) opens from the copy he touched.
   One listener for the app, on the capture phase so it runs before the
   press's own handler opens the sheet. */
let lastPress: { el: Element; at: number } | null = null;
let tracking = false;
function track() {
  if (tracking || typeof document === 'undefined') return;
  tracking = true;
  const note = (e: Event) => {
    if (e.target instanceof Element) lastPress = { el: e.target, at: performance.now() };
  };
  document.addEventListener('pointerdown', note, true);
  document.addEventListener('click', note, true);
}
track();

const PRESS_FRESH_MS = 1500;

function onScreen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
}

/** The row a sheet grows from (see the header), or null. `inside` is the sheet itself, never a candidate. */
export function findOrigin(selector: string, inside?: Element | null): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let all: HTMLElement[];
  try {
    all = Array.from(document.querySelectorAll<HTMLElement>(selector));
  } catch {
    return null;
  }
  const live = all.filter((el) => !(inside && inside.contains(el)) && onScreen(el));
  if (live.length === 0) return null;
  const press = lastPress && performance.now() - lastPress.at < PRESS_FRESH_MS ? lastPress.el : null;
  return (press && live.find((el) => el.contains(press))) || live[0];
}

/** `el`'s box as it will be once the page is not sunk — exact at any point of the sink. */
export function unsunk(el: Element): DOMRect {
  const r = el.getBoundingClientRect();
  /* The page's scale right now, not the attribute: on the way out the
     attribute is already gone while the page is still sunk. */
  const root = document.getElementById('root');
  if (!root || !root.contains(el)) return r;
  const m = /^matrix\(([-\d.e]+)/.exec(getComputedStyle(root).transform);
  const s = m ? parseFloat(m[1]) : 1;
  if (s === 1) return r;
  const ox = window.innerWidth / 2;
  const oy = window.innerHeight * SINK_ORIGIN_Y;
  return new DOMRect(ox + (r.left - ox) / s, oy + (r.top - oy) / s, r.width / s, r.height / s);
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The keyframes that take a panel at `panel` to look like the box `from`, and
 * back: a move and a scale from the panel's top-left corner, nothing else, so
 * the browser runs it on the compositor without painting a frame. Measured on
 * the tablet stand-in (29-1P6a): a growing `clip-path` repainted the whole
 * sheet every frame and halved the frames drawn. The scale would squash the
 * sheet's text, so its content is not shown until the box has nearly grown
 * (`Dialog`). Its corners shrink with it, which at a row's size is close to
 * the row's own round; animating the radius as well would paint every frame.
 */
export function growFrames(from: DOMRect, panel: DOMRect): Keyframe[] {
  const sx = from.width / panel.width;
  const sy = from.height / panel.height;
  return [
    { transformOrigin: '0 0', transform: `translate(${from.left - panel.left}px, ${from.top - panel.top}px) scale(${sx}, ${sy})` },
    { transformOrigin: '0 0', transform: 'translate(0px, 0px) scale(1, 1)' },
  ];
}
