/**
 * When he was last here, on this device (29-1P14b, idea 110: welcome back
 * after three or more days away). Device-only, in localStorage: the other
 * device's visits are read from the data instead (`dayMoments.ts`'s
 * `lastActivityAt`), so a day on the tablet is not "away" on the laptop.
 *
 * Marked when BASE opens, when it is shown again, when it is hidden, and on
 * a press at most once a minute — cheap, one storage write. Before each open
 * or return marks it, the previous value is kept as `cameBackFrom`: that is
 * what the welcome measures from, until he closes it.
 *
 * Installed once at startup (`main.tsx`). The harness's stand-in user has no
 * history and no cloud, so no shot ever sees a welcome.
 */
const KEY = 'base.lastHere';
const PRESS_EVERY_MS = 60_000;

let installed = false;
let cameBack: number | null = null;
let lastPressMark = 0;
const listeners = new Set<() => void>();

function read(): number | null {
  try {
    const n = Number(localStorage.getItem(KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function mark(now: number = Date.now()): void {
  try {
    localStorage.setItem(KEY, String(now));
  } catch {
    /* A locked-down browser: no welcome back, nothing else lost. */
  }
}

/** An open or a return: keep when he was last here, then mark now. */
function arrive(): void {
  const before = read();
  if (before !== null && cameBack === null) {
    cameBack = before;
    for (const fn of listeners) fn();
  }
  mark();
}

export function installLastHere(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  arrive();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') arrive();
    else mark();
  });
  window.addEventListener(
    'pointerdown',
    () => {
      const now = Date.now();
      if (now - lastPressMark < PRESS_EVERY_MS) return;
      lastPressMark = now;
      mark(now);
    },
    { capture: true, passive: true },
  );
}

/** When he was last here before this open or return, until the welcome is closed. */
export function cameBackFrom(): number | null {
  return cameBack;
}

/** The welcome was shown and closed, or was not due: measure afresh next time. */
export function settleCameBack(): void {
  if (cameBack === null) return;
  cameBack = null;
  for (const fn of listeners) fn();
}

export function subscribeCameBack(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** For `/design` and a dev tab: pretend he was last here at `at`. */
export function pretendCameBackFrom(at: number | null): void {
  cameBack = at;
  for (const fn of listeners) fn();
}
