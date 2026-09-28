/**
 * What keeps a focus session honest while nobody is looking at it (BUILD-1).
 *
 * Renders nothing. It is mounted once, beside the router, and it owns the
 * three things that used to live inside `FocusMode` and therefore stopped
 * happening the moment he navigated away:
 *
 *   1. **The sound follows the session.** Start a task and the noise fades in;
 *      pause, finish or defer it and it fades out. In `pomodoro` mode it does
 *      that on the focus/break cycle instead — beside the task's own
 *      countdown, never replacing it.
 *   2. **The queue can move under a run.** Smart Sort reorders it, a delete
 *      takes the task out of it, "New Session" empties it, and a Firestore
 *      snapshot from the tablet can replace it wholesale — none of which goes
 *      through a button on this device.
 *   3. **The focus log survives a killed tab.** A backgrounded browser can be
 *      shot without running a single React cleanup, so the open stretch is
 *      banked at every last-chance moment and re-opened behind it.
 *
 * WHY THE NOISE IS EDGE-TRIGGERED
 * -------------------------------
 * This component decides what the sound *should* be doing and acts only when
 * that decision changes — it never re-asserts it. That is deliberate, and it
 * is what keeps Settings' audition working: `BrownNoiseSection` stops the
 * sound it started, and a host that levelled the sound back up every render
 * would fight it and win, leaving a Preview button that visibly does nothing.
 * The rule it preserves is the item's own: *"Settings stops only the sound it
 * started, so auditioning never kills a real session"* — and its mirror, that
 * a real session does not overrule what you just pressed in Settings either.
 */
import { useEffect, useRef, useState } from 'react';
import { useStore, taskFocusSeconds } from '../store/useStore';
import { useFocusRun, subjectOf } from '../store/useFocusRun';
import {
  getNoisePrefs, noiseSupported, startNoise, stopNoise, subscribeNoisePrefs, type NoisePrefs,
} from '../lib/brownNoise';
import { noisePhaseAt } from '../lib/noiseSchedule';

export default function FocusRunHost() {
  const head = useStore((s) => s.tasks[0]);
  const sessionDuration = useStore((s) => s.sessionDuration);
  const hasRun = useFocusRun((s) => s.task !== null);
  const running = useFocusRun((s) => s.running);
  const runningSince = useFocusRun((s) => s.runningSince);
  const muted = useFocusRun((s) => s.muted);

  const [prefs, setPrefs] = useState<NoisePrefs>(getNoisePrefs);
  useEffect(() => subscribeNoisePrefs(setPrefs), []);

  /*
   * The queue, mirrored into the run. Only ever *follows* an existing session
   * — it must not start one, or the pill would appear over a queue he built on
   * the Select screen and never took into Focus.
   *
   * `attach` is idempotent and is also called by `FocusMode` while that screen
   * is mounted; the two cannot disagree because they pass the same three
   * arguments derived from the same store.
   */
  useEffect(() => {
    if (!hasRun) return;
    const run = useFocusRun.getState();
    if (!run.task) return;
    if (!head) {
      /* The session is over — the last task was closed, or he pressed New
         Session, which empties the queue before `/select` even paints. */
      run.clear();
      return;
    }
    run.attach(subjectOf(head), taskFocusSeconds(head), sessionDuration);
  }, [head, sessionDuration, hasRun]);

  /*
   * The sound. One decision — "should there be noise right now" — and a single
   * timer for the next moment that answer changes, rather than a poll.
   */
  const soundOnRef = useRef(false);
  useEffect(() => {
    if (!noiseSupported()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const evaluate = () => {
      const now = Date.now();
      const phase = running && runningSince !== null
        ? noisePhaseAt(prefs, runningSince, now)
        : null;
      const want = running && prefs.enabled && !muted && phase !== null && phase.on;

      if (want !== soundOnRef.current) {
        soundOnRef.current = want;
        if (want) startNoise();
        else stopNoise();
      }

      /* `until` is null in `task` mode, where the next change comes from him
         rather than from the clock. The floor keeps a zero-length cycle — a
         preference written by hand, or a clock that jumped — from spinning. */
      if (phase?.until != null) {
        timer = setTimeout(evaluate, Math.max(250, phase.until - Date.now()));
      }
    };

    evaluate();
    return () => clearTimeout(timer);
  }, [running, runningSince, muted, prefs]);

  /*
   * Bank the open stretch at every last-chance moment. `visibilitychange` is
   * the one that matters on the tablet: a hidden tab can be killed outright,
   * and `pagehide` is not guaranteed to run when it is. Both re-open the
   * stretch behind them, because the session keeps running — the clock is a
   * deadline now, so time that passes with the screen off is time worked.
   */
  useEffect(() => {
    const checkpoint = () => useFocusRun.getState().checkpoint();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') checkpoint();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', checkpoint);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', checkpoint);
    };
  }, []);

  return null;
}
