import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * How many rows of a long list to draw: a screenful and a margin at first,
 * then more as the scroller nears the end of what is drawn (2026-09-28).
 *
 * New Session drew every open task in the backlog at once, on a screen that
 * shows about a dozen. A row there costs ~22ms to build on a phone-speed CPU,
 * so 176 tasks froze the screen for four seconds before the first one
 * appeared. Rows past `count` are simply not rendered yet; the list, its
 * counts and its search all still work from the data, never from the DOM.
 *
 * `scroller` must be the element that actually scrolls. The observer is
 * rooted there because `rootMargin` only widens the ROOT's box — rooted at
 * the viewport, a sentinel clipped by an inner scroller would never be seen
 * until it had already scrolled into view, and the list would visibly run
 * out before growing. The margin is a fixed 2000px, about two tablet
 * screens, so rows are built well before anybody reaches them. Fixed rather
 * than read off the scroller: reading `clientHeight` here forced a full
 * layout of the screen the moment a kept screen reappeared (App.tsx).
 * When a step still leaves the sentinel inside the margin, the effect
 * re-runs on the new `count` and the fresh observer reports it at once,
 * so the list keeps growing until it is ahead again.
 */
export function useRevealOnScroll(
  total: number,
  scroller: RefObject<HTMLElement | null>,
  first = 20,
  step = 20,
): { count: number; sentinelRef: RefObject<HTMLDivElement | null> } {
  const [count, setCount] = useState(first);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    const root = scroller.current;
    if (!el || !root || count >= total) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setCount((c) => c + step);
      },
      { root, rootMargin: '0px 0px 2000px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [count, total, step, scroller]);

  return { count, sentinelRef };
}
