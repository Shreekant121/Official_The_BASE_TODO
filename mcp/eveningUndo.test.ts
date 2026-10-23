import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LISTS, useStore, type Task } from '../src/store/useStore';
import { useTrashStore } from '../src/store/useTrashStore';
import { useSnapshotStore } from '../src/store/useSnapshotStore';
import { liveAgentStore, liveSnapshotCapture } from '../src/lib/agent/liveContext';
import { sendToEvening } from '../src/lib/agent/tools/eveningTools';
import { DRAWERS, drawerOf, frontDoorKindOf } from '../src/lib/agent/tools/index';
import { describeToolCall } from '../src/lib/agent/toolChip';
import type { ToolContext } from '../src/lib/agent/types';
import { applyUndo, beginCapture, endCapture, type UndoPayload } from '../src/lib/agent/toolServer/undo';

/**
 * 29-1c2 — ATLAS SENDS A TASK TO THIS EVENING, AND BACK.
 *
 * Held against the real store and the real capture ring, the undo token
 * round-tripped through JSON as it travels to Atlas's log, as `moveUndo.test.ts`
 * does: the tool runs free only because Revert really puts the deadline back.
 */

const NOW = new Date('2026-10-21T11:00:00+05:30');

const task = (id: string, title: string, extra: Partial<Task> = {}): Task => ({
  id, title, status: 'needsAction', listId: 'action', listName: 'Action Steps', order: 0, subtasks: [], createdAt: 0, ...extra,
});

const BOARD: Task[] = [
  task('t-invoice', 'Send the invoice', { deadline: '2026-10-21T14:00' }),
  task('t-call', 'Call the CA', { deadline: '2026-10-21T19:30' }),
  task('t-done', 'Old thing', { deadline: '2026-10-21T10:00', status: 'completed', completedAt: 1 }),
  task('t-steps', 'Has steps', { subtasks: [{ id: 's-one', title: 'One', status: 'needsAction', subtasks: [] }] }),
];

beforeEach(() => {
  useStore.setState({ projects: [], taskLists: structuredClone(DEFAULT_LISTS), backlogTasks: structuredClone(BOARD), tasks: [], focusLog: [] });
  useTrashStore.setState({ entries: [] });
  useSnapshotStore.getState().clearTurns();
});

async function run(args: Record<string, unknown>) {
  const ctx: ToolContext = {
    snapshotHandle: beginCapture('turn-1', 'send_to_evening'),
    now: NOW,
    timezone: 'Asia/Kolkata',
    store: liveAgentStore,
    snapshots: liveSnapshotCapture,
  };
  const result = await sendToEvening.execute(args, ctx);
  const payload = endCapture(ctx.snapshotHandle);
  return { result, token: JSON.parse(JSON.stringify(payload)) as UndoPayload | null };
}

const byId = (id: string) => useStore.getState().backlogTasks.find((t) => t.id === id)!;

describe('send_to_evening', () => {
  it('sends a task to 9pm remembering its time, and brings it back to that time', async () => {
    const sent = await run({ taskIds: ['t-invoice'] });
    expect(sent.result.ok).toBe(true);
    expect(sent.result.summary).toBe('Sent "Send the invoice" to this evening.');
    expect(byId('t-invoice').deadline).toBe('2026-10-21T21:00');
    expect(byId('t-invoice').beforeEvening).toEqual({ was: '2026-10-21T14:00', to: '2026-10-21T21:00' });

    const back = await run({ taskIds: ['t-invoice'], back: true });
    expect(back.result.summary).toBe('Brought "Send the invoice" back from the evening.');
    expect(byId('t-invoice').deadline).toBe('2026-10-21T14:00');
    expect(byId('t-invoice').beforeEvening).toBeUndefined();
  });

  it('says so, and changes nothing, for a task already where it was asked to go', async () => {
    const { result } = await run({ taskIds: ['t-call', 't-invoice'] });
    expect(result.summary).toBe('Sent "Send the invoice" to this evening; "Call the CA" was already in the evening, so nothing changed.');
    expect(byId('t-call').deadline).toBe('2026-10-21T19:30');
  });

  it('refuses a finished task, a step and an unknown id, and still does the rest', async () => {
    const { result } = await run({ taskIds: ['t-done', 's-one', 'nope', 't-invoice'] });
    expect(result.ok).toBe(true);
    const failed = (result.data as { failed: { id: string; reason: string }[] }).failed;
    expect(failed.map((f) => f.id)).toEqual(['t-done', 's-one', 'nope']);
    expect(failed[0].reason).toMatch(/already finished/);
    expect(failed[1].reason).toMatch(/step inside another task/);
    expect(byId('t-invoice').deadline).toBe('2026-10-21T21:00');
  });

  it('brings back everything in this evening when no ids are named', async () => {
    await run({ taskIds: ['t-invoice'] });
    const { result } = await run({ back: true, taskIds: [] });
    expect(result.summary).toBe('Brought "Send the invoice" and "Call the CA" back from the evening.');
    expect(byId('t-invoice').deadline).toBe('2026-10-21T14:00');
    expect(byId('t-call').deadline).toBe('2026-10-21T18:00');
  });

  it('needs ids to send, and says so when the evening is already empty', async () => {
    expect((await run({})).result.ok).toBe(false);
    useStore.setState({ backlogTasks: [task('t-day', 'Day thing', { deadline: '2026-10-21T12:00' })] });
    expect((await run({ back: true })).result.summary).toBe('Nothing is in this evening, so nothing changed.');
  });

  it('is undone whole by Revert, memory and all', async () => {
    const { token } = await run({ taskIds: ['t-invoice', 't-call'] });
    expect(token).not.toBeNull();
    expect(applyUndo(token!).ok).toBe(true);
    expect(useStore.getState().backlogTasks).toEqual(BOARD);
  });

  it('draws its chip from what moved', async () => {
    const { result } = await run({ taskIds: ['t-invoice'] });
    const chip = describeToolCall(
      { name: 'send_to_evening', args: { taskIds: ['t-invoice'] }, ok: true, summary: result.summary, data: result.data, durationMs: 1 },
      'Asia/Kolkata',
      NOW,
    );
    expect(chip.verb).toBe('Sent to this evening');
    expect(chip.wrote).toBe(true);
  });
});

describe('where it is registered', () => {
  it('is in the Tasks drawer, which says so, and runs free', () => {
    expect(drawerOf('send_to_evening')).toBe('tasks');
    expect(DRAWERS.tasks.description).toMatch(/sending it to this evening/);
    expect(frontDoorKindOf(sendToEvening)).toBeUndefined();
  });
});
