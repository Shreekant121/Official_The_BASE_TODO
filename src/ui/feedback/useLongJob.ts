/**
 * How long Atlas has been on the job in front of you, for the long-job light
 * (29-1P15d, idea 77). Drawn by `DriftGlass.tsx` and `LongJobSeconds`.
 */
import { useEffect, useState } from 'react';
import { devStillPresence } from '../../lib/devStillPresence';

/** When a turn counts as a longer job. */
export const LONG_JOB_MS = 5000;

export interface LongJob {
  /** It has run past `LONG_JOB_MS`. */
  long: boolean;
  /** Whole seconds since it started. */
  seconds: number;
}

/**
 * How long the work in front of you has been running, ticking once a second.
 *
 * `since` is when it began (`Date.now()`); without one it is when this mounted.
 * The tick only exists while the component that asks for it does, and the
 * working pills exist only while Atlas works — so nothing ticks at rest.
 *
 * Under the screenshot harness it reads the clock once and never ticks
 * (`devStillPresence`, the orb's switch, set on every shot): the harness's
 * fake clock flows at wall speed between its jumps, so a ticking count would
 * land on a different second each run.
 */
export function useLongJob(since?: number): LongJob {
  const [start] = useState(() => since ?? Date.now());
  const from = since ?? start;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (import.meta.env.DEV && devStillPresence()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const ms = Math.max(0, now - from);
  return { long: ms >= LONG_JOB_MS, seconds: Math.floor(ms / 1000) };
}
