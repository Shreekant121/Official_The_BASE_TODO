/**
 * The priority engine.
 *
 * Every test fixes `now` and passes `timeZone: 'UTC'`, so these hold the same
 * tomorrow as today and on a laptop in another country. That is the whole
 * reason the module takes both as arguments.
 *
 * Two ceilings quoted in the design are worth knowing are *unreachable*, and
 * nothing here asserts them: Emergency reads zero once the deadline it is
 * anchored to has passed, and the Escalator reads zero until it has — so the
 * two can never both be at their cap, and neither the linear 35 nor the
 * multiplicative 640 can actually occur. They are caps on the arithmetic, not
 * predictions about a task.
 */
import { describe, expect, it } from 'vitest';
import type { TaskList } from '../store/useStore';
import {
  TUNING,
  durationMinutes,
  hasEmergencyLapsed,
  latestStartOf,
  scoreAll,
  scoreDraft,
  scoreOf,
  type PriorityTask,
} from './priority';

/** Noon UTC, 10 March 2026. Every date below is written relative to it. */
const NOW = Date.UTC(2026, 2, 10, 12, 0, 0);
const UTC = { timeZone: 'UTC' } as const;

/** A stored `YYYY-MM-DDTHH:mm` this many minutes from `NOW`. */
function at(minutesFromNow: number): string {
  return new Date(NOW + minutesFromNow * 60_000).toISOString().slice(0, 16);
}

const DAY = 24 * 60;

function task(id: string, extra: Partial<PriorityTask> = {}): PriorityTask {
  return { id, status: 'needsAction', estimatedTime: 60, ...extra };
}

function score(tasks: PriorityTask[], id: string, lists?: TaskList[]) {
  return scoreAll(tasks, NOW, { ...UTC, taskLists: lists }).get(id)!;
}

// ─── Duration and latest start ───────────────────────────────────────────────

describe('duration', () => {
  it('prefers the deliberate allocation over the generic estimate', () => {
    // The opposite order from the store's `taskEstimatedMinutes`, on purpose:
    // `allocatedTime` is what you set for this task today.
    expect(durationMinutes({ allocatedTime: 900, estimatedTime: 120 })).toBe(15);
    expect(durationMinutes({ estimatedTime: 120 })).toBe(120);
    expect(durationMinutes({})).toBe(TUNING.defaultTaskMinutes);
    expect(durationMinutes({ allocatedTime: 0, estimatedTime: 0 })).toBe(TUNING.defaultTaskMinutes);
  });

  it('scores a quick win up and a long haul at nothing', () => {
    const quick = score([task('q', { estimatedTime: 20 })], 'q');
    const standard = score([task('s', { estimatedTime: 120 })], 's');
    const long = score([task('l', { estimatedTime: 121 })], 'l');
    expect(quick.variables.duration).toBe(1);
    expect(standard.variables.duration).toBe(0.5);
    expect(long.variables.duration).toBe(0);
  });
});

describe('latest start', () => {
  it('is the deadline less the duration, never the deadline itself', () => {
    const t = task('t', { deadline: at(120), estimatedTime: 90 });
    expect(latestStartOf(t, 'UTC')).toBe(NOW + 30 * 60_000);
  });

  it('does not exist without a deadline, and neither does deadline pressure', () => {
    const s = score([task('t')], 't');
    expect(latestStartOf(task('t'), 'UTC')).toBeNull();
    expect(s.latestStart).toBeNull();
    expect(s.daysToLatestStart).toBeNull();
    expect(s.variables.deadlineProximity).toBe(0);
    expect(s.W).toBe(0);
    expect(s.redAlert).toBe(false);
  });
});

// ─── The seven variables ─────────────────────────────────────────────────────

describe('deadline proximity', () => {
  it('is nothing at the horizon, half way at half of it, and full once the latest start is here', () => {
    const horizon = score([task('t', { deadline: at(14 * DAY + 60) })], 't');
    const half = score([task('t', { deadline: at(7 * DAY + 60) })], 't');
    const here = score([task('t', { deadline: at(60) })], 't');
    const past = score([task('t', { deadline: at(-5 * DAY) })], 't');

    expect(horizon.variables.deadlineProximity).toBeCloseTo(0, 10);
    expect(half.variables.deadlineProximity).toBeCloseTo(2.5, 10);
    expect(here.variables.deadlineProximity).toBeCloseTo(5, 10);
    expect(past.variables.deadlineProximity).toBe(5);
  });
});

