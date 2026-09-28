/**
 * The v9 merge: two importance fields become one dial, and **no task changed
 * rank on the day it shipped**.
 *
 * That claim was true because the pre-v9 scorer was already *adding* the
 * quadrant and the personal score, so the test that mattered was not "the
 * fields were renamed" but "the number that comes out is the same number".
 *
 * **ITEM 16 RETIRED THE OTHER HALF OF THAT COMPARISON.** The three old scoring
 * functions are deleted, and the engine that replaced them deliberately ranks
 * differently — that is the whole of item 16. So the "same number" assertions
 * are gone; a test that scored the new way and compared against the old way
 * would now be asserting that item 16 did not happen.
 *
 * What survives is the arithmetic the merge actually promised, said directly:
 * the dial equals the two old fields added, on every one of the thirty pairs,
 * plus a whole-backlog ranking check run through the **new** engine. That
 * check still pins the merge, because on deadline-free tasks with nothing else
 * set the score is monotone in the dial — so a merge that mapped the two
 * fields wrongly would reorder the backlog and the test would say so.
 *
 * Fixtures stay **deadline-free**, and the new engine is handed an explicit
 * `now` and `timeZone`, so nothing here reads a clock — the same rule
 * `smartStart.test.ts` follows.
 */
import { describe, expect, it } from 'vitest';
import {
  isTaskScored,
  taskNeedsAttention,
  upgradeTaskScoring,
  HUMAN_OVERRIDE_MAX,
  type Subtask,
  type Task,
} from './useStore';
import { scoreAll } from '../lib/priority';

/** Pinned, so nothing below depends on the machine's Tuesday. */
const NOW = Date.parse('2026-03-12T09:00:00Z');
const ZONE = 'UTC';

/** The new engine's score for one task, out of a one-task pass. */
function score(task: Task): number {
  return scoreAll([task], NOW, { timeZone: ZONE }).get(task.id)!.score;
}

/** The two fields that were merged, plus the one that was renamed. */
interface LegacyFields {
  eisenhowerQuadrant?: 1 | 2 | 3 | 4;
  personalScore?: number;
  quasiNeedBonus?: number;
}

/** A pre-v9 task, in the shape the store actually held. */
type LegacyTask = Task & LegacyFields;

/** …and a pre-v9 subtask, which carried the same three. */
type LegacySubtask = Subtask & LegacyFields & { subtasks?: LegacySubtask[] };

function legacy(id: string, fields: Partial<LegacyTask> = {}): LegacyTask {
  return { id, title: id, status: 'needsAction', subtasks: [], ...fields };
}

/** What the merge promised the dial would read: the two old fields, added. */
function mergedOverride(task: LegacyTask): number {
  return (task.eisenhowerQuadrant ?? 0) + (task.personalScore ?? 0);
}

describe('upgradeTaskScoring — the arithmetic survives', () => {
  /** Every combination of the two old fields, including neither. */
  const QUADRANTS = [undefined, 1, 2, 3, 4] as const;
  const PERSONALS = [undefined, 1, 2, 3, 4, 5] as const;

  it('adds every quadrant × importance pair onto the one dial', () => {
    for (const eisenhowerQuadrant of QUADRANTS) {
      for (const personalScore of PERSONALS) {
        const before = legacy('t', { eisenhowerQuadrant, personalScore, estimatedTime: 45 });
        const [after] = upgradeTaskScoring([before]);
        // Neither field set is "nobody judged this", which stays undefined.
        if (eisenhowerQuadrant === undefined && personalScore === undefined) {
          expect(after.humanOverride).toBeUndefined();
        } else {
          expect(after.humanOverride).toBe(mergedOverride(before));
        }
      }
    }
  });

  it('lands inside 0–9, which is the dial’s whole range', () => {
    for (const eisenhowerQuadrant of QUADRANTS) {
      for (const personalScore of PERSONALS) {
        const [after] = upgradeTaskScoring([legacy('t', { eisenhowerQuadrant, personalScore })]);
        if (after.humanOverride === undefined) continue;
        expect(after.humanOverride).toBeGreaterThanOrEqual(0);
        expect(after.humanOverride).toBeLessThanOrEqual(HUMAN_OVERRIDE_MAX);
      }
    }
  });

  it('keeps the deferral count, which the new engine still spends', () => {
    const before = legacy('t', { personalScore: 3, quasiNeedBonus: 2, estimatedTime: 20 });
    const [after] = upgradeTaskScoring([before]);
    expect(after.avoidedCount).toBe(2);
    // Importance 3 + Avoided 2 + Duration 1 (20 min is a Micro). No deadline,
    // so no proximity, no escalator, and no danger zone to multiply in.
    expect(score(after)).toBe(6);
  });

  it('preserves the ranking of a whole backlog', () => {
    const before = [
      legacy('a', { eisenhowerQuadrant: 1, personalScore: 5 }),  // 6
      legacy('b', { eisenhowerQuadrant: 4, personalScore: 1 }),  // 5
      legacy('c', { eisenhowerQuadrant: 2, personalScore: 3, quasiNeedBonus: 4 }), // 9
      legacy('d', {}),                                           // 0
    ];
    const rank = (tasks: LegacyTask[], of: (t: LegacyTask) => number) =>
      [...tasks].sort((x, y) => of(y) - of(x)).map((t) => t.id);

    const after = upgradeTaskScoring(before);
    // The new engine's ranking of the migrated backlog, against the merge's own
    // promise. These carry no deadline, no estimate and no dependency, so the
    // only thing separating them is what the merge wrote.
    expect(rank(after as LegacyTask[], score)).toEqual(
      rank(before, (t) => mergedOverride(t) + (t.quasiNeedBonus ?? 0)),
    );
  });
});

