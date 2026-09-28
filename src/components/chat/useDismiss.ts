/**
 * Close an open popover on a click outside it, or on Escape (item 13G).
 *
 * Its own file rather than a fourth export from `Dial.tsx`: a module that
 * exports both components and plain functions loses React Fast Refresh for
 * everything in it, which is the eslint rule that caught this — and losing it
 * on the composer is losing it on the control being tuned by hand.
 */
import { useEffect, useRef } from 'react';

export function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open, close]);

  return ref;
}
