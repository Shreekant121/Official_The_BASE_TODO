/**
 * Which screen BASE opens on (BIG-6, his call 2026-09-30): the Dashboard,
 * with a setting to go back to Home. Settings → App; BIG-9 gives it its
 * permanent home when Settings is redrawn.
 *
 * Device-only, in localStorage, like `speedPrefs.ts` and for a similar reason:
 * the laptop and the tablet are used for different things, and a choice made
 * on one should not quietly move the other. Every read is wrapped, because
 * storage can throw in a locked-down browser.
 *
 * The screenshot harness sets this to 'home', so every Home baseline keeps
 * photographing Home at `/` (`scripts/screenshots.ts`).
 */
export type Landing = 'dashboard' | 'home';

export const LANDING_KEY = 'base.landing';

const listeners = new Set<() => void>();

export function readLanding(): Landing {
  try {
    return localStorage.getItem(LANDING_KEY) === 'home' ? 'home' : 'dashboard';
  } catch {
    return 'dashboard';
  }
}

export function writeLanding(landing: Landing): void {
  try {
    localStorage.setItem(LANDING_KEY, landing);
  } catch {
    /* Not remembered past this page load. */
  }
  for (const fn of listeners) fn();
}

export function subscribeLanding(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
