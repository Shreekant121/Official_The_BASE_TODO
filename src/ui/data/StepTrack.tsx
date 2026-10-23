/**
 * A task's steps, as a card shows them (29-1P7b, ideas 160, 12 and 163).
 *
 * His call, 2026-10-13: the three ideas are one picture, not three.
 *   - **The card fills (160, from Things 3).** A faint lime wash grows from the
 *     card's left edge as steps get done, with a brighter line at its front.
 *     It REPLACES the grey hairline that ran along a card's foot. Lime because
 *     done is lime's job. `stepWash` is the layer; the card puts it first in
 *     its own `backgroundImage` list (`stepWash.ts`), so there is no extra element, nothing to
 *     stack content above, and the hover fill underneath it still changes.
 *   - **Step dots with a line (12, Apple's "3 of 5").** Six steps or fewer read
 *     as dots joined by a line, filled from the left as many as are done; more
 *     than six would be a row of specks, so they keep "↳ 2/5".
 *   - **Tick steps from the card (163).** The dots (or the count) are a button
 *     that unfolds the steps under the card, where each one ticks. Ticking the
 *     last one does nothing to the task itself — his pick over the idea's
 *     "Mark the task done?" offer.
 *
 * Counts are the whole tree's (`subtaskCount`), as the old "2/5" was. The dots
 * fill by count, left to right, not by which step is done: they say how far,
 * not which.
 *
 * Nothing runs at rest. A dot's colour and the wash's width transition only
 * when a step is ticked; the wash draws at its width on first paint.
 */
import type { CSSProperties } from 'react';
import { Icon } from '../core/Icon';
import { MAX_DOTS } from './stepWash';

const DOT = 7;
const LINK = 6;

export interface StepTrackProps {
  done: number;
  total: number;
  /** The steps are unfolded under the card. */
  open: boolean;
  onToggle: () => void;
  /** Read after "2 of 5 steps done" — the task's title, so a list of these is not twenty identical buttons. */
  title?: string;
  style?: CSSProperties;
}

/**
 * The tap target: dots on a line (or "↳ 2/5") and a small chevron. A real
 * button, so a press on it neither opens the card nor starts a drag
 * (`cardPress.ts`, `SortableList`'s sensors).
 */
export function StepTrack({ done, total, open, onToggle, title, style }: StepTrackProps) {
  const dots = total <= MAX_DOTS;
  return (
    <button
      type="button"
      aria-expanded={open}
      /* "Subtasks", the app's word for them everywhere else (the ⋯ menu's
         Show subtasks, the sheet); the ideas page said "steps". */
      aria-label={`${done} of ${total} subtask${total === 1 ? '' : 's'} done${title ? `, ${title}` : ''}. ${open ? 'Hide' : 'Show'} subtasks`}
      title={open ? 'Hide subtasks' : 'Show subtasks'}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className="ag-step-track"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        /* A finger-sized target that does not grow the fact line it sits in. */
        height: 26, margin: '-5px -6px', padding: '0 6px',
        border: 0, borderRadius: 'var(--r-pill)',
        background: 'transparent', color: 'var(--fg-3)', cursor: 'pointer',
        minWidth: 0,
        ...style,
      }}
    >
      {dots ? (
        <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center' }}>
          {Array.from({ length: total }, (_, i) => {
            const on = i < done;
            return (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center' }}>
                {i > 0 && (
                  <span
                    style={{
                      width: LINK, height: 2, borderRadius: 1,
                      /* Lit when the dots on both sides are. */
                      backgroundColor: i < done ? 'var(--job-lime)' : 'oklch(1 0 0 / 0.12)',
                      transition: 'background-color var(--dur-base) var(--ease-glass)',
                    }}
                  />
                )}
                <span
                  style={{
                    width: DOT, height: DOT, borderRadius: 'var(--r-circle)',
                    boxSizing: 'border-box',
                    backgroundColor: on ? 'var(--job-lime)' : 'transparent',
                    boxShadow: on ? '0 0 6px -1px oklch(0.84 0.17 130 / 0.55)' : 'inset 0 0 0 1.5px oklch(1 0 0 / 0.28)',
                    transition: 'background-color var(--dur-base) var(--ease-glass), box-shadow var(--dur-base) var(--ease-glass)',
                  }}
                />
              </span>
            );
          })}
        </span>
      ) : (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Icon name="corner-down-right" size={13} style={{ flex: '0 0 auto' }} />
          <span
            style={{
              font: 'var(--type-numeric)', fontSize: 'var(--text-xs)',
              fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
            }}
          >
            {done}/{total}
          </span>
        </span>
      )}
      <Icon
        name="chevron-down"
        size={11}
        style={{
          flex: '0 0 auto',
          transform: open ? 'rotate(180deg)' : undefined,
          transition: 'transform var(--dur-base) var(--ease-springy)',
        }}
      />
    </button>
  );
}
