/**
 * Today's special day for the Dashboard's greeting (29-1P14b, idea 109). Its
 * own file so `moments.tsx` exports only components (fast refresh).
 */
import { useSyncExternalStore } from 'react';
import { useStore } from '../../store/useStore';
import { useWorkDays } from '../../lib/dashboard/todayHours';
import { specialDayOf, specialWords, type SpecialDay } from '../../lib/dayMoments';
import { readBirthday, subscribeBirthday } from '../../lib/birthday';

const todayOnly = (today: string) => [today];
/**
 * Today's special day and its words, or null on an ordinary day. On the
 * minute's clock (`useWorkDays`), so a Dashboard left open across midnight
 * dresses up for New Year without a reload.
 */
export function useSpecialDay(name: string | undefined): { special: SpecialDay; kicker: string; line: string } | null {
  const { today } = useWorkDays(todayOnly);
  const birthday = useSyncExternalStore(subscribeBirthday, readBirthday);
  const special = specialDayOf(today, birthday);
  /* Only BASE's birthday counts his ticks, so only then is the walk paid for. */
  const tasksDone = useStore((s) => (special?.kind === 'base' ? s.backlogTasks.filter((t) => !t.parent && t.status === 'completed').length : 0));
  if (!special) return null;
  return { special, ...specialWords(special, name, tasksDone) };
}
