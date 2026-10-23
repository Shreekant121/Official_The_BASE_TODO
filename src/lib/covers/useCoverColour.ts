/**
 * The colour of a cover photo, as CSS (`coverColour.ts` chooses it; this
 * reads the picture). Ideas 46 and 68's shared piece, born in 29-1P8a2 for
 * the glow behind a photo project's icon; Focus takes both of its colours
 * since 29-1P11c (`useCoverColours`).
 *
 * A picture is read once per device, ever: decoded straight to 32 × 32 by
 * `createImageBitmap` (off the main thread in Chromium), and the answer kept
 * in memory and in localStorage under the cover's id — a cover's id is a hash
 * of the picture (`coverRef.ts`), so the same id is always the same colour.
 * Until it is read, and for a picture it cannot read (a web address that
 * refuses to be read back), the answer is undefined and the caller shows grey.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useCoverSrc } from './coverCache';
import { isCoverRef } from './coverRef';
import { coverColours, oklchCss, GREY_GLOW } from './coverColour';
import { hashId } from '../projectCover';

/* v2 since 29-1P11c: each picture's two colours. v1 held one, and is read again. */
const STORAGE_KEY = 'base.coverColour.v2';
const OLD_KEY = 'base.coverColour.v1';
const SIDE = 32;

type Pair = readonly [string, string];
const GREY_PAIR: Pair = [GREY_GLOW, GREY_GLOW];

const colours = new Map<string, Pair>();
const listeners = new Set<() => void>();
const reading = new Set<string>();

try {
  localStorage.removeItem(OLD_KEY);
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? (JSON.parse(raw) as unknown) : null;
  if (parsed && typeof parsed === 'object') {
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(v) && v.length === 2 && v.every((c) => typeof c === 'string')) colours.set(k, [v[0], v[1]]);
    }
  }
} catch { /* read again */ }

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** A pointer is its own key; an old inline picture or a web address is keyed by a hash of itself. */
function keyOf(imageUrl: string): string {
  return isCoverRef(imageUrl) ? imageUrl : `h:${hashId(imageUrl)}`;
}

function remember(key: string, pair: Pair) {
  colours.set(key, pair);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(colours)));
  } catch { /* still right for this visit */ }
  for (const l of listeners) l();
}

async function read(key: string, src: string) {
  if (reading.has(key)) return;
  reading.add(key);
  try {
    const blob = await (await fetch(src)).blob();
    const bitmap = await createImageBitmap(blob, { resizeWidth: SIDE, resizeHeight: SIDE, resizeQuality: 'low' });
    const canvas = document.createElement('canvas');
    canvas.width = SIDE;
    canvas.height = SIDE;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const found = coverColours(ctx.getImageData(0, 0, SIDE, SIDE).data);
    remember(key, found ? [oklchCss(found[0]), oklchCss(found[1])] : GREY_PAIR);
  } catch {
    /* Unreadable (a web picture without CORS, a broken file): grey, and not
       remembered, so a picture that loads later is read then. */
  } finally {
    reading.delete(key);
  }
}

/** The photo's colour as CSS, or undefined until it is known (and with no photo). */
export function useCoverColour(imageUrl: string | undefined): string | undefined {
  return useCoverColours(imageUrl)?.[0];
}

/** The photo's two colours as CSS (`coverColours`), or undefined until they are known. */
export function useCoverColours(imageUrl: string | undefined): Pair | undefined {
  const src = useCoverSrc(imageUrl);
  /* Memoised: an old inline picture is a 200 KB string to hash. */
  const key = useMemo(() => (imageUrl ? keyOf(imageUrl) : undefined), [imageUrl]);
  const pair = useSyncExternalStore(subscribe, () => (key ? colours.get(key) : undefined));
  useEffect(() => {
    if (key && src && !colours.has(key)) void read(key, src);
  }, [key, src]);
  return pair;
}
