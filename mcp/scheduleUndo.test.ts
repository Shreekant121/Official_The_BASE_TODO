import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LISTS, useStore, type Task } from '../src/store/useStore';
import { useTrashStore } from '../src/store/useTrashStore';
import { useSnapshotStore } from '../src/store/useSnapshotStore';
import { useEventStore } from '../src/store/useEventStore';
import { liveAgentStore, liveSnapshotCapture } from '../src/lib/agent/liveContext';
import { scheduleTask } from '../src/lib/agent/tools/scheduleTools';
import { DRAWERS, drawerOf, frontDoorKindOf } from '../src/lib/agent/tools/index';
import { describeToolCall } from '../src/lib/agent/toolChip';
import type { ToolContext } from '../src/lib/agent/types';
import { applyUndo, beginCapture, endCapture, type UndoPayload } from '../src/lib/agent/toolServer/undo';

/**
 * 29-2e3a — ATLAS PUTS A TASK ON THE CALENDAR AT A TIME, AS A DRAG DOES.
 *
 * Held against the real store and the real capture ring, the undo token
 * round-tripped through JSON as it travels to Atlas's log, as
 * `eveningUndo.test.ts` does: the tool runs free only because Revert really
 * puts the deadline back.
 */

const NOW = new Date('2026-10-21T11:00:00+05:30');

const task = (id: string, title: string, extra: Partial<Task> = {}): Task => ({
  id, title, status: 'needsAction', listId: 'action', listName: 'Action Steps', order: 0, subtasks: [], createdAt: 0, ...extra,
});

const BOARD: Task[] = [
  task('t-invoice', 'Send the invoice', { deadline: '2026-10-21T10:00', estimatedTime: 60 }),
  task('t-call', 'Call the CA'),
  task('t-gels', 'Buy energy gels', { deadline: '2026-11-07T06:00', eventId: 'ev-run' }),
  task('t-done', 'Old thing', { deadline: '2026-10-21T10:00', status: 'completed', completedAt: 1 }),
  task('t-steps', 'Has steps', { subtasks: [{ id: 's-one', title: 'One', status: 'needsAction', subtasks: [] }] }),
];

beforeEach(() => {
  useStore.setState({ projects: [], taskLists: structuredClone(DEFAULT_LISTS), backlogTasks: structuredClone(BOARD), tasks: [], focusLog: [] });
  useTrashStore.setState({ entries: [] });
  useEventStore.setState({ events: [{ id: 'ev-run', title: 'Mumbai Marathon', start: '2026-11-07T06:00', createdAt: 0 }] });
  useSnapshotStore.getState().clearTurns();
});

async function run(args: Record<string, unknown>) {
  const ctx: ToolContext = {
    snapshotHandle: beginCapture('turn-1', 'schedule_task'),
    now: NOW,
    timezone: 'Asia/Kolkata',
    store: liveAgentStore,
    snapshots: liveSnapshotCapture,
  };
  const result = await scheduleTask.execute(args, ctx);
  const payload = endCapture(ctx.snapshotHandle);
  return { result, token: JSON.parse(JSON.stringify(payload)) as UndoPayload | null };
}

const byId = (id: string) => useStore.getState().backlogTasks.find((t) => t.id === id)!;

