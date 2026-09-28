/**
 * **The focus session, now that it outlives the screen** (BUILD-1).
 *
 * `FocusMode` used to own the clock, so every one of these behaviours was
 * settled by a component that unmounted on the next navigation — and none of
 * it was tested, because none of it could be: the state died with the render.
 * It is a store now, which makes the four things that can go silently wrong
 * assertable. They are silent in the same way: **a wrong number here is a
 * wrong number in the focus log**, which is data he keeps, and nothing on
 * screen reveals it until he opens the analytics weeks later.
 *
 *   1. **The clock is a deadline, not a counter.** The whole reason for the
 *      rewrite. The assertion that matters is that time passing with nothing
 *      ticking still moves the readout — a counter would read the same after
 *      an hour behind a locked screen, which is exactly what the tablet does.
 *   2. **Every stop banks exactly one stretch, measured on the wall clock.**
 *      Pause, a task change and clearing the session all close the open
 *      stretch; a double press must not write it twice.
 *   3. **A same-task re-seed must not touch the stretch.** Editing the time
 *      allocated to a task he is working on re-seeds the countdown — and if
 *      that also reopened the stretch, the minutes already worked would be
 *      thrown away rather than banked.
 *   4. **The session window survives a task change.** Re-seeding it per task
 *      would hand him a fresh four hours every time one closed, which is the
 *      one number on that screen nobody would think to re-check.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore, type Task } from './useStore';
import {
  useFocusRun, subjectOf, taskSecondsLeft, sessionSecondsLeft,
} from './useFocusRun';

const START = new Date('2026-09-15T09:00:00Z').getTime();

function task(over: Partial<Task> = {}): Task {
  return { id: 't1', title: 'Write the proposal', status: 'needsAction', listId: 'l1', order: 0, ...over };
}

const run = () => useFocusRun.getState();
const log = () => useStore.getState().focusLog;

/** Move the wall clock on. Nothing in the run is on a timer, so this is all it takes. */
function advance(seconds: number) {
  vi.setSystemTime(new Date(Date.now() + seconds * 1000));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(START));
  useStore.setState({ projects: [], taskLists: [], backlogTasks: [], tasks: [], focusLog: [] });
  useFocusRun.setState({
    task: null, running: false, allocated: 0, sessionAllocated: 0,
    taskZeroAt: 0, taskLeft: 0, sessionZeroAt: 0, sessionLeft: 0,
    segmentStartedAt: null, runningSince: null, muted: false,
  });
});

// ─── 1. The clock ────────────────────────────────────────────────────────────

describe('the countdowns', () => {
  it('starts paused, holding the full allocation', () => {
    run().attach(subjectOf(task()), 1500, 14400);
    expect(run().running).toBe(false);
    expect(taskSecondsLeft(run())).toBe(1500);
    expect(sessionSecondsLeft(run())).toBe(14400);
  });

  it('counts down on the wall clock, with nothing ticking', () => {
    run().attach(subjectOf(task()), 1500, 14400);
    run().resume();

    /* No timer has fired and no action has been dispatched — the only thing
       that happened is that time passed. A decremented counter would still
       read 1500 here, which is the bug behind a locked tablet. */
    advance(600);
    expect(taskSecondsLeft(run())).toBe(900);
    expect(sessionSecondsLeft(run())).toBe(13800);
  });

  it('is not clamped at zero — an overrun keeps counting', () => {
    run().attach(subjectOf(task()), 60, 14400);
    run().resume();
    advance(90);
    expect(taskSecondsLeft(run())).toBe(-30);
  });

  it('freezes where it was when paused, and resumes from there', () => {
    run().attach(subjectOf(task()), 1500, 14400);
    run().resume();
    advance(300);
    run().pause();

    advance(3600); // an hour doing something else entirely
    expect(taskSecondsLeft(run())).toBe(1200);

    run().resume();
    advance(200);
    expect(taskSecondsLeft(run())).toBe(1000);
  });

  it('+5m moves the deadline while running and the frozen value while paused', () => {
    run().attach(subjectOf(task()), 600, 14400);
    run().addTaskSeconds(300);
    expect(taskSecondsLeft(run())).toBe(900);

    run().resume();
    run().addTaskSeconds(300);
    expect(taskSecondsLeft(run())).toBe(1200);
  });
});

// ─── 2. What reaches the focus log ───────────────────────────────────────────

