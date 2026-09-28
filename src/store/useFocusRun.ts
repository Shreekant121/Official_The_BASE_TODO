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
 */
import { create } from 'zustand';
import { useStore } from './useStore';

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
  tags?: string[];
  skillId?: string;
}

/**
 * A queue task, reduced to what the run needs.
 *
 * The four optional fields are the ones `FocusLogEntry` snapshots, and they
 * are copied here for the reason that file gives for snapshotting them at all:
 * history has to stay meaningful after a task is moved between lists,
 * retagged, or deleted outright.
 */
export function subjectOf(task: {
  id: string; title: string; listId?: string; tags?: string[]; skillId?: string;
}): RunSubject {
  return {
    id: task.id,
    title: task.title,
    listId: task.listId,
    tags: task.tags,
    skillId: task.skillId,
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
  resume: () => void;
  pause: () => void;
  toggle: () => void;
  /** The +5m / +15m buttons. Moves the clock, never the log. */
  addTaskSeconds: (seconds: number) => void;
  /** No session any more: the queue emptied, or he started a new one. */
  clear: () => void;
  /** Bank what has accrued and re-open the stretch. For last-chance moments. */
  checkpoint: () => void;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
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
  const seconds = Math.round((now - startedAt) / 1000);
  /* A sub-second stretch is a mis-tap on pause/resume, not work. */
  if (seconds < 1) return;
  useStore.getState().addFocusLog({
    taskId: state.task.id,
    taskTitle: state.task.title,
    listId: state.task.listId,
    tags: state.task.tags,
    skillId: state.task.skillId,
    seconds,
    startedAt,
    endedAt: now,
  });
}

const EMPTY = {
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

    if (!same && !fresh) bank(state, now);

    const running = fresh ? false : state.running;
    const patch: Partial<FocusRunState> = {
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

  resume: () => {
    const state = get();
    if (!state.task || state.running) return;
    const now = Date.now();
    set({
      running: true,
      taskZeroAt: now + state.taskLeft * 1000,
      sessionZeroAt: now + state.sessionLeft * 1000,
      segmentStartedAt: now,
      runningSince: now,
    });
  },

  pause: () => {
    const state = get();
    if (!state.task || !state.running) return;
    const now = Date.now();
    bank(state, now);
    set({
      running: false,
      taskLeft: taskSecondsLeft(state, now),
      sessionLeft: sessionSecondsLeft(state, now),
      segmentStartedAt: null,
      runningSince: null,
    });
  },

  toggle: () => {
    if (get().running) get().pause();
    else get().resume();
  },

  addTaskSeconds: (seconds) => {
    const state = get();
    if (!state.task) return;
    set(state.running
      ? { taskZeroAt: state.taskZeroAt + seconds * 1000 }
      : { taskLeft: state.taskLeft + seconds });
  },

  clear: () => {
    const state = get();
    if (!state.task) return;
    bank(state, Date.now());
    set({ ...EMPTY });
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
}));
