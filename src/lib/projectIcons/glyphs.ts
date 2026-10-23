/**
 * How a project's Phosphor icon gets its shape (29-1P8a2, idea 150).
 *
 * The whole set is ~190 KB gzipped (`catalog.generated.ts`), far too much
 * for the startup download, so it is fetched with `import()` — and a card
 * cannot wait for that every time it draws. Three layers, read in order:
 *
 * - **Bundled**: the defaults (`starter.generated.ts`), so a new project's
 *   rocket and an iconless project's clipboard are there on the first frame.
 * - **This device**: every glyph a card here has drawn is kept in
 *   localStorage (`base.projectIcons.v1`, a few hundred bytes each) and read
 *   once at load, so after the first time, every card draws its icon at once.
 * - **The catalogue**: fetched once, the first time the picker opens or a
 *   card wears an icon this device has never drawn (chosen on the other
 *   device, say). Until it lands, the tile shows its glass and glow, empty.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { STARTER_GLYPHS } from './starter.generated';
import type { CatalogRow } from './catalog.generated';

const STORAGE_KEY = 'base.projectIcons.v1';
/** Enough for every project he could have, small enough never to matter. */
const KEEP = 200;

const glyphs = new Map<string, readonly string[]>(Object.entries(STARTER_GLYPHS));
const listeners = new Set<() => void>();
/** Names asked for and not yet known, so the catalogue's arrival fills them. */
const wanted = new Set<string>();
/** Glyphs drawn on this device beyond the bundled ones, oldest first. */
let kept: Record<string, readonly string[]> = {};

try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') {
      for (const [name, paths] of Object.entries(parsed as Record<string, unknown>)) {
        if (Array.isArray(paths) && paths.every((d) => typeof d === 'string')) {
          kept[name] = paths as string[];
          glyphs.set(name, paths as string[]);
        }
      }
    }
  }
} catch { /* private window, damaged entry: the catalogue fills in */ }

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function keep(name: string, paths: readonly string[]) {
  if (name in STARTER_GLYPHS || name in kept) return;
  kept = { ...kept, [name]: paths };
  const names = Object.keys(kept);
  if (names.length > KEEP) for (const old of names.slice(0, names.length - KEEP)) delete kept[old];
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(kept)); } catch { /* full: still drawn this time */ }
}

let catalog: Promise<readonly CatalogRow[]> | null = null;

/** The whole set, fetched once. The picker awaits it; a card only asks for one glyph. */
export function loadCatalog(): Promise<readonly CatalogRow[]> {
  if (!catalog) {
    catalog = import('./catalog.generated').then(({ CATALOG }) => {
      for (const [name, , paths] of CATALOG) {
        if (!glyphs.has(name)) glyphs.set(name, paths);
      }
      for (const name of wanted) {
        const paths = glyphs.get(name);
        if (paths) keep(name, paths);
      }
      wanted.clear();
      emit();
      return CATALOG;
    }).catch((err: unknown) => {
      catalog = null; // offline: the next card or the picker asks again
      throw err;
    });
  }
  return catalog;
}

/**
 * A glyph's paths, or undefined while the catalogue is on its way (or for a
 * name Phosphor does not have). Drawing one also keeps it on this device.
 */
export function useGlyph(name: string | undefined): readonly string[] | undefined {
  const paths = useSyncExternalStore(subscribe, () => (name ? glyphs.get(name) : undefined));
  useEffect(() => {
    if (!name) return;
    const known = glyphs.get(name);
    if (known) { keep(name, known); return; }
    wanted.add(name);
    loadCatalog().catch(() => { /* drawn empty; retried on the next mount */ });
  }, [name]);
  return paths;
}
