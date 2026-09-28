/**
 * The one deadline rule.
 *
 * Every test names its dates in full and passes an explicit `timeZone`, so
 * these hold on a laptop in another country and in March as well as in June.
 * That is the whole reason the module takes a zone and refuses a default.
 *
 * There is no `now` anywhere below, and there is not meant to be: the rule
 * compares dates to each other and never to the clock. A test that needed one
 * would be a test of something else.
 */
import { describe, expect, it } from 'vitest';
import {
  DEADLINE_GAP_DAYS,
  affectsDeadlines,
  isQuietPlan,
  planDeadlineCascade,
  type DeadlineTask,
} from './deadlineMath';

const UTC = { timeZone: 'UTC' } as const;

function task(id: string, extra: Partial<DeadlineTask> = {}): DeadlineTask {
  return { id, title: id, status: 'needsAction', ...extra };
}

/** The plan, plus the two lookups every test wants off it. */
function plan(tasks: DeadlineTask[], options: { timeZone: string } = UTC) {
  const result = planDeadlineCascade(tasks, options);
  return {
    ...result,
    moveOf: (id: string) => result.moves.find((m) => m.taskId === id),
    patchOf: (id: string) => result.patches.find((p) => p.taskId === id),
    conflictOf: (id: string) => result.conflicts.find((c) => c.taskId === id),
  };
}

// ─── The rule itself ─────────────────────────────────────────────────────────

describe('the rule', () => {
  it('pushes a task to the day after the prerequisite that lands on top of it', () => {
    const result = plan([
      task('wireframes', { deadline: '2026-03-20T17:00' }),
      task('review', { deadline: '2026-03-18T09:00', dependsOn: ['wireframes'] }),
    ]);
    expect(result.moveOf('review')).toMatchObject({
      from: '2026-03-18T09:00',
      to: '2026-03-21T17:00',
      because: { taskId: 'wireframes', deadline: '2026-03-20T17:00' },
    });
    expect(DEADLINE_GAP_DAYS).toBe(1);
  });

  it('carries the prerequisite time of day, because the rule adds a day to ITS date', () => {
    // `Max(prerequisite deadlines) + 1 day` is read literally. The pushed task
    // is due the day after its prerequisite, AT the prerequisite's hour — the
    // 09:00 it used to hold is not preserved. Anything else would be a second
    // rule about which half of the date survives.
    const result = plan([
      task('a', { deadline: '2026-03-20T17:00' }),
      task('b', { deadline: '2026-03-18T09:00', dependsOn: ['a'] }),
    ]);
    expect(result.moveOf('b')!.to.slice(11)).toBe('17:00');
  });

  it('leaves slack you deliberately left', () => {
    const result = plan([
      task('a', { deadline: '2026-03-10T12:00' }),
      task('b', { deadline: '2026-03-24T12:00', dependsOn: ['a'] }),
    ]);
    expect(isQuietPlan(result)).toBe(true);
  });

  it('never pulls a deadline earlier — push-only, even by a minute', () => {
    const result = plan([
      task('a', { deadline: '2026-03-10T12:00' }),
      // Exactly the gap, to the minute. `max` must not treat equality as a move.
      task('exact', { deadline: '2026-03-11T12:00', dependsOn: ['a'] }),
      task('later', { deadline: '2026-03-11T12:01', dependsOn: ['a'] }),
    ]);
    expect(isQuietPlan(result)).toBe(true);
  });

  it('takes the LATEST prerequisite and names that one', () => {
    const result = plan([
      task('early', { deadline: '2026-03-10T12:00' }),
      task('late', { deadline: '2026-03-15T08:00' }),
      task('b', { deadline: '2026-03-11T12:00', dependsOn: ['early', 'late'] }),
    ]);
    expect(result.moveOf('b')).toMatchObject({ to: '2026-03-16T08:00', because: { taskId: 'late' } });
  });
});

// ─── Recursion, and the cycle guard ──────────────────────────────────────────

