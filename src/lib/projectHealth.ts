/**
 * On track, or at risk (29-1P8b, idea 152): one honest word for a project
 * and one line saying why.
 *
 * Pure: the project's tasks (the whole subtree's, ignored work already left
 * out), the clock and the time zone are arguments. His rule, 2026-10-13:
 *
 *   - **Off track**: a task in it is past its deadline and not done.
 *   - **At risk**: at the pace of the last two weeks, the tasks due in the
 *     next two weeks won't all be done by their dates; or nothing has been
 *     done for a week while something is due in those two weeks.
 *   - **On track**: anything else, while something in it has a deadline.
 *   - **Quiet**: nothing in it has a deadline, and nothing was done this week.
 *
 * Anything else answers null, and the card keeps its "In progress" — a
 * project with no deadlines cannot be late, so it gets no word until it
 * goes still (his call). Only the card's "In progress" is replaced; Not
 * started, Empty and Complete are the card's business, not this file's.
 *
 * "Pace" is the last fourteen days' tasks done per day, and a deadline's
 * share of it counts today: two days away is three days of work. One task
 * is never "at risk" by pace alone — a pace of nought point something still
 * finishes one thing — only by a still week.
 */
import { parseStoredDate } from './agent/dates';
import { calendarDaysBetween, doneByDay, lastDoneAt } from './stats';
import type { Task } from '../store/useStore';

export type HealthState = 'on-track' | 'at-risk' | 'off-track' | 'quiet';

export interface ProjectHealth {
  state: HealthState;
  /** The pill's word. */
  word: string;
  /** One line of why, a sentence with its full stop. */
  why: string;
}

/** How far ahead "due soon" looks, and how far back the pace is measured. */
export const HEALTH_WINDOW_DAYS = 14;
/** A week with nothing done is a still one. */
export const STILL_DAYS = 7;

const WORD: Record<HealthState, string> = {
  'on-track': 'On track',
  'at-risk': 'At risk',
  'off-track': 'Off track',
  quiet: 'Quiet',
};

const DAY = 86_400_000;

type HealthTask = Pick<Task, 'title' | 'status' | 'deadline' | 'completedAt'>;

export function projectHealth(tasks: readonly HealthTask[], now: Date, timeZone: string): ProjectHealth | null {
  const open = tasks.filter((t) => t.status !== 'completed');
  if (open.length === 0) return null;
  const say = (state: HealthState, why: string): ProjectHealth => ({ state, word: WORD[state], why });

  const dated = open
    .map((t) => ({ t, at: parseStoredDate(t.deadline, timeZone) }))
    .filter((x): x is { t: HealthTask; at: Date } => x.at !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  /* Off track: the oldest late task names it. */
  const late = dated.filter((x) => x.at.getTime() < now.getTime());
  if (late.length > 0) {
    const { t, at } = late[0];
    const ago = calendarDaysBetween(at, now, timeZone);
    const when = ago <= 0 ? 'was due today' : ago === 1 ? 'was due yesterday' : `was due ${dayName(at, timeZone)}, ${ago} days ago`;
    const more = late.length - 1;
    return say('off-track', `“${t.title}” ${when}${more > 0 ? `, and ${more} more ${more === 1 ? 'is' : 'are'} late` : ''}.`);
  }

  const days = doneByDay(tasks, now, timeZone, HEALTH_WINDOW_DAYS);
  const doneInWindow = days.reduce((sum, d) => sum + d.count, 0);
  const stillWeek = days.slice(-STILL_DAYS).every((d) => d.count === 0);
  const last = lastDoneAt(tasks);
  const still = last === null ? null : calendarDaysBetween(new Date(last), now, timeZone);
  const stillLine = still !== null && still >= STILL_DAYS ? `Nothing done in ${still} days` : 'Nothing done this week';

  const horizon = now.getTime() + HEALTH_WINDOW_DAYS * DAY;
  const soon = dated.filter((x) => x.at.getTime() <= horizon);
  if (soon.length > 0) {
    if (stillWeek) {
      const n = soon.length;
      return say('at-risk', `${stillLine}, and ${n} ${n === 1 ? 'is' : 'are'} due by ${dayName(soon[n - 1].at, timeZone)}.`);
    }
    const pace = doneInWindow / HEALTH_WINDOW_DAYS;
    for (const x of soon) {
      const due = soon.filter((y) => y.at.getTime() <= x.at.getTime()).length;
      const capacity = pace * (calendarDaysBetween(now, x.at, timeZone) + 1);
      if (due > Math.max(1, capacity)) {
        const will = Math.floor(capacity);
        const by = `${due} due by ${dayName(x.at, timeZone)}`;
        /* "None will be done" after a task was done reads as a scold; say
           what was done instead, and let the two numbers speak. */
        return say('at-risk', will >= 1
          ? `${by}; at this pace, about ${will} will be done.`
          : `${by}, and only ${doneInWindow} done in the last two weeks.`);
      }
    }
  }

  if (dated.length > 0) {
    const pace = doneInWindow > 0 ? ` ${doneInWindow} done in the last two weeks.` : '';
    return say('on-track', `Next due ${dayName(dated[0].at, timeZone)}.${pace}`);
  }

  return stillWeek ? say('quiet', `${stillLine}.`) : null;
}

const dayFormats = new Map<string, Intl.DateTimeFormat>();

/** "Fri 16 Oct", in the zone. One formatter per zone: a grid draws one of these per card. */
function dayName(at: Date, timeZone: string): string {
  let f = dayFormats.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short' });
    dayFormats.set(timeZone, f);
  }
  return f.format(at).replace(',', '');
}
