/**
 * A real break and the run (29-1P11a, idea 104). His call that matters most
 * here: **break time does not count** — a break pauses the run, so nothing is
 * banked while he rests — and it is not one of his pauses on the "Session
 * done" card (idea 105).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore, type Task } from './useStore';
import { useFocusRun, subjectOf, taskSecondsLeft } from './useFocusRun';
import { useFocusBreak } from './useFocusBreak';

const START = new Date('2026-10-15T09:00:00Z').getTime();
const task: Task = { id: 't1', title: 'Write the proposal', status: 'needsAction', listId: 'l1', order: 0 };
const run = () => useFocusRun.getState();
const brk = () => useFocusBreak.getState();
const advance = (seconds: number) => vi.setSystemTime(new Date(Date.now() + seconds * 1000));
const five = () => 5;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(START));
  useStore.setState({ projects: [], taskLists: [], backlogTasks: [], tasks: [], focusLog: [] });
  run().clear();
  useFocusRun.setState({ pauses: 0 });
  useFocusBreak.setState({ offer: null, breakOn: null, taken: 0 });
  run().attach(subjectOf(task), 3600, 14400);
  run().resume();
});

describe('a break', () => {
  it('pauses the run, banks the work before it and nothing during it', () => {
    advance(25 * 60);
    brk().offerBreak();
    brk().startBreak(five, 's1');
    expect(run().running).toBe(false);
    const banked = useStore.getState().focusLog.reduce((n, e) => n + e.seconds, 0);
    expect(banked).toBe(25 * 60);
    advance(5 * 60);
    brk().breakOver();
    brk().endBreak();
    expect(run().running).toBe(true);
    /* The task clock waited through the break. */
    expect(taskSecondsLeft(run())).toBe(3600 - 25 * 60);
    expect(useStore.getState().focusLog.reduce((n, e) => n + e.seconds, 0)).toBe(25 * 60);
  });

  it('is not one of his pauses; his own press is', () => {
    brk().startBreak(five, null);
    brk().endBreak();
    expect(run().pauses).toBe(0);
    run().toggle();
    expect(run().pauses).toBe(1);
  });

  it('starts a fresh block when it ends, and when he keeps going instead', () => {
    advance(25 * 60);
    brk().offerBreak();
    brk().keepGoing();
    expect(brk().offer).toBeNull();
    expect(run().runningSince).toBe(Date.now());
    advance(60);
    brk().startBreak(five, null);
    advance(300);
    brk().endBreak();
    expect(run().runningSince).toBe(Date.now());
  });

  it('makes every fourth one long, and offers once until answered', () => {
    for (let i = 0; i < 3; i += 1) {
      brk().offerBreak();
      expect(brk().offer?.long).toBe(false);
      brk().startBreak(five, null);
      brk().endBreak();
    }
    brk().offerBreak();
    expect(brk().offer?.long).toBe(true);
    const offered = brk().offer;
    brk().offerBreak();
    expect(brk().offer).toBe(offered);
  });

  it('runs on his minutes, and +2 min moves its end', () => {
    brk().startBreak((long) => (long ? 15 : 5), null);
    expect(brk().breakOn?.endsAt).toBe(START + 5 * 60_000);
    brk().addBreakTime();
    expect(brk().breakOn?.endsAt).toBe(START + 7 * 60_000);
  });

  it('starts two more minutes from now on a break that is over', () => {
    brk().startBreak(five, null);
    advance(10 * 60);
    brk().breakOver();
    brk().addBreakTime();
    expect(brk().breakOn).toMatchObject({ over: false, endsAt: Date.now() + 120_000 });
  });

  it('can be taken with no session (Session done’s Break), and ends without one', () => {
    run().clear();
    brk().startBreak(five, null);
    expect(brk().breakOn).not.toBeNull();
    brk().endBreak();
    expect(brk().breakOn).toBeNull();
    expect(run().task).toBeNull();
  });
});

describe('Session done’s pauses', () => {
  it('survive the queue emptying, and a new session starts them at zero', () => {
    run().pause(true);
    run().resume();
    run().pause(true);
    run().clear();
    expect(run().pauses).toBe(2);
    run().attach(subjectOf(task), 1500, 14400);
    expect(run().pauses).toBe(0);
  });

  it('do not count a pause that is not his press', () => {
    run().pause();
    expect(run().pauses).toBe(0);
  });
});
