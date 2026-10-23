/**
 * The running focus session — the one thing that outlives the Focus screen.
 *
 * BUILD-1 asked for a mini-player in the nav that shows *"the focus session
 * going on"* from any screen, and for the noise to keep playing while he
 * checks a project (his Q8). Both sentences say the same thing about state:
 * **a session cannot live inside `FocusMode`**, which unmounts the moment he
 * navigates. Until now it did — `isRunning`, `timeLeft` and `sessionTimeLeft`
 * were `useState` in that component, so leaving the screen silently stopped
 * the clock and returning re-seeded it from the task's allocation. Shreekant
 * chose the other behaviour on 2026-09-15, asked directly: *"the clock keeps
 * counting, the noise keeps playing, and the time still gets logged against
 * that task — even while you're looking at a project or Settings."*
 *
 * WHY DEADLINES AND NOT A COUNTER
 * -------------------------------
 * The old screen decremented a number on a `setInterval`. That was survivable
 * while the clock only existed on a screen you were looking at; it is not
 * survivable now. A browser throttles `setInterval` in a hidden tab to about
 * once a minute, and **Android suspends it outright behind the lock screen** —
 * so a counter would come back from a twenty-minute walk reading two minutes
 * spent. This store instead records the wall-clock moment each clock reaches
 * zero (`taskZeroAt`, `sessionZeroAt`) and derives the remaining seconds from
 * `Date.now()` on read. Nothing has to tick for the answer to be right; the
 * one-second interval in the components is only there to repaint.
 *
 * Neither clock is clamped at zero, which is the rule the screen already
 * followed: an overrun is a fact worth reporting, so the readouts show `+MM:SS`
 * rather than parking on 00:00.
 *
 * THE FOCUS LOG MOVED IN HERE WITH IT
 * -----------------------------------
 * `segmentStartedAt` is the open stretch of work — what `FocusMode`'s
 * `segmentRef` used to be. It had to move for the same reason the clock did:
 * the component banked its stretch on unmount, so a session that now survives
 * a route change would have stopped being *recorded* at the exact moment it
 * started being interesting. Measured against `Date.now()`, never against the
 * countdown, because the countdown is also moved by the +5m / +15m buttons.
 *
 * `runningSince` looks like a duplicate of it and is not. The pomodoro cycle
 * is anchored to the moment he pressed play; `segmentStartedAt` is re-opened
 * every time the app checkpoints itself (a tab going to the background), and
 * an anchor that moved with it would restart his focus block every time he
 * glanced at something else.
 *
 * 29-1P10a — THE BREATH, AND THE LINE
 * -----------------------------------
 * **A session starts with one breath (idea 95).** His call, 2026-10-14: at the
 * start of a session only — not after a pause, not when the next task comes
 * up. `start` is that press: on a session that has never run (`begun`) it
 * sets `settleUntil` five seconds out and the clock does NOT run yet; the
 * clock starts at that moment (`FocusRunHost` holds the timer, so leaving the
 * screen mid-breath still starts it) or at once on Skip. `resume` stays the
 * plain "carry on" every other play button uses.
 *
 * **"When this ends, I'll have…" (idea 96)** is `intent`, held here for the
 * task on the clock and cleared with it. It reaches the synced log only when
 * the task leaves the clock, onto the last stretch banked for it — never on
 * every stretch (`lib/focusIntent.ts` has the arithmetic). `finish` is Mark
 * done's half: it banks the last stretch with the answer.
 *
 * 29-1P10b — THE MINUTES HE WAS AWAY ARE HELD, NOT WRITTEN
 * --------------------------------------------------------
 * **"You were away 4 min" (idea 101)** offers to take the minutes off. The
 * focus log cannot lose an entry — `mergeFocusLogs` is a union, so a removed
 * entry comes back with the next copy from the cloud — so the away minutes
 * are never written until he answers. `noteAway` holds them in `away`; every
 * bank writes either side of them and never across; `answerAway(true)` writes
 * them as their own stretch, and `answerAway(false)` writes nothing and gives
 * them back to the clocks (his call: off his hours AND back on the
 * countdown). A session that ends with the card unanswered counts them: the
 * card said the timer kept going.
 *
 * **"Halfway. Still on it?" (idea 103)** needs only to know he answered it
 * for this task, `halfwaySeenFor`; when it shows is `lib/focusMoments.ts`.
 *
 * FIX-14 — "SESSION DONE" READS THE RUN
 * -------------------------------------
 * The card's tasks and counts (`closed`, `stepsTicked`, `ideasCaptured`,
 * `pauses`) are the session's, so they live here: they were `FocusMode`'s
 * `useState`, which forgot them whenever he left Focus mid-session and never
 * heard about a task the pill's panel closed. `finishHead` writes `closed`,
 * so every Mark done records. All four are kept through `clear`, because the
 * card is drawn after the queue empties, and zeroed when a new session
 * attaches. In memory only, like the rest of the run: never persisted, never
 * synced.
 */
