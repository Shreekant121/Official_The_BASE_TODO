/**
 * "Start it tomorrow" — a task row swiped LEFT (idea 17, 29-1P6b, his call
 * 2026-10-12): its start date becomes the beginning of tomorrow, in his time
 * zone, and it stays in its list. One store call, so it is one undo; and since
 * nothing on a row shows a start date, the press names itself and the undo
 * toast says what happened ("Starts tomorrow: …").
 */
import { useStore } from '../store/useStore';
import { sayThisPress } from '../store/useUndoStore';
import { resolveUserTimeZone, zonedParts } from './agent/dates';
import { cue } from './sound';

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Tomorrow at 00:00 in `timeZone`, as the app stores a date (`YYYY-MM-DDTHH:mm`). Pure. */
export function tomorrowStart(now: Date, timeZone: string): string {
  const p = zonedParts(now, timeZone);
  /* Calendar arithmetic on a civil date: UTC only because it never shifts. */
  const next = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return `${pad(next.getUTCFullYear(), 4)}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}T00:00`;
}

/** Sets a backlog task's start date to tomorrow, through the one task path. */
export function startTaskTomorrow(taskId: string, title: string): void {
  useStore.getState().updateBacklogTask(taskId, { startDate: tomorrowStart(new Date(), resolveUserTimeZone()) });
  sayThisPress(`Starts tomorrow: “${title}”`);
  cue('drop');
}
