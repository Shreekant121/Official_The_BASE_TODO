/**
 * Aurora Glass — useMedia
 *
 * Every screen mockup in `design-system/screens/` defines this hook inline to
 * switch between the desktop rail and the floating bar at 960px. Extracted
 * once so the breakpoint behaviour cannot drift between screens as they
 * migrate.
 *
 * The mockups use useState + useEffect; this uses `useSyncExternalStore`,
 * which is what it is for — no state to get out of sync, no setState in an
 * effect, and the first render already has the right answer rather than
 * flashing the wrong layout for a frame.
 */
import { useCallback, useSyncExternalStore } from 'react';

export function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot);
}

/** The one breakpoint the design system's screens switch on. */
export const WIDE = '(min-width: 960px)';

/**
 * A window narrow enough that the horizontal `MiniNav` cannot fit (item 10).
 *
 * The bar is 48px a cell plus 12px of its own padding, so nine destinations
 * measure 458px — wider than a 375px phone, and it is centred in a full-width
 * fixed wrapper, so it overhangs both edges and the two end cells are cut.
 * `navModel.tsx` recorded this coming at eight cells and named item 10 or 12
 * as the session that would have to settle it; item 10 is the one that added
 * the ninth.
 *
 * **768 rather than a number derived from the cell count.** The screenshot
 * matrix is 1440 and 820, and this threshold is below both — so the scrolling
 * behaviour it turns on cannot move a single baseline, and the two sizes
 * anybody photographs render exactly as they did. A breakpoint that tracked
 * the cell count would eventually cross 820 without anyone noticing.
 */
export const NARROW = '(max-width: 767px)';