import { create } from 'zustand';
import { useStore, taskFocusSeconds, taskLockReason } from './useStore';
import { SETTLE_MS, stampFocusEntry, type FocusOutcome } from '../lib/focusIntent';

/**
 * What the run needs to know about the task it is on: enough to draw the pill
 * and to write a `FocusLogEntry` without going back to the queue for it.
 *
 * A *snapshot*, like the log entry itself — the queue's own copy of a task can
 * be deleted out from under a run that is still owed its last stretch.
 */
export interface RunSubject {
  id: string;
  title: string;
  listId?: string;
}

/**
 * A queue task, reduced to what the run needs.
 *
 * The optional fields are the ones `FocusLogEntry` snapshots, and they
 * are copied here for the reason that file gives for snapshotting them at all:
 * history has to stay meaningful after a task is moved between lists or
 * deleted outright.
 */
export function subjectOf(task: {
  id: string; title: string; listId?: string;
}): RunSubject {
  return {
    id: task.id,
    title: task.title,
    listId: task.listId,
  };
}

export interface FocusRunState {
  /** The task being worked on. `null` means there is no session at all. */
  task: RunSubject | null;
  running: boolean;
  /** The allocation this run was seeded with. A changed one re-seeds. */
  allocated: number;
  /** The session window this run was seeded with. Same rule. */
  sessionAllocated: number;
  /** Epoch ms at which the task clock reaches zero. Live only while running. */
  taskZeroAt: number;
  /** Seconds left on the task clock. Authoritative while paused. */
  taskLeft: number;
  sessionZeroAt: number;
  sessionLeft: number;
  /** The open stretch of work, epoch ms, or `null` when nothing is running. */
  segmentStartedAt: number | null;
  /** When he last pressed play. The pomodoro cycle's anchor — see the header. */
  runningSince: number | null;
  /** He silenced the noise from the nav pill. Not the same as turning it off. */
  muted: boolean;
  /** This session's clock has run at least once — the breath is behind it. */
  begun: boolean;
  /** Epoch ms the clock starts at, while the session's one breath plays. */
  settleUntil: number | null;
  /** This task's clock has run at least once in this run. */
  taskBegun: boolean;
  /** When this task came onto the clock. The log entries that are this run's. */
  taskSince: number;
  /** "When this ends, I'll have…" for the task on the clock. Empty: not written. */
  intent: string;
  /** Minutes he was away, held until he says whether they count (idea 101). */
  away: AwayHeld | null;
  /** The task whose halfway note he answered (idea 103). */
  halfwaySeenFor: string | null;
  /**
   * His pause presses this session, for the "Session done" card (29-1P11a,
   * idea 105). Kept through `clear`, because the card is drawn after the
   * queue empties; a new session starts it at zero.
   */
  pauses: number;
  /** The tasks this session closed, in order — the strip's done segments and the card's list. */
  closed: SessionClosed[];
  /** Steps he ticked on Focus this session; an untick takes one back. */
  stepsTicked: number;
  /** Ideas he captured on Focus this session. */
  ideasCaptured: number;

