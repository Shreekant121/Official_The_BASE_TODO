/**
 * The mini-player — BUILD-1's other half, and the only thing on screen that
 * says a focus session is still going.
 *
 * Shreekant's ask, 2026-09-15: *"a mini player… which could allow me to just
 * directly back to the focus session going on"*, answered in the nav (his Q12)
 * and extended so that the same object also silences the noise. **One new
 * object, not two** — which is why the countdown, the way back and the mute
 * are one pill rather than a player and a separate sound control.
 *
 * It appears only while a session exists, and never on `/focus` itself: the
 * thing it offers is already the screen you are on.
 *
 * WHERE IT SITS, AND WHY IT IS NOT ONE ANCHOR
 * -------------------------------------------
 * His call, asked directly: **bottom-left on the laptop**, where nothing else
 * in the app lives — every floating bar in this product is centred and every
 * capture button is bottom-right. On a narrow window the nav itself is a
 * centred floating bar, so the pill takes the **112px lane** directly above
 * it: the same offset `FocusMode`'s own toast and `TaskSelection`'s use, which
 * is what keeps three different floating objects off each other.
 *
 * `footerReserve` is the one screen that can still collide with it. Set
 * Deadlines carries a work-session bar at the foot of the window (FIX-6) whose
 * height is *measured* because it wraps — 76px on one line, 136px on two — so
 * the pill reads that measurement rather than carrying a number that would be
 * right at 1440 and wrong at 1000.
 *
 * **In flow it is gold (29-1P10b, idea 102, his call):** once either clock is
 * past zero the countdown counts up in gold, the word says "In flow" and the
 * pill glows gold rather than emerald — the same moment Focus itself shows.
 *
 * **29-1P11b — IT GROWS ON A TAP (idea 16, after the iPhone's Dynamic
 * Island).** A tap on the clock no longer goes straight to Focus: the pill
 * grows into a small panel of the run's own controls — Pause, + time, Mark
 * done — and the task up next, with Focus a tap further on (his call,
 * 2026-10-15). This reverses FIX-10's "not a second pause button" (he agreed
 * to that on 2026-09-22 and chose the panel since). The controls are Focus's
 * own: Pause is `pause(true)`, so it counts on "Session done"; + time is
 * `AddTime`, the minute ruler; Mark done is `finishHead`, the very function
 * Focus's button presses, asking his "did you do it?" first when he wrote a
 * line. The panel grows toward the middle of the screen (up from a bottom
 * corner, down from a top one) so the clock stays under his finger, is built
 * on first open, and closes on a second tap, a tap outside, Escape or Back.
 *
 * FIX-10 — IT SNAPS TO A CORNER
 * -----------------------------
 * His ask: *"allow the mini time player to be shifted"*, because wherever it
 * sits it is sometimes on top of the thing he wants. **Snapping, not
 * dragging** — a drag on a tablet fights the page's own scroll for the same
 * finger. So a third, smaller target: **Move** puts four corner targets on the
 * screen, and tapping one sends the pill there; two taps to anywhere, his
 * pick of the three offered. The corner is remembered on the device
 * (`useRememberedState`, FIX-1's rule), not synced: it is about this screen's
 * furniture, not about his account.
 *
 * `auto` is the placement above, and what a device that has never chosen
 * gets. A chosen corner holds at every width. Both bottom-right placements
 * sit in the 112px lane, because bottom-right is where every capture button in
 * the app lives and the pill would otherwise cover it.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Countdown, GelButton, Icon, MorphIcon, SoftButton, SoftIconButton, useMedia, WIDE } from '../ui';
import {
  useFocusRun, taskSecondsLeft, sessionSecondsLeft, finishHead, type FocusRunState,
} from '../store/useFocusRun';
import { useStore, taskLockReason } from '../store/useStore';
import { useUIStore } from '../store/useUIStore';
import { useOverlayDismiss } from '../lib/useOverlayDismiss';
import { useRememberedState } from '../lib/useRememberedState';
import { getNoisePrefs, subscribeNoisePrefs, type NoisePrefs } from '../lib/brownNoise';
import { cleanIntent, type FocusOutcome } from '../lib/focusIntent';
import { cue } from '../lib/sound';
import { useNow } from '../lib/useNow';
import { Z } from '../lib/zLayers';
import { AddTime, DoneQuestion } from './FocusStart';

type Corner = 'tl' | 'tr' | 'bl' | 'br';
type Placement = Corner | 'auto';

const CORNERS: { id: Corner; label: string; icon: 'arrow-up-left' | 'arrow-up-right' | 'arrow-down-left' | 'arrow-down-right' }[] = [
  { id: 'tl', label: 'Top left', icon: 'arrow-up-left' },
  { id: 'tr', label: 'Top right', icon: 'arrow-up-right' },
  { id: 'bl', label: 'Bottom left', icon: 'arrow-down-left' },
  { id: 'br', label: 'Bottom right', icon: 'arrow-down-right' },
];

/** Stored on the device; see the header. */
const PLACEMENT_KEY = 'base.focusRunPill.corner';

