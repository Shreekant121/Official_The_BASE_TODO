/**
 * **Red Alert** — this task is inside its danger zone (item 16).
 *
 * `W > 0.5`, which is the sigmoid's midpoint and *"the precise moment
 * multiplication starts outweighing addition"* — not a cutoff chosen to look
 * right. It goes wherever a score already renders, so a task that is shouting
 * shouts on the board, in Smart Start, on Set Deadlines and on its own panel
 * rather than only where you happened to look.
 *
 * **It is `StatusPill status="overrun"` and nothing custom.** That state is
 * rose plus a rippling dot, and `StatusPill.prompt.md`'s rule is that the
 * seven states are semantic: *"Do not reach for a hue because it looks good
 * next to something; reach for the state."* A task that cannot be started in
 * time and is compounding is the same kind of fact as a timer past its
 * allocation, which is what `overrun` already means here. It is also the only
 * live-rippling state besides `running`, and the ripple is the half that makes
 * this readable at a glance in a column of rows.
 *
 * **Why it does not simply recolour the score chip.** `ScoreDial.prompt.md`
 * gives that component two states and one hue — *"Two states, no score-band
 * rainbow"* — and the chip's alert state is amber, so the chip warms and this
 * names what warmed it. A number going from grey to amber says *something*
 * changed; only a word says which thing.
 *
 * The `title` is the sentence rather than the number: `W` is meaningless to
 * read and "the latest start is inside the danger zone" is the actual claim.
 */
import { StatusPill } from '../../ui';

export interface RedAlertBadgeProps {
  /** `ScoreBreakdown.redAlert`. Nothing renders when it is false. */
  redAlert: boolean;
  /**
   * `sm` in a row, `md` where the score is the subject. The pill's own two
   * sizes — this component adds none of its own.
   */
  size?: 'sm' | 'md';
  /** Drop the word and keep the rippling dot. For rows with no width to spend. */
  compact?: boolean;
  style?: React.CSSProperties;
}

export function RedAlertBadge({ redAlert, size = 'sm', compact = false, style }: RedAlertBadgeProps) {
  if (!redAlert) return null;

  return (
    <StatusPill
      status="overrun"
      size={size}
      title="Red alert — the last moment you can start this and still finish on time is inside the danger zone."
      style={{ flex: '0 0 auto', ...(compact ? { padding: '0 var(--sp-3)' } : null), ...style }}
    >
      {compact ? '' : 'Red alert'}
    </StatusPill>
  );
}