  /**
   * "The run is now on this task, with this allocation, inside this session."
   *
   * Idempotent, and called from two places that must not fight: `FocusMode`
   * while it is mounted, and `FocusRunHost` when the queue moves under a run
   * he is not looking at. Re-seeds the task clock when the task or its
   * allocation changed, keeps `running` so Smart Sort does not stop the
   * session, and banks the outgoing task's stretch before its clock is
   * replaced.
   */
  attach: (task: RunSubject, allocated: number, sessionAllocated: number) => void;
  /**
   * The Start press on Focus (and `startQueue`): the session's one breath when
   * it has never run, else the same as `resume`. Pressed during the breath, it
   * skips it.
   */
  start: () => void;
  resume: () => void;
  /**
   * Stops the clock. `byHim` counts it on the "Session done" card: his own
   * press on a pause button. Mark done, Skip, Switch and a break stop the
   * clock too, and none of those is a pause.
   */
  pause: (byHim?: boolean) => void;
  /** A fresh pomodoro block from now, the clock still running ("Keep going", 29-1P11a). */
  restartBlock: () => void;
  /** Mark done after his answer: bank the last stretch with it, and the line. */
  finish: (outcome?: FocusOutcome) => void;
  setIntent: (intent: string) => void;
  toggle: () => void;
  /** The +5m / +15m buttons. Moves the clock, never the log. */
  addTaskSeconds: (seconds: number) => void;
  /** No session any more: the queue emptied, or he started a new one. */
  clear: () => void;
  /** Bank what has accrued and re-open the stretch. For last-chance moments. */
  checkpoint: () => void;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
  /** He was away from `from` to `to` with the clock running: hold it for the card. */
  noteAway: (from: number, to: number) => void;
  /** The card's answer: count the minutes, or take them off and back onto the clocks. */
  answerAway: (count: boolean) => void;
  /** He answered the halfway note for this task. */
  seeHalfway: (taskId: string) => void;
  /** A step ticked (or unticked) on Focus, for the card's count. */
  tickStep: (done: boolean) => void;
  /** An idea captured on Focus, for the card's count. */
  captureIdea: () => void;
}

/** One task this session closed, for Focus's strip and "Session done". */
export interface SessionClosed {
  id: string;
  title: string;
  /** What it was given, in seconds. Sizes its segment in the strip. */
  allocated: number;
  /** What it actually took. */
  used: number;
}

/** A stretch he was away for, and the task that was on the clock then. */
export interface AwayHeld {
  from: number;
  to: number;
  task: RunSubject;
}

/** Seconds left on the task clock — negative once it has run over. */
export function taskSecondsLeft(state: FocusRunState, now: number = Date.now()): number {
  if (!state.task) return 0;
  return state.running ? Math.round((state.taskZeroAt - now) / 1000) : state.taskLeft;
}

/** Seconds left in the work session window. Negative is over. */
export function sessionSecondsLeft(state: FocusRunState, now: number = Date.now()): number {
  if (!state.task) return 0;
  return state.running ? Math.round((state.sessionZeroAt - now) / 1000) : state.sessionLeft;
}

/**
 * Closes the open stretch into the synced focus log.
 *
 * Deliberately not part of any `set` updater: it writes to a *different* store
 * and a state updater that reaches sideways is the kind of thing that works
 * until something calls it twice. Every action banks first, then sets.
 */
function bank(state: FocusRunState, now: number): void {
  const startedAt = state.segmentStartedAt;
  if (startedAt === null || !state.task) return;
  const { away } = state;
  /* Minutes he is still to answer for are his, not this stretch's: write
     either side of them, never across (see the header). */
  if (away && startedAt < away.to && now > away.from) {
    writeStretch(state.task, startedAt, Math.min(now, away.from));
    writeStretch(state.task, Math.max(startedAt, away.to), now);
    return;
  }
  writeStretch(state.task, startedAt, now);
}

function writeStretch(task: RunSubject, startedAt: number, endedAt: number): void {
  const seconds = Math.round((endedAt - startedAt) / 1000);
  /* A sub-second stretch is a mis-tap on pause/resume, not work. */
  if (seconds < 1) return;
  useStore.getState().addFocusLog({
    taskId: task.id,
    taskTitle: task.title,
    listId: task.listId,
    seconds,
    startedAt,
    endedAt,
  });
}

/**
 * Writes the task's line (and Mark done's answer) onto the last stretch this
 * run banked for it. Call it after `bank`, as the task leaves the clock. The
 * focus log is all it touches, so a raw `setState` records no undo and no
 * story line — neither is a thing he did to a task.
 */
function keepIntent(state: FocusRunState, outcome?: FocusOutcome): void {
  if (!state.task || (!state.intent && !outcome)) return;
  const { id } = state.task;
  const log = useStore.getState().focusLog;
  const next = stampFocusEntry(log, id, state.taskSince, { intent: state.intent, outcome });
  if (next !== log) useStore.setState({ focusLog: next });
}

