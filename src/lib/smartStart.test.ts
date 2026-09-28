/**
 * Smart Start's prerequisite rules.
 *
 * **ITEM 16 INVERTED THE PREMISE THIS FILE WAS WRITTEN ON, AND THE MACHINERY
 * SURVIVED IT.** The old note said a blocker *"very often scores below the
 * task it blocks — a chore nobody rates highly standing in front of the thing
 * that matters"*, so rank order alone put such a pair in the queue back to
 * front. Under the new engine that can no longer happen: the Conductivity
 * floor is `max(score, highestBlockedScore × c)` with `c = 1 + k/T` strictly
 * greater than 1, so **a blocker always outranks the incomplete task it
 * blocks**, by construction and not by luck. `outranks what it blocks` below
 * pins that as a fact of the engine rather than of this fixture.
 *
 * The grouping code is not thereby redundant, which is the second thing this
 * file now has to say. Ranking is only half of it: a group is admitted **whole
 * or not at all** against the hour budget, a prerequisite that is a subtask
 * makes the whole group impossible, and a dependency cycle has no bottom for
 * the floor to start from. Every one of those is still exercised below.
 *
 * **`blocker` is now the expensive one**, at ninety minutes against everything
 * else's sixty. That is what makes "the blocker cannot come with it" reachable
 * at all now that it can no longer be reached by rank — the pair is withheld
 * because it does not fit, which is the case Smart Start actually meets.
 *
 * Every fixture task here is deliberately **deadline-free**, so the score
 * never reaches `Date.now()` and these tests hold the same tomorrow as today.
 * Ranking is expressed through `humanOverride` and the dependency graph alone.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_TASK_MINUTES, type Task } from '../store/useStore';
import { buildSmartQueue, planStartNow } from './smartStart';
import { scoreAll } from './priority';

/** One hour of work, scored by `humanOverride` and nothing else. */
function task(id: string, humanOverride: number, extra: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    status: 'needsAction',
    estimatedTime: 60,
    humanOverride,
    subtasks: [],
    ...extra,
  };
}

const ids = (tasks: Task[]) => tasks.map((t) => t.id);

/**
 * `dependent` is rated highest by hand and waits on `blocker`, which is rated
 * lowest — and `blocker` still comes out on top, because the Conductivity
 * floor lifts it above the thing it is holding up. `filler` sits between them
 * so a budget can be filled without either, and `blocker` costs ninety minutes
 * so a one-hour budget cannot take it.
 */
const BLOCKER = task('blocker', 1, { estimatedTime: 90 });
const FILLER = task('filler', 3);
const DEPENDENT = task('dependent', 5, { dependsOn: ['blocker'] });
const TASKS: Task[] = [DEPENDENT, FILLER, BLOCKER];

