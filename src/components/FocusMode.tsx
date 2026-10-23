/**
 * Focus Mode — RECONCILED against `design-system/screens/focus.html` (UI-32).
 *
 * UI-11 built this screen from the tokens alone; the mockup could not be
 * pulled for twelve consecutive sessions and UI-21 finally mirrored it. The
 * source opens with a comment naming its own subject and then listing the
 * four things the old screen got wrong. All four were ours, and all four are
 * fixed here.
 *
 *   > Everything is decided. This screen holds exactly one task in front of
 *   > you and counts. The product's whole question collapses to two numerals:
 *   > how long on THIS, how long on the SESSION.
 *
 * **1. The panels dock, they do not cover.** *"Details and Subtasks opened
 * sheets that blurred and covered the task they described — you lost the
 * thing you were working on to read about it."* Ours were exactly that: a
 * full-height drawer off the right edge over a blurred scrim. They are
 * `FocusDockPanel`s now — the stage stays put, the panel grows out of the
 * pill that opened it, and on a window too narrow to dock it stacks
 * underneath instead. That file carries the argument; `FocusSubtasksPanel`
 * and `FocusDetailsPanel` are its two bodies.
 *
 * **2. Defer advances, and the toast only confirms.** Already true here, and
 * unchanged. What moved is where the control sits — see 4.
 *
 * **3. The session budget is a live bar.** *"It is a live bar here, segmented
 * by task, so '04:00:00 remaining' has a shape."* Ours was the static label
 * the mockup complains about: a `Countdown` in the header and nothing else.
 * `FocusSessionStrip` replaces it, and Smart Sort moves into it because
 * re-ordering the queue is an operation on that bar.
 *
 * **4. One frost verb, one glass verb, one ghost escape.** *"Three
 * same-weight buttons competed… and Defer sits a step below because it is a
 * decision, not a control."* Ours had four weights — Resume was a `solid`
 * accent button, and Defer was a full-size amber `tint` sitting in the row of
 * things you can OPEN. Resume/Pause is plain glass at every state now, and
 * Defer is a small tint a step under the controls with the next task named
 * beneath it. +5m / +15m moved too: they adjust the clock, so they live on
 * the clock's own line rather than beside Done.
 *
 * **THE RING IS GONE.** UI-24 ported `Countdown`'s `total` track and left this
 * note behind: *"`screens/focus.html:785` is the proof it is the focus clock's
 * real shape — `<Countdown seconds total running size="lg" />`, no ring around
 * it. FocusMode still wraps this in a `ProgressRing` and is not rewired here;
 * that screen is UI-32's."* This is UI-32. The 400px ring is replaced by the
 * component's own 4px rail, which says the same thing at a tenth of the size
 * and stops a 780px pane being mostly empty circle.
 *
 * **THE CLOCK IS WHITE.** It was emerald while running. `Countdown`'s real
 * file emits `--text-glow-white` on a `--fg-1` numeral — the glow is the
 * numeral's own colour — and this screen carries "live" in three other places
 * already: the status pill, the stage's glow (Focus's teal since 29-1P2c3), and the strip's
 * running segment. A fourth would be the accent ceasing to mean anything.
 * An overrun still forces rose, and the pill now says **Overrunning** rather
 * than continuing to say "Running", which is the state `StatusPill` has a
 * token for and the screen never used.
 *
 * **`--focal`, not the plain grid.** `<body class="ag-page ag-page--focal">`
 * in the mockup, and `backdrop.css` defines that variant as *"one pool of
 * light behind a single object"*. This screen is one object.
 *
 * BUILD-1 — THE SESSION IS NO LONGER THIS SCREEN'S TO OWN
 * -------------------------------------------------------
 * UI-32 could say that every store call, hook and effect was where it had
 * always been. That is no longer true of one group of them, and the change is
 * the whole of BUILD-1: **the clock, the run state and the focus time-log
 * moved into `store/useFocusRun.ts`**, because Shreekant asked for a session
 * that keeps counting — and keeps playing its noise — while he looks at a
 * project. `isRunning`, `timeLeft`, `sessionTimeLeft`, `segmentRef`,
 * `startSegment`/`endSegment`, the bank-on-task-change effect and the
 * `visibilitychange`/`pagehide` checkpoints were all state and effects in this
 * file, which is to say they all ended at the moment he navigated. This screen
 * now *drives* a session it does not contain: it seeds the run from the queue,
 * presses play and pause, and reads both numerals back.
 *
 * Everything else is where UI-32 left it, comments included: the `details`
 * memo that resolves the live backlog record behind a queue snapshot (and a
 * subtask proxy's root task with it), `useWakeLock(isRunning)`,
 * `updateBacklogTask` for Done, `addAvoidedCount` for Defer, the shared
 * scoring pass for Smart Sort, and `deleteBacklogTask` doing its own cleanup
 * on delete.
 *
 * FIVE THINGS THE MOCKUP HAS THAT WE DELIBERATELY DO NOT
 * -----------------------------------------------------
 * - **"End session", with its rose confirm strip.** The prototype's ghost X
 *   ends the whole session; ours skips one task, which is a real queue
 *   operation with a store behind it and the only way past a task you cannot
 *   start. Leaving the session is what the Back control and the nav are for,
 *   and neither needs confirming because nothing is lost — the focus log has
 *   already banked the time. The ghost slot is the same; the verb is ours.
 * - **A wall-clock "ended 12:47" stamp** on the end pane. Nothing stores when
 *   a session began, and a stamp read off `new Date()` at render time would
 *   be a different number every time the pane repainted.
 * - **`ScoreDial` inside the details panel.** The stage already shows it, two
 *   inches away, and the mockup draws both because its panel is a specimen.
 * - **The "Runs after X" lock**, which needs the dependency model the
 *   functional queue still owns.
 * - **`Toast` for every action.** The source announces Done, Defer, Smart Sort
 *   and Capture. Ours keeps the one that reports something you cannot see —
 *   Defer, whose task went to the back of a queue you are not looking at.
 *   `Toast.prompt.md`: *"it disappears, so it can only ever confirm"*, and
 *   confirming a thing that visibly just happened is noise.
 *
 * ON THE TIMER. It was `--type-timer`, 88px at weight 300, on the argument
 * that a bold countdown reads as a threat. **Shreekant overruled it on
 * 2026-09-30**: the clock is bold now and as big as the card allows — see
 * `clockSize` below, which replaced the fixed 36 / 64 / 88 steps.
 *
 * V3 (V3-4, step 8) — FOCUS IS ON V3. Design: `design-system/Focus.dc.html`.
 * The whole screen sits in one `<V3Scope>` (`FocusMode`, the default export,
 * renders `FocusScreen` inside it), so its glass, type, colour, icons and
 * motion are V3, and so is everything it opens — Capture, the task sheet, the toast. The clock takes
 * V3's numeral face (Inter) from the tokens; nothing here sets it.
 *
 * **His two calls, 2026-09-24, both for keeping what is here:**
 *   - **No ring.** The design wraps the clock in a 360px ring around a round
 *     glass face. The numerals and `Countdown`'s thin rail stay, exactly as
 *     UI-32 left them ("THE RING IS GONE", above). (The rail went too in
 *     29-1P11c, his "just the numbers".)
 *   - **Today's buttons, in today's places.** The design's row is Defer ·
 *     round Play/Pause · Mark done, with no Skip and no +5m / +15m. The four
 *     controls stay where they are and only change material: Mark done is gel
 *     (V3's one primary, as on Home and the board), and so is "New session"
 *     on the end pane, which is that pane's primary.
 * What else V3 moved, on this screen only: the BASE mark heads the rail
 * (`RailMark`, as Home and the board); Back is a round glass button; the
 * score's "Priority" reads in sentence case through `--kicker-transform`
 * (the header's "FOCUS" keeps its capitals: it is the system voice, which
 * v4's readme keeps uppercase); the stage condenses on `useMotion()`'s curve. The
 * page stays `--focal` — V3 redraws that as one centred emerald pool, which
 * is what the design puts behind this stage.
 * **Not built, because V3 changes no features:** the design's inline capture
 * bar (the + still opens Capture), its Subtasks / Details / Queue tabs (the
 * landscape column keeps both panes open, his FIX-10 call), the Space / D /
 * → shortcuts line, and a toast for Done.
 *
 * OPT-7 (2026-10-06) — FOCUS, CLEAN. His words: *"remove the status that
 * comes on top of the clock the Paused and running and stuff… also remove the
 * priority score and the text beside it that says To Read… also on the bottom
 * remove the Next: task"*. So the run-state pill (Running / Paused /
 * Overrunning), the `ScoreDial`, the list name and the "Next:" line are gone.
 * Nothing else stopped saying them: the stage still glows while running
 * (teal, Focus's colour, since 29-1P2c3) and coral past the allocation, the clock still turns rose with its
 * own "over the time you gave this task", the button still reads Pause or
 * Resume, and the run itself is `useFocusRun`'s, which the mini timer and the
 * Dashboard read elsewhere. The marks that ask something of him (red alert,
 * avoided, emergency, needs time, blocked) stay. The corner toggles went into
 * a drawer and gained a fifth, the header — see `ViewToggle`.
 *
 * 29-1P10b (2026-10-15) — WHILE YOU WORK. **Past zero is "in flow", not
 * "over" (idea 102)**: the clock, the stage's light, the session bar and the
 * pill turn gold and count up, and Wrap up beside the clock opens Mark done
 * — on both clocks, his call; the session's end rings once, softly
 * (`FocusRunHost`). **Halfway through a task of 20 minutes or more (idea
 * 103)** a note asks "Still on it?" for ten seconds, silently; Switch pauses
 * the clock and opens today's queue. The away card (idea 101) is on every
 * screen, so it is `FocusAwayHost`'s, not this file's. All three are in
 * `FocusMoments.tsx`, their rules in `lib/focusMoments.ts`.
 *
 * 29-1P10c (2026-10-15) — STANDBY (idea 100). On the tablet held sideways
 * with the clock running, a minute after his last touch, a black layer with
 * the task's clock and name covers this screen; dim red at night. A tap puts
 * this screen back. It is a layer, so the run, the noise and the wake lock
 * under it are untouched — see `FocusStandBy.tsx`, rules in `lib/standBy.ts`.
 *
 * 29-1P11c (2026-10-15) — THE COVER'S COLOURS (ideas 46 and 68). **Focus
 * takes the project's own cover colours** (his call): its photo's, or its made
 * cover's two inks (`useProjectLight`). The page's one pool is the main colour
 * (`data-cover-light`, `screenLight.css`), so it fades in from the last screen
 * and from task to task; while the clock runs, the stage casts both colours
 * onto the page round it (`castLight`) in place of the teal. A task in no
 * project keeps the teal. Gold flow stays gold: that is a state, not a picture.
 * **And the clock's line went** — his "just the numbers": `Countdown` is given
 * no `total` here, so it draws no rail.
 */
