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
 * PLACEHOLDERS SHAPED LIKE WHAT'S COMING (29-1P14d2, idea 116)
 * -------------------------------------------------------------
 * A screen that waits on a fetch draws grey shapes in the layout of what is
 * coming — a circle, a title, a date — instead of a "Reading the laptop…"
 * line, and the real rows fade in over them (`useArrival`). `Bone` is one
 * shape; `SkeletonRows` is a list of rows built from it, which is what most
 * of those screens are. The glimmer is a loop, and allowed one: it runs only
 * while the screen is waiting, and stops because the placeholder is gone
 * (Performance rule 1).
 *
 * **The trough is a light grey now, not `--glass-well`.** On the 92%-opaque
 * glass (his call, 2026-09-24) the well's dark fill read as nothing at all:
 * measured in the browser, four placeholder rows were an empty card. The
 * idea page's 7% white, with the well's inset shadow kept, is what reads as
 * "grey shapes". Note 1 still holds as written — the sweep stays a child,
 * so the trough can go back to a gradient without breaking it.
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

export interface BoneProps {
  width?: number | string;
  height?: number | string;
  /** Pill for text lines, `--r-circle` for an avatar or a tick, `--r-lg` for a block. */
  radius?: string;
  /** Where in the wave this shape sweeps, in ms — a stack sweeps as one wave. */
  delay?: number;
  style?: CSSProperties;
}

/** One placeholder shape: a carved well with the light passing over it. */
export function Bone({ width = '100%', height = 12, radius = 'var(--r-pill)', delay = 0, style }: BoneProps) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'relative', display: 'block', overflow: 'hidden', flex: '0 0 auto',
        width, height, borderRadius: radius,
        backgroundColor: 'oklch(1 0 0 / 0.07)',
        boxShadow: 'var(--glass-well-shadow)',
        ...style,
      }}
    >
      {/* Note 1 — the sweep is its own element. */}
      <span
        style={{
          position: 'absolute',
          inset: 0,
          /* The real file's sweep: a peaked core rather than a flat
             band, so the highlight reads as a moving light source. */
          backgroundImage:
            'linear-gradient(100deg, transparent 20%, oklch(1 0 0 / 0.10) 45%, oklch(1 0 0 / 0.16) 50%, oklch(1 0 0 / 0.10) 55%, transparent 80%)',
          backgroundSize: '220% 100%',
          backgroundRepeat: 'no-repeat',
          animation: `ag-shimmer 1600ms var(--ease-in-out) ${delay}ms infinite`,
        }}
      />
    </span>
  );
}

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
        <Bone
          key={i}
          height={height}
          radius={radius}
          width={count > 1 && i === count - 1 ? lastLineWidth : '100%'}
          /* Staggered by the system's own step, so a stack of bars
             sweeps as one wave rather than four separate ones. */
          delay={i * 90}
        />
      ))}
    </div>
  );
}

/* Title widths, in turn: a list of real titles is ragged, and a column of
   equal bars reads as a table (note 2). Fixed rather than random, so a
   screenshot of a placeholder is the same every run. */
const TITLE_WIDTHS = ['58%', '44%', '70%', '51%', '64%', '40%'];

export interface SkeletonRowsProps {
  /** How many rows. Say roughly how many are coming; four when nobody knows. */
  rows?: number;
  /** What leads a row: a tick or avatar, an icon tile, or nothing. */
  lead?: 'circle' | 'square' | 'none';
  /** A short bar at the row's end, where a date or a count sits. */
  trail?: boolean;
  /** A second, smaller line under the title (a path, a summary). */
  sub?: boolean;
  /** Each row as a glass card, for lists whose rows are cards. */
  card?: boolean;
  /** Row height; 44 is a list row, more for a card with a second line. */
  rowHeight?: number;
  /** What is loading, for assistive tech. */
  label: string;
  style?: CSSProperties;
}

/** A list that is on its way: rows in the shape the real ones will have. */
export function SkeletonRows({
  rows = 4,
  lead = 'circle',
  trail = true,
  sub = false,
  card = false,
  rowHeight,
  label,
  style,
}: SkeletonRowsProps) {
  const height = rowHeight ?? (sub ? 60 : 44);
  return (
    <div role="status" aria-busy="true" aria-label={label} style={{ display: 'grid', gap: 'var(--sp-3)', ...style }}>
      {Array.from({ length: Math.max(1, rows) }, (_, i) => {
        const delay = i * 90;
        return (
          <div
            key={i}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', minHeight: height,
              boxSizing: 'border-box', padding: card ? 'var(--sp-4) var(--sp-6)' : '0 var(--sp-4)',
              borderRadius: 'var(--r-lg)',
              ...(card ? { backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)' } : null),
            }}
          >
            {lead !== 'none' && (
              <Bone
                width={lead === 'circle' ? 20 : 32}
                height={lead === 'circle' ? 20 : 32}
                radius={lead === 'circle' ? 'var(--r-circle)' : 'var(--r-md)'}
                delay={delay}
              />
            )}
            <span style={{ display: 'grid', gap: 'var(--sp-3)', flex: 1, minWidth: 0 }}>
              <Bone width={TITLE_WIDTHS[i % TITLE_WIDTHS.length]} height={11} delay={delay} />
              {sub && <Bone width="34%" height={8} delay={delay} />}
            </span>
            {trail && <Bone width={32} height={9} delay={delay} />}
          </div>
        );
      })}
    </div>
  );
}
