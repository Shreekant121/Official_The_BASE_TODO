/**
 * Confetti for the big ones (29-1P14a, idea 2, after Todoist and Asana): a
 * burst of BASE's colours — one of each job's, so the burst is the whole
 * palette and no colour means anything in it.
 *
 * Which moments earn it is his call and lives elsewhere: a finished project
 * and a finished milestone (`lib/bigFinish.ts`, watched by `lib/moments.ts`),
 * and a perfect day (`components/MomentsHost.tsx`). This file only draws.
 *
 * Performance (CLAUDE.md, rule 1): nothing loops. Each piece is one Web
 * Animation on `transform` and `opacity` — the compositor's two cheap
 * properties — and removes itself when it lands, so two seconds after the
 * burst the layer is empty again. No React render happens for any of it.
 * Under reduced motion there is no burst at all.
 *
 * It draws into `TickCheerHost`'s fixed, pointer-less layer, the one the
 * gold +1s float in, so it sits over every screen and never takes a press.
 */

const COLOURS = [
  'var(--job-lime)', 'var(--job-orange)', 'var(--job-gold)', 'var(--job-rose)',
  'var(--job-violet)', 'var(--job-sky)', 'var(--job-teal)', 'var(--job-coral)',
];

/** The idea card's 46, a few more for a whole screen. */
export const CONFETTI_PIECES = 56;

let layer: HTMLElement | null = null;

export function setConfettiLayer(el: HTMLElement | null): void {
  layer = el;
}

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Bursts from `at` (viewport pixels), or from a little above the middle of
 * the screen. `random` is there so `/design` and tests could pin it; the app
 * passes nothing.
 */
export function burstConfetti(at?: { x: number; y: number } | null, random: () => number = Math.random): void {
  if (!layer || reducedMotion()) return;
  const x = at?.x ?? window.innerWidth / 2;
  const y = at?.y ?? window.innerHeight * 0.42;
  /* Wider on a bigger screen; a phone's burst stays on the phone. */
  const reach = Math.min(window.innerWidth, window.innerHeight) * 0.28;
  for (let i = 0; i < CONFETTI_PIECES; i++) {
    const p = document.createElement('i');
    p.setAttribute('aria-hidden', 'true');
    p.className = 'ag-confetti';
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.backgroundColor = COLOURS[i % COLOURS.length];
    layer.appendChild(p);
    const angle = random() * Math.PI * 2;
    const distance = reach * (0.45 + random() * 0.75);
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    const a = p.animate?.(
      [
        { transform: 'translate(-50%, -50%) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy - reach * 0.25}px) rotate(${random() * 540}deg)`, opacity: 1, offset: 0.7 },
        /* The last third falls, as paper does, and fades as it goes. */
        { transform: `translate(${dx}px, ${dy + reach * 0.35}px) rotate(${random() * 720}deg)`, opacity: 0 },
      ],
      { duration: 1300 + random() * 500, easing: 'cubic-bezier(.2,.7,.3,1)' },
    );
    if (a) a.onfinish = () => p.remove();
    else p.remove();
  }
}
