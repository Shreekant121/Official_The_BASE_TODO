/**
 * Confetti for a perfect day (29-1P14a, ideas 2 and 111), mounted once in
 * `App.tsx` beside `TickCheerHost`. A finished project or milestone is a
 * press and is watched in `lib/moments.ts`; a perfect day is not — the hours
 * are usually met while Focus's clock runs — so it is watched here, on the
 * minute `useWorkDays` already re-counts on.
 *
 * **The moment, not the state.** It bursts when today turns perfect while
 * BASE is open on this device and this device did it: a focus run going here,
 * or a press a moment ago (time logged by hand, today's hours lowered). Opening
 * BASE on a day that is already perfect, or the other device's work arriving
 * from the cloud, shows the gold edge and the stamp on the Hours block and
 * nothing more. Once a day.
 */
import { useEffect, useRef } from 'react';
import { useWorkDays } from '../lib/dashboard/todayHours';
import { workedSeconds } from '../lib/dashboard/hours';
import { isPerfectDay } from '../lib/stats';
import { burstConfetti } from '../lib/confetti';
import { pressPoint } from '../lib/moments';
import { useFocusRun } from '../store/useFocusRun';

const todayOnly = (today: string) => [today];

/** Days already celebrated in this page's life. */
const celebrated = new Set<string>();

export default function MomentsHost() {
  const { today, days: [day], available: [available] } = useWorkDays(todayOnly);
  const perfect = isPerfectDay(workedSeconds(day), available);
  const seen = useRef<{ day: string; perfect: boolean } | null>(null);

  useEffect(() => {
    const was = seen.current;
    seen.current = { day: today, perfect };
    if (!perfect || !was || was.day !== today || was.perfect || celebrated.has(today)) return;
    const press = pressPoint();
    const run = useFocusRun.getState();
    if (!press && !(run.task && run.running)) return;
    celebrated.add(today);
    burstConfetti(press);
  }, [today, perfect]);

  return null;
}
