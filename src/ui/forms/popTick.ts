/* The tick box's pop (29-1P4b) — beside `TickBox.tsx`, not in it, so that
   file exports only a component and keeps fast refresh. */

/** Read at the moment of the press, so a change in the OS setting is honoured at once. */
export const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * The small pop (idea 1): up a fifth and back, once. A one-off Web Animation —
 * it writes nothing to React and leaves nothing running.
 */
export function popTick(el: Element | null | undefined): void {
  if (!el || reducedMotion()) return;
  el.animate?.(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.2)', offset: 0.35 }, { transform: 'scale(1)' }],
    { duration: 340, easing: 'cubic-bezier(.34,1.56,.64,1)' },
  );
}