import { useState, useLayoutEffect, useMemo, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useStore, countSubtasksRecursive, AVOIDED_MAX,
  findSubtaskWithRoot, getBlockingTasks, taskFocusSeconds, taskLockReason,
  type Subtask,
} from '../store/useStore';
import {
  useFocusRun, subjectOf, taskSecondsLeft, sessionSecondsLeft, finishHead,
} from '../store/useFocusRun';
import { useNow } from '../lib/useNow';
import { usePriorityScores } from '../store/usePriorityScores';
import { RedAlertBadge } from './task-fields/RedAlertBadge';
import { AvoidedMark, EmergencyMark } from './task-fields/TaskMarks';
import { BlockedLine } from './project/parts';
import { motion, AnimatePresence } from 'framer-motion';
import CaptureModal from './CaptureModal';
import FocusDetailsPanel from './FocusDetailsPanel';
import FocusSubtasksPanel from './FocusSubtasksPanel';
import FocusSideColumn from './FocusSideColumn';
import { FocusSessionStrip, type SessionSegment } from './FocusSessionStrip';
import { formatHms, formatSpan } from '../lib/timeSpan';
import { Z } from '../lib/zLayers';
import TaskDetailPanel from './TaskDetailPanel';
import { useWakeLock } from '../lib/useWakeLock';
import { useProjectLight } from '../lib/projectIcons/useProjectGlow';
import { castLight } from '../lib/projectCover';
import { useRememberedState } from '../lib/useRememberedState';
import { cue } from '../lib/sound';
import { getNoisePrefs, setNoisePrefs, subscribeNoisePrefs } from '../lib/brownNoise';
import {
  Countdown, FloatingAddButton, GelButton, Icon, Knob, MetaKicker, MiniNav, MorphIcon,
  SoftButton, SoftIconButton, SoftToggle, StatusPill, Stepper, Toast, useMedia, useMotion, V3Scope, WIDE,
} from '../ui';
import { useNavModel } from './navModel';
import { RailMark } from './BrandMark';
import { AddTime, DoneQuestion, FocusBreath, FocusIntent } from './FocusStart';
import { cleanIntent, type FocusOutcome } from '../lib/focusIntent';
import { HalfwayNote, MomentLane, SwitchPicker, WrapUp } from './FocusMoments';
import { ANOTHER_SECONDS, LiveSessionDone } from './FocusSessionDone';
import { takeBreak } from '../store/useFocusBreak';
import { breakMinutes } from '../lib/breaks';
import { buildSmartQueue } from '../lib/smartStart';
import { halfwayLeft } from '../lib/focusMoments';
import { StandByLayer } from './FocusStandBy';
import { useStandBy } from './useStandBy';

/**
 * Where the panels stop docking and start stacking. `focus.html` switches on
 * `window.innerWidth >= 1180`, and the arithmetic is why it is not the
 * system's usual 960: a 780px stage plus a 404px panel is 1184px of content
 * before the rail and the page gutters are paid for.
 */
const DOCK = '(min-width: 1180px)';

/** The stage's own width. Everything else on the screen centres on it. */
const STAGE_WIDTH = 780;

/*
 * FIX-10 — LANDSCAPE FITS, IT DOES NOT SCROLL.
 *
 * Shreekant, 2026-09-22: Focus scrolled on the tablet held sideways and he did
 * not want it to; measured, it scrolled at every landscape size tried — 237px
 * at 1280×720, and 57px on the laptop at 1440×900 with nothing open. His call
 * was **two columns in landscape** (task left, subtasks and notes right,
 * `FocusSideColumn`), on the laptop as well as the tablet, and **show less**
 * when even that does not fit.
 *
 * So a landscape window wide enough for the rail is a fixed-height screen:
 * header, strip, then one row that takes exactly what is left, the stage and
 * the column sharing it. What does not fit is taken off in a ladder keyed on
 * HEIGHT, because height is what runs out:
 *   - under `ROOMY` the stepper leaves the header — its three hints repeat
 *     what the strip already says — and the stage drops a rung (the 64px
 *     clock, `--text-3xl` title, tighter insets);
 *   - under `SHORT` it drops another (the 36px clock, `--text-2xl`).
 * The Details / Subtasks pills leave the stage at every rung: both panels are
 * always open in the column, so the pills would open nothing.
 *
 * Portrait is untouched — 820×1180 already fits, and the dock and the stacked
 * panels are still what it uses. `DOCK` below is now reached only by a window
 * that is at least 1180 wide and taller than it is wide.
 */
const SPLIT = '(min-width: 960px) and (orientation: landscape)';
const ROOMY = '(min-height: 860px)';
const SHORT = '(max-height: 680px)';

/**
 * The pill that opens a docked panel. It is the panel's origin, so it stays
 * lit while the panel is open — `readme.md`'s motion law is that everything
 * which opens morphs out of the thing that triggered it, and a source that
 * goes dark leaves the panel having come from nowhere.
 */