describe('buildSmartQueue — prerequisites', () => {
  it('puts a blocker ahead of the task it blocks', () => {
    const { queue, heldBack } = buildSmartQueue(2.5, TASKS);

    expect(ids(queue)).toEqual(['blocker', 'dependent']);
    expect(heldBack).toEqual([]);
  });

  it('outranks what it blocks, however lowly the blocker is rated by hand', () => {
    // The engine's guarantee, not this fixture's: `blocker` is a 1 against a 5
    // and still scores higher, because the Conductivity floor is the blocked
    // task's own score multiplied by a coefficient that is always above 1.
    const scored = scoreAll(TASKS, Date.now());

    expect(scored.get('blocker')!.score).toBeGreaterThan(scored.get('dependent')!.score);
    expect(scored.get('blocker')!.conductivity.applied).toBe(true);
    expect(scored.get('blocker')!.conductivity.from).toBe('dependent');
  });

  it('withholds a blocked task when its blocker cannot come with it, and says what it is waiting on', () => {
    // An hour buys neither the ninety-minute blocker nor the pair, so the hour
    // goes on `filler` and `dependent` comes back with its reason.
    const { queue, heldBack } = buildSmartQueue(1, TASKS);

    expect(ids(queue)).toEqual(['filler']);
    expect(heldBack).toHaveLength(1);
    expect(heldBack[0].task.id).toBe('dependent');
    expect(ids(heldBack[0].blockers)).toEqual(['blocker']);
  });

  it('never schedules a blocked task on its own', () => {
    // Every budget from nothing to plenty, including the zero-budget fallback.
    for (const hours of [0, 0.5, 1, 1.5, 2, 4]) {
      const { queue } = buildSmartQueue(hours, TASKS);
      const queued = new Set(ids(queue));
      if (queued.has('dependent')) {
        expect(queued.has('blocker'), `${hours}h scheduled the dependent alone`).toBe(true);
        expect(ids(queue).indexOf('blocker')).toBeLessThan(ids(queue).indexOf('dependent'));
      }
    }
  });

  it('still returns something when the budget fits nothing at all', () => {
    // The cold-start guarantee: a one-button start never lands on an empty
    // queue, and honouring it must not smuggle in a blocked task by itself.
    // It takes the highest-ranked schedulable task, which under this engine is
    // the blocker — so the hour you have not got is spent unblocking, which is
    // the right answer and used to require the chain branch to produce it.
    const { queue } = buildSmartQueue(0, TASKS);

    expect(ids(queue)).toEqual(['blocker']);
  });

  it('still pulls a whole chain in when the top-ranked task is one it cannot rank past', () => {
    // A cycle has no bottom for the Conductivity floor to start from, so one
    // member is scored without it and the pair can come out in either order.
    // The chain branch is what keeps them together and the right way round.
    const tasks: Task[] = [
      task('p', 5, { dependsOn: ['q'] }),
      task('q', 5, { dependsOn: ['p'] }),
    ];

    const { queue } = buildSmartQueue(0, tasks);

    expect(queue).toHaveLength(2);
  });

  it('orders a chain of prerequisites deepest-first', () => {
    const tasks: Task[] = [
      task('c', 5, { dependsOn: ['b'] }),
      task('b', 4, { dependsOn: ['a'] }),
      task('a', 3),
    ];

    expect(ids(buildSmartQueue(3, tasks).queue)).toEqual(['a', 'b', 'c']);
  });

  it('names the prerequisite a task is directly waiting on, not the whole chain', () => {
    const tasks: Task[] = [
      task('c', 5, { dependsOn: ['b'] }),
      task('b', 4, { dependsOn: ['a'] }),
      task('a', 3),
    ];

    const { queue, heldBack } = buildSmartQueue(1, tasks);

    // Only `a` fits. `c` is held back and told to wait on `b` — the thing that
    // will actually unblock it — rather than on `a`, which is already in hand.
    // `b` is not held back at all: nothing blocks it any more, it simply left
    // no room behind `a`.
    expect(ids(queue)).toEqual(['a']);
    expect(heldBack.map((h) => [h.task.id, ids(h.blockers)])).toEqual([['c', ['b']]]);
  });

  it('does not treat a completed or deleted prerequisite as a blocker', () => {
    const tasks: Task[] = [
      task('done-dep', 5, { dependsOn: ['finished'] }),
      task('stale-dep', 4, { dependsOn: ['no-such-task'] }),
      task('finished', 1, { status: 'completed' }),
    ];

    const { queue, heldBack } = buildSmartQueue(2, tasks);

    expect(ids(queue)).toEqual(['done-dep', 'stale-dep']);
    expect(heldBack).toEqual([]);
  });

  it('holds back a task waiting on a subtask, which has no row of its own to schedule', () => {
    const tasks: Task[] = [
      task('waiting', 5, { dependsOn: ['sub'] }),
      task('sub', 4, { parent: 'somewhere' }),
      task('other', 1),
    ];

    const { queue, heldBack } = buildSmartQueue(0, tasks);

    // Even the cold-start fallback steps over it rather than scheduling either
    // half of an impossible pair.
    expect(ids(queue)).toEqual(['other']);
    expect(heldBack.map((h) => h.task.id)).toEqual(['waiting']);
  });

  it('terminates on a dependency cycle instead of walking it forever', () => {
    const tasks: Task[] = [
      task('x', 5, { dependsOn: ['y'] }),
      task('y', 4, { dependsOn: ['x'] }),
    ];

    const { queue } = buildSmartQueue(4, tasks);

    expect(ids(queue).sort()).toEqual(['x', 'y']);
  });
});