/** What "Session done" reports, at the start of a session (see the header). */
const NEW_TALLY = {
  pauses: 0,
  closed: [] as SessionClosed[],
  stepsTicked: 0,
  ideasCaptured: 0,
};

const EMPTY = {
  ...NEW_TALLY,
  task: null,
  running: false,
  allocated: 0,
  sessionAllocated: 0,
  taskZeroAt: 0,
  taskLeft: 0,
  sessionZeroAt: 0,
  sessionLeft: 0,
  segmentStartedAt: null,
  runningSince: null,
  /* Reset with the session: muting one task's noise is not a standing
     instruction about the next session he sits down to. */
  muted: false,
  begun: false,
  settleUntil: null,
  taskBegun: false,
  taskSince: 0,
  intent: '',
  away: null,
  halfwaySeenFor: null,
} as const;

export const useFocusRun = create<FocusRunState>()((set, get) => ({
  ...EMPTY,

  attach: (task, allocated, sessionAllocated) => {
    const state = get();
    const now = Date.now();
    const fresh = state.task === null;
    const same = state.task?.id === task.id;

    if (same && state.allocated === allocated && state.sessionAllocated === sessionAllocated) {
      /* Nothing about the clocks moved — but the title can have been edited
         while the run was on it, and the pill is showing it. */
      if (state.task!.title === task.title) return;
      set({ task });
      return;
    }

    if (!same && !fresh) {
      bank(state, now);
      keepIntent(state);
    }

    const running = fresh ? false : state.running;
    const patch: Partial<FocusRunState> = {
      ...(fresh ? NEW_TALLY : {}),
      task,
      allocated,
      sessionAllocated,
      running,
      taskLeft: allocated,
      taskZeroAt: now + allocated * 1000,
    };

    /* A NEW task closes the old stretch and opens a fresh one. The same task
       with a new allocation must not: an edit to the time on a card would
       otherwise throw away the minutes already worked on it. */
    if (!same) {
      patch.segmentStartedAt = running ? now : null;
      /* The line was the outgoing task's; the new one has not been asked. */
      patch.intent = '';
      patch.taskBegun = running;
      patch.taskSince = now;
      patch.runningSince = running ? (state.runningSince ?? now) : null;
    }

    /* The session window survives everything except a new window. Re-seeding
       it on a task change would hand him four fresh hours per task. */
    if (fresh || state.sessionAllocated !== sessionAllocated) {
      patch.sessionLeft = sessionAllocated;
      patch.sessionZeroAt = now + sessionAllocated * 1000;
    }

    set(patch);
  },

  start: () => {
    const state = get();
    if (!state.task || state.running) return;
    if (state.begun || state.settleUntil !== null) {
      get().resume();
      return;
    }
    set({ settleUntil: Date.now() + SETTLE_MS });
  },

  resume: () => {
    const state = get();
    if (!state.task || state.running) return;
    const now = Date.now();
    set({
      begun: true,
      taskBegun: true,
      settleUntil: null,
      running: true,
      taskZeroAt: now + state.taskLeft * 1000,
      sessionZeroAt: now + state.sessionLeft * 1000,
      segmentStartedAt: now,
      runningSince: now,
    });
  },

  pause: (byHim = false) => {
    const state = get();
    if (!state.task || !state.running) return;
    const now = Date.now();
    bank(state, now);
    set({
      ...(byHim ? { pauses: state.pauses + 1 } : {}),
      running: false,
      taskLeft: taskSecondsLeft(state, now),
      sessionLeft: sessionSecondsLeft(state, now),
      segmentStartedAt: null,
      runningSince: null,
    });
  },

  toggle: () => {
    if (get().running) get().pause(true);
    else get().resume();
  },

  restartBlock: () => {
    if (get().running) set({ runningSince: Date.now() });
  },

  addTaskSeconds: (seconds) => {
    const state = get();
    if (!state.task) return;
    set(state.running
      ? { taskZeroAt: state.taskZeroAt + seconds * 1000 }
      : { taskLeft: state.taskLeft + seconds });
  },

  finish: (outcome) => {
    const state = get();
    if (!state.task) return;
    /* Pause's own banking first, so the stretch the answer lands on is the
       one that just closed; a paused clock has none, and the answer goes on
       the last stretch it did bank. */
    get().pause();
    keepIntent(get(), outcome);
    set({ intent: '' });
  },

  setIntent: (intent) => set({ intent }),

  clear: () => {
    const state = get();
    if (!state.task) return;
    bank(state, Date.now());
    keepIntent(state);
    /* Unanswered, the minutes count: the card said the timer kept going. */
    if (state.away) writeStretch(state.away.task, state.away.from, state.away.to);
    set({
      ...EMPTY,
      pauses: state.pauses,
      closed: state.closed,
      stepsTicked: state.stepsTicked,
      ideasCaptured: state.ideasCaptured,
    });
  },

  checkpoint: () => {
    const state = get();
    if (!state.running) return;
    const now = Date.now();
    bank(state, now);
    set({ segmentStartedAt: now });
  },

  setMuted: (muted) => set((state) => (state.muted === muted ? state : { muted })),
  toggleMuted: () => set((state) => ({ muted: !state.muted })),

  noteAway: (from, to) => {
    const state = get();
    if (!state.task || !state.running || to <= from) return;
    /* A second time away before he answered the first: the first counts.
       Not through `answerAway`, whose bank would run up to now, across the
       minutes being held here. */
    const old = state.away;
    if (old) {
      if (state.segmentStartedAt !== null && state.segmentStartedAt < old.to) {
        bank(state, from);
        set({ segmentStartedAt: from });
      }
      writeStretch(old.task, old.from, old.to);
    }
    set({ away: { from, to, task: state.task } });
  },

  answerAway: (count) => {
    const state = get();
    const { away } = state;
    if (!away) return;
    /* Bank the open stretch around the held minutes first, so whatever he
       answers, they are outside every stretch from here on. */
    if (state.running && state.segmentStartedAt !== null && state.segmentStartedAt < away.to) {
      const now = Date.now();
      bank(state, now);
      set({ segmentStartedAt: now });
    }
    if (count) {
      writeStretch(away.task, away.from, away.to);
      set({ away: null });
      return;
    }
    /* Not counted: off his hours (never written) and back on the clocks. The
       task's clock only while it is still that task's. */
    const ms = away.to - away.from;
    const seconds = Math.round(ms / 1000);
    const now = get();
    const sameTask = now.task?.id === away.task.id;
    set(now.running
      ? {
          away: null,
          sessionZeroAt: now.sessionZeroAt + ms,
          ...(sameTask ? { taskZeroAt: now.taskZeroAt + ms } : {}),
        }
      : {
          away: null,
          sessionLeft: now.sessionLeft + seconds,
          ...(sameTask ? { taskLeft: now.taskLeft + seconds } : {}),
        });
  },

  seeHalfway: (taskId) => set({ halfwaySeenFor: taskId }),

  tickStep: (done) => set((state) => ({ stepsTicked: Math.max(0, state.stepsTicked + (done ? 1 : -1)) })),
  captureIdea: () => set((state) => ({ ideasCaptured: state.ideasCaptured + 1 })),
}));