describe('the post-deadline escalator', () => {
  it('measures from the original deadline, never from the one it was pushed to', () => {
    // Seven days late of fourteen is half volume — and it stays half volume
    // even though the deadline itself has been moved a week into the future.
    const pushed = score(
      [task('t', { deadline: at(7 * DAY), originalDeadline: at(-7 * DAY) })],
      't',
    );
    expect(pushed.variables.escalator).toBeCloseTo(2.5, 10);

    // The same task without the anchor is not late at all — which is exactly
    // the inversion `originalDeadline` exists to prevent.
    const unanchored = score([task('t', { deadline: at(7 * DAY) })], 't');
    expect(unanchored.variables.escalator).toBe(0);
  });

  it('falls back to the current deadline while nothing writes the anchor', () => {
    const s = score([task('t', { deadline: at(-7 * DAY) })], 't');
    expect(s.variables.escalator).toBeCloseTo(2.5, 10);
  });

  it('caps rather than climbing forever', () => {
    const s = score([task('t', { deadline: at(-90 * DAY) })], 't');
    expect(s.variables.escalator).toBe(TUNING.caps.escalator);
  });
});

describe('emergency', () => {
  it('counts while the deadline is ahead', () => {
    const s = score([task('t', { deadline: at(2 * DAY), emergencyBoost: 5 })], 't');
    expect(s.variables.emergency).toBe(5);
  });

  it('stops counting once the deadline it was set against has gone', () => {
    // Item 17's button clears the field; the engine reads it as gone anyway,
    // so the score is right whether or not that write has happened.
    const s = score([task('t', { deadline: at(-1), emergencyBoost: 5 })], 't');
    expect(s.variables.emergency).toBe(0);
    expect(s.variables.escalator).toBeGreaterThan(0);
  });

  it('reads the original deadline, so pushing a date does not revive it', () => {
    const s = score(
      [task('t', { deadline: at(30 * DAY), originalDeadline: at(-DAY), emergencyBoost: 4 })],
      't',
    );
    expect(s.variables.emergency).toBe(0);
  });

  it('has no anchor to run out of when the task has no deadline', () => {
    const s = score([task('t', { emergencyBoost: 3 })], 't');
    expect(s.variables.emergency).toBe(3);
  });
});

/*
 * Item 17 has three readers of this one rule — the engine above, the store's
 * `clearLapsedEmergencies`, and the sentence the task sheet prints under the
 * trough — so it is one exported function rather than three copies of a date
 * comparison. These pin the predicate directly; the `emergency` block above
 * pins that the engine actually uses it.
 */
describe('hasEmergencyLapsed', () => {
  it('is true once the anchor has passed and false while it is ahead', () => {
    expect(hasEmergencyLapsed({ deadline: at(-1) }, NOW, 'UTC')).toBe(true);
    expect(hasEmergencyLapsed({ deadline: at(1) }, NOW, 'UTC')).toBe(false);
  });

  it('takes originalDeadline over deadline, like the escalator does', () => {
    expect(hasEmergencyLapsed({ deadline: at(30 * DAY), originalDeadline: at(-DAY) }, NOW, 'UTC')).toBe(true);
  });

  it('is false with no date at all — there is nothing to run out of', () => {
    expect(hasEmergencyLapsed({}, NOW, 'UTC')).toBe(false);
  });

  it('agrees with the engine on every case it is asked about', () => {
    const cases: PriorityTask[] = [
      task('a', { deadline: at(-1), emergencyBoost: 5 }),
      task('b', { deadline: at(DAY), emergencyBoost: 5 }),
      task('c', { deadline: at(30 * DAY), originalDeadline: at(-DAY), emergencyBoost: 5 }),
      task('d', { emergencyBoost: 5 }),
    ];
    for (const t of cases) {
      const lapsed = hasEmergencyLapsed(t, NOW, 'UTC');
      expect(score([t], t.id).variables.emergency === 0).toBe(lapsed);
    }
  });
});

describe('the caps', () => {
  it('hold whatever is stored', () => {
    const s = score([task('t', { humanOverride: 40, avoidedCount: 12, emergencyBoost: 9, deadline: at(DAY) })], 't');
    expect(s.variables.humanOverride).toBe(TUNING.caps.humanOverride);
    expect(s.variables.avoided).toBe(TUNING.caps.avoided);
    expect(s.variables.emergency).toBe(TUNING.caps.emergency);
  });
});