describe('buildSmartQueue — "schedule anyway"', () => {
  it('schedules a held-back task and leaves its blocker where it was', () => {
    const { queue, heldBack } = buildSmartQueue(1, TASKS, { overrides: new Set(['dependent']) });

    // `blocker` stays out — it does not fit the hour — and `filler`, which the
    // preview was already showing for this budget, is untouched by the
    // override.
    expect(ids(queue)).toEqual(['dependent', 'filler']);
    // The row stays in the list so the override can be taken back.
    expect(heldBack.map((h) => h.task.id)).toEqual(['dependent']);
  });

  it('overrules the hour budget as well, without spending any of it', () => {
    const tasks = [...TASKS, task('cheap', 4, { estimatedTime: 15 })];
    const { queue } = buildSmartQueue(0.25, tasks, { overrides: new Set(['dependent']) });

    // A quarter of an hour buys `cheap`. The overridden hour is added on top of
    // it — neither dropped for want of room, nor paid for by evicting `cheap`.
    expect(ids(queue)).toEqual(['dependent', 'cheap']);
    expect(queue.reduce((sum, t) => sum + (t.allocatedTime ?? 0), 0)).toBe(75 * 60);
  });

  it('means nothing to a task that is not being held back', () => {
    // `filler` has no prerequisites, so an override on it must not quietly
    // exempt it from the budget — there would be no held-back row on screen to
    // explain the overrun.
    const { queue } = buildSmartQueue(1, TASKS, { overrides: new Set(['filler', 'blocker']) });

    expect(ids(queue)).toEqual(['filler']);
  });

  it('stamps the override onto the queue copy, so the lock is lifted downstream', () => {
    // Item 19. Without this the button admits the task and Focus Mode then
    // refuses to tick it — the override meaning nothing exactly one screen
    // later, which is the failure the settled decision names.
    const { queue } = buildSmartQueue(1, TASKS, { overrides: new Set(['dependent']) });
    const byId = new Map(queue.map((t) => [t.id, t]));

    expect(byId.get('dependent')!.scheduledAnyway).toBe(true);
    // And nothing else picks it up. `filler` was admitted the ordinary way and
    // an unlock it never asked for would exempt it from a lock it is not under.
    expect(byId.get('filler')).not.toHaveProperty('scheduledAnyway');
  });

  it('does not stamp a task admitted TOGETHER WITH its prerequisite', () => {
    // Two and a half hours takes the pair the ordinary way. That is not an
    // override — it is the right order — and if you skip `blocker` in the
    // session, `dependent` must lock again rather than coasting on a flag
    // nobody pressed a button for.
    const { queue } = buildSmartQueue(2.5, TASKS);

    expect(ids(queue)).toEqual(['blocker', 'dependent']);
    for (const t of queue) expect(t).not.toHaveProperty('scheduledAnyway');
  });
});

describe('buildSmartQueue — budget', () => {
  it('skips a task too big to fit so a smaller one further down still can', () => {
    const tasks: Task[] = [
      task('huge', 5, { estimatedTime: 180 }),
      task('small', 1, { estimatedTime: 30 }),
    ];

    expect(ids(buildSmartQueue(1, tasks).queue)).toEqual(['small']);
  });

  it('charges an unestimated task the neutral default rather than nothing', () => {
    const tasks: Task[] = [
      task('guess', 5, { estimatedTime: undefined }),
      task('other', 4, { estimatedTime: undefined }),
    ];

    const { queue } = buildSmartQueue(DEFAULT_TASK_MINUTES / 60, tasks);

    expect(ids(queue)).toEqual(['guess']);
    expect(queue[0].allocatedTime).toBe(DEFAULT_TASK_MINUTES * 60);
  });

  it('stamps allocatedTime on everything it returns, including a pulled-in blocker', () => {
    const { queue } = buildSmartQueue(2.5, TASKS);

    expect(queue.map((t) => t.allocatedTime)).toEqual([90 * 60, 60 * 60]);
  });

  it('leaves completed and subtask rows out of the running', () => {
    const tasks: Task[] = [
      task('done', 5, { status: 'completed' }),
      task('nested', 5, { parent: 'somewhere' }),
      task('real', 1),
    ];

    expect(ids(buildSmartQueue(4, tasks).queue)).toEqual(['real']);
  });
});

