/**
 * Notices that stack (29-1P14d1, idea 26) — several notices piled into one.
 *
 * The notices at the top of the screen (cloud sync, a reminder that did not
 * reach Google, a deadline the rule moved, a new version) used to stand in a
 * column, and three of them filled half a tablet. Now the first one is in
 * front and the others tuck behind it, each a little smaller and fainter,
 * peeking out 8px below — at most three (his call, 2026-10-15); a fourth
 * waits its turn. Point at the pile (laptop), tap it (tablet) or tab into it
 * and it fans out into the column it was; point away, tap elsewhere or tab out
 * and it piles up again.
 *
 * HOW
 * ---
 * Each child gets a slot. A child that is not showing renders nothing, so its
 * slot measures 0 tall and is not counted — the notices keep deciding for
 * themselves when to show, exactly as before, and this decides only where.
 * One `ResizeObserver` reads every slot's height (no layout read on the way
 * in; CLAUDE.md, Performance 6), and each slot is placed by `translate`,
 * `scale` and `clip-path`, all CSS transitions — nothing moves at rest.
 *
 * - **First in front.** The children's order is their priority (`App.tsx` puts
 *   the broken sync first), so the one in front is the one that matters most,
 *   not the newest.
 * - **Behind, only the bottom shows, lit along its edge.** A card behind is scaled from its bottom
 *   edge and lined up so that edge sits 8px under the one in front of it, and
 *   everything above that strip is clipped away: the glass is 92% solid, so
 *   a whole card behind ghosted its buttons through the front one (seen in
 *   the browser). Left, right and bottom are left generous so its shadow
 *   still draws. One `inset()` form in every state, so the clip animates —
 *   fanning out, each card unrolls upward as it slides down.
 * - **A tap on the pile only fans it.** On a finger the press is caught before
 *   it reaches the card under it — otherwise tapping the pile would fold or
 *   press whatever is in front. A drag is not a tap, so the front card can
 *   still be flicked away while piled. With a mouse the pile is already open
 *   by the time the pointer gets there.
 *
 * Children must be keyed or stable in order: a slot is a position.
 */
import { Children, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { placeNotices, SHADOW_ROOM } from './noticePlaces';

export interface NoticeStackProps {
  children: ReactNode;
  /** The most notices shown at once; the rest wait their turn. */
  max?: number;
  /** Space between notices when fanned out, in px. */
  gap?: number;
  style?: CSSProperties;
}

export function NoticeStack({ children, max = 3, gap = 12, style }: NoticeStackProps) {
  const items = Children.toArray(children);
  const [heights, setHeights] = useState<number[]>(() => items.map(() => 0));
  const [fanned, setFanned] = useState(false);
  const slots = useRef<(HTMLDivElement | null)[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const pointer = useRef<string>('mouse');

  useLayoutEffect(() => {
    const ro = new ResizeObserver(() => {
      const next = slots.current.map((el) => (el ? el.offsetHeight : 0));
      setHeights((prev) => (prev.length === next.length && prev.every((h, i) => h === next[i]) ? prev : next));
      // Down to one: the next pile starts piled, not fanned.
      if (next.filter((h) => h > 0.5).length < 2) setFanned(false);
    });
    slots.current.forEach((el) => el && ro.observe(el));
    return () => ro.disconnect();
  }, [items.length]);

  const { places, height, piled, count } = placeNotices(heights, fanned, max, gap);

  // A finger fans the pile by a tap; a tap anywhere else piles it up again.
  useEffect(() => {
    if (!fanned) return;
    const away = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && !root.current?.contains(e.target as Node)) setFanned(false);
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [fanned]);

  return (
    <div
      ref={root}
      data-notice-stack={count > 1 ? (piled ? 'piled' : 'fanned') : undefined}
      style={{
        position: 'relative',
        height,
        pointerEvents: count > 1 ? 'auto' : 'none',
        transition: 'height var(--dur-slow) var(--ease-settle)',
        ...style,
      }}
      onPointerDown={(e) => { pointer.current = e.pointerType; }}
      onPointerEnter={(e) => { if (e.pointerType === 'mouse' && count > 1) setFanned(true); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setFanned(false); }}
      onFocus={() => { if (count > 1) setFanned(true); }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null) && !e.currentTarget.matches(':hover')) setFanned(false);
      }}
      onClickCapture={(e) => {
        if (!piled || pointer.current === 'mouse') return;
        e.preventDefault();
        e.stopPropagation();
        setFanned(true);
      }}
    >
      {items.map((child, i) => {
        const p = places[i];
        return (
          <div
            key={i}
            ref={(el) => { slots.current[i] = el; }}
            data-notice-slot={p.hidden ? 'waiting' : p.inert ? 'behind' : 'front'}
            aria-hidden={p.hidden || undefined}
            style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              zIndex: p.z,
              translate: `0 ${p.y}px`,
              scale: String(p.scale),
              transformOrigin: '50% 100%',
              clipPath: `inset(${p.clipTop}px -${SHADOW_ROOM}px -${SHADOW_ROOM}px -${SHADOW_ROOM}px)`,
              opacity: p.hidden ? 0 : p.opacity,
              visibility: p.hidden && heights[i] > 0.5 ? 'hidden' : undefined,
              pointerEvents: p.inert && piled ? 'none' : undefined,
              transition: [
                'translate', 'scale', 'clip-path', 'opacity',
              ].map((prop) => `${prop} var(--dur-slow) var(--ease-settle)`).join(', '),
            }}
          >
            {child}
            {/* A card behind is dark glass on a dark page: a lit lower edge is
                what makes its 8px read as a card at all (seen in the browser). */}
            <span
              aria-hidden
              style={{
                position: 'absolute', inset: 0, borderRadius: 'var(--r-card)', pointerEvents: 'none',
                backgroundColor: 'oklch(1 0 0 / 0.035)',
                boxShadow: 'inset 0 -1px 0 oklch(1 0 0 / 0.16)',
                opacity: p.inert && piled && !p.hidden ? 1 : 0,
                transition: 'opacity var(--dur-slow) var(--ease-glass)',
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
