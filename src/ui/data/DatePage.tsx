/**
 * A due date as a tiny tear-off calendar page (29-1P7a, idea 165, from iOS
 * Calendar's icon): the month in a strip along the top, the day big under it.
 *
 * **The strip is the warmth (idea 66)**, sky when the date is two weeks off
 * or more, warming to coral as it nears and coral on the day itself — his
 * call over the idea page's green "today" page. `lib/warmth.ts` mixes it; the
 * caller passes the 0–1 from `readDue` (`lib/dueDate.ts`), so this file has no
 * clock and no opinion about dates.
 *
 * **The body is the app's glass, not the idea page's white paper.** A white
 * square on every card of a dark board would be the loudest thing on the
 * screen, louder than Red Alert; a raised glass page with a white day reads
 * as the same object and keeps its place.
 *
 * **It flips when the date changes**, once, by a Web Animation from a layout
 * effect — the new page swings down from the fold. Never on the first draw
 * (a board opening is not a date changing), never under reduced motion, and
 * nothing is left on the element afterwards. A CSS transition would not do:
 * a row moved in its list runs none (29-1P4b).
 */
import { useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { warmthColour } from '../../lib/warmth';
import { useMotion } from '../core/motion';

/** [width, height, strip, month size, day size] */
const DIMS = {
  sm: [22, 24, 8, 6, 11.5],
  md: [30, 32, 10, 7.5, 15],
} as const;

export type DatePageSize = keyof typeof DIMS;

export interface DatePageProps {
  /** Three capitals, e.g. "MAR". */
  month: string;
  day: number;
  /** What the flip watches: a new value means a new date. `YYYY-MM-DD`. */
  dayKey: string;
  /** 0–1, sky to coral. */
  warmth: number;
  size?: DatePageSize;
  /** The full date, for the tooltip. */
  title?: string;
  style?: CSSProperties;
}

export function DatePage({ month, day, dayKey, warmth, size = 'sm', title, style }: DatePageProps) {
  const [w, h, strip, monthSize, daySize] = DIMS[size];
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(dayKey);
  const motion = useMotion();

  useLayoutEffect(() => {
    if (shown.current === dayKey) return;
    shown.current = dayKey;
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const flip = el.animate(
      [
        { transform: 'perspective(140px) rotateX(-88deg)', opacity: 0.35 },
        { transform: 'perspective(140px) rotateX(0deg)', opacity: 1 },
      ],
      { duration: 420, easing: `cubic-bezier(${motion.ease.pop.join(',')})` },
    );
    return () => flip.cancel();
  }, [dayKey, motion]);

  return (
    <span
      ref={ref}
      aria-hidden="true"
      title={title}
      style={{
        flex: '0 0 auto',
        display: 'grid', gridTemplateRows: `${strip}px 1fr`,
        width: w, height: h,
        borderRadius: size === 'sm' ? 5 : 7,
        overflow: 'hidden',
        transformOrigin: '50% 0',
        backgroundImage: 'var(--glass-fill-3)',
        boxShadow: 'var(--glass-rim-2), 0 3px 8px -4px oklch(0 0 0 / 0.7)',
        ...style,
      }}
    >
      <span
        style={{
          display: 'grid', placeItems: 'center',
          backgroundColor: warmthColour(warmth),
          color: 'oklch(0.99 0.01 240)',
          font: `800 ${monthSize}px/1 var(--font-sans)`,
          letterSpacing: '0.06em',
        }}
      >
        {month}
      </span>
      <span
        className="ag-tnum"
        style={{
          display: 'grid', placeItems: 'center',
          font: `700 ${daySize}px/1 var(--font-sans)`,
          color: 'var(--fg-1)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {day}
      </span>
    </span>
  );
}
