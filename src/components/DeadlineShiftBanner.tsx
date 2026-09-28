/**
 * **What the deadline rule just did, said out loud.**
 *
 * Item 18 made the app able to move a date on its own for the first time, and
 * the settled decision is that it never does so silently: *"the move is
 * surfaced in a banner naming what moved and why, never applied silently"*.
 * This is that banner. It carries the whole cascade — every task that was
 * pushed, the prerequisite that pushed it, and every fixed task the rule could
 * not fix — and it is dismissible, because a move you have read is a move you
 * are done with.
 *
 * **A `NotificationCard`, and the third in `App.tsx`'s one fixed column.** The
 * two that were already there set the shape: a surface that persists and
 * carries a decision is not a Toast, and neither banner positions itself. It
 * opens expanded, for the reason `ReminderSyncBanner` does — the list *is* the
 * message, and a card that hid it behind a chevron would be a card announcing
 * that something moved and declining to say what.
 *
 * **Two tones, one card.** A push is amber (`review`): the app did something
 * reasonable and you may want to look at it. A conflict is rose (`overrun`): a
 * task cannot be finished on time and its date is not allowed to move, which
 * is a live problem and not a decision the app can take for you. When a
 * cascade produces both, the conflict wins the tone and the title — it is the
 * half nothing downstream will fix.
 *
 * Dates are printed through `describeDate`, the same phrasing the agent's tool
 * summaries use, so a date the app tells you about reads the same wherever it
 * tells you.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useUIStore } from '../store/useUIStore';
import { describeDate, resolveUserTimeZone } from '../lib/agent/dates';
import type { DeadlineConflict, DeadlineMove } from '../lib/deadlineMath';
import { Button, Icon, NotificationCard } from '../ui';

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);

/** One line of the list: a strong task name, then the plain sentence about it. */
function Line({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
      <span style={{ color: 'var(--fg-1)' }}>{title}</span>
      {' — '}
      {children}
    </li>
  );
}

export default function DeadlineShiftBanner() {
  const shift = useUIStore((s) => s.deadlineShift);
  const clear = useUIStore((s) => s.clearDeadlineShift);
  const timeZone = resolveUserTimeZone();

  const moves: DeadlineMove[] = shift?.moves ?? [];
  const conflicts: DeadlineConflict[] = shift?.conflicts ?? [];
  const blocked = conflicts.length > 0;

  const title = blocked
    ? `${conflicts.length} ${plural(conflicts.length, 'deadline cannot move', 'deadlines cannot move')}`
    : `${moves.length} ${plural(moves.length, 'deadline moved', 'deadlines moved')}`;

  /* The clamped summary. It says the RULE, not the first row — the rows are
     immediately underneath, and repeating one of them here would cost the
     only two lines available to explain why any of this happened. */
  const body = blocked
    ? 'A prerequisite now finishes after them, and their dates are marked fixed. Move the prerequisite, or untick "Fixed date" on the task.'
    : 'A prerequisite now finishes after them, so each one was pushed to the day after it. Nothing was ever pulled earlier.';

  return (
    <AnimatePresence>
      {shift && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="pointer-events-auto"
        >
          <NotificationCard
            tone={blocked ? 'overrun' : 'review'}
            icon={<Icon name={blocked ? 'triangle-alert' : 'calendar-clock'} size={16} />}
            title={title}
            body={body}
            defaultOpen
            /* The card condenses on arrival by default; this one flies in on
               its own spring, exactly as the two banners beside it do. */
            style={{ animation: 'none' }}
            actions={<Button size="sm" variant="ghost" onClick={clear}>Dismiss</Button>}
          >
            <ul style={{ display: 'grid', gap: 'var(--sp-3)', margin: 0, padding: 0, listStyle: 'none' }}>
              {conflicts.map((conflict) => (
                <Line key={conflict.taskId} title={conflict.title}>
                  stays on {describeDate(conflict.deadline, timeZone)}, but{' '}
                  <span style={{ color: 'var(--fg-2)' }}>{conflict.because.title}</span> does not finish
                  until {describeDate(conflict.because.deadline, timeZone)} — it would need{' '}
                  {describeDate(conflict.required, timeZone)}.
                </Line>
              ))}
              {moves.map((move) => (
                <Line key={move.taskId} title={move.title}>
                  {describeDate(move.from, timeZone)} → {describeDate(move.to, timeZone)}, after{' '}
                  <span style={{ color: 'var(--fg-2)' }}>{move.because.title}</span>.
                </Line>
              ))}
            </ul>
          </NotificationCard>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
