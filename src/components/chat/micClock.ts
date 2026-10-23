/**
 * The mic timer's clock (29-1P15d, idea 78): how long the microphone has been
 * open, and how long "got it" stays lime. Drawn by `MicTimer.tsx`.
 */
import { useEffect, useState } from 'react';
import { devStillPresence } from '../../lib/devStillPresence';

/** How long the lime "got it" stays before the pill folds back. */
export const MIC_DONE_MS = 900;

/**
 * Whole seconds since `since`, ticking once a second while `on`.
 *
 * Under the screenshot harness it reads the clock once and never ticks
 * (`devStillPresence`, set on every shot), for `useLongJob`'s reason: the
 * harness's clock flows between its jumps, so a ticking count would land on a
 * different second each run.
 */
export function useSecondsSince(since: number | null, on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    if (import.meta.env.DEV && devStillPresence()) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [on]);
  /* `now` is stale from the last time it ticked until the first tick of a new
     run, and stale means earlier than `since`: that reads as nought. */
  return since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000));
}

/** "1 second", "12 seconds": what a screen reader says for the timer. */
export function secondsWords(seconds: number): string {
  return seconds === 1 ? '1 second' : `${seconds} seconds`;
}