describe('recursion', () => {
  it('pushes a whole chain in one pass, in dependency order', () => {
    // c waits on b waits on a. Delaying a has to reach c, and it has to reach
    // it through b's NEW date rather than its old one.
    const result = plan([
      task('c', { deadline: '2026-03-12T10:00', dependsOn: ['b'] }),
      task('b', { deadline: '2026-03-11T10:00', dependsOn: ['a'] }),
      task('a', { deadline: '2026-03-20T10:00' }),
    ]);
    expect(result.moveOf('b')!.to).toBe('2026-03-21T10:00');
    expect(result.moveOf('c')).toMatchObject({ to: '2026-03-22T10:00', because: { taskId: 'b' } });
  });

  it('reaches a diamond once down each side and takes the worse one', () => {
    const result = plan([
      task('root', { deadline: '2026-03-20T10:00' }),
      task('left', { deadline: '2026-03-01T10:00', dependsOn: ['root'] }),
      task('right', { deadline: '2026-04-10T10:00', dependsOn: ['root'] }),
      task('join', { deadline: '2026-03-02T10:00', dependsOn: ['left', 'right'] }),
    ]);
    expect(result.moveOf('left')!.to).toBe('2026-03-21T10:00');
    expect(result.moves.some((m) => m.taskId === 'right')).toBe(false);
    // The untouched right-hand branch is the binding one, at 10 April.
    expect(result.moveOf('join')).toMatchObject({ to: '2026-04-11T10:00', because: { taskId: 'right' } });
  });

  it('terminates on a cycle instead of walking round it for ever', () => {
    // Unreachable through the UI — `wouldCreateDependencyCycle` refuses the
    // edge — but reachable from the agent, a restore, or the cloud document.
    const result = plan([
      task('a', { deadline: '2026-03-10T10:00', dependsOn: ['b'] }),
      task('b', { deadline: '2026-03-20T10:00', dependsOn: ['a'] }),
    ]);
    // The only assertion that matters is that we got here at all. Each task is
    // considered once, and no date is invented past one gap.
    expect(result.moves.length).toBeLessThanOrEqual(2);
    for (const move of result.moves) expect(move.to <= '2026-03-22T00:00').toBe(true);
  });

  it('ignores a task naming itself as its own prerequisite', () => {
    const result = plan([task('a', { deadline: '2026-03-10T10:00', dependsOn: ['a'] })]);
    expect(isQuietPlan(result)).toBe(true);
  });
});

// ─── What is not in the graph ────────────────────────────────────────────────

describe('what the rule leaves alone', () => {
  it('never gives an undated task a date', () => {
    const result = plan([
      task('a', { deadline: '2026-03-20T10:00' }),
      task('undated', { dependsOn: ['a'] }),
      task('after', { deadline: '2026-03-01T10:00', dependsOn: ['undated'] }),
    ]);
    // And an undated task pushes nothing either — there is no date to add to.
    expect(isQuietPlan(result)).toBe(true);
  });

  it('does not push on behalf of a completed prerequisite', () => {
    const result = plan([
      task('done', { deadline: '2026-03-20T10:00', status: 'completed' }),
      task('b', { deadline: '2026-03-11T10:00', dependsOn: ['done'] }),
    ]);
    expect(isQuietPlan(result)).toBe(true);
  });

  it('does not move a completed task, whatever its prerequisite says', () => {
    const result = plan([
      task('a', { deadline: '2026-03-20T10:00' }),
      task('b', { deadline: '2026-03-11T10:00', status: 'completed', dependsOn: ['a'] }),
    ]);
    expect(isQuietPlan(result)).toBe(true);
  });

  it('drops a prerequisite id that resolves to nothing', () => {
    const result = plan([task('b', { deadline: '2026-03-11T10:00', dependsOn: ['deleted-long-ago'] })]);
    expect(isQuietPlan(result)).toBe(true);
  });
});

// ─── The fixed date ──────────────────────────────────────────────────────────

describe('a fixed date', () => {
  const fixture = (): DeadlineTask[] => [
    task('build', { deadline: '2026-03-20T17:00' }),
    task('launch', {
      deadline: '2026-03-18T09:00',
      deadlineIsFixed: true,
      dependsOn: ['build'],
    }),
    task('party', { deadline: '2026-03-01T20:00', dependsOn: ['launch'] }),
  ];

  it('refuses to move and says why', () => {
    const result = plan(fixture());
    expect(result.moveOf('launch')).toBeUndefined();
    expect(result.patchOf('launch')).toBeUndefined();
    expect(result.conflictOf('launch')).toMatchObject({
      deadline: '2026-03-18T09:00',
      required: '2026-03-21T17:00',
      because: { taskId: 'build' },
    });
  });

  it('still propagates its own date downstream, because its date is still the fact', () => {
    const result = plan(fixture());
    expect(result.moveOf('party')).toMatchObject({
      to: '2026-03-19T09:00',
      because: { taskId: 'launch', deadline: '2026-03-18T09:00' },
    });
  });

  it('is quiet while it is still possible', () => {
    const result = plan([
      task('build', { deadline: '2026-03-10T17:00' }),
      task('launch', { deadline: '2026-03-18T09:00', deadlineIsFixed: true, dependsOn: ['build'] }),
    ]);
    expect(isQuietPlan(result)).toBe(true);
  });
});

