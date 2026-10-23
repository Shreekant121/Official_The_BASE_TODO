/**
 * Two projects side by side (BIG-5) — where the pair lives, which is the URL.
 *
 * `/project/:left?beside=:right`. The split is an address rather than a store
 * field, so Back undoes a close, a reload keeps both boards, and nothing about
 * it is synced: which boards are open is this window's business, not his data.
 *
 * Pure and store-free; the screen hands it the ids that exist.
 */

/** The query parameter that carries the second board. */
export const BESIDE_PARAM = 'beside';

/** The address of `left` with `right` open beside it — or `left` alone. */
export function splitPath(left: string, right?: string | null): string {
  return right && right !== left
    ? `/project/${left}?${BESIDE_PARAM}=${encodeURIComponent(right)}`
    : `/project/${left}`;
}

export interface ResolvedSplit {
  /** The board on the left (or on top), or null when neither id is a project. */
  left: string | null;
  /** The board beside it, or null for the ordinary single board. */
  right: string | null;
}

/**
 * What an address actually opens, against the projects that exist now.
 *
 * A board can vanish while it is open — deleted or archived from its own
 * menu, from the other board, from the tablet, or by Atlas — and the address
 * then names something that is not there. The rule is that a board never
 * turns into a "not found" while its partner is still good: the survivor
 * becomes the single board. The same project twice is one board, because its
 * lists would be registered twice with one drag system, and two droppables
 * with one id collide silently.
 */
export function resolveSplit(
  exists: (id: string) => boolean,
  left: string | undefined,
  beside: string | null | undefined,
): ResolvedSplit {
  const l = left && exists(left) ? left : null;
  const r = beside && beside !== left && exists(beside) ? beside : null;
  if (l === null) return { left: r, right: null };
  return { left: l, right: r };
}

/** The address after one board of a pair is closed: the other, alone. */
export function closePanePath(split: { left: string; right: string }, pane: 0 | 1): string {
  return splitPath(pane === 0 ? split.right : split.left);
}

/**
 * The address after one board of a pair is swapped for another project —
 * opening a project that sits inside it, or a parent from its path. The other
 * board stays; the same project on both sides collapses to one board.
 */
export function replacePanePath(
  split: { left: string; right: string },
  pane: 0 | 1,
  projectId: string,
): string {
  return pane === 0 ? splitPath(projectId, split.right) : splitPath(split.left, projectId);
}