describe('planStartNow', () => {
  it('starts an unblocked task alone, stamped as Smart Start stamps it', () => {
    const plan = planStartNow(TASKS, 'filler');
    expect(plan.kind).toBe('start');
    if (plan.kind !== 'start') return;
    expect(ids(plan.queue)).toEqual(['filler']);
    expect(plan.queue[0].allocatedTime).toBe(60 * 60);
    expect(plan.queue[0].scheduledAnyway).toBeUndefined();
  });

  it('charges an unestimated task the neutral default', () => {
    const plan = planStartNow([task('bare', 1, { estimatedTime: undefined })], 'bare');
    expect(plan.kind === 'start' && plan.queue[0].allocatedTime).toBe(DEFAULT_TASK_MINUTES * 60);
  });

  it('refuses a blocked task and offers its blocker instead, with no override', () => {
    const plan = planStartNow(TASKS, 'dependent');
    expect(plan).toEqual({ kind: 'blocked', blockers: [BLOCKER], startable: [BLOCKER] });
  });

  it('offers the bottom of a chain, not a blocker that is itself blocked', () => {
    const tasks = [
      task('top', 5, { dependsOn: ['middle'] }),
      task('middle', 4, { dependsOn: ['bottom'] }),
      task('bottom', 3),
    ];
    const plan = planStartNow(tasks, 'top');
    expect(plan.kind).toBe('blocked');
    if (plan.kind !== 'blocked') return;
    expect(ids(plan.blockers)).toEqual(['middle']);
    expect(ids(plan.startable)).toEqual(['bottom']);
  });

  it('offers every free prerequisite across branches, deepest first', () => {
    const tasks = [
      task('top', 5, { dependsOn: ['a', 'b'] }),
      task('a', 4, { dependsOn: ['a0'] }),
      task('a0', 1),
      task('b', 2),
    ];
    const plan = planStartNow(tasks, 'top');
    expect(plan.kind === 'blocked' && ids(plan.startable)).toEqual(['a0', 'b']);
  });

  it('can start a task once what it waited on is done or gone', () => {
    const tasks = [
      task('dependent', 5, { dependsOn: ['done', 'deleted'] }),
      task('done', 1, { status: 'completed' }),
    ];
    expect(planStartNow(tasks, 'dependent').kind).toBe('start');
  });

  it('offers nothing from a dependency cycle, and terminates', () => {
    const tasks = [
      task('x', 1, { dependsOn: ['y'] }),
      task('y', 1, { dependsOn: ['x'] }),
    ];
    const plan = planStartNow(tasks, 'x');
    expect(plan.kind === 'blocked' && plan.startable).toEqual([]);
  });

  it('offers nothing through a subtask prerequisite, but still offers a free sibling branch', () => {
    const tasks = [
      task('top', 5, { dependsOn: ['sub', 'free'] }),
      task('sub', 1, { parent: 'someone' }),
      task('free', 1),
    ];
    const plan = planStartNow(tasks, 'top');
    expect(plan.kind === 'blocked' && ids(plan.startable)).toEqual(['free']);
  });

  it('does not honour a stray override stamp — Start now has no override', () => {
    const plan = planStartNow([BLOCKER, { ...DEPENDENT, scheduledAnyway: true }], 'dependent');
    expect(plan.kind).toBe('blocked');
  });

  it('has nothing to start for a finished task, a subtask row, or an unknown id', () => {
    const tasks = [task('done', 1, { status: 'completed' }), task('sub', 1, { parent: 'p' })];
    expect(planStartNow(tasks, 'done').kind).toBe('unavailable');
    expect(planStartNow(tasks, 'sub').kind).toBe('unavailable');
    expect(planStartNow(tasks, 'nope').kind).toBe('unavailable');
  });
});
