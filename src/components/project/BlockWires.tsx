/**
 * The wires themselves (idea 164, 29-1P7c) — `lib/blockWires.ts` says which
 * task is pointed at and what shape a wire is; this finds the cards on the
 * page and draws between them.
 *
 * One per project page, around both boards, so a wire crosses from one
 * side-by-side project to the other (BIG-5) as readily as across columns.
 * A card is found by the `data-dust` marker every task row already wears
 * (`lib/dust.ts`), on `.ag-row`, the board card and the List view row alike.
 * A blocker that is not on screen — another project, a subtask, scrolled out
 * of view — gets no wire; the card's "Waiting on …" still names it.
 *
 * WHITE, HIS CALL (2026-10-13): the line, its dot and its words are white,
 * and the card at the far end lights with a white line inside its edge
 * (`screens.css`, `[data-wire-lit]`) — not the demo's gold and sky, which
 * are reward's and a date's. Blocked is already grey with a lock.
 *
 * COST. Nothing exists until a card is pointed at; then one SVG, a rect read
 * per card involved (on a hover, never on a screen's way in — performance
 * rule 6) and one 420ms draw, a Web Animation on a mask, that comes to rest.
 * It is cleared — not re-measured — by a scroll, a resize or the screen being
 * hidden: a wire is a glance, and it must never be left pointing at where a
 * card used to be.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { useMotion } from '../../ui';
import { Z } from '../../lib/zLayers';
import { dustSelector } from '../../lib/dust';
import { relationsOf, useWireStore, wirePath, type Box, type Point } from '../../lib/blockWires';

interface Drawn { key: string; d: string; end: Point; label: Point; words: string }

const NONE: Drawn[] = [];

/** The cards for a task that are actually on screen. */
function cardsOf(id: string): HTMLElement[] {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return [...document.querySelectorAll<HTMLElement>(`.ag-row${dustSelector('task', id)}`)].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
  });
}

const boxOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
};

/** The one of several cards (a task shared into two lists) nearest to `to`. */
function nearest(cards: HTMLElement[], to: Box): HTMLElement {
  const cx = (to.left + to.right) / 2;
  const cy = (to.top + to.bottom) / 2;
  let best = cards[0];
  let bestD = Infinity;
  for (const el of cards) {
    const b = boxOf(el);
    const d = Math.hypot((b.left + b.right) / 2 - cx, (b.top + b.bottom) / 2 - cy);
    if (d < bestD) { bestD = d; best = el; }
  }
  return best;
}

export function BlockWires() {
  const m = useMotion();
  const at = useWireStore((s) => s.at);
  const backlog = useStore((s) => s.backlogTasks);
  /* Keyed by the task they were measured for, so a stale set is never drawn
     for the next card (or for none). */
  const [measured, setMeasured] = useState<{ at: string; wires: Drawn[] } | null>(null);
  const wires = measured && measured.at === at ? measured.wires : NONE;
  const svg = useRef<SVGSVGElement>(null);

  /* Hidden (a kept screen) or gone: nothing stays pointed at. */
  useEffect(() => () => useWireStore.getState().clear(), []);

  /* Measure and light, in a microtask off the layout effect: still before
     the frame is painted, so the wires and the lit cards land together, and
     the state is set from a callback rather than the effect's body. */
  useLayoutEffect(() => {
    if (!at) return;
    let live = true;
    const lit: HTMLElement[] = [];
    queueMicrotask(() => {
      if (!live) return;
      const links = relationsOf(backlog, at);
      const mine = links.length > 0 ? cardsOf(at) : [];
      /* The card under the pointer, when the task is on the page twice. */
      const self = mine.find((el) => el.matches(':hover')) ?? mine[0];
      const drawn: Drawn[] = [];
      if (self) {
        const selfBox = boxOf(self);
        for (const link of links) {
          const other = link.blocker === at ? link.blocked : link.blocker;
          const found = cardsOf(other);
          if (found.length === 0) continue;
          const card = nearest(found, selfBox);
          const otherBox = boxOf(card);
          lit.push(card);
          drawn.push({
            key: `${link.blocker}>${link.blocked}`,
            ...(link.blocker === at
              ? wirePath(selfBox, otherBox, window.innerWidth)
              : wirePath(otherBox, selfBox, window.innerWidth)),
            words: link.blocked === at ? 'waits on' : 'unblocks',
          });
        }
      }
      for (const el of lit) el.dataset.wireLit = 'true';
      setMeasured({ at, wires: drawn });
    });
    return () => {
      live = false;
      for (const el of lit) delete el.dataset.wireLit;
    };
  }, [at, backlog]);

  /* The draw: each line revealed along its length, once, then still. */
  useLayoutEffect(() => {
    const root = svg.current;
    if (!root || wires.length === 0) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const anims = [...root.querySelectorAll<SVGPathElement>('[data-reveal]')].map((p) => p.animate(
      [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
      { duration: 420, easing: `cubic-bezier(${m.ease.glide.join(', ')})`, fill: 'forwards' },
    ));
    const fades = [...root.querySelectorAll<SVGElement>('[data-after]')].map((el) => el.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 180, delay: 300, easing: 'ease-out', fill: 'backwards' },
    ));
    return () => { for (const a of [...anims, ...fades]) a.cancel(); };
  }, [wires, m]);

  /* A wire is a glance: a scroll or a resize ends it, and on the tablet the
     next tap anywhere but a "Waiting on …" does too. */
  useEffect(() => {
    if (!at) return;
    const clear = () => useWireStore.getState().clear();
    const tapAway = (e: PointerEvent) => {
      if (!useWireStore.getState().pinned) return;
      if ((e.target as Element | null)?.closest?.('[data-wire-pin]')) return;
      clear();
    };
    window.addEventListener('scroll', clear, { capture: true, passive: true });
    window.addEventListener('resize', clear);
    document.addEventListener('pointerdown', tapAway, true);
    return () => {
      window.removeEventListener('scroll', clear, { capture: true });
      window.removeEventListener('resize', clear);
      document.removeEventListener('pointerdown', tapAway, true);
    };
  }, [at]);

  if (wires.length === 0) return null;
  return (
    <svg
      ref={svg}
      aria-hidden="true"
      style={{
        position: 'fixed', inset: 0, width: '100vw', height: '100vh',
        pointerEvents: 'none', overflow: 'visible', zIndex: Z.wires,
      }}
    >
      <defs>
        {wires.map((w, i) => (
          <mask key={w.key} id={`ag-wire-${i}`} maskUnits="userSpaceOnUse" x="-10%" y="-10%" width="120%" height="120%">
            <path data-reveal d={w.d} pathLength={1} fill="none" stroke="white" strokeWidth={8} strokeDasharray="1 1" strokeDashoffset={0} />
          </mask>
        ))}
      </defs>
      {wires.map((w, i) => (
        <g key={w.key}>
          <path
            d={w.d}
            mask={`url(#ag-wire-${i})`}
            fill="none"
            stroke="oklch(1 0 0 / 0.78)"
            strokeWidth={1.75}
            strokeDasharray="4 5"
            strokeLinecap="round"
          />
          <circle data-after cx={w.end.x} cy={w.end.y} r={3.5} fill="oklch(1 0 0 / 0.9)" />
          <text
            data-after
            x={w.label.x}
            y={w.label.y - 7}
            textAnchor="middle"
            style={{ font: '600 10px var(--font-sans)', fill: 'oklch(1 0 0 / 0.78)', paintOrder: 'stroke', stroke: 'var(--void-1)', strokeWidth: 3 }}
          >
            {w.words}
          </text>
        </g>
      ))}
    </svg>
  );
}
