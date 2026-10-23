/**
 * Content that blurs across (idea 60, 29-1P5c, BIG-15; visionOS, iOS 26).
 * Switch a view and the old content softens into a blur, sliding away the
 * way you went, as the new one comes into focus from the other side.
 *
 *   <SegmentedControl options={…} value={view} onChange={setView} />
 *   <BlurAcross value={view} index={VIEWS.indexOf(view)}>
 *     {view === 'board' ? <Board /> : <List />}
 *   </BlurAcross>
 *
 * It wraps what a switch SHOWS — every `SegmentedControl` or `Tabs` that
 * swaps a view or a list. A switch that only sets a preference (a sound's
 * style, a widget's look) changes nothing below it and has no wrapper.
 *
 * HOW. While the old content leaves, the wrapper keeps drawing it — the last
 * children it was given before the switch, kept in state — and only then
 * lets the new children in. Two Web Animations on the wrapper, `opacity`,
 * `filter` and `transform`, which the browser composites. **Nothing is left
 * on the element at rest**: a `filter` that stayed would make the wrapper
 * the containing block of every `position: fixed` inside it, and a board's
 * menus and drag are exactly that. A second switch while the first is still
 * leaving lands on the newest value when the leave ends.
 *
 * `prefers-reduced-motion` swaps at once: a WAAPI duration is a number, and
 * the global rule in `tokens/motion.css` cannot reach it.
 */
import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useMotion } from './motion';

export interface BlurAcrossProps {
  /** Which view is chosen. A change is a switch. */
  value: string;
  /** Its place among the options, so the content slides the way you went. */
  index: number;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

interface Seen { value: string; index: number; children: ReactNode }

/** How far the content travels, and how soft it goes (the idea page's). */
const SHIFT = 18;
const BLUR = 8;

export function BlurAcross({ value, index, children, className, style }: BlurAcrossProps) {
  const m = useMotion();
  const ref = useRef<HTMLDivElement | null>(null);

  /* The newest props, and — while a switch is playing — what was on screen
     before it. Adjusted during render (React's "storing information from
     previous renders"), so the old content is drawn on the very frame the
     switch arrives instead of one frame of the new. */
  const [last, setLast] = useState<Seen>({ value, index, children });
  const [leaving, setLeaving] = useState<Seen | null>(null);
  if (value !== last.value) {
    if (!leaving) setLeaving(last);
    setLast({ value, index, children });
  } else if (children !== last.children || index !== last.index) {
    setLast({ value, index, children });
  }

  /* Set when a leave finished, for the arrival to read. */
  const arriving = useRef<number | null>(null);
  const towards = leaving && index >= leaving.index ? 1 : -1;

  useLayoutEffect(() => {
    if (!leaving) return;
    const el = ref.current;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!el || reduced || typeof el.animate !== 'function') {
      setLeaving(null);
      return;
    }
    const out = el.animate(
      [
        { opacity: 1, filter: 'blur(0px)', transform: 'none' },
        { opacity: 0, filter: `blur(${BLUR}px)`, transform: `translateX(${-SHIFT * towards}px) scale(0.98)` },
      ],
      { duration: Math.round(m.dur.fast * 1000), easing: 'ease-in', fill: 'forwards' },
    );
    let done = false;
    out.onfinish = () => {
      done = true;
      arriving.current = towards;
      setLeaving(null);
    };
    return () => {
      /* A leave cut short (the screen hidden, the wrapper gone) is undone
         rather than left holding the content invisible. */
      if (!done) out.cancel();
    };
    /* `towards` is fixed by the switch that started this leave. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving, m]);

  /* The new content comes into focus from the side it was switched to. */
  useLayoutEffect(() => {
    const dir = arriving.current;
    arriving.current = null;
    const el = ref.current;
    if (leaving || dir === null || !el) return;
    const inn = el.animate(
      [
        { opacity: 0, filter: `blur(${BLUR}px)`, transform: `translateX(${SHIFT * dir}px) scale(0.98)` },
        { opacity: 1, filter: 'blur(0px)', transform: 'none' },
      ],
      { duration: Math.round(m.dur.slow * 1000), easing: `cubic-bezier(${m.ease.glide.join(', ')})` },
    );
    /* The leave's held end is under it now; drop it, so nothing stays. */
    for (const a of el.getAnimations()) if (a !== inn) a.cancel();
  }, [leaving, m]);

  return (
    <div ref={ref} className={className} style={style}>
      {leaving ? leaving.children : children}
    </div>
  );
}
