/**
 * **The blocked-task lock** (item 19).
 *
 * `isTaskLocked` is one four-line function, and every screen in the app now
 * greys a row, disables a tick, refuses a status pill or turns off "Mark done"
 * on its answer — plus `complete_task`, so Atlas is inside the same rule. That
 * fan-out is the reason this file exists: a change to those four lines is a
 * change to six controls on five screens and one tool, and none of them would
 * fail loudly. A tick that quietly starts working again photographs exactly
 * like a tick that was always meant to.
 *
 * **The three exits are the whole test.** Being blocked is the easy half and
 * `getBlockingTasks` was already pinned by `smartStart.test.ts`; what is new
 * here is what does NOT lock, because each of those is a decision that can be
 * lost silently:
 *
 *   1. **A completed task.** Un-ticking is the only way to reopen one, and it
 *      goes through the same control the lock disables — so a lock that
 *      applied to a finished task would make it permanent. This is the case
 *      that turns a soft rule into data loss.
 *   2. **`scheduledAnyway`.** The settled decision in one sentence: *"an
 *      override you deliberately pressed is not re-imposed one screen later,
 *      or the button stops meaning anything."* Nothing on screen would reveal
 *      the loss of this until you had pressed the button and then found Focus
 *      Mode refusing you anyway.
 *   3. **A prerequisite that has been deleted.** `getBlockingTasks` drops ids
 *      that resolve to nothing, which is what stops a stale dependency locking
 *      a task for ever. Restated here because the consequence changed: it used
 *      to mean a chip did not draw, and it now means a task can never be
 *      finished.
 *
 * The sentence is tested as well as the boolean. Six controls state the same
 * refusal and none of them composes its own wording — if they did, "why can't
 * I tick this" would have six answers.
 */
import { describe, expect, it } from 'vitest';
import { isTaskLocked, taskLockReason, type Task } from './useStore';

function task(id: string, extra: Partial<Task> = {}): Task {
  return { id, title: id, status: 'needsAction', subtasks: [], ...extra };
}

const BLOCKER = task('blocker', { title: 'Sign the lease' });
const SECOND = task('second', { title: 'Pay the deposit' });
const DEPENDENT = task('dependent', { title: 'Get it quoted', dependsOn: ['blocker'] });
const ALL = [BLOCKER, SECOND, DEPENDENT];

describe('isTaskLocked', () => {
  it('locks a task whose prerequisite is unfinished', () => {
    expect(isTaskLocked(ALL, DEPENDENT)).toBe(true);
  });

  it('does not lock a task with no prerequisites at all', () => {
    expect(isTaskLocked(ALL, SECOND)).toBe(false);
  });

  it('lifts as soon as the prerequisite is completed', () => {
    const tasks = [{ ...BLOCKER, status: 'completed' as const }, DEPENDENT];

    expect(isTaskLocked(tasks, DEPENDENT)).toBe(false);
  });

  it('never locks a completed task, so it can always be reopened', () => {
    // The tick that reopens a task is the tick the lock disables. Applied
    // here, the lock would be permanent — see note 1 at the top.
    const done: Task = { ...DEPENDENT, status: 'completed' };

    expect(isTaskLocked(ALL, done)).toBe(false);
  });

  it('never locks a task that was scheduled anyway', () => {
    // The queue copy carries the override; the blocker is untouched and still
    // unfinished, which is the whole point of the flag.
    const queued: Task = { ...DEPENDENT, scheduledAnyway: true };

    expect(isTaskLocked(ALL, queued)).toBe(false);
    expect(isTaskLocked(ALL, DEPENDENT)).toBe(true);
  });

  it('does not lock on a prerequisite that no longer exists', () => {
    // A deleted blocker is not a blocker. Deletion strips the id from other
    // tasks' `dependsOn` anyway, but a document written by an older client, or
    // by the agent, can still arrive carrying one.
    const orphan = task('orphan', { dependsOn: ['deleted-long-ago'] });

    expect(isTaskLocked([orphan], orphan)).toBe(false);
  });

  it('locks on any one unfinished prerequisite, not on all of them', () => {
    const two = task('two', { dependsOn: ['blocker', 'second'] });
    const tasks = [{ ...BLOCKER, status: 'completed' as const }, SECOND, two];

    expect(isTaskLocked(tasks, two)).toBe(true);
  });
});

describe('taskLockReason', () => {
  it('is absent exactly when the task is not locked', () => {
    expect(taskLockReason(ALL, SECOND)).toBeUndefined();
    expect(taskLockReason(ALL, { ...DEPENDENT, scheduledAnyway: true })).toBeUndefined();
  });

  it('names the blocker, because "you cannot" without "because of X" is not actionable', () => {
    expect(taskLockReason(ALL, DEPENDENT)).toBe('Waiting on “Sign the lease” — finish that first.');
  });

  it('names every blocker when there is more than one', () => {
    const two = task('two', { dependsOn: ['blocker', 'second'] });

    expect(taskLockReason([...ALL, two], two))
      .toBe('Waiting on “Sign the lease” and “Pay the deposit” — finish those first.');
  });

  it('leaves out a prerequisite that is already done', () => {
    const two = task('two', { dependsOn: ['blocker', 'second'] });
    const tasks = [{ ...BLOCKER, status: 'completed' as const }, SECOND, two];

    expect(taskLockReason(tasks, two)).toBe('Waiting on “Pay the deposit” — finish that first.');
  });
});
