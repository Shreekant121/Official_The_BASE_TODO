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
  useFocusRun, subjectOf, taskSecondsLeft, sessionSecondsLeft, finishHead,
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
    begun: false, settleUntil: null, taskBegun: false, taskSince: 0, intent: '',
    away: null, halfwaySeenFor: null,
    pauses: 0, closed: [], stepsTicked: 0, ideasCaptured: 0,
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

  it('carries the snapshot fields a log entry needs, and no skill (FIX-12)', () => {
    run().attach(subjectOf(task({ skillId: 'sk1' })), 600, 14400);
    run().resume();
    advance(60);
    run().pause();
    expect(log()[0]).toMatchObject({ listId: 'l1' });
    expect(log()[0]).not.toHaveProperty('skillId');
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

// ─── 5. 29-1P10a: the breath, and what done looks like ───────────────────────

describe('the breath before a session (idea 95)', () => {
  it('holds the clock for five seconds on the first Start, then runs it', () => {
    run().attach(subjectOf(task()), 1500, 14400);
    run().start();
    expect(run().running).toBe(false);
    expect(run().settleUntil).toBe(START + 5000);

    /* FocusRunHost's timer is what starts it; the store only says when. */
    advance(5);
    run().resume();
    expect(run().running).toBe(true);
    expect(run().settleUntil).toBeNull();
    /* The breath is not focus: the clock starts full. */
    expect(taskSecondsLeft(run())).toBe(1500);
  });

  it('a second press during the breath skips it', () => {
    run().attach(subjectOf(task()), 1500, 14400);
    run().start();
    run().start();
    expect(run().running).toBe(true);
    expect(run().settleUntil).toBeNull();
  });

  it('breathes once a session — not after a pause, not on the next task', () => {
    run().attach(subjectOf(task()), 1500, 14400);
    run().start();
    run().resume();
    run().pause();
    run().start();
    expect(run().running).toBe(true);

    run().attach(subjectOf(task({ id: 't2' })), 600, 14400);
    run().pause();
    run().start();
    expect(run().running).toBe(true);
    expect(run().settleUntil).toBeNull();
  });

  it('breathes again once the session is cleared and a new one starts', () => {
    run().attach(subjectOf(task()), 1500, 14400);
    run().start();
    run().resume();
    run().clear();
    run().attach(subjectOf(task()), 1500, 14400);
    run().start();
    expect(run().running).toBe(false);
    expect(run().settleUntil).not.toBeNull();
  });
});

describe('what done looks like (idea 96)', () => {
  it('keeps the line and the answer on the last stretch only', () => {
    run().attach(subjectOf(task()), 1500, 14400);
    run().setIntent('  uploaded the   signed forms ');
    run().resume();
    advance(300);
    run().pause();
    run().resume();
    advance(200);
    run().finish('partly');

    expect(log()).toHaveLength(2);
    expect(log()[0].intent).toBeUndefined();
    expect(log()[1]).toMatchObject({ seconds: 200, intent: 'uploaded the signed forms', outcome: 'partly' });
    expect(run().intent).toBe('');
  });

  it('finds the last stretch when the clock was already paused', () => {
    run().attach(subjectOf(task()), 1500, 14400);
    run().setIntent('sent the draft');
    run().resume();
    advance(120);
    run().pause();
    run().finish('yes');
    expect(log()[0]).toMatchObject({ intent: 'sent the draft', outcome: 'yes' });
  });

  it('keeps the line when the task leaves the clock unfinished, and starts the next one blank', () => {
    run().attach(subjectOf(task()), 1500, 14400);
    run().setIntent('sent the draft');
    run().resume();
    advance(60);
    run().attach(subjectOf(task({ id: 't2' })), 600, 14400);

    expect(log()[0]).toMatchObject({ taskId: 't1', intent: 'sent the draft' });
    expect(log()[0].outcome).toBeUndefined();
    expect(run().intent).toBe('');
    /* The next task's clock is running, so it has begun; nothing is asked. */
    expect(run().taskBegun).toBe(true);
  });

  it('never reaches back into an earlier run of the same task', () => {
    useStore.setState({
      focusLog: [{ id: 'old', taskId: 't1', taskTitle: 'x', seconds: 60, startedAt: START - 99_000, endedAt: START - 39_000 }],
    });
    run().attach(subjectOf(task()), 1500, 14400);
    run().setIntent('sent the draft');
    run().finish('yes');
    expect(log()[0].intent).toBeUndefined();
  });
});

// ─── 29-1P10b: the minutes he was away ───────────────────────────────────────

describe('away (idea 101)', () => {
  /** Go away for `seconds`, the way the tab does: a checkpoint as it hides, the card's note as it comes back. */
  function goAway(seconds: number) {
    run().checkpoint();
    const from = Date.now();
    advance(seconds);
    run().noteAway(from, Date.now());
  }

  it('writes nothing for the minutes until he answers', () => {
    run().attach(subjectOf(task()), 1500, 14400);
    run().resume();
    advance(300);
    goAway(240);
    expect(log().map((e) => e.seconds)).toEqual([300]);
    expect(run().away).toMatchObject({ task: { id: 't1' } });
  });

  it('counted, they are one stretch of their own, and the clock is untouched', () => {
    run().attach(subjectOf(task()), 1500, 14400);
    run().resume();
    advance(300);
    goAway(240);
    advance(60);
    run().answerAway(true);
    run().pause();
    expect(log().map((e) => e.seconds).sort((a, b) => a - b)).toEqual([60, 240, 300]);
    expect(taskSecondsLeft(run())).toBe(1500 - 600);
    expect(run().away).toBeNull();
  });

  it('not counted, they are never written and go back on both clocks', () => {
    run().attach(subjectOf(task()), 1500, 14400);
    run().resume();
    advance(300);
    goAway(240);
    advance(60);
    run().answerAway(false);
    advance(30);
    run().pause();
    expect(log().map((e) => e.seconds)).toEqual([300, 60, 30]);
    expect(taskSecondsLeft(run())).toBe(1500 - 300 - 90);
    expect(sessionSecondsLeft(run())).toBe(14400 - 300 - 90);
  });

  it('a pause before the answer banks around them, and the answer still decides', () => {
    run().attach(subjectOf(task()), 1500, 14400);
    run().resume();
    advance(100);
    goAway(200);
    advance(50);
    run().pause();
    expect(log().map((e) => e.seconds)).toEqual([100, 50]);
    run().answerAway(false);
    expect(log()).toHaveLength(2);
    expect(taskSecondsLeft(run())).toBe(1500 - 150);
  });

  it('gives the task clock back only while it is still that task', () => {
    run().attach(subjectOf(task()), 1500, 14400);
    run().resume();
    goAway(180);
    run().attach(subjectOf(task({ id: 't2' })), 600, 14400);
    run().answerAway(false);
    expect(taskSecondsLeft(run())).toBe(600);
    expect(sessionSecondsLeft(run())).toBe(14400);
  });

  it('counts them when the session ends unanswered', () => {
    run().attach(subjectOf(task()), 1500, 14400);
    run().resume();
    goAway(180);
    run().clear();
    expect(log().map((e) => e.seconds)).toEqual([180]);
  });

  it('a second time away counts the first and holds the second', () => {
    run().attach(subjectOf(task()), 1500, 14400);
    run().resume();
    goAway(150);
    advance(20);
    goAway(400);
    expect(log().map((e) => e.seconds).sort((a, b) => a - b)).toEqual([20, 150]);
    run().answerAway(false);
    expect(log()).toHaveLength(2);
    expect(taskSecondsLeft(run())).toBe(1500 - 170);
  });

  it('is not held when the clock was not running', () => {
    run().attach(subjectOf(task()), 1500, 14400);
    run().noteAway(Date.now() - 300_000, Date.now());
    expect(run().away).toBeNull();
  });
});

// ─── Mark done from anywhere (29-1P11b) ──────────────────────────────────────
describe('finishHead, Mark done for Focus and the pill', () => {
  const second = () => task({ id: 't2', title: 'Send the invoice', order: 1 });

  function queueOf(...tasks: Task[]) {
    useStore.setState({ backlogTasks: tasks, tasks });
    run().attach(subjectOf(tasks[0]), 1500, 14400);
  }

  it('closes the head, moves the queue on and reports the minutes it took', () => {
    queueOf(task({ allocatedTime: 1500 }), second());
    run().resume();
    advance(600);
    const closed = finishHead();
    expect(closed).toEqual({ id: 't1', title: 'Write the proposal', allocated: 1500, used: 600, last: false });
    expect(useStore.getState().backlogTasks.find((t) => t.id === 't1')?.status).toBe('completed');
    expect(useStore.getState().tasks.map((t) => t.id)).toEqual(['t2']);
    expect(log()).toHaveLength(1);
    expect(log()[0].seconds).toBe(600);
    /* Mark done is not one of his pauses. */
    expect(run().pauses).toBe(0);
  });

  it('says when it closed the last task', () => {
    queueOf(task({ allocatedTime: 1500 }));
    expect(finishHead()?.last).toBe(true);
    expect(useStore.getState().tasks).toEqual([]);
  });

  it('closes nothing while the task waits on another', () => {
    queueOf(task({ dependsOn: ['t2'] }), second());
    expect(finishHead()).toBeNull();
    expect(useStore.getState().backlogTasks.find((t) => t.id === 't1')?.status).toBe('needsAction');
    expect(useStore.getState().tasks).toHaveLength(2);
  });
});

// ─── "Session done" reads the run (FIX-14) ───────────────────────────────────
describe("the session's tally for Session done", () => {
  const second = () => task({ id: 't2', title: 'Send the invoice', order: 1 });

  it('records every close in order, wherever it was pressed, and keeps it through clear', () => {
    const first = task({ allocatedTime: 1500 });
    const next = task({ id: 't2', title: 'Send the invoice', order: 1, allocatedTime: 1800 });
    useStore.setState({ backlogTasks: [first, next], tasks: [first, next] });
    run().attach(subjectOf(first), 1500, 14400);
    run().resume();
    advance(600);
    finishHead();
    /* What FocusRunHost does when the queue moves under a run he is not looking at. */
    run().attach(subjectOf(next), 1800, 14400);
    run().resume();
    advance(300);
    expect(finishHead()?.last).toBe(true);
    expect(run().closed).toEqual([
      { id: 't1', title: 'Write the proposal', allocated: 1500, used: 600 },
      { id: 't2', title: 'Send the invoice', allocated: 1800, used: 300 },
    ]);
    /* The queue emptied, so the host ends the session; the card is drawn after. */
    run().clear();
    expect(run().task).toBeNull();
    expect(run().closed.map((c) => c.id)).toEqual(['t1', 't2']);
  });

  it('keeps the counts through clear and zeroes all four when a new session starts', () => {
    useStore.setState({ backlogTasks: [task()], tasks: [task()] });
    run().attach(subjectOf(task()), 1500, 14400);
    run().resume();
    run().tickStep(true);
    run().tickStep(true);
    run().captureIdea();
    run().pause(true);
    finishHead();
    run().clear();
    expect(run()).toMatchObject({ pauses: 1, stepsTicked: 2, ideasCaptured: 1 });
    expect(run().closed).toHaveLength(1);

    run().attach(subjectOf(second()), 1500, 14400);
    expect(run()).toMatchObject({ pauses: 0, stepsTicked: 0, ideasCaptured: 0, closed: [] });
  });

  it('takes an untick back off the count, never below zero', () => {
    run().tickStep(true);
    run().tickStep(false);
    run().tickStep(false);
    expect(run().stepsTicked).toBe(0);
  });

  it('records nothing when Mark done closes nothing', () => {
    useStore.setState({ backlogTasks: [task({ dependsOn: ['t2'] }), second()], tasks: [task({ dependsOn: ['t2'] })] });
    run().attach(subjectOf(task()), 1500, 14400);
    expect(finishHead()).toBeNull();
    expect(run().closed).toEqual([]);
  });
});
