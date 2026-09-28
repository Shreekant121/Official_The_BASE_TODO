/**
 * V3's release bloom — a soft highlight that lifts off a button's top rim
 * and fades when the finger comes up (V3-2).
 *
 * Ported from the helper that v4's `Button.jsx` and `IconButton.jsx` each
 * carry a copy of. It is one component here so the two cannot drift. Both
 * buttons render it only inside a `<V3Scope>`: the old system has no bloom,
 * and an unconverted screen must not grow one.
 *
 * `k` is a counter the button bumps on every release; each new value plays
 * the bloom once. Zero never plays, so a first render is still.
 */
import { useEffect, useState } from 'react';

export function PressBloom({ k }: { k: number }) {
  /* The last release that has finished blooming. The bloom is lit exactly
     while `k` is ahead of it, so it lights in the render that bumps `k` and
     no effect has to set state to start it; the timer only puts it out. */
  const [spent, setSpent] = useState(0);
  const on = k !== spent;
  useEffect(() => {
    if (!k) return undefined;
    const id = setTimeout(() => setSpent(k), 130);
    return () => clearTimeout(id);
  }, [k]);
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 'inherit',
        pointerEvents: 'none',
        overflow: 'hidden',
        backgroundImage: 'radial-gradient(120% 80% at 50% 0%, oklch(1 0 0 / 0.26), oklch(1 0 0 / 0) 65%)',
        opacity: on ? 1 : 0,
        transition: `opacity ${on ? '110ms' : '520ms'} var(--ease-glass)`,
      }}
    />
  );
}
