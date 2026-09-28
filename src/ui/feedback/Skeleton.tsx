/**
 * Aurora Glass — Skeleton
 *
 * RECONCILED against the real `Skeleton.jsx` at UI-21.
 * ---------------------------------------------------------------------
 * Derived at UI-8 from `motion.css`'s `ag-shimmer` keyframe (which the
 * token file itself comments "Skeleton shimmer") plus the Card/Well
 * inversion, because the design project was unreachable for eleven
 * sessions. UI-21 mirrored the real file and diffed it.
 *
 * **The two disagree about the trough, and this file keeps its own —
 * with the source's blessing, not in spite of it.** The prototype hardcodes
 * a flat `oklch(1 0 0 / 0.04)` with an inset shadow. But its own `d.ts`
 * calls the component a *"travelling shimmer over a carved well"*, and
 * `readme.md` states the material law outright: "Anything you put data
 * *into* — inputs, troughs, progress tracks… uses `--glass-well` and
 * `--glass-well-shadow`." A skeleton is a trough. The tokens are the rule;
 * the prototype's literal is an approximation of them, and the handoff
 * README says to match the visual output rather than copy prototype
 * internals.
 *
 * That choice is what forces note 1 below, and note 1 is why the prototype
 * could get away with a single element and this file cannot.
 *
 * TAKEN from the real file: the sweep's own gradient — a brighter, more
 * sharply peaked core (`.10 → .16 → .10` across 45–55%) than the derived
 * flat `.11`, and a 1.6s period rather than 1.7s.
 *
 * NOTES ON THE DERIVATION
 * -----------------------
 * 1. The shimmer is a CHILD, not another background layer on the trough.
 *    `ag-shimmer` animates `background-position`, which applies to every
 *    layer of the element it runs on — and `--glass-well` IS a gradient
 *    (`glass.css:49`), so painting the sweep on top of it would drag the
 *    trough's own gradient 260% off the box and leave the line transparent
 *    for most of the loop. An absolutely positioned overlay is the only
 *    version where the keyframe means what it says. **The prototype avoids
 *    this only because its trough is a flat `background-color`, which
 *    `background-position` cannot move.** Swap the well back for a literal
 *    and the child becomes unnecessary; keep the well and it is required.
 * 2. Multi-line placeholders shorten their LAST line. A block of identical
 *    full-width bars reads as a table; a paragraph ends mid-line, and the
 *    point of a skeleton is to be the shape of what is coming.
 * 3. `role="status"` with `aria-busy` rather than silence: a screen reader
 *    should hear that something is loading, and the caller names it. It is
 *    the one thing about a placeholder that is not visual.
 * 4. No `prefers-reduced-motion` branch is needed — `motion.css` rewrites
 *    every duration token to 1ms under that query and pins
 *    `animation-iteration-count: 1` globally, so the sweep stops there for
 *    free.
 */
import type { CSSProperties, HTMLAttributes } from 'react';

export interface SkeletonProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** How many bars. Above 1 the last one is shortened — see note 2. */
  lines?: number;
  /** Bar thickness. 12px reads as a line of body copy; raise it for a block. */
  height?: number | string;
  /** Overall width. Defaults to filling the container. */
  width?: number | string;
  /** Corner radius. Pill for text lines, `--r-lg` for a block or a thumbnail. */
  radius?: string;
  /** Width of the final bar when `lines > 1`. */
  lastLineWidth?: number | string;
  /** What is loading, for assistive tech. Say the thing, not "Loading…". */
  label?: string;
}

export function Skeleton({
  lines = 1,
  height = 12,
  width,
  radius = 'var(--r-pill)',
  lastLineWidth = '62%',
  label = 'Loading',
  className = '',
  style,
  ...rest
}: SkeletonProps) {
  const count = Math.max(1, Math.floor(lines));

  const bar: CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    height,
    borderRadius: radius,
    background: 'var(--glass-well)',
    boxShadow: 'var(--glass-well-shadow)',
  };

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={className}
      style={{ display: 'grid', gap: 'var(--sp-3)', width, ...style }}
      {...rest}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{ ...bar, width: count > 1 && i === count - 1 ? lastLineWidth : '100%' }}
        >
          {/* Note 1 — the sweep is its own element. */}
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              /* The real file's sweep: a peaked core rather than a flat
                 band, so the highlight reads as a moving light source. */
              backgroundImage:
                'linear-gradient(100deg, transparent 20%, oklch(1 0 0 / 0.10) 45%, oklch(1 0 0 / 0.16) 50%, oklch(1 0 0 / 0.10) 55%, transparent 80%)',
              backgroundSize: '220% 100%',
              backgroundRepeat: 'no-repeat',
              /* Staggered by the system's own step, so a stack of bars
                 sweeps as one wave rather than four separate ones. */
              animation: `ag-shimmer 1600ms var(--ease-in-out) ${i * 90}ms infinite`,
            }}
          />
        </div>
      ))}
    </div>
  );
}