describe('upgradeTaskScoring — what counts as scored', () => {
  it('leaves a task nobody ever scored unscored, not scored zero', () => {
    const [after] = upgradeTaskScoring([legacy('t')]);
    expect(after.humanOverride).toBeUndefined();
    expect(isTaskScored(after)).toBe(false);
  });

  it('keeps that task in the Needs Attention queue', () => {
    // Everything else the queue asks for is present, so `score` is the only
    // reason this can come back true — which is the regression being pinned:
    // a literal `(e ?? 0) + (p ?? 0)` would have emptied the queue overnight.
    const complete = legacy('t', {
      deadline: '2026-03-01T10:00',
      estimatedTime: 30,
      description: 'Written out in full.',
    });
    const [after] = upgradeTaskScoring([complete]);
    expect(taskNeedsAttention(after)).toBe(true);
  });

  it('counts a task scored once either old field was set', () => {
    const [fromQuadrant] = upgradeTaskScoring([legacy('a', { eisenhowerQuadrant: 1 })]);
    const [fromPersonal] = upgradeTaskScoring([legacy('b', { personalScore: 1 })]);
    expect(isTaskScored(fromQuadrant)).toBe(true);
    expect(isTaskScored(fromPersonal)).toBe(true);
  });

  it('treats an explicit zero as a judgement, unlike an absent value', () => {
    expect(isTaskScored({ humanOverride: 0 })).toBe(true);
    expect(isTaskScored({})).toBe(false);
    // The distinction is about the queue, not the score: both read as 0 points.
    expect(score(legacy('a', { humanOverride: 0 }))).toBe(score(legacy('b')));
  });
});

describe('upgradeTaskScoring — the shape it leaves behind', () => {
  it('removes the old fields rather than keeping them in parallel', () => {
    const [after] = upgradeTaskScoring([legacy('t', { eisenhowerQuadrant: 3, personalScore: 2, quasiNeedBonus: 1 })]);
    expect(after).not.toHaveProperty('eisenhowerQuadrant');
    expect(after).not.toHaveProperty('personalScore');
    expect(after).not.toHaveProperty('quasiNeedBonus');
    expect(after.humanOverride).toBe(5);
  });

  it('reaches subtasks at every depth', () => {
    const nested: LegacySubtask[] = [{
      id: 's1',
      title: 'one',
      eisenhowerQuadrant: 2,
      personalScore: 4,
      subtasks: [{ id: 's1a', title: 'deep', personalScore: 5, quasiNeedBonus: 3 }],
    }];
    const before = legacy('t', { subtasks: nested as Subtask[] });
    const [after] = upgradeTaskScoring([before]);
    const child = after.subtasks![0];
    expect(child.humanOverride).toBe(6);
    expect(child).not.toHaveProperty('eisenhowerQuadrant');
    expect(child.subtasks![0].humanOverride).toBe(5);
    expect(child.subtasks![0].avoidedCount).toBe(3);
  });

  it('is idempotent — running it twice is running it once', () => {
    const once = upgradeTaskScoring([legacy('t', { eisenhowerQuadrant: 2, personalScore: 3 })]);
    const twice = upgradeTaskScoring(once);
    expect(twice).toEqual(once);
  });

  it('never overwrites a value already on the new field', () => {
    // The cloud snapshot path can hand it a document written by a new client
    // and edited by an old one, so both shapes can arrive on one task. The
    // new field is the one that was written last.
    const mixed = legacy('t', { humanOverride: 7, eisenhowerQuadrant: 1, personalScore: 1 });
    const [after] = upgradeTaskScoring([mixed]);
    expect(after.humanOverride).toBe(7);
  });

  it('hands back the very same array when there is nothing to change', () => {
    // The sync path runs this on every snapshot; a fresh reference each time
    // would re-render the whole app for nothing.
    const tasks = [legacy('t', { humanOverride: 4 })];
    expect(upgradeTaskScoring(tasks)).toBe(tasks);
  });
});