// ─── The anchor ──────────────────────────────────────────────────────────────

describe('originalDeadline', () => {
  it('is written on the first push, and holds the date the task was first given', () => {
    const result = plan([
      task('a', { deadline: '2026-03-20T10:00' }),
      task('b', { deadline: '2026-03-11T10:00', dependsOn: ['a'] }),
    ]);
    expect(result.moveOf('b')!.anchored).toBe(true);
    expect(result.patchOf('b')).toEqual({
      taskId: 'b',
      deadline: '2026-03-21T10:00',
      originalDeadline: '2026-03-11T10:00',
    });
  });

  it('is never written again, so a task pushed twice still escalates from the first date', () => {
    // The state after the push above, with the prerequisite delayed again.
    const result = plan([
      task('a', { deadline: '2026-04-20T10:00' }),
      task('b', {
        deadline: '2026-03-21T10:00',
        originalDeadline: '2026-03-11T10:00',
        dependsOn: ['a'],
      }),
    ]);
    expect(result.moveOf('b')!.anchored).toBe(false);
    const patch = result.patchOf('b')!;
    expect(patch.deadline).toBe('2026-04-21T10:00');
    // Not `toBeUndefined` — the two read identically in JavaScript and only
    // one of them survives a Firestore write.
    expect(patch).not.toHaveProperty('originalDeadline');
  });

  it('is not written for a task that was never moved', () => {
    const result = plan([
      task('a', { deadline: '2026-03-10T10:00' }),
      task('b', { deadline: '2026-03-24T10:00', dependsOn: ['a'] }),
    ]);
    expect(result.patches).toEqual([]);
  });
});

// ─── A day, in a zone ────────────────────────────────────────────────────────

describe('adding a day', () => {
  it('keeps the wall clock across a DST boundary', () => {
    // New York springs forward at 02:00 on 8 March 2026, so the day after
    // 7 March 18:00 is only 23 hours long. It is still 18:00.
    const result = plan(
      [
        task('a', { deadline: '2026-03-07T18:00' }),
        task('b', { deadline: '2026-03-01T09:00', dependsOn: ['a'] }),
      ],
      { timeZone: 'America/New_York' },
    );
    expect(result.moveOf('b')!.to).toBe('2026-03-08T18:00');
  });

  it('rolls over the end of a month', () => {
    const result = plan([
      task('a', { deadline: '2026-02-28T23:00' }),
      task('b', { deadline: '2026-02-01T10:00', dependsOn: ['a'] }),
    ]);
    expect(result.moveOf('b')!.to).toBe('2026-03-01T23:00');
  });
});

// ─── When the rule is run at all ─────────────────────────────────────────────

describe('affectsDeadlines', () => {
  const before = task('b', { deadline: '2026-03-11T10:00', dependsOn: ['a'] });

  it('is true for the three fields the graph is made of, and for completion', () => {
    expect(affectsDeadlines(before, { deadline: '2026-03-12T10:00' })).toBe(true);
    expect(affectsDeadlines(before, { deadline: undefined })).toBe(true);
    expect(affectsDeadlines(before, { dependsOn: ['a', 'c'] })).toBe(true);
    expect(affectsDeadlines(before, { dependsOn: [] })).toBe(true);
    expect(affectsDeadlines(before, { deadlineIsFixed: true })).toBe(true);
    expect(affectsDeadlines(before, { status: 'completed' })).toBe(true);
  });

  it('is false for an edit that leaves the graph exactly where it was', () => {
    expect(affectsDeadlines(before, { title: 'renamed' })).toBe(false);
    expect(affectsDeadlines(before, { deadline: '2026-03-11T10:00' })).toBe(false);
    expect(affectsDeadlines(before, { dependsOn: ['a'] })).toBe(false);
    expect(affectsDeadlines(before, { status: 'needsAction' })).toBe(false);
    // `false` and absent are one state for this flag, and toggling between
    // the two spellings is not an edit.
    expect(affectsDeadlines(before, { deadlineIsFixed: false })).toBe(false);
  });
});
