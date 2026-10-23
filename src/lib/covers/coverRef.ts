/**
 * Cover pictures live in their own documents, not in `data/main` (2026-09-30).
 *
 * A cover used to be a JPEG data URL written straight onto `imageUrl`, which
 * put every picture inside the one document Firestore caps at 1 MiB: on his
 * account six-odd project covers were 906 KB of a 984 KB record, against 49 KB
 * for every task he has. Now each picture is its own document,
 * `users/{uid}/covers/{id}`, and `imageUrl` holds `cover:<id>` — a pointer
 * about forty bytes long. The field keeps its name and its type, so every
 * `imageUrl ? … : …` in the app still reads "has a cover" correctly; only the
 * places that draw one need `useCoverSrc` (`coverCache.ts`).
 *
 * **The id is a hash of the picture**, so the same picture is always the same
 * document. That is what makes lifting old covers out safe to run as often as
 * the store changes: a focus-queue copy and its backlog task, a restore from
 * the Trash, Atlas writing an old copy of the document back — all land on the
 * id already there instead of uploading a second copy.
 *
 * This file is pure (no DOM, no Firebase) because `mcp/` resolves a shared
 * project's cover from Node, and because the sweep is the part that deletes
 * pictures and must be tested.
 */

export const COVER_REF_PREFIX = 'cover:';

/**
 * A cover nothing points at is deleted at once — his call, 2026-09-30:
 * "instead of deleting them after 30 days, make sure they get deleted
 * instantly". The one wait is for a picture this young, and only in the sweep
 * on opening: another device may have uploaded it a moment ago and not yet
 * pushed the edit that points at it, and a cover picked in a task sheet that
 * is still open is uploaded before it is saved.
 */
export const COVER_MIN_AGE_MS = 10 * 60 * 1000;

/** The only key walked. A data URL pasted into a description is text, not a cover. */
const COVER_KEY = 'imageUrl';

export function isCoverRef(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(COVER_REF_PREFIX);
}

export function coverRef(id: string): string {
  return COVER_REF_PREFIX + id;
}

export function coverIdOf(ref: string): string {
  return ref.slice(COVER_REF_PREFIX.length);
}

/** A picture still stored inline — what every cover was before this. */
export function isInlineCover(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:image/');
}

function visitCovers(value: unknown, visit: (cover: string) => void, seen: Set<object>): void {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) visitCovers(item, visit, seen);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === COVER_KEY && typeof child === 'string') visit(child);
    else visitCovers(child, visit, seen);
  }
}

/** Every cover id any of `values` points at, however deep (subtasks, Trash entries). */
export function collectCoverIds(...values: unknown[]): Set<string> {
  const ids = new Set<string>();
  const seen = new Set<object>();
  for (const v of values) visitCovers(v, (c) => { if (isCoverRef(c)) ids.add(coverIdOf(c)); }, seen);
  return ids;
}

/** Every picture still stored inline in `values`. */
export function collectInlineCovers(...values: unknown[]): Set<string> {
  const found = new Set<string>();
  const seen = new Set<object>();
  for (const v of values) visitCovers(v, (c) => { if (isInlineCover(c)) found.add(c); }, seen);
  return found;
}

/**
 * `value` with every inline cover that `refs` knows swapped for its pointer.
 * **Returns the very same object when nothing changed**, at every level, so a
 * store slice with no covers in it is not rewritten and nothing re-renders.
 */
export function rewriteInlineCovers<T>(value: T, refs: ReadonlyMap<string, string>): T {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const r = rewriteInlineCovers(item, refs);
      if (r !== item) changed = true;
      return r;
    });
    return (changed ? next : value) as T;
  }
  // Only plain records — a Map, a Date or a class instance is left alone.
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    let r: unknown;
    if (key === COVER_KEY && typeof child === 'string') r = refs.get(child) ?? child;
    else r = rewriteInlineCovers(child, refs);
    if (r !== child) changed = true;
    next[key] = r;
  }
  return (changed ? next : value) as T;
}

/** One row of `users/{uid}/data/covers`, the list of pictures the account has stored. */
export interface CoverIndexEntry {
  createdAt: number;
}

/**
 * The sweep on opening: every stored picture nothing points at, except one
 * younger than `COVER_MIN_AGE_MS`. It catches what `releasedCovers` could not
 * see — a cover replaced on a device that closed before deleting it.
 */
export function planCoverSweep(
  index: Readonly<Record<string, CoverIndexEntry>>,
  referenced: ReadonlySet<string>,
  now: number,
): string[] {
  return Object.entries(index)
    .filter(([id, entry]) => !referenced.has(id) && now - (entry?.createdAt ?? 0) >= COVER_MIN_AGE_MS)
    .map(([id]) => id);
}

/**
 * The covers pointed at before a change and not after it — a replaced or
 * removed cover, or the last copy of one leaving the Trash. Deleted with no
 * wait, however young: this device saw it in use and saw it go.
 */
export function releasedCovers(before: ReadonlySet<string>, after: ReadonlySet<string>): string[] {
  return [...before].filter((id) => !after.has(id));
}

/**
 * A share document with its cover turned back into a picture. A public link
 * is read by strangers who cannot open `users/{uid}/covers`, so a pointer
 * must never be published: the picture goes in, or no cover does.
 */
export async function withResolvedShareCover<T extends { project?: { coverUrl?: string } }>(
  shareDoc: T,
  resolve: (id: string) => Promise<string | undefined>,
): Promise<T> {
  const cover = shareDoc.project?.coverUrl;
  if (!isCoverRef(cover) || !shareDoc.project) return shareDoc;
  let src: string | undefined;
  try { src = await resolve(coverIdOf(cover)); } catch { src = undefined; }
  const project = { ...shareDoc.project };
  if (src) project.coverUrl = src;
  else delete project.coverUrl;
  return { ...shareDoc, project };
}
