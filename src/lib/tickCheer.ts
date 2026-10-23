import { create } from 'zustand';

/**
 * What a tick says back (29-1P4b): the gold +1 that floats up from the box
 * (idea 41, Duolingo) and the "3 in a row!" chip (idea 90, Duolingo's combo).
 *
 * **Which ticks, his calls (2026-10-07):** a TASK's tick box — the board card
 * and the list view, both `project/parts.tsx`'s `Tick`. Not a subtask (the
 * tally beside it counts tasks, and a +1 that the tally ignores would be a
 * lie), and not New Session's pick dot, which chooses a task rather than
 * finishing it. Those two get the tick's motion and nothing else.
 *
 * Nothing here records anything: the tally on the Dashboard is
 * `finishedToday` over `completedAt`, so it is the same on both devices and an
 * undo takes it back. The combo is a feeling, in memory, on this device.
 *
 * `components/TickCheerHost.tsx` draws both; this file is the door callers
 * use, so a row never imports the host.
 */

/** The idea card's eight seconds: closer than this and the run goes on. */
export const COMBO_WINDOW_MS = 8000;

export interface Combo {
  /** Ticks in this run. The chip shows from two. */
  n: number;
  /** When the last one landed, `Date.now()`. */
  last: number;
}

export const NO_COMBO: Combo = { n: 0, last: 0 };

/** One more tick, `at` ms. Pure. */
export function nextCombo(prev: Combo, at: number): Combo {
  return { n: prev.n > 0 && at - prev.last < COMBO_WINDOW_MS ? prev.n + 1 : 1, last: at };
}

/** "2 in a row", "3 in a row!" — the card's words; the mark comes at three. */
export function comboLabel(n: number): string {
  return n >= 3 ? `${n} in a row!` : `${n} in a row`;
}

/**
 * The chip warms as the run grows: gold, amber, orange, coral. **His call over
 * the colour jobs** (gold is reward, coral is urgent) — it warms like the idea
 * card, and must not be "fixed" back to gold.
 */
export function comboColour(n: number): string {
  if (n <= 2) return 'var(--job-gold)';
  if (n === 3) return 'color-mix(in oklch, var(--job-gold), var(--job-orange))';
  if (n === 4) return 'var(--job-orange)';
  return 'var(--job-coral)';
}

export const useComboStore = create<Combo>(() => NO_COMBO);

/** The host's fixed, pointer-less layer the +1s are printed into. */
let layer: HTMLElement | null = null;

export function setCheerLayer(el: HTMLElement | null): void {
  layer = el;
}

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * A task's box was just pressed to done. `from` is the box: the +1 starts at
 * its top right. One Web Animation, removed when it ends — nothing in React
 * re-renders for it and nothing is left running.
 */
export function cheerTick(from: Element | null): void {
  useComboStore.setState((c) => nextCombo(c, Date.now()));
  if (!layer || !from || reducedMotion()) return;
  const r = from.getBoundingClientRect();
  const p = document.createElement('span');
  p.className = 'ag-plus-one';
  p.textContent = '+1';
  p.setAttribute('aria-hidden', 'true');
  p.style.left = `${r.right + 2}px`;
  p.style.top = `${r.top - 8}px`;
  layer.appendChild(p);
  const a = p.animate?.(
    [
      { transform: 'translateY(0) scale(.6)', opacity: 0 },
      { transform: 'translateY(-14px) scale(1.15)', opacity: 1, offset: 0.3 },
      { transform: 'translateY(-44px) scale(1)', opacity: 0 },
    ],
    { duration: 900, easing: 'cubic-bezier(.22,.61,.36,1)' },
  );
  if (a) a.onfinish = () => p.remove();
  else p.remove();
}
