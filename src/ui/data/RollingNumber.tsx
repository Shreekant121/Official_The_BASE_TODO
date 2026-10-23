/**
 * A count that rolls to its new number (idea 49, Telegram's; 29-1P4c). His
 * call: **every count chip** — the nav's counts, Atlas's Waiting chip, every
 * `CountChip`, and Needs Attention's counters.
 *
 * `bump` is for a badge: when the count GROWS, the chip it sits in — this
 * span's parent — stretches and bounces back. A count falling only rolls.
 *
 * Nothing moves on the first draw, only on a change seen while mounted, so a
 * screen opening with a 3 on it is still; and the motion is a Web Animation
 * from a layout effect, which writes nothing to React and leaves nothing
 * running (CLAUDE.md "Performance", rule 1). At rest the number is a plain
 * inline-block span of the same text.
 */
import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { bumpBadge, rollCount } from './rollCount';

export interface RollingNumberProps {
  value: number;
  /** What to show for it, when not the number itself — "99+". */
  text?: string;
  /** Bounce the chip this sits in when the count grows. */
  bump?: boolean;
  style?: CSSProperties;
}

export function RollingNumber({ value, text, bump, style }: RollingNumberProps) {
  const shown = text ?? String(value);
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef({ value, shown });

  useLayoutEffect(() => {
    const was = prev.current;
    prev.current = { value, shown };
    if (was.value === value) return;
    const up = value > was.value;
    if (was.shown !== shown) rollCount(ref.current, was.shown, up);
    if (bump && up) bumpBadge(ref.current?.parentElement);
  }, [value, shown, bump]);

  return (
    <span ref={ref} style={{ display: 'inline-block', ...style }}>
      {shown}
    </span>
  );
}
