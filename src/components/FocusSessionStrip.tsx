/**
 * The session strip — ported from `design-system/screens/focus.html`'s
 * `SessionStrip` (UI-32).
 *
 * The mockup's third complaint about the old focus screen, verbatim:
 *
 *   > The session budget was a static label. It is a live bar here, segmented
 *   > by task, so "04:00:00 remaining" has a shape.
 *
 * Ours was the static label — a `Countdown` in the header reading
 * `sessionDuration` down, and nothing else. A number on its own cannot say
 * whether four hours is three tasks or eleven, or which one you are inside.
 * The bar can: one segment per task, each sized by its allocation, the live
 * one carrying an accent fill that advances on the second while the rest sit
 * as glass. `2 / 5 tasks · run order` reads underneath it.
 *
 * NOT A `Countdown`, and not `BudgetTrack`, on purpose:
 *   - `Countdown.prompt.md` says *"one per screen, and nothing competes with
 *     it for size"*. The task clock is that one. This readout is `--text-xl`
 *     mono in the mockup — deliberately a rung below the 88px clock — which
 *     is also why it renders its own numerals rather than borrowing a
 *     component built to be the largest thing on a page.
 *   - `BudgetTrack` is UI-31's single-fill bar: the *plan* against the window,
 *     drawn identically by `session.html` and `deadlines.html`. This is a
 *     different drawing (10px, segmented, three per-task states) that only
 *     `focus.html` has, and merging them would give one component two jobs.
 *
 * **An overrun session counts up.** The app has never clamped
 * `sessionTimeLeft` at zero — running past the window is a fact the focus log
 * records either way — so the readout follows `Countdown`'s rule for the same
 * situation: `+` and `--status-overrun`, with the word switching from
 * "remaining" to "over". The mockup clamps at zero and never has to answer
 * this. **Since 29-1P10b (idea 102) it is gold and says "in flow"**, as the
 * task clock does: running past the window while deep in it is not a fault.
 */
import { formatHms, formatSpan } from '../lib/timeSpan';
import { Icon, MetaKicker, SoftToggle } from '../ui';

export interface SessionSegment {
  id: string;
  title: string;
  /** Allocated seconds. Sizes the segment. */
  seconds: number;
  state: 'done' | 'live' | 'queued';
  /** 0–1, live segment only. */
  progress: number;
}

export interface FocusSessionStripProps {
  segments: SessionSegment[];
  /** Seconds left in the window. Negative is over. */
  secondsLeft: number;
  doneCount: number;
  total: number;
  /** Smart Sort has already run on this queue — the button holds its tint. */
  sorted: boolean;
  /** Omitted when there is nothing left to sort. */
  onSort?: () => void;
}

export function FocusSessionStrip({ segments, secondsLeft, doneCount, total, sorted, onSort }: FocusSessionStripProps) {
  const span = segments.reduce((n, s) => n + s.seconds, 0) || 1;
  const over = secondsLeft < 0;

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-6)', flexWrap: 'wrap', justifyContent: 'center',
        padding: 'var(--sp-4) var(--sp-5) var(--sp-4) var(--sp-7)',
        /* FIX-10: a rounded rectangle, not a pill (his "more of a rectangle
           with curved edges"). The track inside keeps its pill — that is a
           bar, not a surface. */
        borderRadius: 'var(--r-md)',
        backgroundImage: 'var(--glass-fill-2)',
        backdropFilter: 'var(--glass-bd-lg)',
        WebkitBackdropFilter: 'var(--glass-bd-lg)',
        boxShadow: 'var(--glass-shadow-pane)',
      }}
    >
      <div style={{ display: 'grid', gap: 2 }}>
        <MetaKicker icon="hourglass">Global work session</MetaKicker>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)' }}>
          <span
            style={{
              font: 'var(--type-numeric)', fontSize: 'var(--text-xl)',
              color: over ? 'var(--job-gold)' : 'var(--fg-1)',
              textShadow: over ? '0 0 18px oklch(0.8 0.16 82 / 0.45)' : 'none',
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em',
            }}
          >
            {over ? '+' : ''}{formatHms(Math.abs(secondsLeft))}
          </span>
          <span style={{ font: 'var(--type-kicker)', color: 'var(--fg-4)' }}>{over ? 'in flow' : 'remaining'}</span>
        </span>
      </div>

      <span aria-hidden="true" style={{ width: 1, alignSelf: 'stretch', background: 'var(--line-faint)' }} />

      <div style={{ display: 'grid', gap: 'var(--sp-3)', minWidth: 260, flex: 1 }}>
        <div
          aria-hidden="true"
          style={{
            display: 'flex', gap: 3, height: 10, padding: 2,
            borderRadius: 'var(--r-pill)',
            backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
          }}
        >
          {segments.map((s) => (
            <span
              key={s.id}
              title={`${s.title} · ${formatSpan(s.seconds)}`}
              style={{
                flex: s.seconds / span, minWidth: 6, borderRadius: 'var(--r-pill)', overflow: 'hidden',
                backgroundImage: s.state === 'queued' ? 'var(--glass-fill-2)' : 'none',
                /* A closed task is done: dimmed lime (29-1P2c1). The live one
                   is emerald, running now. */
                backgroundColor: s.state === 'done' ? 'oklch(0.84 0.17 130 / 0.42)' : undefined,
                boxShadow: s.state === 'live' ? 'var(--glow-accent-sm)' : 'none',
                transition: 'flex var(--dur-slow) var(--ease-glass)',
              }}
            >
              {s.state === 'live' && (
                <span
                  style={{
                    display: 'block', height: '100%',
                    width: `${Math.max(2, Math.min(100, s.progress * 100))}%`,
                    borderRadius: 'var(--r-pill)',
                    background: 'var(--accent)',
                    boxShadow: '0 0 12px -1px var(--accent)',
                    /* On the second and linear — the same rule `Countdown`'s
                       rail follows. A session bar must not ease. */
                    transition: 'width 1s linear',
                  }}
                />
              )}
            </span>
          ))}
        </div>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
          <span
            style={{
              font: 'var(--type-numeric)', fontSize: 'var(--text-2xs)',
              color: 'var(--fg-3)', fontVariantNumeric: 'tabular-nums',
            }}
          >
            {doneCount} / {total} tasks
          </span>
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>run order</span>
        </span>
      </div>

      {/* Soft, pressed in once the queue is in score order (29-1P2). */}
      {onSort && (
        <SoftToggle
          size="sm"
          pressed={!!sorted}
          onClick={onSort}
          icon={<Icon name="arrow-down-wide-narrow" size={15} />}
          title="Sort the queue by priority score"
        >
          Smart sort
        </SoftToggle>
      )}
    </div>
  );
}
