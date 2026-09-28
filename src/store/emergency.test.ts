/**
 * **The Emergency flag and the Avoided counter, through the real store**
 * (item 17).
 *
 * `priority.test.ts` already pins what the engine *scores* them at. What is
 * left is what the app *stores*, and the four things worth asserting are all
 * ones that look right in a screenshot while being wrong in the document:
 *
 *   1. **Clearing removes the key, it does not set it to `undefined`.** That
 *      is not tidiness — Firestore rejects an `undefined` value and takes the
 *      whole document push down with it, so one cleared emergency would
 *      silently stop every later edit reaching the cloud. `withPatch` exists
 *      for exactly this and the test is written the way it is (`toHaveProperty`
 *      rather than `toBeUndefined`) because the two spellings are
 *      indistinguishable at the reading end and only one of them syncs.
 *   2. **The counter saturates.** Before item 17 `addAvoidedCount` incremented
 *      for ever, so a task deferred fourteen times stored 14 and scored 5 —
 *      the row would have read "Avoided ×14" beside a factor bar reading
 *      `+5 /5`.
 *   3. **Both reach a subtask.** A subtask dragged into "Selected for Today"
 *      is scored as a task, so it can carry either field, and both writes are
 *      addressed by an id that is not in `backlogTasks` at all.
 *   4. **The sweep is a no-op when nothing lapsed** — same array reference
 *      back. It runs hourly against a document that is rewritten whole under a
 *      1 MB cap, so "changed nothing" has to be observably free.
 *
 * Dates are wall clocks converted with the store's own zone, the same rule
 * `recurrenceCompletion.test.ts` follows, so nothing here depends on which
 * zone the machine running it is in.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AVOIDED_MAX,
  EMERGENCY_MAX,
  emergencyBoostOf,
  useStore,
  type Task,
  type TaskList,
} from './useStore';
import { resolveUserTimeZone, zonedTimeToInstant } from '../lib/agent/dates';

const ZONE = resolveUserTimeZone();

/** The instant at which this machine's zone reads a `YYYY-MM-DDTHH:mm` wall clock. */
function at(wall: string): number {
  const [date, time] = wall.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  return zonedTimeToInstant({ year, month, day, hour, minute, second: 0 }, ZONE).getTime();
}

const NOW = at('2026-03-12T09:00');

const LISTS: TaskList[] = [{ id: 'l1', title: 'Build', projectId: 'p1', order: 0 }];

function task(over: Partial<Task> = {}): Task {
  return { id: 't1', title: 'Ship it', status: 'needsAction', listId: 'l1', order: 0, ...over };
}

function seed(tasks: Task[]) {
  useStore.setState({
    projects: [],
    taskLists: structuredClone(LISTS),
    backlogTasks: structuredClone(tasks),
    tasks: [],
    focusLog: [],
  });
}

const backlog = () => useStore.getState().backlogTasks;
const first = () => backlog()[0];

beforeEach(() => seed([task()]));

// ─── Setting the flag ────────────────────────────────────────────────────────

describe('setEmergencyBoost', () => {
  it('writes the level', () => {
    useStore.getState().setEmergencyBoost('t1', 3);
    expect(first().emergencyBoost).toBe(3);
  });

  it('clamps to the cap in both directions', () => {
    useStore.getState().setEmergencyBoost('t1', 99);
    expect(first().emergencyBoost).toBe(EMERGENCY_MAX);

    useStore.getState().setEmergencyBoost('t1', -4);
    expect(first()).not.toHaveProperty('emergencyBoost');
  });

  it('clears by REMOVING the field, never by setting it to undefined', () => {
    useStore.getState().setEmergencyBoost('t1', 4);
    useStore.getState().setEmergencyBoost('t1', 0);
    // See point 1 in the header: `toBeUndefined` would pass on a key that
    // breaks the Firestore write.
    expect(first()).not.toHaveProperty('emergencyBoost');
  });

  it('does nothing at all when the level is already what it would write', () => {
    useStore.getState().setEmergencyBoost('t1', 2);
    const before = backlog();
    useStore.getState().setEmergencyBoost('t1', 2);
    expect(backlog()).toBe(before);
  });

  it('writes through to a subtask, which is how a proxy row reaches one', () => {
    seed([task({ subtasks: [{ id: 's1', title: 'A step', status: 'needsAction' }] })]);

    useStore.getState().setEmergencyBoost('s1', 5);
    expect(first().subtasks![0].emergencyBoost).toBe(5);
    expect(emergencyBoostOf(backlog(), 's1')).toBe(5);

    useStore.getState().setEmergencyBoost('s1', 0);
    expect(first().subtasks![0]).not.toHaveProperty('emergencyBoost');
  });
});

describe('emergencyBoostOf', () => {
  it('answers 0 for a task nobody flagged, and for an id it has never seen', () => {
    expect(emergencyBoostOf(backlog(), 't1')).toBe(0);
    expect(emergencyBoostOf(backlog(), 'ghost')).toBe(0);
  });
});

// ─── Clearing itself ─────────────────────────────────────────────────────────

describe('clearLapsedEmergencies', () => {
  it('clears a flag whose anchor date has gone by', () => {
    seed([task({ deadline: '2026-03-10T12:00', emergencyBoost: 4 })]);

    useStore.getState().clearLapsedEmergencies(NOW);
    expect(first()).not.toHaveProperty('emergencyBoost');
  });

  it('measures from originalDeadline, not from the deadline it was pushed to', () => {
    // Item 18 pushes a deadline forward and writes `originalDeadline` once.
    // The flag lapsed when the ORIGINAL date went by; a task rescheduled into
    // next month must not come back holding a live emergency.
    seed([task({
      deadline: '2026-04-20T12:00',
      originalDeadline: '2026-03-10T12:00',
      emergencyBoost: 4,
    })]);

    useStore.getState().clearLapsedEmergencies(NOW);
    expect(first()).not.toHaveProperty('emergencyBoost');
  });

  it('leaves a flag whose date is still ahead', () => {
    seed([task({ deadline: '2026-03-20T12:00', emergencyBoost: 4 })]);

    useStore.getState().clearLapsedEmergencies(NOW);
    expect(first().emergencyBoost).toBe(4);
  });

  it('leaves a flag on a task with no deadline at all', () => {
    // Nothing to run out of: the flag is then the only thing saying "now".
    seed([task({ emergencyBoost: 2 })]);

    useStore.getState().clearLapsedEmergencies(NOW);
    expect(first().emergencyBoost).toBe(2);
  });

  it('returns the very same array when nothing lapsed — it runs hourly', () => {
    seed([task({ deadline: '2026-03-20T12:00', emergencyBoost: 4 }), task({ id: 't2' })]);
    const before = backlog();

    useStore.getState().clearLapsedEmergencies(NOW);
    expect(backlog()).toBe(before);
  });
});

// ─── The Avoided counter ─────────────────────────────────────────────────────

describe('addAvoidedCount', () => {
  it('counts up and then saturates at the cap', () => {
    for (let i = 0; i < AVOIDED_MAX + 4; i += 1) useStore.getState().addAvoidedCount('t1');
    expect(first().avoidedCount).toBe(AVOIDED_MAX);
  });

  it('saturates on a subtask too', () => {
    seed([task({ subtasks: [{ id: 's1', title: 'A step', status: 'needsAction', avoidedCount: AVOIDED_MAX }] })]);

    useStore.getState().addAvoidedCount('s1');
    expect(first().subtasks![0].avoidedCount).toBe(AVOIDED_MAX);
  });
});
