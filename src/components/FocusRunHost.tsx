/**
 * What keeps a focus session honest while nobody is looking at it (BUILD-1).
 *
 * Renders nothing. It is mounted once, beside the router, and it owns the
 * three things that used to live inside `FocusMode` and therefore stopped
 * happening the moment he navigated away:
 *
 *   1. **The sound follows the session.** Start a task and the noise fades in;
 *      pause, finish or defer it and it fades out. Since 29-1P11a that is true
 *      in `pomodoro` mode too: the break is real now (the run pauses through
 *      it), so the sound needs no cycle of its own.
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
 *
 * THE CHIME (29-1P3, idea 119) lives here too, because it is the one sound in
 * BASE a press does not make: a timer ending, on whatever screen he is on. His
 * calls (2026-10-07): it rings when the SESSION's time runs out — not each
 * task's — and, in pomodoro mode, when a break is due and when it ends.
 * Since 29-1P10b (idea 102, his call 2026-10-15) the session's end rings
 * **softly, once** (`flowChime`), and Focus's numbers turn gold and count up.
 *
 * AWAY (29-1P10b, idea 101) is noticed here too, for the reason the chime is:
 * leaving BASE is leaving every screen at once. On the tablet only (his call
 * — on the laptop another app is often the work), the tab going hidden with
 * the clock running is remembered with how long ago he last touched the
 * screen; coming back, `lib/focusMoments.ts` says whether that was an app
 * switch or a lock and whether it earns the card, and `noteAway` holds the
 * minutes for it. The clock itself never stops: it is a deadline.
 *
 * A REAL BREAK (29-1P11a, idea 104) is timed here too, for the chime's reason:
 * in pomodoro mode a focus block ending offers a break on whatever screen he
 * is on, and a break ending says so. `lib/breaks.ts` is when; `useFocusBreak`
 * is the state; `FocusBreakHost` draws it.
 */
import { useEffect, useRef, useState } from 'react';
import { useStore, taskFocusSeconds } from '../store/useStore';
import { useFocusRun, subjectOf, taskSecondsLeft } from '../store/useFocusRun';
import {
  getNoisePrefs, noiseSupported, startNoise, stopNoise, subscribeNoisePrefs, type NoisePrefs,
} from '../lib/brownNoise';
import { blockEndsAt } from '../lib/breaks';
import { useFocusBreak } from '../store/useFocusBreak';
import { cue } from '../lib/sound';
import { awayCardDue, awayKind } from '../lib/focusMoments';

/** A finger, not a mouse: the laptop never gets the away card (his call). */
const POINTER_FINE = '(hover: hover) and (pointer: fine)';

