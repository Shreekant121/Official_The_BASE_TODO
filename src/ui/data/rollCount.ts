/* Counts that bounce (idea 49, Telegram's; 29-1P4c) — the motion half, beside
   `RollingNumber.tsx` rather than in it, so that file exports only a
   component and keeps fast refresh (the same split as `forms/popTick.ts`). */
import { useCallback, useEffect, useRef } from 'react';

const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const rolling = new WeakMap<HTMLElement, { position: string; overflow: string; n: number }>();

/** The idea card's curve: a pop that overshoots. */
const POP = 'cubic-bezier(.34,1.56,.64,1)';

/**
 * Rolls `host` from the number it showed (`was`) to the one it shows now: the
 * old one slides out — up when the count grew, down when it fell — and the new
 * one slides in behind it. Clipped only while it moves, so a count at rest is
 * exactly the text it was before this existed. One pair of Web Animations, gone
 * when they end.
 */
export function rollCount(host: HTMLElement | null, wasText: string, up: boolean): void {
  if (!host || reducedMotion() || !host.animate) return;
  const ghost = document.createElement('span');
  ghost.textContent = wasText;
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, {
    position: 'absolute', left: '50%', top: '0', whiteSpace: 'nowrap', pointerEvents: 'none',
  });
  /* Two quick changes overlap; the styles at rest are put back by the last one. */
  const rest = rolling.get(host) ?? { position: host.style.position, overflow: host.style.overflow, n: 0 };
  rest.n += 1;
  rolling.set(host, rest);
  host.style.position = 'relative';
  host.style.overflow = 'clip';
  host.appendChild(ghost);
  const dir = up ? -1 : 1;
  const out = ghost.animate(
    [
      { transform: 'translate(-50%, 0)', opacity: 1 },
      { transform: `translate(-50%, ${dir * 100}%)`, opacity: 0 },
    ],
    { duration: 180, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' },
  );
  host.animate(
    [
      { transform: `translateY(${-dir * 100}%)`, opacity: 0 },
      { transform: `translateY(${-dir * 100}%)`, opacity: 0, offset: 0.3 },
      { transform: 'translateY(0)', opacity: 1 },
    ],
    { duration: 300, easing: POP },
  ).onfinish = () => {
    if (--rest.n > 0) return;
    rolling.delete(host);
    host.style.position = rest.position;
    host.style.overflow = rest.overflow;
  };
  out.onfinish = () => ghost.remove();
}

/** The badge stretches wide and bounces back — only when the count grew. */
export function bumpBadge(el: Element | null | undefined): void {
  if (!el || reducedMotion()) return;
  el.animate?.(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.35, 1.2)', offset: 0.4 }, { transform: 'scale(1)' }],
    { duration: 380, easing: POP },
  );
}

/**
 * A ref for something that may appear later — an alert dot, a count chip at
 * its first 1. It pops in when it mounts after its owner did, and stays still
 * when it was simply there as the screen drew.
 */
export function usePopOnLateMount<T extends Element>(): (el: T | null) => void {
  const settled = useRef(false);
  useEffect(() => {
    settled.current = true;
  }, []);
  return useCallback((el: T | null) => {
    if (!el || !settled.current || reducedMotion()) return;
    el.animate?.(
      [{ transform: 'scale(0)' }, { transform: 'scale(1.3)', offset: 0.6 }, { transform: 'scale(1)' }],
      { duration: 380, easing: POP },
    );
  }, []);
}