/** What Mark done closed (also written to `closed`), and whether the queue is now empty. */
export interface ClosedTask extends SessionClosed {
  last: boolean;
}

/**
 * Mark done on the task at the head of the queue, after his answer if he was
 * asked one. Focus's button and the pill's panel (29-1P11b) both press this,
 * so a task closed from another screen is closed exactly as Focus closes it.
 *
 * It reads the LIVE queue rather than a render's (Focus's `liveHead` note),
 * and re-checks the lock for the same reason: the button is disabled, but a
 * stale closure is not. `null` is "nothing was closed".
 */
export function finishHead(outcome?: FocusOutcome): ClosedTask | null {
  const store = useStore.getState();
  const queue = store.tasks;
  const current = queue[0];
  if (!current || taskLockReason(store.backlogTasks, current)) return null;
  const allocated = taskFocusSeconds(current);
  /* Stopping the run banks the stretch AND freezes the clock, so the figure
     read back below is this task's own final one. */
  useFocusRun.getState().finish(outcome);
  store.updateBacklogTask(current.id, { status: 'completed' });
  const left = useFocusRun.getState().taskLeft;
  const entry: SessionClosed = {
    id: current.id,
    title: current.title,
    allocated,
    used: Math.max(0, allocated - left),
  };
  /* Recorded before the queue moves: emptying it is what ends the session. */
  useFocusRun.setState((state) => ({ closed: [...state.closed, entry] }));
  useStore.getState().setTasks(queue.slice(1));
  return { ...entry, last: queue.length === 1 };
}