/**
 * How wide the pill grows: room for its three controls, and for Mark done's
 * Not yet · Partly · Yes, in one row each (296px of buttons, measured).
 */
const OPEN_WIDTH = 'min(360px, calc(100vw - 2 * var(--gutter-page-sm)))';

/**
 * Where a corner is, as a fixed box's offsets. The pill and the four targets
 * that choose it read the same numbers, so a target is where its pill lands.
 */
function cornerOffsets(corner: Corner, wide: boolean, footerReserve: number): CSSProperties {
  const edge = wide ? 'var(--sp-7)' : 'var(--gutter-page-sm)';
  /* The bottom-left keeps the old rule: clear of the floating nav on a narrow
     window, and of a screen's own measured footer (FIX-6) on any. */
  const lane = corner === 'br' || !wide ? '112px' : 'var(--sp-7)';
  /* Bottom-right also clears a capture button that is itself lifted over a
     footer — Set Deadlines puts its 52px one `--sp-5` above the bar, so the
     pill goes a further 64px up. Measured there: without it the two overlap. */
  const overFooter = corner === 'br' ? `${footerReserve}px + var(--sp-5) + 64px` : `${footerReserve}px + var(--sp-4)`;
  const vertical: CSSProperties = corner[0] === 't'
    ? { top: `calc(${wide ? 'var(--sp-7)' : 'var(--sp-5)'} + var(--safe-t))` }
    : { bottom: `max(${lane} + var(--safe-b), ${overFooter} + var(--safe-b))` };
  const horizontal: CSSProperties = corner[1] === 'l'
    ? { left: `calc(${edge} + var(--safe-l))` }
    : { right: `calc(${edge} + var(--safe-r))` };
  return { ...vertical, ...horizontal };
}