export default function FocusRunHost() {
  const head = useStore((s) => s.tasks[0]);
  const sessionDuration = useStore((s) => s.sessionDuration);
  const hasRun = useFocusRun((s) => s.task !== null);
  const running = useFocusRun((s) => s.running);
  const runningSince = useFocusRun((s) => s.runningSince);
  const muted = useFocusRun((s) => s.muted);
  const sessionZeroAt = useFocusRun((s) => s.sessionZeroAt);
  const settleUntil = useFocusRun((s) => s.settleUntil);
  const offer = useFocusBreak((s) => s.offer);
  const breakOn = useFocusBreak((s) => s.breakOn);

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
   * The sound. One decision — "should there be noise right now" — acted on
   * only when it changes (see the header). No timer: since 29-1P11a nothing
   * but the run decides it.
   */
  const soundOnRef = useRef(false);
  useEffect(() => {
    if (!noiseSupported()) return;
    const want = running && prefs.enabled && !muted;
    if (want === soundOnRef.current) return;
    soundOnRef.current = want;
    if (want) startNoise();
    else stopNoise();
  }, [running, muted, prefs.enabled]);

  /*
   * 29-1P11a, idea 104: in pomodoro mode, the focus block ending offers a
   * break, with the bowl. One timer for that moment, re-armed by every play
   * (a new `runningSince`); none while an offer waits or a break is on. A
   * block that ended behind a locked screen offers at once on the way back.
   */
  const pomodoro = prefs.mode === 'pomodoro';
  const focusMinutes = prefs.focusMinutes;
  useEffect(() => {
    if (!pomodoro || !running || runningSince === null || offer || breakOn) return;
    const wait = blockEndsAt({ focusMinutes }, runningSince) - Date.now();
    const timer = setTimeout(() => {
      cue('breakEdge');
      useFocusBreak.getState().offerBreak();
    }, Math.max(0, wait));
    return () => clearTimeout(timer);
  }, [pomodoro, focusMinutes, running, runningSince, offer, breakOn]);

  /* The break's end: the bowl again, and the card says it is over. */
  const breakEndsAt = breakOn && !breakOn.over ? breakOn.endsAt : null;
  useEffect(() => {
    if (breakEndsAt === null) return;
    const timer = setTimeout(() => {
      cue('breakEdge');
      useFocusBreak.getState().breakOver();
    }, Math.max(0, breakEndsAt - Date.now()));
    return () => clearTimeout(timer);
  }, [breakEndsAt]);
  /* Play pressed anywhere while a break is on (the Dashboard's Focus block)
     ends the break: he is back. */
  useEffect(() => {
    if (running && useFocusBreak.getState().breakOn) useFocusBreak.setState({ breakOn: null });
  }, [running]);
  /* A session over is a fresh count of breaks for the next one. */
  useEffect(() => {
    if (!hasRun) useFocusBreak.getState().resetSession();
  }, [hasRun]);

  /*
   * 29-1P10a, idea 95: the clock starts when the session's one breath ends.
   * Here rather than on Focus, so leaving the screen mid-breath still starts
   * it — the same reason the session lives in a store at all. Skip resumes
   * early, which clears `settleUntil` and drops this timer.
   */
  useEffect(() => {
    if (settleUntil === null) return;
    const timer = setTimeout(() => useFocusRun.getState().resume(), Math.max(0, settleUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [settleUntil]);

  /*
   * The session's end. One timer for the moment the session window reaches
   * zero, re-armed whenever that moment moves (a task's +15m, Set Deadlines'
   * hours) and dropped on pause. A session already over when he presses play
   * does not ring again — `rungFor` remembers the moment it rang for.
   */
  const rungFor = useRef<number | null>(null);
  useEffect(() => {
    if (!running || !sessionZeroAt) return;
    const wait = sessionZeroAt - Date.now();
    if (wait <= 0 || rungFor.current === sessionZeroAt) return;
    const timer = setTimeout(() => {
      rungFor.current = sessionZeroAt;
      cue('flowChime');
    }, wait);
    return () => clearTimeout(timer);
  }, [running, sessionZeroAt]);

  /*
   * Bank the open stretch at every last-chance moment. `visibilitychange` is
   * the one that matters on the tablet: a hidden tab can be killed outright,
   * and `pagehide` is not guaranteed to run when it is. Both re-open the
   * stretch behind them, because the session keeps running — the clock is a
   * deadline now, so time that passes with the screen off is time worked.
   */
  useEffect(() => {
    const checkpoint = () => useFocusRun.getState().checkpoint();
    /* Away: when the tab went, how long since his last touch, and what the
       task had left. Kept in this effect, so a reload forgets it, as it
       forgets the run itself. */
    let lastTouchAt = 0;
    let left: { at: number; touchedAt: number; taskLeft: number } | null = null;
    const onTouch = () => { lastTouchAt = Date.now(); };
    const onVisibility = () => {
      const run = useFocusRun.getState();
      const now = Date.now();
      if (document.visibilityState === 'hidden') {
        checkpoint();
        left = run.running && !window.matchMedia(POINTER_FINE).matches
          ? { at: now, touchedAt: lastTouchAt, taskLeft: taskSecondsLeft(run, now) }
          : null;
        return;
      }
      const went = left;
      left = null;
      if (!went || !run.running) return;
      if (awayCardDue(awayKind(went.touchedAt, went.at), now - went.at, went.taskLeft)) run.noteAway(went.at, now);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', checkpoint);
    /* Capture, so a press a control stops still counts; passive, so it costs
       the scroll nothing. `touchstart` as well as `pointerdown`: a swipe home
       from the edge may reach the page only as a touch the system cancels. */
    window.addEventListener('pointerdown', onTouch, { capture: true, passive: true });
    window.addEventListener('touchstart', onTouch, { capture: true, passive: true });
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', checkpoint);
      window.removeEventListener('pointerdown', onTouch, { capture: true });
      window.removeEventListener('touchstart', onTouch, { capture: true });
    };
  }, []);

  return null;
}
