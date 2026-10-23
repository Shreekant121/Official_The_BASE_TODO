/**
 * Two marks of a day that went well (29-1P14a), both gold — gold is reward,
 * one colour, one job:
 *
 * - **`NewBestBadge`** (idea 108, after Strava and Apple Fitness): the small
 *   "★ New best" pill that pops on beside a number that beat his record. Its
 *   `title` carries who he beat ("Beat 16 Sep by 5m").
 * - **`PerfectDayStamp`** (idea 111, after Duolingo and Apple Fitness): the
 *   "PERFECT DAY" stamp that thumps down, tilted, when today's hours are met.
 *   "Rare on purpose, so it means something."
 *
 * Each plays its arrival ONCE, by a Web Animation from a layout effect, and
 * remembers that it has in a ref. A ref survives a kept screen being hidden
 * and shown again (the Dashboard is one), where a CSS keyframe would restart
 * on every return (`components/dashboard/motionOnce.ts` says why). Nothing is
 * left running and nothing loops; the glow is a still shadow. No motion under
 * reduced motion — the mark is simply there.
 */
import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { useReducedMotion } from 'framer-motion';
import { Icon } from '../core/Icon';

function usePlayOnce<T extends HTMLElement>(play: (el: T) => void) {
  const ref = useRef<T>(null);
  const played = useRef(false);
  const reduced = useReducedMotion();
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || played.current) return;
    played.current = true;
    if (!reduced) play(el);
  });
  return ref;
}

export interface NewBestBadgeProps {
  /** What it beat, as a tooltip and for a screen reader: "Beat 16 Sep by 5m". */
  beat?: string;
  /** `sm` sits in a block's title row; `md` on a card. */
  size?: 'sm' | 'md';
  style?: CSSProperties;
}

export function NewBestBadge({ beat, size = 'sm', style }: NewBestBadgeProps) {
  const ref = usePlayOnce<HTMLSpanElement>((el) => {
    el.animate(
      [{ transform: 'scale(0) rotate(-12deg)' }, { transform: 'scale(1) rotate(0deg)' }],
      { duration: 500, easing: 'cubic-bezier(.34,1.56,.64,1)' },
    );
  });
  const h = size === 'sm' ? 22 : 26;
  return (
    <span
      ref={ref}
      title={beat}
      aria-label={beat ? `New best. ${beat}` : 'New best'}
      data-new-best=""
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, flex: '0 0 auto',
        height: h, padding: `0 ${size === 'sm' ? 8 : 10}px`, borderRadius: h / 2,
        font: `700 ${size === 'sm' ? 11 : 12}px / 1 var(--font-sans)`, letterSpacing: 'var(--tracking-ui)',
        whiteSpace: 'nowrap',
        color: 'var(--job-gold-ink)',
        backgroundImage: 'var(--job-gold-gel)',
        boxShadow: 'var(--job-gold-glow-sm)',
        ...style,
      }}
    >
      <Icon name="star" size={size === 'sm' ? 11 : 13} style={{ color: 'inherit' }} />
      New best
    </span>
  );
}

export interface PerfectDayStampProps {
  style?: CSSProperties;
}

export function PerfectDayStamp({ style }: PerfectDayStampProps) {
  const ref = usePlayOnce<HTMLSpanElement>((el) => {
    el.animate(
      [
        { transform: 'scale(1.8) rotate(-4deg)', opacity: 0 },
        { transform: 'scale(0.94) rotate(-8deg)', opacity: 1, offset: 0.7 },
        { transform: 'scale(1) rotate(-8deg)', opacity: 1 },
      ],
      { duration: 480, easing: 'cubic-bezier(.34,1.4,.64,1)' },
    );
  });
  return (
    <span
      ref={ref}
      data-perfect-day=""
      style={{
        display: 'inline-flex', alignItems: 'center', flex: '0 0 auto',
        height: 24, padding: '0 10px', borderRadius: 'var(--r-xs)',
        font: '800 11px / 1 var(--font-sans)', letterSpacing: '0.08em', whiteSpace: 'nowrap',
        color: 'var(--job-gold-tag-fg)',
        backgroundColor: 'var(--job-gold-tag)',
        boxShadow: 'inset 0 0 0 1.5px var(--job-gold)',
        transform: 'rotate(-8deg)',
        ...style,
      }}
    >
      PERFECT DAY
    </span>
  );
}
