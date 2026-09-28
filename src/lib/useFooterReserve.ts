/**
 * "This element is my screen's bottom furniture" (BUILD-1).
 *
 * The focus pill is fixed to the window and knows nothing about the screen it
 * is floating over, which is right — it is app-level chrome, mounted beside
 * the router. Two screens end in something it would otherwise sit on: Set
 * Deadlines' work-session bar, which has sat at the foot of the window since
 * FIX-6, and the chat composer, which on a narrow window fills the strip
 * directly above the nav. Both are **measured rather than typed**, for FIX-6's
 * own reason — the bar wraps from 76px to 136px between 1440 and 1000, and the
 * composer grows as he writes, so a constant tuned at one size is wrong at the
 * other in a way that looks like nothing until it is the window somebody uses.
 *
 * What is published is the distance from the foot of the window to the **top**
 * of that element, because it is the only form a caller can use without also
 * knowing how far the element is lifted off the bottom on that screen.
 *
 * It returns the element's own height, which is what Set Deadlines' floating
 * capture button already needed from its own copy of this observer — one
 * observer answering both questions rather than two watching one box.
 */
import { useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';
import { useUIStore } from '../store/useUIStore';

export function useFooterReserve(ref: RefObject<HTMLElement | null>, active = true): number {
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const rect = el.getBoundingClientRect();
      setHeight(rect.height);
      useUIStore.getState().setFooterReserve(
        active ? Math.max(0, window.innerHeight - rect.top) : 0,
      );
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    /* The element can also move without changing size — a window resized
       taller leaves the bar where it is and the foot somewhere else. */
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      /* Every screen that sets this must clear it on the way out, or the pill
         floats above a bar that is no longer there. */
      useUIStore.getState().setFooterReserve(0);
    };
  }, [ref, active]);

  return height;
}