// ─── Bottleneck severity ─────────────────────────────────────────────────────

describe('bottleneck severity', () => {
  it('counts what is stuck behind a task, transitively', () => {
    // c waits on b, b waits on a — so a is holding up two things, not one.
    const tasks = [task('a'), task('b', { dependsOn: ['a'] }), task('c', { dependsOn: ['b'] })];
    expect(score(tasks, 'a').blockedCount).toBe(2);
    expect(score(tasks, 'b').blockedCount).toBe(1);
    expect(score(tasks, 'c').blockedCount).toBe(0);
  });

  it('is logarithmic, so blocking one matters and blocking one more does not', () => {
    const one = [task('hub'), task('x', { dependsOn: ['hub'] })];
    expect(score(one, 'hub').variables.bottleneck).toBeCloseTo(2.5 * Math.log10(2), 10);

    const nine = [task('hub'), ...Array.from({ length: 9 }, (_, i) => task(`x${i}`, { dependsOn: ['hub'] }))];
    expect(score(nine, 'hub').variables.bottleneck).toBeCloseTo(2.5, 10);

    const ninetyNine = [task('hub'), ...Array.from({ length: 99 }, (_, i) => task(`x${i}`, { dependsOn: ['hub'] }))];
    expect(score(ninetyNine, 'hub').variables.bottleneck).toBe(TUNING.caps.bottleneck);
  });

  it('does not count tasks that are already done, or prerequisites that no longer exist', () => {
    const tasks = [
      task('hub'),
      task('done', { dependsOn: ['hub'], status: 'completed' }),
      task('live', { dependsOn: ['hub'] }),
      task('orphan', { dependsOn: ['deleted-long-ago'] }),
    ];
    expect(score(tasks, 'hub').blockedCount).toBe(1);
    expect(score(tasks, 'orphan').blockedCount).toBe(0);
  });
});

// ─── The conductivity floor ──────────────────────────────────────────────────

describe('the conductivity coefficient', () => {
  /** One important task, blocked by one blocker of the given length. */
  function pair(blockerMinutes: number) {
    const tasks = [
      task('blocker', { estimatedTime: blockerMinutes, humanOverride: 0 }),
      task('big', { dependsOn: ['blocker'], humanOverride: 9, estimatedTime: 240 }),
    ];
    const all = scoreAll(tasks, NOW, UTC);
    return { blocker: all.get('blocker')!, big: all.get('big')! };
  }

  it('lifts a fifteen-minute blocker to five times what it is holding up', () => {
    const { blocker, big } = pair(15);
    expect(big.score).toBeCloseTo(9, 10);
    expect(blocker.conductivity.coefficient).toBeCloseTo(5, 10);
    expect(blocker.score).toBeCloseTo(45, 10);
    expect(blocker.conductivity.applied).toBe(true);
    expect(blocker.conductivity.from).toBe('big');
  });

  it('barely moves a blocker that is genuinely a day of work', () => {
    expect(pair(30).blocker.conductivity.coefficient).toBeCloseTo(3, 10);
    expect(pair(60).blocker.conductivity.coefficient).toBeCloseTo(2, 10);
    expect(pair(480).blocker.conductivity.coefficient).toBeCloseTo(1.125, 10);
    expect(pair(480).blocker.score).toBeCloseTo(9 * 1.125, 10);
  });

  it('is a floor, so it never drags an already-urgent blocker down', () => {
    const tasks = [
      task('blocker', { humanOverride: 9, emergencyBoost: 5, deadline: at(60), estimatedTime: 480 }),
      task('small', { dependsOn: ['blocker'], humanOverride: 0, estimatedTime: 240 }),
    ];
    const s = scoreAll(tasks, NOW, UTC).get('blocker')!;
    expect(s.conductivity.applied).toBe(false);
    expect(s.score).toBe(s.baseScore);
    expect(s.score).toBeGreaterThan(s.conductivity.floor);
  });

  it('reaches along a chain without anyone computing a transitive closure', () => {
    // c is what matters; b holds up c; a holds up b. a inherits from b's
    // already-lifted score, so the urgency arrives two hops away.
    const tasks = [
      task('a', { estimatedTime: 60 }),
      task('b', { dependsOn: ['a'], estimatedTime: 60 }),
      task('c', { dependsOn: ['b'], humanOverride: 9, estimatedTime: 240 }),
    ];
    const all = scoreAll(tasks, NOW, UTC);
    expect(all.get('c')!.score).toBeCloseTo(9, 10);
    expect(all.get('b')!.score).toBeCloseTo(18, 10);
    expect(all.get('a')!.score).toBeCloseTo(36, 10);
  });

  it('takes nothing from a dependent that is already finished', () => {
    const tasks = [
      task('blocker', { estimatedTime: 15 }),
      task('done', { dependsOn: ['blocker'], humanOverride: 9, status: 'completed' }),
    ];
    const s = scoreAll(tasks, NOW, UTC).get('blocker')!;
    expect(s.conductivity.from).toBeNull();
    expect(s.conductivity.applied).toBe(false);
  });

  it('takes the worst of several dependents, not the nearest', () => {
    const tasks = [
      task('blocker', { estimatedTime: 60 }),
      task('minor', { dependsOn: ['blocker'], humanOverride: 1, estimatedTime: 240 }),
      task('major', { dependsOn: ['blocker'], humanOverride: 9, estimatedTime: 240 }),
    ];
    const s = scoreAll(tasks, NOW, UTC).get('blocker')!;
    expect(s.conductivity.from).toBe('major');
    expect(s.score).toBeCloseTo(18, 10);
  });
});

