/**
 * Dark that isn't grey (idea 63, 29-1P1, BIG-15): Settings → App → Appearance
 * tints every dark grey a trace of one colour. Neutral by default; the other
 * four are the idea page's. The colours themselves are in `tokens/v3.css`,
 * keyed off `<html data-dark-tint>`, which this module sets.
 *
 * HIS CALL (2026-09-30): the same on both devices. So the choice lives in the
 * cloud (`darkTintSync.ts`, its own small document) and a copy of it lives
 * here in localStorage, which is what the first frame is drawn from:
 * `applyDarkTint()` runs in `main.tsx` before React, so a tinted app never
 * flashes grey on open. Every storage read is wrapped, because a preference
 * is not worth a crash in a locked-down browser.
 */
export const DARK_TINTS = ['neutral', 'emerald', 'orange', 'violet', 'sky'] as const;
export type DarkTint = (typeof DARK_TINTS)[number];

const KEY = 'base.appearance.darkTint';

export function isDarkTint(v: unknown): v is DarkTint {
  return typeof v === 'string' && (DARK_TINTS as readonly string[]).includes(v);
}

export function readDarkTint(): DarkTint {
  try {
    const raw = localStorage.getItem(KEY);
    return isDarkTint(raw) ? raw : 'neutral';
  } catch {
    return 'neutral';
  }
}

type Listener = (tint: DarkTint, fromHere: boolean) => void;
const listeners = new Set<Listener>();

/** Called for every change; `fromHere` is false when the cloud brought it. */
export function subscribeDarkTint(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function store(tint: DarkTint, fromHere: boolean): void {
  try {
    localStorage.setItem(KEY, tint);
  } catch {
    /* Not remembered on this device past this page load; still applied now. */
  }
  applyDarkTint();
  for (const fn of listeners) fn(tint, fromHere);
}

/** His pick, from the picker. The sync hook sends it to the other device. */
export function setDarkTint(tint: DarkTint): void {
  if (tint === readDarkTint()) return;
  store(tint, true);
}

/** The other device's pick, arriving from the cloud. Not sent back. */
export function adoptDarkTint(tint: DarkTint): void {
  if (tint === readDarkTint()) return;
  store(tint, false);
}

export function applyDarkTint(): void {
  const tint = readDarkTint();
  const root = document.documentElement;
  if (tint === 'neutral') delete root.dataset.darkTint;
  else root.dataset.darkTint = tint;
}
