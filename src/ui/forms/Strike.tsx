/**
 * A ticked title, with the line that slides through it (29-1P4b, idea 1) — in
 * place of a `line-through`, which can only appear. The look is `.ag-strike`
 * in `screens.css`; the slide is here.
 *
 * **A Web Animation started after the commit, not a CSS transition, and that
 * is the whole point.** A tick sinks its row to the bottom of the column
 * (idea 55), and React does that by MOVING the row's node — and a node that
 * is taken out and put back has no "before" style, so a transition on it
 * never runs: measured on the board, the line was simply there on the first
 * frame. A layout effect runs after the move, so the slide survives it. It
 * runs only when `on` changes, never on mount, so a title that is already
 * done is drawn struck; an untick (or an undo) slides the line back out.
 */
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { reducedMotion } from './popTick';

export function Strike({ on, children }: { on: boolean; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const was = useRef(on);
  useLayoutEffect(() => {
    if (was.current === on) return;
    was.current = on;
    if (reducedMotion()) return;
    ref.current?.animate?.(
      [{ backgroundSize: on ? '0% 1.5px' : '100% 1.5px' }, { backgroundSize: on ? '100% 1.5px' : '0% 1.5px' }],
      on
        ? { duration: 280, delay: 80, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }
        : { duration: 180, easing: 'cubic-bezier(.22,.61,.36,1)' },
    );
  }, [on]);
  return (
    <span ref={ref} className="ag-strike" data-on={on ? '' : undefined}>
      {children}
    </span>
  );
}