describe('the focus log', () => {
  it('banks one stretch on pause, measured on the wall clock', () => {
    run().attach(subjectOf(task()), 1500, 14400);
    run().resume();
    advance(742);
    run().pause();

    expect(log()).toHaveLength(1);
    expect(log()[0]).toMatchObject({ taskId: 't1', taskTitle: 'Write the proposal', seconds: 742 });
  });

  it('carries the snapshot fields a log entry needs', () => {
    run().attach(subjectOf(task({ tags: ['deep'], skillId: 'sk1' })), 600, 14400);
    run().resume();
    advance(60);
    run().pause();
    expect(log()[0]).toMatchObject({ listId: 'l1', tags: ['deep'], skillId: 'sk1' });
  });

  it('does not bank the same stretch twice', () => {
    run().attach(subjectOf(task()), 600, 14400);
    run().resume();
    advance(120);
    run().pause();
    run().pause();
    expect(log()).toHaveLength(1);
  });

  it('ignores a mis-tap on pause/resume', () => {
    run().attach(subjectOf(task()), 600, 14400);
    run().resume();
    run().pause();
    expect(log()).toHaveLength(0);
  });

  it('banks the outgoing task before the next one starts counting', () => {
    run().attach(subjectOf(task()), 600, 14400);
    run().resume();
    advance(200);

    /* Smart Sort, a defer, or a queue rebuilt from the tablet: the head
       changes under a running session. */
    run().attach(subjectOf(task({ id: 't2', title: 'Review the draft' })), 900, 14400);

    expect(log()).toHaveLength(1);
    expect(log()[0]).toMatchObject({ taskId: 't1', seconds: 200 });
    /* Still running, on the new task, from its own allocation. */
    expect(run().running).toBe(true);
    expect(taskSecondsLeft(run())).toBe(900);
  });

  it('keeps the stretch open when only the allocation changed', () => {
    run().attach(subjectOf(task()), 600, 14400);
    run().resume();
    advance(300);

    /* He set a new time on the card. The countdown re-seeds; the five minutes
       already worked must still be owed to the log rather than discarded. */
    run().attach(subjectOf(task()), 1800, 14400);
    expect(log()).toHaveLength(0);
    expect(taskSecondsLeft(run())).toBe(1800);

    run().pause();
    expect(log()[0]).toMatchObject({ taskId: 't1', seconds: 300 });
  });

  it('checkpoints without double-counting — the tab going to the background', () => {
    run().attach(subjectOf(task()), 3600, 14400);
    run().resume();
    advance(100);
    run().checkpoint();
    advance(50);
    run().pause();

    expect(log().map((e) => e.seconds)).toEqual([100, 50]);
  });

  it('banks what is owed when the session ends', () => {
    run().attach(subjectOf(task()), 600, 14400);
    run().resume();
    advance(400);
    run().clear();

    expect(log()[0]).toMatchObject({ seconds: 400 });
    expect(run().task).toBeNull();
    expect(run().running).toBe(false);
  });
});

// ─── 3. The session window ───────────────────────────────────────────────────

describe('the session window', () => {
  it('survives a task change', () => {
    run().attach(subjectOf(task()), 600, 14400);
    run().resume();
    advance(600);
    run().attach(subjectOf(task({ id: 't2' })), 600, 14400);

    /* Ten minutes of the four hours are gone and stay gone. */
    expect(sessionSecondsLeft(run())).toBe(13800);
  });

  it('re-seeds when the window itself changes', () => {
    run().attach(subjectOf(task()), 600, 14400);
    run().resume();
    advance(600);
    run().attach(subjectOf(task()), 600, 7200);
    expect(sessionSecondsLeft(run())).toBe(7200);
  });
});

// ─── 4. The mute, which is not the preference ────────────────────────────────

describe('mute', () => {
  it('is a property of the session and resets with it', () => {
    run().attach(subjectOf(task()), 600, 14400);
    run().toggleMuted();
    expect(run().muted).toBe(true);

    /* Muting one task is not a standing instruction about tomorrow. */
    run().clear();
    expect(run().muted).toBe(false);
  });

  it('survives a task change inside the same session', () => {
    run().attach(subjectOf(task()), 600, 14400);
    run().setMuted(true);
    run().attach(subjectOf(task({ id: 't2' })), 600, 14400);
    expect(run().muted).toBe(true);
  });
});