describe('schedule_task', () => {
  it('starts the block at the time and makes it due when it ends, as a drop does', async () => {
    const { result } = await run({ taskIds: ['t-invoice'], start: '2026-10-21T15:00' });
    expect(result.ok).toBe(true);
    expect(byId('t-invoice').deadline).toBe('2026-10-21T16:00');
    expect(result.summary).toBe('Put "Send the invoice" at Wed, 21 Oct 2026, 15:00, due 16:00.');
  });

  it('puts several one after another, in the order given', async () => {
    const { result } = await run({ taskIds: ['t-invoice', 't-call'], start: '2026-10-22T14:00' });
    expect(byId('t-invoice').deadline).toBe('2026-10-22T15:00');
    /* No length of its own: the app's 30 minutes, from where the invoice ends. */
    expect(byId('t-call').deadline).toBe('2026-10-22T15:30');
    expect(result.summary).toMatch(/one after another from Thu, 22 Oct 2026, 14:00, the last due 15:30\.$/);
  });

  it('reads the start the way gemma wrote it, with seconds and with an offset', async () => {
    /* Both measured on gemma (2026-10-22): "2026-10-23T14:00:00" and "…T14:00:00+05:30". */
    await run({ taskIds: ['t-invoice'], start: '2026-10-23T14:00:00' });
    expect(byId('t-invoice').deadline).toBe('2026-10-23T15:00');
    await run({ taskIds: ['t-invoice'], start: '2026-10-24T09:30:00+05:30' });
    expect(byId('t-invoice').deadline).toBe('2026-10-24T10:30');
  });

  it('runs into the next day past midnight', async () => {
    await run({ taskIds: ['t-invoice'], start: '2026-10-21T23:30' });
    expect(byId('t-invoice').deadline).toBe('2026-10-22T00:30');
  });

  it('refuses what the drag refuses, and still does the rest', async () => {
    const { result } = await run({ taskIds: ['t-gels', 't-done', 's-one', 'nope', 't-call'], start: '2026-10-21T15:00' });
    expect(result.ok).toBe(true);
    const failed = (result.data as { failed: { id: string; reason: string }[] }).failed;
    expect(failed.map((f) => f.id)).toEqual(['t-gels', 't-done', 's-one', 'nope']);
    expect(failed[0].reason).toMatch(/due before "Mumbai Marathon" and moves with it/);
    expect(failed[1].reason).toMatch(/already finished/);
    expect(failed[2].reason).toMatch(/step inside another task/);
    expect(byId('t-gels').deadline).toBe('2026-11-07T06:00');
    expect(byId('t-gels').eventId).toBe('ev-run');
    expect(byId('t-call').deadline).toBe('2026-10-21T15:30');
  });

  it('needs a time of day', async () => {
    expect((await run({ taskIds: ['t-call'], start: '2026-10-21' })).result.ok).toBe(false);
    expect((await run({ taskIds: ['t-call'], start: 'tomorrow' })).result.ok).toBe(false);
    expect(byId('t-call').deadline).toBeUndefined();
  });

  it('says so, and writes nothing, for a task already there', async () => {
    const { result, token } = await run({ taskIds: ['t-invoice'], start: '2026-10-21T09:00' });
    expect(result.summary).toBe('"Send the invoice" was already there, so nothing changed.');
    expect(token).toBeNull();
  });

  it('is undone whole by Revert', async () => {
    const { token } = await run({ taskIds: ['t-invoice', 't-call'], start: '2026-10-21T15:00' });
    expect(token).not.toBeNull();
    expect(applyUndo(token!).ok).toBe(true);
    expect(useStore.getState().backlogTasks).toEqual(BOARD);
  });

  it('draws its chip from what moved', async () => {
    const { result } = await run({ taskIds: ['t-invoice'], start: '2026-10-21T15:00' });
    const chip = describeToolCall(
      { name: 'schedule_task', args: { taskIds: ['t-invoice'] }, ok: true, summary: result.summary, data: result.data, durationMs: 1 },
      'Asia/Kolkata',
      NOW,
    );
    expect(chip.verb).toBe('Scheduled');
    expect(chip.wrote).toBe(true);
  });
});

describe('where it is registered', () => {
  it('is in the Tasks drawer, which says so, and runs free', () => {
    expect(drawerOf('schedule_task')).toBe('tasks');
    expect(DRAWERS.tasks.description).toMatch(/putting it on the calendar at a time/);
    expect(frontDoorKindOf(scheduleTask)).toBeUndefined();
  });
});
