/**
 * Aurora Glass — Stepper
 * Ported from design-system/components/navigation/Stepper.{jsx,d.ts} in UI-27.
 * Guidance: design-system/components/navigation/Stepper.prompt.md
 *
 * The product's flow spine — Home → Selection → Deadlines → Focus. Three
 * states readable without colour: a done step is filled, ticked and emitting;
 * the current one carries a soft outer ring; a future one is a well. The
 * connector fills over `--dur-slow`, which `prompt.md` calls the reward moment
 * — do not shorten it.
 *
 * `hint` is where the real value lives ("3 chosen", "4h 30m"). A stepper with
 * only labels is decoration, and the source says so.
 *
 * PORT NOTES
 * ----------
 * 1. **It is an `<ol>` and the steps are `<li>`s**, as in the source, but the
 *    current step is marked with `aria-current="step"` and every step states
 *    its condition in a visually-hidden run ("done", "current"). The source
 *    draws all three states and announces none of them; a tick that only
 *    exists as an unlabelled `<svg>` reads as an empty list item.
 * 2. The `[vertical ? 'width' : 'height']` computed keys the source uses to
 *    size its connector are written out as two branches instead — TypeScript
 *    widens a computed key to `string` and the style object stops type-
 *    checking, which is a real loss on the one prop that has to be right.
 * 3. **A horizontal label is centred under its own circle, not under the whole
 *    step** (FIX-7). The source stacks the label beneath a row of circle *plus
 *    connector* and centres it on that row, so each label is centred against a
 *    different width — and the last step, which carries no connector, against a
 *    different one again. Measured at HEAD, the first two labels sat 18px right
 *    of their own circles at every width the stepper appears at. Here the
 *    circle and the label share a column, so the column is as wide as the label
 *    needs and the circle sits over its middle; the connector is the column's
 *    sibling rather than the circle's. The connector keeps its `--dur-slow`
 *    fill untouched — `prompt.md` calls that the reward moment.
 */
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

/**
 * The circle's diameter and the connector's thickness, named because a
 * horizontal connector is now centred on the circle by hand: it is a sibling of
 * the circle's column rather than a child of its row, so no alignment property
 * can reach across to do it (port note 3).
 */
const CIRCLE = 30;
const CONNECTOR = 2;

export interface Step {
  label: ReactNode;
  /** Muted second line. Where the real value goes: "3 chosen", "4h 30m". */
  hint?: ReactNode;
}

export interface StepperProps extends HTMLAttributes<HTMLOListElement> {
  steps: Array<string | Step>;
  /** Zero-based index of the active step. */
  current?: number;
  orientation?: 'horizontal' | 'vertical';
}

export function Stepper({
  steps = [],
  current = 0,
  orientation = 'horizontal',
  className = '',
  style,
  ...rest
}: StepperProps) {
  const items: Step[] = steps.map((s) => (typeof s === 'string' ? { label: s } : s));
  const vertical = orientation === 'vertical';

  return (
    <ol
      className={className}
      style={{
        display: 'flex',
        flexDirection: vertical ? 'column' : 'row',
        alignItems: vertical ? 'stretch' : 'flex-start',
        gap: 0,
        margin: 0,
        padding: 0,
        listStyle: 'none',
        ...style,
      }}
      {...rest}
    >
      {items.map((s, i) => {
        const done = i < current;
        const now = i === current;
        const last = i === items.length - 1;

        const connector: CSSProperties = {
          flex: 1,
          ...(vertical ? { width: CONNECTOR, minHeight: 34 } : { height: CONNECTOR, minWidth: 20 }),
          // Horizontal: the top margin is what lands the line on the circle's
          // own middle, since the two are no longer in one row (port note 3).
          margin: vertical ? 'var(--sp-2) 0' : `${(CIRCLE - CONNECTOR) / 2}px var(--sp-3) 0`,
          borderRadius: 'var(--r-pill)',
          background: done ? 'var(--job-lime)' : 'oklch(1 0 0 / 0.09)',
          boxShadow: done ? '0 0 10px -2px var(--job-lime)' : 'none',
          transition: 'background var(--dur-slow) var(--ease-glass), box-shadow var(--dur-slow) var(--ease-glass)',
        };

        const circle = (
          <span
            style={{
              flex: '0 0 auto',
              width: CIRCLE,
              height: CIRCLE,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 'var(--r-circle)',
              backgroundImage: done || now ? 'var(--glass-tint-lime)' : 'var(--glass-well)',
              boxShadow: done
                ? 'var(--glass-rim-2), var(--job-lime-shine)'
                : now
                  ? 'var(--glass-rim-2), 0 0 0 3px var(--job-lime-wash), var(--job-lime-shine)'
                  : 'var(--glass-well-shadow), 0 0 0 1px var(--line-soft)',
              color: done || now ? 'var(--fg-1)' : 'var(--fg-4)',
              font: 'var(--type-numeric)',
              fontSize: 'var(--text-xs)',
              transition: 'background var(--dur-base) var(--ease-glass), box-shadow var(--dur-base) var(--ease-glass)',
            }}
          >
            {done ? (
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M3.5 8.5 6.5 11.5 12.5 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              i + 1
            )}
          </span>
        );

        const line = !last && <span aria-hidden="true" style={connector} />;

        const label = (
          <div
            style={{
              display: 'grid',
              gap: 2,
              textAlign: vertical ? 'left' : 'center',
              paddingBottom: vertical ? 'var(--sp-6)' : 0,
            }}
          >
            <span
              style={{
                font: 'var(--type-label)',
                color: done || now ? 'var(--fg-1)' : 'var(--fg-4)',
                transition: 'color var(--dur-base) var(--ease-glass)',
              }}
            >
              {s.label}
              {/* Port note 1 — the three states are drawn, so they have to
                  be said too. */}
              {(done || now) && <span className="sr-only">{done ? ' — done' : ' — current step'}</span>}
            </span>
            {s.hint && <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>{s.hint}</span>}
          </div>
        );

        return (
          <li
            key={i}
            aria-current={now ? 'step' : undefined}
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: vertical ? 'var(--sp-5)' : 0,
              flex: last ? '0 0 auto' : 1,
              minWidth: 0,
            }}
          >
            {vertical ? (
              /* The source's own vertical arrangement, unchanged: the connector
                 hangs below the circle and the label sits beside both, so
                 nothing in it is centred against anything. */
              <>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 0,
                    height: '100%',
                  }}
                >
                  {circle}
                  {line}
                </div>
                {label}
              </>
            ) : (
              <>
                <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--sp-4)', minWidth: 0 }}>
                  {circle}
                  {label}
                </div>
                {line}
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}
