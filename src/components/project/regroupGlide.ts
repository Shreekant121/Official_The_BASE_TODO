/**
 * Regrouping glides (29-1P9a, idea 158): when the list view changes from By
 * list to By due date or By Score, every row slides from where it was to its
 * place in the new group, "so you can follow where each one went", instead of
 * the table redrawing.
 *
 * A row lands in a different section under a new key, so React mounts a new
 * element for it and Framer's `layout` has nothing to animate from. So this
 * is a plain FLIP: `rememberRows` reads where every row is drawn at the press,
 * before the regroup renders; `useRegroupGlide`, in the table's layout effect
 * after it, moves each row back to its old place and lets it go on the
 * `translate` property — never `transform`, which the row's Framer `layout`
 * owns (CLAUDE.md: Framer Motion overwrites `transform`).
 *
 * The rects are read once per press of the Group menu, never on a screen's
 * way in (CLAUDE.md, Performance rule 6). Rows are found by their dust
 * marker, which every task row already wears.
 */
import { useLayoutEffect, type RefObject } from 'react';
import { useMotion } from '../../ui/core/motion';

const ROW = '[data-dust^="task:"]';

function prefersLessMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Where each table's rows were at the last press, until the table plays it. */
const pending = new WeakMap<HTMLElement, Map<string, DOMRect>>();

/** Call at the press, before the new grouping is set. */
export function rememberRows(root: HTMLElement | null): void {
  if (!root) return;
  const rects = new Map<string, DOMRect>();
  root.querySelectorAll<HTMLElement>(ROW).forEach((row) => {
    const id = row.dataset.dust;
    if (id && !rects.has(id)) rects.set(id, row.getBoundingClientRect());
  });
  pending.set(root, rects);
}

/** In the table: after `groupBy` has rendered, glide each row in from where it was. */
export function useRegroupGlide(rootRef: RefObject<HTMLElement | null> | undefined, groupBy: string): void {
  const motion = useMotion();
  useLayoutEffect(() => {
    const root = rootRef?.current;
    if (!root) return;
    const before = pending.get(root);
    if (!before) return;
    pending.delete(root);
    if (prefersLessMotion()) return;
    const seen = new Set<string>();
    const ease = motion.ease.glide;
    const easing = `cubic-bezier(${ease[0]}, ${ease[1]}, ${ease[2]}, ${ease[3]})`;
    root.querySelectorAll<HTMLElement>(ROW).forEach((row) => {
      const id = row.dataset.dust;
      if (!id || seen.has(id)) return;
      seen.add(id);
      const was = before.get(id);
      if (!was) return;
      const now = row.getBoundingClientRect();
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      if (Math.abs(dx) + Math.abs(dy) < 1) return;
      row.animate(
        [{ translate: `${dx}px ${dy}px` }, { translate: '0px 0px' }],
        { duration: Math.round(motion.dur.slow * 1000 * 1.2), easing },
      );
    });
  }, [rootRef, groupBy, motion]);
}