describe('a dependency cycle', () => {
  it('terminates, and still scores both halves of it', () => {
    // Nothing should ever build one — `wouldCreateDependencyCycle` guards the
    // picker — but a cloud document written by an older client can carry one,
    // and an engine that hangs on it takes the whole app down.
    const tasks = [
      task('a', { dependsOn: ['b'], humanOverride: 4 }),
      task('b', { dependsOn: ['a'], humanOverride: 0 }),
    ];
    const all = scoreAll(tasks, NOW, UTC);
    expect(Number.isFinite(all.get('a')!.score)).toBe(true);
    expect(Number.isFinite(all.get('b')!.score)).toBe(true);
    expect(all.get('a')!.blockedCount).toBe(1);
    expect(all.get('b')!.blockedCount).toBe(1);
  });

  it('survives a task that depends on itself', () => {
    const all = scoreAll([task('a', { dependsOn: ['a'] })], NOW, UTC);
    expect(all.get('a')!.blockedCount).toBe(0);
    expect(Number.isFinite(all.get('a')!.score)).toBe(true);
  });
});

// ─── The sigmoid, and the blend it drives ────────────────────────────────────

describe('the danger zone', () => {
  it('sits at exactly the midpoint on the threshold, which is what Red Alert means', () => {
    // Latest start three days out, the base threshold: W is 0.5 to the digit,
    // and Red Alert is *past* it, so the boundary itself is not an alert.
    const s = score([task('t', { deadline: at(3 * DAY + 60) })], 't');
    expect(s.daysToLatestStart).toBeCloseTo(3, 10);
    expect(s.W).toBeCloseTo(0.5, 10);
    expect(s.redAlert).toBe(false);

    const inside = score([task('t', { deadline: at(2 * DAY + 60) })], 't');
    expect(inside.W).toBeGreaterThan(0.5);
    expect(inside.redAlert).toBe(true);
  });

  it('spreads the crossover over about six days rather than stepping', () => {
    const far = score([task('t', { deadline: at(6 * DAY + 60) })], 't');
    const near = score([task('t', { deadline: at(60) })], 't');
    expect(far.W).toBeLessThan(0.05);
    expect(near.W).toBeGreaterThan(0.95);
  });

  it('adds outside the zone and multiplies inside it', () => {
    const v = { humanOverride: 9, avoidedCount: 3, emergencyBoost: 5, estimatedTime: 60 };

    // Latest start now: proximity 5, emergency 5, and the product bites.
    const hot = score([task('t', { ...v, deadline: at(60) })], 't');
    expect(hot.linear).toBeCloseTo(22.5, 10);
    expect(hot.multiplicative).toBeCloseTo(37.5, 10);
    expect(hot.score).toBeCloseTo((1 - hot.W) * 22.5 + hot.W * 37.5, 10);
    expect(hot.score).toBeGreaterThan(hot.linear);

    // The same task a month out is the calm sum and nothing else.
    const cool = score([task('t', { ...v, deadline: at(30 * DAY) })], 't');
    expect(cool.score).toBeCloseTo(cool.linear, 3);
  });

  it('never lets a single absent variable zero the product', () => {
    // Every dynamic factor is floored at 1, so a task with no bottleneck and
    // no escalator still multiplies its proximity by its emergency.
    const s = score([task('t', { deadline: at(60), emergencyBoost: 5 })], 't');
    expect(s.multiplicative).toBeCloseTo(0.5 + 25, 10);
  });
});

