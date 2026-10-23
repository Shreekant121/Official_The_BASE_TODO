/**
 * The done box — one drawing for every place a task or subtask is ticked
 * (29-1P4b, idea 1 "The satisfying tick").
 *
 * **His calls (2026-10-07):** a done box KEEPS the board's outline — the well,
 * a lime hairline inside its edge and a lime check, no fill — and gains only
 * motion: the check draws itself, the box gives a small pop, and a line slides
 * through the title (`.ag-strike`, `screens.css`). Not the idea card's solid
 * lime. And every done box is this one: the board's `Tick`, `Checkbox` (Focus's
 * subtasks) and the sheet's `SubtaskTree` used to be three different drawings.
 * New Session's `SelectDot` is NOT one — it means "chosen", which keeps its
 * lime glass.
 *
 * Only the drawing lives here. The button around it, its hit area and what a
 * press does belong to each caller, which also calls `popTick` on a press that
 * ticks (`popTick.ts`) — never on a render, so a task ticked on the other device, or by an
 * undo, changes state without a pop.
 */
import { forwardRef, useLayoutEffect, useRef } from 'react';
import { Icon } from '../core/Icon';
import { reducedMotion } from './popTick';

export interface TickBoxProps {
  done: boolean;
  /** 24 (rows), 20 (dense), 16 (the sheet's subtask tree). */
  size?: 16 | 20 | 24;
  /** A lock in place of the check: waiting on unfinished work (item 19). */
  locked?: boolean;
}

export const TickBox = forwardRef<HTMLSpanElement, TickBoxProps>(function TickBox(
  { done, size = 24, locked = false },
  ref,
) {
  const glyph = size === 24 ? 14 : size === 20 ? 12 : 10;
  /* The check draws itself — a Web Animation started after the commit, for
     `Strike.tsx`'s reason: a ticked row is MOVED to the bottom of its column,
     and a moved node runs no CSS transition. Only on a change, never on mount. */
  const path = useRef<SVGPathElement>(null);
  const was = useRef(done);
  useLayoutEffect(() => {
    if (was.current === done) return;
    was.current = done;
    if (reducedMotion()) return;
    path.current?.animate?.(
      [{ strokeDashoffset: done ? 16 : 0 }, { strokeDashoffset: done ? 0 : 16 }],
      done
        ? { duration: 280, delay: 40, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }
        : { duration: 140, easing: 'cubic-bezier(.22,.61,.36,1)' },
    );
  }, [done]);
  return (
    <span
      ref={ref}
      className="ag-check__box"
      style={{
        position: 'relative', flex: '0 0 auto',
        display: 'grid', placeItems: 'center', width: size, height: size,
        borderRadius: size === 24 ? 'var(--r-xs)' : 'var(--r-2xs)',
        backgroundImage: 'var(--glass-well)',
        boxShadow: locked ? 'var(--glass-well-shadow)'
          : done ? 'var(--glass-well-shadow), inset 0 0 0 1px var(--job-lime-line)'
            : 'var(--glass-well-shadow), 0 0 0 1px var(--line-soft)',
        color: 'var(--fg-4)',
        transition: 'box-shadow var(--dur-base) var(--ease-glass)',
      }}
    >
      {locked ? (
        <Icon name="lock" size={glyph} style={{ color: 'inherit' }} />
      ) : (
        <svg width={glyph} height={glyph} viewBox="0 0 16 16" aria-hidden="true" style={{ display: 'block' }}>
          {/* Strokes on rather than appearing: the dash is the path's whole
              length, so offsetting it by that much hides it exactly. A beat
              late, so the pop has started when the stroke does. */}
          <path
            ref={path}
            d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
            fill="none" stroke="var(--job-lime)" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ strokeDasharray: 16, strokeDashoffset: done ? 0 : 16 }}
          />
        </svg>
      )}
    </span>
  );
});