export default function FocusRunPill() {
  const location = useLocation();
  const navigate = useNavigate();
  const wide = useMedia(WIDE);
  const overlayOpen = useUIStore((s) => s.overlayOpen);
  const footerReserve = useUIStore((s) => s.footerReserve);

  /* The whole run rather than five selectors: this component draws every part
     of it, and it repaints on the second anyway while one is going. */
  const run = useFocusRun();
  const { task, running, muted } = run;

  const [placement, setPlacement] = useRememberedState<Placement>(PLACEMENT_KEY, 'auto');
  /** The four corner targets are showing. */
  const [picking, setPicking] = useState(false);
  /* Escape and the back gesture put the targets away. `hideNav: false`, or
     opening the picker would hide the very pill it is moving. */
  useOverlayDismiss(picking, () => setPicking(false), { hideNav: false });

  /** 29-1P11b: grown into the panel. */
  const [open, setOpen] = useState(false);
  /** The panel is built on the first tap and kept, so it can shrink back. */
  const [built, setBuilt] = useState(false);
  /** + time's ruler is open: it is a portal, so a tap in it is "outside". */
  const [rulerOpen, setRulerOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useOverlayDismiss(open, () => setOpen(false), { hideNav: false });
  /* A tap anywhere else shrinks it back, as the island does. */
  useEffect(() => {
    if (!open || rulerOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, rulerOpen]);

  const [prefs, setPrefs] = useState<NoisePrefs>(getNoisePrefs);
  useEffect(() => subscribeNoisePrefs(setPrefs), []);

  /* One repaint a second, and only while something is moving. The value it
     returns is not the clock — `taskSecondsLeft` reads that off `Date.now()`
     — it is what makes the component ask again. */
  const now = useNow(running);
  const left = taskSecondsLeft(run, now);
  /* Idea 102: either clock past zero. A task with no time given has no
     clock to be past, so its own zero is not flow. */
  const flow = task !== null && ((left < 0 && run.allocated > 0) || sessionSecondsLeft(run, now) < 0);

  /*
   * Hidden rather than unmounted, so the pill leaves the way the nav does
   * instead of vanishing mid-spring. `/s/` and `/login` are the two routes
   * that are not the app — the public share view and the sign-in screen —
   * and `/focus` is where this control would be pointing at itself.
   */
  const hidden =
    !task
    || location.pathname === '/focus'
    || location.pathname === '/login'
    || location.pathname.startsWith('/s/')
    || overlayOpen;

  /* Nothing to move or grow once it has gone. */
  if (hidden && picking) setPicking(false);
  if (hidden && open) setOpen(false);

  /* `auto` on a narrow window keeps its centred lane; everywhere else it is a
     corner, and `auto` on a wide one is the bottom-left it always was. */
  const corner: Corner | null = placement !== 'auto' ? placement : wide ? 'bl' : null;
  const fromTop = corner !== null && corner[0] === 't';

  const title = task?.title ?? '';
  /* No "break" reading since 29-1P11a: a real break pauses the run, so a
     running pill is never in one. */
  const soundLabel = muted ? 'Sound off. Tap to bring the noise back' : 'Mute the noise';

  const toggleOpen = () => {
    if (!open) { setBuilt(true); setPicking(false); }
    setOpen(!open);
  };

  return (
    <>
    <div
      style={{
        position: 'fixed',
        zIndex: Z.nav,
        pointerEvents: 'none',
        /* `max`, not a sum: the reserve is where the screen's own bottom
           furniture starts, and on most screens there is none — adding it
           blindly would push the pill up by nothing on twelve screens and by
           the wrong amount on the one that has it. */
        ...(corner
          ? { ...cornerOffsets(corner, wide, footerReserve), maxWidth: 'calc(100vw - 2 * var(--gutter-page-sm))' }
          : {
              bottom: `max(112px + var(--safe-b), ${footerReserve}px + var(--sp-4) + var(--safe-b))`,
              left: 0,
              right: 0,
              display: 'grid',
              placeItems: 'center',
              padding: '0 var(--gutter-page-sm)',
            }),
      }}
    >
      <motion.div
        initial={false}
        /* It leaves toward the edge it sits on. */
        animate={hidden ? { y: fromTop ? -110 : 110, opacity: 0, scale: 0.92 } : { y: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        style={{ pointerEvents: hidden ? 'none' : 'auto', maxWidth: '100%' }}
      >
        <div
          ref={box}
          style={{
            display: 'flex',
            /* The panel grows toward the middle of the screen, so the clock
               stays where his finger is. */
            flexDirection: fromTop ? 'column' : 'column-reverse',
            maxWidth: '100%',
            /* Open, it is as wide as its three controls need; `min-width`
               rather than `width` so it grows smoothly out of whatever width
               the title gave the pill. */
            minWidth: open ? OPEN_WIDTH : 0,
            borderRadius: open ? 'var(--r-lg)' : 'var(--r-pill)',
            transition: 'min-width var(--dur-base) var(--ease-glass), border-radius var(--dur-base) var(--ease-glass)',
            backgroundImage: 'var(--glass-fill-2)',
            backdropFilter: 'var(--glass-bd-lg)',
            WebkitBackdropFilter: 'var(--glass-bd-lg)',
            /* `elevation.css` — a live object emits, a resting one does not.
               Paused is exactly "resting": the session is still there, and
               nothing about it is happening. */
            boxShadow: running
              ? `var(--glass-rim-2), var(--glass-cast-2), ${flow ? 'var(--job-gold-glow-sm)' : 'var(--glow-accent-sm)'}`
              : 'var(--glass-rim-2), var(--glass-cast-2)',
          }}
        >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-4)',
            maxWidth: '100%',
            padding: 'var(--sp-3) var(--sp-4) var(--sp-3) var(--sp-5)',
          }}
        >
          <button
            type="button"
            onClick={toggleOpen}
            aria-expanded={open}
            aria-label={open ? 'Shrink the timer back' : `Timer controls for ${title}`}
            title={open ? 'Shrink the timer back' : 'Pause, + time and Mark done'}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-5)',
              minWidth: 0, maxWidth: wide ? 260 : 220,
              border: 0, padding: 0, background: 'transparent',
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            <Countdown seconds={left} format="clock" size="sm" running={running} over="flow" />
            <span style={{ display: 'grid', gap: 1, minWidth: 0 }}>
              <span
                style={{
                  font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
                  textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'],
                  color: !running ? 'var(--fg-4)' : flow ? 'var(--job-gold)' : 'var(--accent)',
                }}
              >
                {!running ? 'Paused' : flow ? 'In flow' : 'Focus'}
              </span>
              <span
                style={{
                  font: 'var(--type-label)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {title}
              </span>
            </span>
          </button>

          {/* Only where there is something to silence. With the master switch
              off in Settings, a mute button would be a control over nothing. */}
          {prefs.enabled && (
            <button
              type="button"
              onClick={run.toggleMuted}
              aria-pressed={muted}
              aria-label={soundLabel}
              title={soundLabel}
              style={{
                flex: '0 0 auto',
                display: 'grid', placeItems: 'center',
                width: 38, height: 38, border: 0, cursor: 'pointer',
                borderRadius: 'var(--r-pill)',
                backgroundImage: muted ? 'var(--glass-well)' : 'var(--glass-fill-3)',
                boxShadow: muted ? 'var(--glass-well-shadow)' : 'var(--glass-rim-2)',
                color: muted ? 'var(--fg-4)' : 'var(--fg-1)',
                transition: 'var(--t-hover)',
                /* Open, the panel's controls sit beside it; it keeps its place. */
                marginLeft: open ? 'auto' : undefined,
              }}
            >
              <Icon name={muted ? 'volume-x' : 'volume-2'} size={17} />
            </button>
          )}

          {/* The third target, and the quietest: it moves the pill, it does
              nothing to the session. */}
          <button
            type="button"
            onClick={() => { setOpen(false); setPicking((was) => !was); }}
            aria-expanded={picking}
            aria-label="Move the timer to another corner"
            title="Move the timer to another corner"
            style={{
              flex: '0 0 auto',
              display: 'grid', placeItems: 'center',
              width: 32, height: 32, border: 0, cursor: 'pointer',
              borderRadius: 'var(--r-pill)',
              backgroundImage: picking ? 'var(--glass-fill-3)' : 'none',
              backgroundColor: 'transparent',
              boxShadow: picking ? 'var(--glass-rim-2)' : 'none',
              color: picking ? 'var(--fg-1)' : 'var(--fg-4)',
              transition: 'var(--t-hover)',
              marginLeft: open && !prefs.enabled ? 'auto' : undefined,
            }}
          >
            <Icon name="move" size={15} />
          </button>
        </div>

        {built && task && (
          <RunPanel
            open={open}
            fromTop={fromTop}
            run={run}
            left={left}
            now={now}
            onRuler={setRulerOpen}
            onOpenFocus={() => navigate('/focus')}
          />
        )}
        </div>
      </motion.div>
    </div>

    {/* The four places it can go. A tap anywhere else puts them away. */}
    {picking && !hidden && (
      <div style={{ position: 'fixed', inset: 0, zIndex: Z.nav }}>
        <button
          type="button"
          aria-label="Keep the timer where it is"
          tabIndex={-1}
          onClick={() => setPicking(false)}
          style={{ position: 'absolute', inset: 0, border: 0, padding: 0, background: 'oklch(0.04 0 0 / 0.32)', cursor: 'default' }}
        />
        {/* A lighter wash than `Dialog`'s 0.62: this is a choice about the
            page, so the page should still be legible under it. */}
        {CORNERS.map(({ id, label, icon }) => {
          const here = id === corner;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={here}
              onClick={() => { setPlacement(id); setPicking(false); }}
              style={{
                position: 'absolute',
                ...cornerOffsets(id, wide, footerReserve),
                display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)',
                height: 48, padding: '0 var(--sp-6)', border: 0, cursor: 'pointer',
                borderRadius: 'var(--r-pill)',
                backgroundImage: here ? 'var(--glass-tint-lime)' : 'var(--glass-fill-3)',
                backdropFilter: 'var(--glass-bd-lg)',
                WebkitBackdropFilter: 'var(--glass-bd-lg)',
                boxShadow: here ? 'var(--glass-rim-2), var(--job-lime-shine)' : 'var(--glass-rim-2), var(--glass-cast-2)',
                color: here ? 'var(--fg-1)' : 'var(--fg-2)',
                font: 'var(--type-label)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap',
                animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
              }}
            >
              <Icon name={icon} size={16} />
              {here ? `${label} · here now` : label}
            </button>
          );
        })}
      </div>
    )}
    </>
  );
}