function DockPill({
  icon, label, count, open, onClick, title,
}: {
  icon: 'file-text' | 'list-tree';
  label: string;
  count?: string;
  open: boolean;
  onClick: () => void;
  title: string;
}) {
  /* The design system's soft material since 29-1P2, pressed in while its
     panel is open (`aria-expanded`, which `buttons.css` reads as pressed). */
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      title={title}
      className="ds-soft"
      style={{ fontSize: 'var(--text-sm)' }}
    >
      <Icon name={icon} size={17} />
      {label}
      {count && (
        <span
          style={{
            font: 'var(--type-numeric)', fontSize: 'var(--text-xs)',
            color: open ? 'var(--fg-3)' : 'var(--fg-4)', fontVariantNumeric: 'tabular-nums',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * PURE FOCUS (2026-09-30, his ask): four toggles in the stage's top-left
 * corner that hide the subtasks, the task details, the session bar and the
 * nav, "so I can hide it and just do pure focus". Each is remembered on this
 * device only (`useRememberedState`, FIX-1's rule) — the laptop and the tablet
 * want different amounts of screen. Hiding never ends anything: the session
 * still counts, and Back in the header still leaves.
 *
 * The design system's soft toggle since 29-1P2 (the queue's "soft toggle for
 * Focus's pure-focus toggles"): pressed in while the thing is showing, raised
 * while it is hidden. Never emerald: four lit rings on the stage would spend
 * the colour this screen keeps for "live" (see THE CLOCK IS WHITE above).
 *
 * OPT-7, his ask: a fifth hides the header ("the top focus session banner…
 * that way just the clock is seen"), and all five live in a drawer behind one
 * button, "so there is much more clean look" — his pick over a single switch
 * that hid everything at once. The drawer only shows or hides the switches;
 * what they hid stays hidden. Whether it is open is remembered too, and it
 * starts closed.
 */
function ViewToggle({
  icon, what, shown, onToggle,
}: {
  icon: 'list-tree' | 'file-text' | 'hourglass' | 'panel-left' | 'panel-top' | 'volume-2';
  what: string;
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <SoftToggle
      round
      size="sm"
      pressed={shown}
      aria-label={`Show ${what}`}
      title={`${shown ? 'Hide' : 'Show'} ${what}`}
      onClick={onToggle}
    >
      <Icon name={icon} size={16} />
    </SoftToggle>
  );
}

/** Is every step in this tree done, counting `closing` as done? (29-1P3's chord.) */
function everyStepClosed(steps: Subtask[] | undefined, closing: string): boolean {
  return (steps ?? []).every((s) => (s.id === closing || s.status === 'completed') && everyStepClosed(s.subtasks, closing));
}

/** Where the toggles sit, and the room the stage keeps clear above its content for them. */
const TOGGLE_INSET = 'var(--sp-4)';
const TOGGLE_RESERVE = 'calc(34px + 2 * var(--sp-4))';

/*
 * THE CLOCK FILLS THE CARD (2026-09-30, his ask: "as big of a space it can
 * cover", and bold). It is sized off its own box — a CSS size container — so
 * pure focus's extra room goes straight into the numerals.
 *
 * `CLOCK_EM` is the widest reading it is sized for, in ems, measured in the
 * V3 face at weight 700: `+1:30:00` (an overrun past an hour) is 4.38em. A
 * plain `1:30:00` is 3.62em and so fills ~83% of the width. Sizing to the
 * text actually showing would fill 100%, and jump 30% bigger the second the
 * clock passes 59:59. `CLOCK_LINE` is `--leading-tight`.
 *
 * In landscape the height is the limit too: the clock's box is the row left
 * over after the badges, title and buttons, and `CLOCK_BELOW` is what else
 * sits in that box — the elapsed line and its gap (the rail and its gap went
 * in 29-1P11c) — plus the overrun note when it shows. In portrait the card grows to fit, so
 * only the width limits it, under a cap so it cannot push the page into a
 * scroll; with a panel stacked under it (`condensed`) the cap is the old
 * 64px, because FIX-2's fold budget is what that rung is for.
 */
const CLOCK_EM = 4.4;
const CLOCK_LINE = 1.03;
const CLOCK_BELOW = 60;
const CLOCK_NOTE = 30;

function clockSize(split: boolean, condensed: boolean, note: boolean): string {
  const byWidth = `calc(100cqi / ${CLOCK_EM})`;
  if (split) {
    const byHeight = `calc((100cqb - ${CLOCK_BELOW + (note ? CLOCK_NOTE : 0)}px) / ${CLOCK_LINE})`;
    return `max(var(--text-3xl), min(${byWidth}, ${byHeight}))`;
  }
  return `min(${byWidth}, ${condensed ? 'var(--text-5xl)' : '20vh'})`;
}

/**
 * The switch (V3-4). A component of its own rather than a wrapper inside
 * `FocusScreen`'s two returns, because `useMotion()` reads the scope from
 * context — called in the component that renders the provider, it would
 * answer with the old curves.
 */
export default function FocusMode() {
  return (
    <V3Scope>
      <FocusScreen />
    </V3Scope>
  );
}

function FocusScreen() {
  const navigate = useNavigate();
  const nav = useNavModel();
  const motionTokens = useMotion();
  const wide = useMedia(WIDE);
  const canDock = useMedia(DOCK);
  const split = useMedia(SPLIT);
  const roomy = useMedia(ROOMY);
  const short = useMedia(SHORT);
  /** Split, and one rung down — see `SPLIT`. */
  const tight = split && !roomy;
  const {
    tasks, setTasks, sessionDuration, backlogTasks,
    updateBacklogTask, deleteBacklogTask, addAvoidedCount,
  } = useStore();
  const scores = usePriorityScores();
  const activeTask = tasks[0];
  const activeDuration = activeTask ? taskFocusSeconds(activeTask) : 0;
  /*
   * Item 19 — this task cannot be marked done, and why.
   *
   * **Against the backlog, not against the queue.** `activeTask` is a snapshot
   * taken when the day was built; its prerequisites' *completion* is live, and
   * the ordinary way out of this lock is to finish the blocker — which, if the
   * blocker is also in today's queue, you do on this very screen a minute
   * earlier. Read out of the queue, the lock would survive the thing that was
   * meant to lift it.
   *
   * The flag it checks is the other way round: `scheduledAnyway` lives on the
   * queue copy and `taskLockReason` reads it off the task it is handed, so a
   * task you pressed "Schedule anyway" on arrives here already unlocked. That
   * is the promise — an override is not re-imposed one screen later.
   */
  const activeBlockers = activeTask ? getBlockingTasks(backlogTasks, activeTask) : [];
  const lockReason = activeTask ? taskLockReason(backlogTasks, activeTask) : undefined;

  /*
   * BUILD-1 — THE CLOCK IS NOT THIS COMPONENT'S ANY MORE.
   *
   * `isRunning`, `timeLeft` and `sessionTimeLeft` were `useState` here, which
   * meant a session existed only while this screen was mounted: leaving for a
   * project stopped the clock, and coming back re-seeded it from the task's
   * allocation as though nothing had happened. Shreekant asked for the
   * opposite on 2026-09-15 — the run keeps counting, the noise keeps playing
   * and the time keeps being logged while he is elsewhere — so the session
   * lives in `useFocusRun` and this screen reads and drives it.
   *
   * The two readouts are derived from wall-clock deadlines rather than from a
   * counter, which is why `useNow` only has to repaint: see that store's
   * header for what a throttled interval did to a locked tablet.
   */
  const run = useFocusRun();
  /* What this session has closed, in order: the run's since FIX-14, so a task
     closed from the pill, or while he was on another screen, is on it too. */
  const log = run.closed;
  const isRunning = run.running;
  const now = useNow(isRunning);
  const timeLeft = taskSecondsLeft(run, now);
  const sessionTimeLeft = sessionSecondsLeft(run, now);
  /** Which panel is docked out, if any. One at a time, as in the mockup. */
  const [dock, setDock] = useState<'details' | 'subs' | null>(null);
  /* Pure focus — what the corner toggles have hidden (see `ViewToggle`). */
  const [showSubs, setShowSubs] = useRememberedState('base.focus.show.subtasks', true);
  const [showDetails, setShowDetails] = useRememberedState('base.focus.show.details', true);
  const [showSession, setShowSession] = useRememberedState('base.focus.show.session', true);
  const [showNav, setShowNav] = useRememberedState('base.focus.show.nav', true);
  const [showHeader, setShowHeader] = useRememberedState('base.focus.show.header', true);
  /* 29-1P3, idea 132: brown noise's level as a knob on the stage, with a sixth
     switch to hide it (his call, 2026-10-07). Both only while the noise is on
     in Settings — a knob, or a switch for one, over no sound is a control over
     nothing, the mute button's rule. */
  const [showKnob, setShowKnob] = useRememberedState('base.focus.show.knob', true);
  const noise = useSyncExternalStore(subscribeNoisePrefs, getNoisePrefs);
  const [switchesOpen, setSwitchesOpen] = useRememberedState('base.focus.switches.open', false);
  const [isEditing, setIsEditing] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  /**
   * The Avoided count the deferral just landed on, or `null` for no toast.
   *
   * **A number rather than a boolean, and that is not a refinement — it is the
   * only correct shape.** The press moves the deferred task to the back of the
   * queue, so by the time the toast paints, `activeTask` is the *next* task and
   * reading the count off it would report a stranger's number. It is captured
   * at the moment of the write instead.
   */
  const [quasiNeedToast, setQuasiNeedToast] = useState<number | null>(null);
  /** Smart Sort has run on this queue — the strip's button holds its tint. */
  const [sorted, setSorted] = useState(false);
  /* 29-1P10a, idea 96. The line is being changed (the box stays while it has
     the caret, even once the clock starts), and the task Mark done is asking
     about — an id, so a queue that moves under the question drops it. */
  const [intentEditing, setIntentEditing] = useState(false);
  const [askingFor, setAskingFor] = useState<string | null>(null);
  /* 29-1P10b, idea 103: Switch's queue is open (the clock is paused under it). */
  const [switching, setSwitching] = useState(false);

  // The focus queue holds *snapshots* taken when tasks were selected for today,
  // so their description / notes / links can already be stale (and a subtask
  // proxy never carried notes or links at all). Resolve the live backlog record
  // for the details panel, plus the record an "Edit" should actually write to.
  const details = useMemo(() => {
    if (!activeTask) return null;
    if (activeTask.isSubtaskProxy) {
      const found = findSubtaskWithRoot(backlogTasks, activeTask.id);
      if (!found) return { task: activeTask, parent: null, editTask: null };
      return {
        task: { ...activeTask, description: found.subtask.description },
        parent: found.rootTask,
        editTask: found.rootTask,
      };
    }
    const live = backlogTasks.find((t) => t.id === activeTask.id);
    return { task: live ?? activeTask, parent: null, editTask: live ?? null };
  }, [activeTask, backlogTasks]);

  const editTask = details?.editTask ?? null;
  /**
   * The record the subtask panel reads and writes. The queue's snapshot of a
   * task carries a copy of `subtasks` that a write-through never reaches —
   * `updateBacklogTask` mirrors into the queue by task id, and a subtask's id
   * is not the task's — so both the checklist and the pill's count have to
   * come off the live backlog record or they immediately disagree.
   */
  const liveTask = details?.task ?? activeTask;

  /* 29-1P11c: the project whose cover lights this screen. The task's home list
     names it; a subtask proxy's is its root task's. */
  const homeListId = (details?.parent ?? liveTask)?.listId;
  const project = useStore((s) => {
    const projectId = s.taskLists.find((l) => l.id === homeListId)?.projectId;
    return projectId ? s.projects.find((p) => p.id === projectId) : undefined;
  });
  const light = useProjectLight(project);

  /**
   * Ticking a step writes through to the real subtask wherever it lives.
   * `SUBTASK_PROXY_FIELDS` already carries `status`, so `updateBacklogTask`
   * takes an id it cannot find at the top level and walks the trees for it.
   * This used to be a local `string[]` that was never persisted anywhere.
   */
  const toggleSubtask = (sub: Subtask, done: boolean) => {
    /* 29-1P3, 118: the tick that closes the last open step lands on a chord.
       The tick itself sounded in `Checkbox`. */
    if (done && liveTask && everyStepClosed(liveTask.subtasks, sub.id)) cue('cleared');
    updateBacklogTask(sub.id, { status: done ? 'completed' : 'needsAction' });
    /* An untick takes its tick back off the count. */
    run.tickStep(done);
  };

  // Seed the run from the queue, and re-seed it whenever the active task
  // changes *or* its duration does. Tracking the duration and not just the id
  // is what makes a time set on a task card or on the Set Deadlines page land
  // here: that edit reaches the queue through `updateBacklogTask` without ever
  // changing which task is active. Comparing the resolved number rather than
  // the task object means a Firestore snapshot that rebuilds an identical
  // queue never restarts a running countdown, and the +5m/+15m buttons (which
  // move the deadline alone) survive untouched — `attach` makes all three of
  // those judgements and this screen only supplies the facts.
  //
  // A LAYOUT effect, not an ordinary one: it runs before the browser paints,
  // so a new task's clock is never shown for a frame holding the previous
  // task's number. That is what the render-time `setSeeded` adjustment this
  // replaces was buying, and a store cannot be written during a render.
  //
  // `FocusRunHost` makes the same call while this screen is unmounted, which
  // is the half that keeps a queue reordered from another device honest.
  useLayoutEffect(() => {
    if (!activeTask) return;
    run.attach(subjectOf(activeTask), activeDuration, sessionDuration);
    // `run` is a store slice and changes identity on every tick; the three
    // facts below are the whole input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTask, activeDuration, sessionDuration]);

  // Neither countdown is clamped at zero. A session that has run over and a
  // task that has run over are facts the log already records, and `Countdown`
  // renders an overrun as `+MM:SS` in rose — so the readout can say so instead
  // of parking on 00:00 while the clock underneath carries on. The strip
  // follows the same rule for the window.

  // Keep the screen awake only while the timer is actively counting down;
  // releases automatically on pause/done/skip (isRunning flips false) and on
  // leaving focus mode (unmount).
  useWakeLock(isRunning);

  /* 29-1P10c, idea 100: the tablet held sideways becomes a StandBy clock a
     minute after the last touch, never over something he opened. */
  const standBy = useStandBy({
    running: isRunning,
    busy: askingFor !== null || switching || isEditing || isCapturing,
    now,
  });

  // ─── Focus time-log ───────────────────────────────────────────────────────
  // The stretch of work being timed used to be a ref in this component, banked
  // on unmount. BUILD-1 moved it into `useFocusRun` beside the clock, because
  // a session that now survives a route change would otherwise have stopped
  // being *recorded* at the exact moment it started being interesting: the
  // unmount that closed the stretch is the navigation he is allowed to make.
  //
  // What did not change is how it is measured — against `Date.now()`, never
  // against the countdown, because a backgrounded browser throttles timers and
  // because the countdown is also moved by the +5m/+15m buttons. The
  // last-chance banking on `visibilitychange`/`pagehide` moved with it, to
  // `FocusRunHost`, which is mounted whether or not this screen is.

  /* `start`, not `resume`: the session's first press breathes first (29-1P10a,
     idea 95), and a press during the breath skips it. */
  const handleToggleRunning = () => {
    if (run.running) {
      run.pause(true);
      return;
    }
    cue('start');
    run.start();
  };

  /*
   * Done / Skip / Defer all move the queue on, and all three read it out of
   * the store rather than out of this render's `tasks`.
   *
   * The timer card leaves through `AnimatePresence mode="wait"`, which keeps
   * the OUTGOING card mounted — handlers and all — until its exit finishes,
   * and those handlers are closed over the queue as it was before the press.
   * Press Skip twice inside that quarter-second and the second press used to
   * re-run the first one: same slice, same result, one task skipped instead of
   * two. Reading the live head at press time is what makes the second press
   * count, and it is the same reason `endSegment` measures against
   * `Date.now()` rather than the state it is looking at.
   */
  const liveHead = () => useStore.getState().tasks;

  const handleDone = () => {
    const current = liveHead()[0];
    if (!current) return;
    if (taskLockReason(useStore.getState().backlogTasks, current)) return;
    /* 29-1P10a, idea 96: he said what done would look like, so Mark done asks
       whether he did it before it finishes anything. */
    if (cleanIntent(useFocusRun.getState().intent)) {
      setAskingFor(current.id);
      return;
    }
    finishTask();
  };

  /** Mark done's answer. His call: Not yet keeps the task open, clock and all. */
  const answerDone = (answer: FocusOutcome | 'notYet') => {
    setAskingFor(null);
    if (answer !== 'notYet') finishTask(answer);
  };

  const finishTask = (outcome?: FocusOutcome) => {
    /* `finishHead` is the whole of Mark done since 29-1P11b, because the pill's
       panel presses it too. It reads the LIVE head and re-checks the lock, and
       reads the task's final minutes off the stopped run rather than this
       render's `timeLeft` — `AnimatePresence` keeps the outgoing card's
       handlers alive through the dissolve, and a closure over a render's clock
       would report the minutes of the task after it. */
    const closed = finishHead(outcome);
    if (!closed) return;
    /* 29-1P3: done, or the chord when it was the session's last task. */
    cue(closed.last ? 'cleared' : 'done');
    setDock(null);
  };

  const handleSkip = () => {
    const queue = liveHead();
    if (queue.length === 0) return;
    run.pause();
    setDock(null);
    setTasks(queue.slice(1));
  };

  const handleQuasiNeed = () => {
    const queue = liveHead();
    const current = queue[0];
    if (!current) return;
    run.pause();
    addAvoidedCount(current.id);
    // Move current task to end of queue
    const remaining = queue.slice(1);
    /* The queue's own copy of the task, bumped the same way the store bumps
       the real one — **including the cap** (item 17). These two arithmetics
       have to match: the row in the queue and the row on the board would
       otherwise disagree about how many times you had dodged one task. */
    const landedOn = Math.min(AVOIDED_MAX, (current.avoidedCount ?? 0) + 1);
    const updated = { ...current, avoidedCount: landedOn };
    setDock(null);
    setTasks([...remaining, updated]);
    setQuasiNeedToast(landedOn);
    setTimeout(() => setQuasiNeedToast(null), 2500);
  };

  /** Halfway's Switch: the clock stops while he picks (his call). */
  const openSwitch = () => {
    const current = liveHead()[0];
    if (!current) return;
    run.seeHalfway(current.id);
    run.pause();
    setSwitching(true);
  };

  /** The picked task goes on the clock; the one he was on is next in line. */
  const switchTo = (id: string) => {
    const [current, ...rest] = liveHead();
    const picked = rest.find((t) => t.id === id);
    setSwitching(false);
    if (current && picked) {
      setDock(null);
      setTasks([picked, current, ...rest.filter((t) => t.id !== id)]);
    }
    run.resume();
  };

  const handleSmartSort = () => {
    const sorted_ = [...tasks].sort((a, b) => scores.scoreOf(b) - scores.scoreOf(a));
    setTasks(sorted_);
    setSorted(true);
  };

  /**
   * The floating nav bar, for windows narrower than the rail's breakpoint.
   * Both exits from this screen render it, which is why it is a variable.
   */
  const floatingBar = !wide && (
    <div
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--sp-5) + var(--safe-b))',
        display: 'grid', placeItems: 'center',
        zIndex: Z.nav, pointerEvents: 'none',
      }}
    >
      <span style={{ pointerEvents: 'auto' }}>
        <MiniNav items={nav.items} value={nav.current} onChange={nav.go} screenLit />
      </span>
    </div>
  );

  /*
   * 29-1P11a, idea 105: Another 25 starts the next best task (his call) — the
   * head of a 25-minute Smart Start, so a blocked task brings what it waits on
   * first, and ignored work never comes up. Worked out only on the end pane.
   */
  const nextBest = useMemo(
    () => (activeTask ? null : buildSmartQueue(ANOTHER_SECONDS / 3600, backlogTasks, {
      scores, ignored: scores.ignored.ids,
    }).queue[0] ?? null),
    [activeTask, backlogTasks, scores],
  );
  const startAnother = () => {
    if (!nextBest) return;
    const head = { ...nextBest, allocatedTime: ANOTHER_SECONDS };
    setSorted(false);
    /* A new session: `attach` on an empty run zeroes the card's tally. */
    run.clear();
    setTasks([head]);
    run.attach(subjectOf(head), ANOTHER_SECONDS, sessionDuration);
    /* `resume`, not `start`: the session's one breath was at its start. */
    cue('start');
    run.resume();
  };
  /** Everything this session committed to, closed and outstanding alike. */
  const plannedSeconds =
    log.reduce((n, entry) => n + entry.allocated, 0)
    + tasks.reduce((n, task) => n + taskFocusSeconds(task), 0);

  if (!activeTask) {
    return (
      /*
       * SESSION COMPLETE — the mockup's own end pane, which REPORTS rather
       * than merely announcing. UI-11 built this on the Score screen's
       * DoneScreen because there was nothing else to build it on; the source
       * has a pane of its own, and what it puts in it is the session: the
       * time the closed tasks actually took, as the loudest number, then one
       * line per task with its own figure beside it.
       *
       * A queue can also empty without closing anything — three skips, or a
       * delete — which the prototype has no way to reach and therefore never
       * answers. That state keeps its old name and, deliberately, none of the
       * report's furniture: no glowing zero, and no emission at all, because
       * `elevation.css` gives glow to what is live or finished and this is
       * neither.
       *
       * Since 29-1P11a it is "Session done" (idea 105, `FocusSessionDone.tsx`):
       * the same report plus subtasks ticked, ideas captured and pauses, and
       * Another 25 · Break · Done in place of Home and New session.
       */
      <div className="ag-page ag-page--focal" style={{ height: '100dvh', display: 'flex', overflow: 'hidden' }}>
        {wide && (
          <div style={{ flex: '0 0 auto', padding: 'var(--sp-9) 0 var(--sp-9) var(--sp-7)' }}>
            <MiniNav orientation="vertical" items={nav.items} value={nav.current} onChange={nav.go} screenLit lead={<RailMark />} />
          </div>
        )}

        <div
          style={{
            flex: 1, minWidth: 0, overflowY: 'auto', display: 'grid', placeItems: 'center',
            boxSizing: 'border-box',
            padding: wide ? 'var(--sp-9) var(--gutter-page)' : 'var(--sp-8) var(--gutter-page-sm) 128px',
          }}
        >
          <LiveSessionDone
            log={log}
            stats={{ subtasks: run.stepsTicked, ideas: run.ideasCaptured, pauses: run.pauses }}
            canAnother={nextBest !== null}
            breakMinutes={noise.mode === 'pomodoro' ? breakMinutes(noise, false) : null}
            onAnother={startAnother}
            onBreak={takeBreak}
            onDone={() => navigate('/dashboard')}
          />
        </div>

        {floatingBar}
      </div>
    );
  }

  const reading = scores.read(activeTask);
  const subCounts = liveTask.subtasks && liveTask.subtasks.length > 0
    ? countSubtasksRecursive(liveTask.subtasks)
    : null;
  const overrun = timeLeft < 0;
  /* Idea 102: either clock past zero is flow, and Wrap up shows beside the clock. */
  const inFlow = (overrun && activeDuration > 0) || sessionTimeLeft < 0;
  const spent = Math.max(0, activeDuration - timeLeft);
  /* Idea 103: the halfway note's ten seconds, read off the clock; never over
     another question, or once he has answered it for this task. */
  const halfway = isRunning && !switching && run.away === null && askingFor === null
    && run.halfwaySeenFor !== activeTask.id
    ? halfwayLeft(activeDuration, timeLeft)
    : null;
  const quasiNeeded = (activeTask.avoidedCount ?? 0) > 0;
  /* The counter saturates (item 17), so the Defer button stops promising a
     point it can no longer add. The press still does the useful half — the
     task goes to the back of the queue — which is why it is not disabled. */
  const avoidedAtCap = (activeTask.avoidedCount ?? 0) >= AVOIDED_MAX;
  const dockOpen = dock !== null;

  /*
   * FIX-2 — THE THIRD RUNG OF THIS SCREEN'S SIZE LADDER.
   *
   * Below `DOCK` there is no room to dock, so the panel stacks UNDER the stage
   * (see `FocusDockPanel`'s header) — and at 820×1180 the stage is 559px tall,
   * which put the stacked panel's foot 139px below the fold. The panel that
   * promises it "covers nothing" was itself the thing you could not see.
   *
   * So when a dock opens on a window too narrow to dock it, the stage steps
   * down a rung and both share the one viewport. It is the same move the
   * screen already makes once — every measurement below already has a `wide`
   * branch and a narrow one — with a third reading for "narrow, and the panel
   * is the thing being read". The stage is context then, not the subject.
   *
   * Measured rather than guessed: 139px were owed and it reclaims 157 — the
   * stage 110 of them, the tighter column gaps the rest — putting the panel's
   * foot at 1034 with the 128px floating-nav reserve still clear beneath it.
   * **It is not for the docked case.** Above `DOCK` the panel sits beside the
   * stage and costs it no height at all, and desktop is byte-for-byte what it
   * was.
   *
   * What it does NOT do is cap the panel: a task with a dozen subtasks still
   * runs past the fold and the page scrolls, exactly as it already does on the
   * docked side at 1440×900. Condensing the stage cannot answer a list of
   * arbitrary length, and making this one panel scroll inside itself would
   * split the two arrangements' behaviour for no gain.
   */
  const condensed = !split && !canDock && dockOpen;
  /** Any reason the stage is a rung down: a stacked panel, or a landscape window under `ROOMY`. */
  const small = condensed || tight;
  /** Above the header, or above whatever comes first when the header is hidden. */
  const topGap = small ? 'var(--sp-5)' : wide ? 'var(--sp-7)' : 'var(--sp-8)';
  /** The stage's insets for each rung: top, sides, bottom. */
  const stagePad: [string, string, string] = condensed
    ? ['var(--sp-5)', 'var(--sp-5)', 'var(--sp-5)']
    : split
      ? short ? ['var(--sp-5)', 'var(--sp-6)', 'var(--sp-5)']
        : tight ? ['var(--sp-6)', 'var(--pad-card)', 'var(--sp-6)']
          : ['var(--sp-9)', 'var(--pad-card-lg)', 'var(--sp-9)']
      : wide ? ['var(--sp-10)', 'var(--pad-card-lg)', 'var(--sp-9)']
        : ['var(--pad-card)', 'var(--pad-card)', 'var(--pad-card)'];

  /*
   * The strip's segments: what has closed, then what is left, the head of the
   * queue carrying the fill. Each is sized by its allocation, so the bar is a
   * picture of the plan rather than of the count.
   */
  const segments: SessionSegment[] = [
    ...log.map((entry) => ({
      id: `closed-${entry.id}`,
      title: entry.title,
      seconds: entry.allocated,
      state: 'done' as const,
      progress: 1,
    })),
    ...tasks.map((task, index) => {
      const seconds = taskFocusSeconds(task);
      return {
        id: task.id,
        title: task.title,
        seconds,
        state: index === 0 ? ('live' as const) : ('queued' as const),
        progress: index === 0 && seconds > 0 ? Math.min(1, spent / seconds) : 0,
      };
    }),
  ];

  const detailsPanel = (
    <FocusDetailsPanel
      open={dock === 'details'}
      docked={canDock}
      onClose={() => setDock(null)}
      task={details?.task ?? activeTask}
      parentTask={details?.parent}
      onEdit={editTask ? () => { setDock(null); setIsEditing(true); } : undefined}
    />
  );

  const subtasksPanel = (
    <FocusSubtasksPanel
      open={dock === 'subs'}
      docked={canDock}
      onClose={() => setDock(null)}
      task={liveTask}
      onToggle={toggleSubtask}
      editable={editTask !== null}
    />
  );

  /** Hiding one closes its panel too, or the dock would hold a pane with no pill left to close it. */
  const toggleSubs = () => {
    if (showSubs && dock === 'subs') setDock(null);
    setShowSubs(!showSubs);
  };
  const toggleDetails = () => {
    if (showDetails && dock === 'details') setDock(null);
    setShowDetails(!showDetails);
  };

  return (
    <div
      className="ag-page ag-page--focal"
      data-cover-light={light ? '' : undefined}
      style={{ height: '100dvh', display: 'flex', overflow: 'hidden', ...(light ? { ['--cover-light' as string]: light[0] } : {}) }}
    >
      {wide && showNav && (
        <div style={{ flex: '0 0 auto', padding: 'var(--sp-9) 0 var(--sp-9) var(--sp-7)' }}>
          <MiniNav orientation="vertical" items={nav.items} value={nav.current} onChange={nav.go} screenLit lead={<RailMark />} />
        </div>
      )}

      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflowY: 'auto',
          boxSizing: 'border-box',
          ...(split
            ? { display: 'flex', flexDirection: 'column', padding: `0 var(--gutter-page) ${tight ? 'var(--sp-5)' : 'var(--sp-7)'}` }
            : { padding: wide ? '0 var(--gutter-page) var(--sp-13)' : '0 var(--gutter-page-sm) 128px' }),
        }}
      >
        <div
          style={
            split
              ? {
                  /* Header, strip, and a row that takes exactly what is left.
                     The floor is where a window has become too short to share
                     at all: past it the page scrolls again rather than crushing
                     the clock. Nothing he owns is that short. */
                  display: 'grid',
                  gridTemplateRows: [showHeader && 'auto', showSession && 'auto', 'minmax(0, 1fr)'].filter(Boolean).join(' '),
                  gap: tight ? 'var(--sp-5)' : 'var(--sp-7)', justifyItems: 'center',
                  flex: 1, minHeight: 460, paddingTop: showHeader ? 0 : topGap,
                }
              : {
                  display: 'grid', gap: condensed ? 'var(--sp-5)' : 'var(--sp-8)', justifyItems: 'center',
                  paddingTop: showHeader ? 0 : topGap,
                }
          }
        >
          {/*
            The header, sticky INSIDE the page scroller, so the stage slides
            past behind its glass. `zIndex` is load-bearing and it is the
            lesson UI-7 paid for on Notifications: every glass surface has a
            `backdrop-filter`, which makes it a stacking context, and stacking
            contexts without a z-index paint in DOM order — so this header,
            being the first child, would be painted over by the card that
            scrolls up to meet it.
            OPT-7's fifth switch can hide it, and then the first thing on the
            page takes its top margin instead (`topGap`).
          */}
          {showHeader && (
            <header
              style={{
                width: '100%',
                position: 'sticky',
                top: 'var(--sp-5)',
                zIndex: 2,
                marginTop: topGap,
                /* FIX-10: a rounded rectangle, not a pill — his "more of a
                   rectangle with curved edges". The strip under it matches. */
                borderRadius: 'var(--r-md)',
                padding: 'var(--sp-4) var(--sp-6) var(--sp-4) var(--sp-4)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-6)',
                flexWrap: 'wrap',
                backgroundImage: 'var(--glass-fill-2)',
                backdropFilter: 'var(--glass-bd-lg)',
                WebkitBackdropFilter: 'var(--glass-bd-lg)',
                boxShadow: 'var(--glass-shadow-pane)',
                animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
              }}
            >
              {/* Round glass since V3-4, as the board's Back (V3-3). */}
              <SoftIconButton label="Back to set deadlines" onClick={() => navigate('/deadlines')}>
                <Icon name="arrow-left" size={18} />
              </SoftIconButton>

              {/* The system voice, as on the two steps before this one — and
                  the explanatory line under it is `readme.md`'s own example of
                  that register, quoted there as "the best line in the product". */}
              <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                <h1
                  style={{
                    /* Uppercase in V3 too: this is the system voice, not a
                       kicker, and v4's readme keeps that voice in capitals — its
                       0.30em tracking only reads as a word in them. */
                    font: 'var(--type-system)', textTransform: 'uppercase',
                    letterSpacing: 'var(--tracking-system)', color: 'var(--fg-1)', whiteSpace: 'nowrap',
                  }}
                >
                  Focus
                </h1>
                <p style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
                  Strict focus. One task at a time.
                </p>
              </div>

              <span style={{ flex: 1, minWidth: 'var(--sp-8)' }} />

              {wide && !tight && (
                /* Step three of New Session, which the other two already draw.
                   `hint` is where the real value lives — a stepper with only
                   labels is decoration, and `Stepper.prompt.md` says so. */
                <Stepper
                  current={2}
                  steps={[
                    { label: 'Select', hint: `${log.length + tasks.length} chosen` },
                    { label: 'Deadlines', hint: formatSpan(plannedSeconds) },
                    { label: 'Focus', hint: `${log.length} done` },
                  ]}
                  style={{ margin: 0 }}
                />
              )}

              {/* In landscape the corner button would sit on the side column's
                  foot, so it moves up here, where the stepper leaves room. */}
              {split && (
                <SoftIconButton label="Capture an idea or task" onClick={() => setIsCapturing(true)}>
                  <Icon name="plus" size={20} />
                </SoftIconButton>
              )}
            </header>
          )}

          {showSession && (
            <div
              style={{
                width: '100%',
                maxWidth: split ? 'none' : dockOpen && canDock ? 1200 : 860,
                transition: 'max-width var(--dur-morph) var(--ease-morph)',
              }}
            >
              <FocusSessionStrip
                segments={segments}
                secondsLeft={sessionTimeLeft}
                doneCount={log.length}
                total={log.length + tasks.length}
                sorted={sorted}
                onSort={tasks.length > 1 ? handleSmartSort : undefined}
              />
            </div>
          )}

          {/* ══════════════ THE STAGE, and what docks beside it ══════════════ */}
          <div
            style={
              split
                ? { display: 'flex', alignItems: 'stretch', gap: 'var(--sp-5)', width: '100%', minHeight: 0 }
                : { display: 'flex', alignItems: 'flex-start', justifyContent: 'center', width: '100%' }
            }
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTask.id}
                /* Panes in this system arrive by CONDENSING, never by sliding
                   in from off-screen (motion.css). */
                initial={{ opacity: 0, scale: 0.94, y: 6, filter: 'blur(8px)' }}
                animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.97, filter: 'blur(6px)' }}
                transition={{ duration: motionTokens.dur.base, ease: motionTokens.ease.glass }}
                style={{
                  width: '100%',
                  maxWidth: split ? 'none' : STAGE_WIDTH,
                  minWidth: 0,
                  /* In landscape the stage fills its half of the row and
                     centres what it holds; the scroll is a last resort for a
                     window under the floor above, never the normal case. */
                  /* The clock's row takes whatever height is left, so the
                     clock can grow into it (see CLOCK_EM). */
                  ...(split ? { flex: 1, gridTemplateRows: 'auto minmax(0, 1fr) auto auto', overflowY: 'auto' } : {}),
                  /* A rounded rectangle like the bars above it — his call,
                     2026-09-30 — not --r-card-lg's big curve. */
                  borderRadius: 'var(--r-md)',
                  /* One shorthand, never `padding` plus `paddingTop`: React
                     clears a longhand when the shorthand beside it changes. The
                     top is at least the toggles' corner, so they stay clear of
                     the badges under them however many badges a task has. */
                  padding: `max(${TOGGLE_RESERVE}, ${stagePad[0]}) ${stagePad[1]} ${stagePad[2]}`,
                  position: 'relative',
                  display: 'grid',
                  justifyItems: 'center',
                  gap: small ? 'var(--sp-5)' : 'var(--sp-7)',
                  textAlign: 'center',
                  backgroundImage: 'var(--glass-fill-2)',
                  backdropFilter: 'var(--glass-bd-lg)',
                  WebkitBackdropFilter: 'var(--glass-bd-lg)',
                  /* Emission says what the stage IS: overrunning, live, or
                     resting. `elevation.css` — a resting surface never glows.
                     Live is Focus's teal since 29-1P2c3 (it was emerald):
                     this is Focus's own stage, so its colour wins, as
                     Atlas's violet does on Atlas's things. The strip's live
                     segment and the run pill keep emerald, running now.
                     Since 29-1P11c a task in a project casts its cover's
                     colours instead (`castLight`); flow stays gold. */
                  boxShadow: overrun
                    ? 'var(--glass-shadow-pane), var(--job-gold-shine-md)'
                    : isRunning
                      ? `var(--glass-shadow-pane), ${light ? castLight(light) : 'var(--job-teal-shine-md)'}`
                      : 'var(--glass-shadow-pane)',
                }}
              >
                <div
                  role="group"
                  aria-label="Show or hide parts of this screen"
                  style={{ position: 'absolute', top: TOGGLE_INSET, left: TOGGLE_INSET, display: 'flex', gap: 'var(--sp-2)' }}
                >
                  <SoftIconButton
                    size="sm"
                    label={switchesOpen ? 'Hide the screen switches' : 'Show the screen switches'}
                    aria-expanded={switchesOpen}
                    onClick={() => setSwitchesOpen(!switchesOpen)}
                  >
                    <Icon name="sliders-horizontal" size={16} />
                  </SoftIconButton>
                  {switchesOpen && (
                    <>
                      <ViewToggle icon="panel-top" what="the top banner" shown={showHeader} onToggle={() => setShowHeader(!showHeader)} />
                      <ViewToggle icon="list-tree" what="subtasks" shown={showSubs} onToggle={toggleSubs} />
                      <ViewToggle icon="file-text" what="task details" shown={showDetails} onToggle={toggleDetails} />
                      <ViewToggle icon="hourglass" what="the session bar" shown={showSession} onToggle={() => setShowSession(!showSession)} />
                      <ViewToggle icon="panel-left" what="the nav bar" shown={showNav} onToggle={() => setShowNav(!showNav)} />
                      {noise.enabled && (
                        <ViewToggle icon="volume-2" what="the brown noise knob" shown={showKnob} onToggle={() => setShowKnob(!showKnob)} />
                      )}
                    </>
                  )}
                </div>

                {/* The brown noise knob, in the corner the switches leave free. Sized
                    to sit inside the room the stage keeps clear for them. */}
                {noise.enabled && showKnob && (
                  <div title="Brown noise level" style={{ position: 'absolute', top: TOGGLE_INSET, right: TOGGLE_INSET }}>
                    <Knob
                      label="Brown noise level"
                      value={Math.round(noise.level * 100)}
                      min={0}
                      max={100}
                      step={5}
                      size={52}
                      dots={8}
                      valueText={`${Math.round(noise.level * 100)} percent`}
                      onValueChange={(v) => setNoisePrefs({ level: v / 100 })}
                    />
                  </div>
                )}

                <div style={{ display: 'grid', justifyItems: 'center', gap: small ? 'var(--sp-4)' : 'var(--sp-5)', width: '100%' }}>
                  <div className="flex flex-wrap items-center justify-center" style={{ gap: small ? 'var(--sp-3)' : 'var(--sp-4)' }}>
                    {/* No run-state pill, score or list name since OPT-7 (see
                        the header). What is left here asks something of him. */}
                    <RedAlertBadge redAlert={reading.redAlert} />

                    {/* The bonus is real and stored; nothing ever showed it.
                        **Item 17 gave it the count and one name.** It used to
                        read "Quasi-need" with no number, in amber, on the one
                        screen that could produce it — while the factor bar
                        called the same field "Avoided" and scored it out of 5.
                        The shared mark says `Avoided ×3` here and on every row
                        that shows the task, so the screen that *causes* the
                        deferral and the screens that live with it are saying
                        one thing. Amber went with the old name: this is a
                        count of what you did, not a decision waiting on you,
                        and `zap` now belongs to the Emergency flag. */}
                    {quasiNeeded && <AvoidedMark count={activeTask.avoidedCount} />}

                    {/* The flag, where you are looking at the task it is on.
                        No control: Focus Mode is for doing the work, and
                        re-judging it mid-timer is what the ⋯ menu on the board
                        is for. */}
                    <EmergencyMark
                      level={activeTask.emergencyBoost}
                      lapsed={(activeTask.emergencyBoost ?? 0) > 0 && reading.variables.emergency === 0}
                    />

                    {/* Grey with its triangle, not coral: a field you never
                        filled in needs a look, it is not a live problem
                        (29-1P2c2: warnings quiet; it was amber, gold's hue). */}
                    {activeDuration === 0 && (
                      <StatusPill status="review" size="sm" dot={false}>Needs time</StatusPill>
                    )}

                    {/* What is holding this task up, on the screen where you
                        would otherwise be about to work on it, and in the same
                        neutral component every row uses. It shows whenever
                        something is unfinished — including on a task you put
                        here with "Schedule anyway", where it is a statement of
                        fact rather than a refusal, because you already
                        answered the refusal. */}
                    {activeBlockers.length > 0 && (
                      <BlockedLine
                        on={activeBlockers[0].title}
                        extra={activeBlockers.length - 1}
                        title={lockReason ?? `Blocked by: ${activeBlockers.map((t) => t.title).join(', ')}`}
                      />
                    )}
                  </div>

                  <h2
                    className="ag-clamp-2"
                    style={{
                      maxWidth: '18ch',
                      font: 'var(--type-display)',
                      fontSize: condensed || (split && short)
                        ? 'var(--text-2xl)'
                        : wide && !tight ? 'var(--text-4xl)' : 'var(--text-3xl)',
                      letterSpacing: 'var(--tracking-display)',
                      color: 'var(--fg-1)',
                      textWrap: 'balance',
                    }}
                  >
                    {activeTask.title}
                  </h2>

                  <FocusIntent
                    intent={run.intent}
                    asking={(!run.taskBegun && !isRunning) || intentEditing}
                    onChange={run.setIntent}
                    onEditing={setIntentEditing}
                    onEnter={() => { if (!run.taskBegun && !isRunning && run.settleUntil === null) handleToggleRunning(); }}
                  />
                </div>

                {/* What you can OPEN about this task, next to its name. Both
                    pills are always here — "this one has no steps" is a fact
                    worth being able to check without leaving the screen. */}
                {!split && (showDetails || showSubs) && (
                <div className="flex flex-wrap items-center justify-center" style={{ gap: 'var(--sp-4)' }}>
                  {showDetails && (
                    <DockPill
                      icon="file-text"
                      label="Details"
                      open={dock === 'details'}
                      title="Description, notes and reference links"
                      onClick={() => setDock(dock === 'details' ? null : 'details')}
                    />
                  )}
                  {showSubs && (
                    <DockPill
                      icon="list-tree"
                      label="Subtasks"
                      count={subCounts ? `${subCounts.done} / ${subCounts.total}` : undefined}
                      open={dock === 'subs'}
                      title={subCounts ? `${subCounts.total} subtasks` : 'No breakdown on this task'}
                      onClick={() => setDock(dock === 'subs' ? null : 'subs')}
                    />
                  )}
                </div>
                )}

                {/* 29-1P10a, idea 95: while the session settles in, the screen
                    goes quiet — the breath stands where the clock and its
                    buttons were, and the title and the line stay. */}
                {run.settleUntil !== null ? (
                  <div style={{ display: 'grid', placeItems: 'center', minHeight: 0 }}>
                    <FocusBreath until={run.settleUntil} onSkip={() => run.resume()} />
                  </div>
                ) : (
                <>
                {/* The two numerals this screen exists for. A size container,
                    so the clock can be sized off the room it actually has. */}
                <div
                  style={{
                    display: 'grid', justifyItems: 'center', alignContent: 'center',
                    gap: small ? 'var(--sp-4)' : 'var(--sp-5)', width: '100%', minHeight: 0,
                    paddingTop: small ? 0 : 'var(--sp-3)',
                    containerType: split ? 'size' : 'inline-size',
                  }}
                >
                  {/* Just the numbers (29-1P11c, his call): no `total`, so no rail. */}
                  <Countdown
                    seconds={timeLeft}
                    format="clock"
                    size="timer"
                    numeralSize={clockSize(split, condensed, inFlow)}
                    numeralWeight="var(--weight-bold)"
                    running={isRunning}
                    over="flow"
                    note={inFlow ? <WrapUp onClick={handleDone} /> : undefined}
                  />

                  <span className="flex flex-wrap items-center justify-center" style={{ gap: 'var(--sp-5)' }}>
                    <MetaKicker tone="var(--fg-4)">
                      {overrun ? `${formatHms(-timeLeft)} in flow` : `${formatHms(spent)} elapsed`}
                    </MetaKicker>
                    <span aria-hidden="true" style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--fg-4)' }} />
                    <MetaKicker tone="var(--fg-4)">{formatSpan(activeDuration)} allocated</MetaKicker>
                    {/* On the clock's own line, because it moves the clock. Was
                        +5m / +15m; the ruler since 29-1P10a (idea 97). */}
                    <AddTime timeLeft={timeLeft} running={isRunning} now={now} onAdd={run.addTaskSeconds} />
                  </span>
                </div>

                {/* Mark done's question takes the controls' place until he
                    answers it (29-1P10a, idea 96). */}
                {askingFor === activeTask.id && cleanIntent(run.intent) ? (
                  <DoneQuestion intent={run.intent} onAnswer={answerDone} />
                ) : (
                <>
                {/* Controls. One ghost escape, one glass verb, one frost verb —
                    and no `solid`: the mockup gives this row three weights and
                    a fourth would leave none of them meaning anything. */}
                <div className="flex flex-wrap items-center justify-center" style={{ gap: 'var(--sp-5)' }}>
                  <SoftIconButton label="Skip this task" onClick={handleSkip}>
                    <Icon name="x" size={20} />
                  </SoftIconButton>

                  {/* Soft raised, the second action (29-1P2), as tall as Mark done. */}
                  <SoftButton
                    onClick={handleToggleRunning}
                    icon={<MorphIcon kind="play-pause" on={isRunning} size={18} />}
                    style={{ height: 56, padding: '0 var(--sp-8)', fontSize: 'var(--text-md)' }}
                  >
                    {isRunning ? 'Pause' : run.begun ? 'Resume' : 'Start'}
                  </SoftButton>

                  {/* Item 19. Skip and Defer are deliberately left alone: a
                      task you cannot finish is exactly the one you want to move
                      past, and taking away every verb on the screen would leave
                      a locked task able to stop the whole session. */}
                  {/* The screen's one lit button: finishing the task. A plain gel
                      since 29-1P2, lime — done is lime's job. */}
                  <GelButton
                    colour="lime"
                    tile={false}
                    onClick={handleDone}
                    disabled={lockReason !== undefined}
                    title={lockReason}
                    icon={<Icon name={lockReason ? 'lock' : 'check'} size={18} />}
                  >
                    Mark done
                  </GelButton>
                </div>

                {/* Defer is a decision, not a control, so it sits a step below
                    them. It named what runs next until OPT-7 took the "Next:"
                    line off, his ask; the strip's run order still says it. */}
                <div style={{ display: 'grid', justifyItems: 'center' }}>
                  <SoftButton
                    size="sm"
                    onClick={handleQuasiNeed}
                    title={
                      avoidedAtCap
                        ? `Push this to the end of the queue. It has already been avoided ${AVOIDED_MAX} times, which is as high as the counter goes, so the score will not move again.`
                        : 'Push this to the end of the queue and score it one point higher next time'
                    }
                    /* `skip-forward`, not `zap` — item 17 gave the lightning to
                       the Emergency flag, and a defer is the opposite gesture.
                       The words are the counter's own name for the same reason
                       every other surface's are: one field, one vocabulary. */
                    icon={<Icon name="skip-forward" size={15} />}
                  >
                    {avoidedAtCap ? `Defer — already avoided ×${AVOIDED_MAX}` : 'Defer — +1 avoided'}
                  </SoftButton>
                </div>
                </>
                )}
                </>
                )}
              </motion.div>
            </AnimatePresence>

            {!split && canDock && detailsPanel}
            {!split && canDock && subtasksPanel}

            {split && (showSubs || showDetails) && (
              <FocusSideColumn
                key={activeTask.id}
                showSubtasks={showSubs}
                showDetails={showDetails}
                task={liveTask}
                detailsTask={details?.task ?? activeTask}
                parentTask={details?.parent}
                onToggle={toggleSubtask}
                editable={editTask !== null}
                onEdit={editTask ? () => setIsEditing(true) : undefined}
                compact={tight}
              />
            )}
          </div>

          {/* Too narrow to dock, so the panel stacks under the stage rather
              than covering it — the mockup's own answer at its own breakpoint. */}
          {!split && !canDock && dockOpen && (
            <div style={{ width: '100%', maxWidth: STAGE_WIDTH }}>
              {dock === 'details' ? detailsPanel : subtasksPanel}
            </div>
          )}
        </div>
      </div>

      {showNav && floatingBar}

      {!split && (
        <div style={{ position: 'fixed', right: 'calc(var(--sp-9) + var(--safe-r))', bottom: 'calc(var(--sp-9) + var(--safe-b))', zIndex: Z.chrome }}>
          {/* The floating + (29-1P2), where the capture button always was. While
              Capture is open it is an ✕, and closes it (29-1P5c). */}
          <FloatingAddButton
            open={isCapturing}
            label={isCapturing ? 'Close capture' : 'Capture an idea or task'}
            onClick={() => setIsCapturing(!isCapturing)}
          />
        </div>
      )}

      <AnimatePresence>
        {isEditing && editTask && (
          <TaskDetailPanel
            task={editTask}
            onClose={() => setIsEditing(false)}
            // Bank the stretch worked so far, as the delete below does.
            onBeforeArchive={() => run.pause()}
            onSave={(updates) => {
              // The queue carries its own copy of the task; `updateBacklogTask`
              // mirrors the edit into it so the timer card doesn't keep showing
              // the pre-edit title/score/duration for the rest of the session.
              updateBacklogTask(editTask.id, updates);
              setIsEditing(false);
            }}
            onDelete={() => {
              // Stop timing a task that no longer exists, and bank the stretch
              // worked so far before the queue entry disappears.
              run.pause();
              // Clears the queue row and the subtask-proxy row itself now —
              // this used to be patched up here by hand, which is exactly the
              // cleanup the other five delete sites each got wrong.
              deleteBacklogTask(editTask.id);
              setIsEditing(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* Quasi-need toast. Centred by its wrapper, not by a translate on the
          animated element — Framer Motion writes that element's `transform`
          every frame and would erase a `-translate-x-1/2` utility. It clears
          the floating nav on a narrow window, which is where that nav sits. */}
      <div
        style={{
          position: 'fixed', left: 0, right: 0, bottom: wide ? 'calc(var(--sp-9) + var(--safe-b))' : 'calc(112px + var(--safe-b))',
          display: 'grid', placeItems: 'center', padding: '0 var(--gutter-page-sm)',
          zIndex: Z.toast, pointerEvents: 'none',
        }}
      >
        <AnimatePresence>
          {quasiNeedToast !== null && (
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.96 }}
              style={{ pointerEvents: 'auto' }}
            >
              <Toast
                tone="review"
                icon={<Icon name="skip-forward" size={16} />}
                title="Deferred"
                detail={
                  quasiNeedToast >= AVOIDED_MAX
                    ? `Avoided ×${AVOIDED_MAX} — the counter stops here · moved to the end of the queue`
                    : `Avoided ×${quasiNeedToast} · moved to the end of the queue`
                }
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Idea 100: StandBy, over everything on Focus but the two notes that
          ask him something (halfway, below; the away card, App's). */}
      {standBy.shown && (
        <StandByLayer
          seconds={timeLeft}
          title={activeTask.title}
          running={isRunning}
          night={standBy.night}
          onWake={standBy.wake}
        />
      )}

      {/* Idea 103: halfway, at the top, where the away card would be. */}
      <MomentLane top>
        <AnimatePresence>
          {halfway !== null && (
            <motion.div
              key={activeTask.id}
              initial={{ opacity: 0, y: -14, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -14, scale: 0.97 }}
              style={{ pointerEvents: 'auto' }}
            >
              <HalfwayNote
                title={activeTask.title}
                drain={halfway}
                onYes={() => run.seeHalfway(activeTask.id)}
                onSwitch={tasks.length > 1 ? openSwitch : undefined}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </MomentLane>

      {switching && (
        <SwitchPicker
          tasks={tasks.slice(1).map((t) => ({ id: t.id, title: t.title, seconds: taskFocusSeconds(t) }))}
          onPick={switchTo}
          onClose={() => { setSwitching(false); run.resume(); }}
        />
      )}

      <CaptureModal
        isOpen={isCapturing}
        onClose={() => setIsCapturing(false)}
        onCaptured={run.captureIdea}
      />
    </div>
  );
}