// ─── Runway ──────────────────────────────────────────────────────────────────

describe('the project runway', () => {
  const LISTS: TaskList[] = [
    { id: 'l-doomed', title: 'Doomed', projectId: 'p-doomed' },
    { id: 'l-calm', title: 'Calm', projectId: 'p-calm' },
  ];

  /** Four twelve-day slabs of work and one small task, all due in ten days. */
  const DOOMED: PriorityTask[] = [
    ...Array.from({ length: 4 }, (_, i) =>
      task(`slab${i}`, { listId: 'l-doomed', estimatedTime: 96 * 60, deadline: at(DAY) }),
    ),
    task('victim', { listId: 'l-doomed', estimatedTime: 60, deadline: at(10 * DAY + 60) }),
  ];

  it('widens the danger zone to its maximum on a project that cannot be finished', () => {
    const s = score(DOOMED, 'victim', LISTS);
    expect(s.daysToLatestStart).toBeCloseTo(10, 10);
    expect(s.dangerThresholdDays).toBeCloseTo(12, 10);
    expect(s.redAlert).toBe(true);
  });

  it('leaves the same task alone when it is in no project', () => {
    // The control for the test above: identical dates, identical everything,
    // no list — so the flat three-day threshold applies and it is ten days out.
    const loose = DOOMED.map((t) => ({ ...t, listId: undefined }));
    const s = score(loose, 'victim');
    expect(s.dangerThresholdDays).toBe(3);
    expect(s.redAlert).toBe(false);
  });

  it('leaves a project with room to spare on the flat threshold', () => {
    const calm: PriorityTask[] = [
      task('small', { listId: 'l-calm', estimatedTime: 60, deadline: at(60 * DAY) }),
      task('victim', { listId: 'l-calm', estimatedTime: 60, deadline: at(10 * DAY + 60) }),
    ];
    const s = score(calm, 'victim', LISTS);
    expect(s.dangerThresholdDays).toBe(3);
    expect(s.redAlert).toBe(false);
  });

  it('widens proportionally in between, rather than switching', () => {
    // Half of the two-week comfort window used up: the threshold should sit
    // halfway between the base 3 and the full 12.
    const half: PriorityTask[] = [
      task('work', { listId: 'l-calm', estimatedTime: 7 * TUNING.workDayHours * 60, deadline: at(DAY) }),
      task('victim', { listId: 'l-calm', estimatedTime: 0, deadline: at(14 * DAY) }),
    ];
    const s = score(half, 'victim', LISTS);
    // 14 days of runway available, 7 working days of work booked against it,
    // plus the victim's own default half-hour.
    expect(s.dangerThresholdDays).toBeGreaterThan(7);
    expect(s.dangerThresholdDays).toBeLessThan(8);
  });

  it('has no runway to measure when a project carries no deadlines at all', () => {
    const undated: PriorityTask[] = [
      task('a', { listId: 'l-calm', estimatedTime: 9999 }),
      task('b', { listId: 'l-calm', deadline: at(2 * DAY + 60) }),
    ];
    // `b` has a deadline, so the project does; `a` alone would not.
    const onlyUndated = score([undated[0]], 'a', LISTS);
    expect(onlyUndated.dangerThresholdDays).toBe(3);
  });
});

// ─── The parking lots ────────────────────────────────────────────────────────