/**
 * What the pill grows into (29-1P11b): Focus's own three controls for the
 * task on the clock, then what comes after it and the way to Focus.
 *
 * Its own component so the pill that is never opened never reads the backlog
 * (the lock) or the queue's second task. It opens by `grid-template-rows`
 * 0fr → 1fr, one CSS transition on the tap and nothing at rest, and shut it
 * is `inert`: out of the tab order and the accessibility tree, so Focus's
 * "Pause" is still the only one a screen reader or a test finds.
 */
function RunPanel({
  open, fromTop, run, left, now, onRuler, onOpenFocus,
}: {
  open: boolean;
  fromTop: boolean;
  run: FocusRunState;
  left: number;
  now: number;
  onRuler: (open: boolean) => void;
  onOpenFocus: () => void;
}) {
  const next = useStore((s) => s.tasks[1] ?? null);
  /* Item 19, as on Focus: a task waiting on another cannot be marked done. */
  const lockReason = useStore((s) => (s.tasks[0] ? taskLockReason(s.backlogTasks, s.tasks[0]) : undefined));
  /** Mark done is asking "did you do it?" about this task's line. */
  const [askingFor, setAskingFor] = useState<string | null>(null);
  const asking = askingFor !== null && askingFor === run.task?.id && cleanIntent(run.intent);

  /* `start`, not `resume`, as Focus's own button: a session that has never
     run breathes first. Pause is HIS pause (29-1P11a), so it counts. */
  const toggleRunning = () => {
    if (run.running) {
      run.pause(true);
      return;
    }
    cue('start');
    run.start();
  };

  const finish = (outcome?: FocusOutcome) => {
    const closed = finishHead(outcome);
    if (closed) cue(closed.last ? 'cleared' : 'done');
  };
  const markDone = () => {
    const current = useStore.getState().tasks[0];
    if (!current) return;
    if (cleanIntent(useFocusRun.getState().intent)) {
      setAskingFor(current.id);
      return;
    }
    finish();
  };
  const answer = (said: FocusOutcome | 'notYet') => {
    setAskingFor(null);
    if (said !== 'notYet') finish(said);
  };

  const playLabel = run.running ? 'Pause' : run.begun ? 'Resume' : 'Start';

  return (
    <div
      inert={!open}
      style={{
        display: 'grid',
        /* As wide as it opened: his "did you do it?" wraps rather than
           widening the panel past its three controls. */
        maxWidth: OPEN_WIDTH,
        gridTemplateRows: open ? '1fr' : '0fr',
        opacity: open ? 1 : 0,
        transition: 'grid-template-rows var(--dur-base) var(--ease-glass), opacity var(--dur-base) var(--ease-glass)',
      }}
    >
      <div style={{ minHeight: 0, overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: fromTop ? 'column-reverse' : 'column',
            gap: 'var(--sp-5)',
            padding: 'var(--sp-5) var(--sp-5) var(--sp-4)',
            margin: '0 var(--sp-3)',
            /* One faint line between the panel and the pill it grew out of. */
            [fromTop ? 'borderTop' : 'borderBottom']: '1px solid var(--line-faint)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minWidth: 0 }}>
            <span style={{ display: 'grid', gap: 1, minWidth: 0, flex: 1 }}>
              <span
                style={{
                  font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
                  textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'],
                  color: 'var(--fg-4)',
                }}
              >
                {next ? 'Up next' : 'Last task'}
              </span>
              <span
                style={{
                  font: 'var(--type-label)', fontSize: 'var(--text-sm)',
                  color: next ? 'var(--fg-2)' : 'var(--fg-3)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {next ? next.title : 'Mark done finishes the session'}
              </span>
            </span>
            <SoftButton size="sm" onClick={onOpenFocus} icon={<Icon name="arrow-up-right" size={14} />}>
              Focus
            </SoftButton>
          </div>

          {asking ? (
            <DoneQuestion intent={run.intent} onAnswer={answer} />
          ) : (
            <div className="flex flex-wrap items-center justify-center" style={{ gap: 'var(--sp-3)' }}>
              <SoftIconButton label={playLabel} onClick={toggleRunning}>
                <MorphIcon kind="play-pause" on={run.running} size={18} />
              </SoftIconButton>
              <AddTime timeLeft={left} running={run.running} now={now} onAdd={run.addTaskSeconds} onOpenChange={onRuler} />
              {/* Done is lime's, as on Focus. */}
              <GelButton
                colour="lime"
                tile={false}
                size="md"
                onClick={markDone}
                disabled={lockReason !== undefined}
                title={lockReason}
                icon={<Icon name={lockReason ? 'lock' : 'check'} size={17} />}
                style={{ padding: '0 var(--sp-6)' }}
              >
                Mark done
              </GelButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
