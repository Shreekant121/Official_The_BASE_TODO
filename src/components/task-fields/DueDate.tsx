/**
 * A task's due date as every row draws it since 29-1P7a: the tiny calendar
 * page (idea 165) with the plain words beside it — "in 5 days", "tomorrow",
 * "5h left", "Overdue". The page's strip warms sky to coral as the day nears
 * (idea 66) and is coral on the day; the words stay the row's quiet grey until
 * the date is under a day away or past, when they go coral, as they did.
 *
 * One reader for all of them (`lib/dueDate.ts`), so the board card, the list
 * view, the task sheet, Set Deadlines and the peek cannot say the same date
 * three different ways again.
 */
import { useMemo, type CSSProperties } from 'react';
import { DatePage, type DatePageSize } from '../../ui';
import { fullDueDate, readDue } from '../../lib/dueDate';
import { resolveUserTimeZone } from '../../lib/agent/dates';

export interface DueDateProps {
  /** `Task.deadline`, as stored. Nothing renders without one. */
  deadline: string | undefined;
  size?: DatePageSize;
  /** The words' face: a row's mono fact, or Set Deadlines' kicker. */
  face?: 'fact' | 'kicker';
  /** Overrides the quiet ink of the words (a finished row's `--fg-4`). */
  tone?: string;
  style?: CSSProperties;
}

export function DueDate({ deadline, size = 'sm', face = 'fact', tone, style }: DueDateProps) {
  const timeZone = useMemo(() => resolveUserTimeZone(), []);
  const due = readDue(deadline, new Date(), timeZone);
  if (!due) return null;
  const full = fullDueDate(due.at, timeZone);

  return (
    <span
      title={full}
      data-due-date={due.dayKey}
      style={{ display: 'inline-flex', alignItems: 'center', gap: size === 'sm' ? 6 : 8, minWidth: 0, ...style }}
    >
      <DatePage month={due.month} day={due.day} dayKey={due.dayKey} warmth={due.warmth} size={size} />
      <span
        style={{
          ...(face === 'kicker'
            ? { font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)' }
            : { font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', fontVariantNumeric: 'tabular-nums' }),
          color: due.urgent ? 'var(--job-coral-tag-fg)' : tone ?? (face === 'kicker' ? 'var(--fg-4)' : 'var(--fg-3)'),
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        <span className="sr-only">Due {full}, </span>
        {due.words}
      </span>
    </span>
  );
}