describe('backburner and reference materials', () => {
  it('never enter the danger zone, however late they are', () => {
    const parked = score([task('t', { listId: 'backburner', deadline: at(-30 * DAY) })], 't');
    expect(parked.W).toBe(0);
    expect(parked.redAlert).toBe(false);
    expect(parked.score).toBeCloseTo(parked.linear, 10);

    const reference = score([task('t', { listId: 'reference', deadline: at(-30 * DAY) })], 't');
    expect(reference.redAlert).toBe(false);
  });

  it('is the only thing separating them from a working list', () => {
    const working = score([task('t', { listId: 'action', deadline: at(-30 * DAY) })], 't');
    expect(working.redAlert).toBe(true);
  });

  it("includes a project's own Backburner, by its name (29-1P6c)", () => {
    const lists: TaskList[] = [
      { id: 'l-bb', title: '🧊 Backburner', projectId: 'p1' },
      { id: 'l-work', title: 'Build', projectId: 'p1' },
    ];
    const parked = score([task('t', { listId: 'l-bb', deadline: at(-30 * DAY) })], 't', lists);
    expect(parked.redAlert).toBe(false);
    expect(parked.W).toBe(0);
    const working = score([task('t', { listId: 'l-work', deadline: at(-30 * DAY) })], 't', lists);
    expect(working.redAlert).toBe(true);
  });
});

// ─── The task being edited ───────────────────────────────────────────────────

describe('scoring an unsaved edit', () => {
  const SAVED = [
    task('blocker', { estimatedTime: 60, humanOverride: 2 }),
    task('big', { dependsOn: ['blocker'], humanOverride: 9, estimatedTime: 240 }),
  ];

  it('keeps the graph half and recomputes only what the edit can change', () => {
    const saved = scoreAll(SAVED, NOW, UTC).get('blocker')!;
    const dragged = scoreDraft({ ...SAVED[0], humanOverride: 9 }, saved, NOW, UTC);

    expect(dragged.variables.humanOverride).toBe(9);
    expect(dragged.blockedCount).toBe(saved.blockedCount);
    expect(dragged.variables.bottleneck).toBeCloseTo(saved.variables.bottleneck, 10);
    expect(dragged.conductivity.highestBlockedScore).toBeCloseTo(saved.conductivity.highestBlockedScore, 10);
  });

  it('agrees with the saved answer when nothing was actually edited', () => {
    const saved = scoreAll(SAVED, NOW, UTC).get('blocker')!;
    const untouched = scoreDraft(SAVED[0], saved, NOW, UTC);
    expect(untouched.score).toBeCloseTo(saved.score, 10);
    expect(untouched.baseScore).toBeCloseTo(saved.baseScore, 10);
    expect(untouched.W).toBeCloseTo(saved.W, 10);
  });

  it('lets shortening a blocker lift it, because that is its own duration', () => {
    const saved = scoreAll(SAVED, NOW, UTC).get('blocker')!;
    const shortened = scoreDraft({ ...SAVED[0], estimatedTime: 15 }, saved, NOW, UTC);
    expect(saved.conductivity.coefficient).toBeCloseTo(2, 10);
    expect(shortened.conductivity.coefficient).toBeCloseTo(5, 10);
    expect(shortened.score).toBeGreaterThan(saved.score);
  });

  it('gives a brand-new task nothing for the graph half, which is the truth', () => {
    const fresh = scoreDraft({ id: 'new', humanOverride: 5, estimatedTime: 60 }, null, NOW, UTC);
    expect(fresh.blockedCount).toBe(0);
    expect(fresh.variables.bottleneck).toBe(0);
    expect(fresh.conductivity.applied).toBe(false);
    expect(fresh.score).toBeCloseTo(5.5, 10);
  });
});

// ─── Housekeeping ────────────────────────────────────────────────────────────

describe('the map', () => {
  it('holds one entry per task and reads back the same answer twice', () => {
    const tasks = [task('a', { deadline: at(DAY) }), task('b'), task('c', { dependsOn: ['a'] })];
    const first = scoreAll(tasks, NOW, UTC);
    const second = scoreAll(tasks, NOW, UTC);
    expect([...first.keys()]).toEqual(['a', 'b', 'c']);
    for (const id of first.keys()) expect(second.get(id)!.score).toBe(first.get(id)!.score);
  });

  it('answers 0 for a task it never scored rather than poisoning a sort', () => {
    const scores = scoreAll([task('a')], NOW, UTC);
    expect(scoreOf(scores, 'a')).toBeGreaterThan(0);
    expect(scoreOf(scores, 'nobody')).toBe(0);
  });

  it('scores nothing at all without falling over', () => {
    expect(scoreAll([], NOW, UTC).size).toBe(0);
  });
});
