import { beforeEach, describe, expect, it } from 'vitest';
import { useStore, type Task, type TaskList } from '../src/store/useStore';
import { useTrashStore } from '../src/store/useTrashStore';
import { useSnapshotStore } from '../src/store/useSnapshotStore';
import { liveAgentStore, liveSnapshotCapture } from '../src/lib/agent/liveContext';
import { completeTask, createTask, updateTask } from '../src/lib/agent/tools/taskTools';
import { deleteTask } from '../src/lib/agent/tools/trashTools';
import type { ToolContext } from '../src/lib/agent/types';
import { applyUndo, beginCapture, endCapture, type UndoPayload } from './undo.ts';

/**
 * ONE INSTRUCTION, ONE UNDO (item 13D).
 *
 * WHY THIS IS A TEST AND NOT A PARAGRAPH
 * ---------------------------------------
 * The item settled that a batch gets **one** undo — *"ten separate undos to
 * reverse one sentence is the same complaint from the other side"* — and then
 * said the thing that matters here: `mcp/undo.ts` already carries a per-call
 * token, a batch is one call, so this *should* fall out. **Verify it rather
 * than assuming it.**
 *
 * It is worth verifying because the mechanism has three parts that each had to
 * hold, and only one of them is in this file's control:
 *
 * - every item in a batch has to capture into the *same* handle, rather than
 *   the tool opening one per item (`batch.test.ts` asserts the capture order);
 * - `endCapture` has to lift all of them out as one payload, so Atlas files one
 *   log entry with one token and draws one Revert button;
 * - `revertSnapshotEntries` has to put all of them back, including the
 *   creations, which on this side is a soft delete into the 30-day Trash.
 *
 * So this drives the real path end to end: the real Zustand store, the real
 * capture ring, the real tools, and the payload round-tripped through JSON the
 * way it actually travels to the laptop and back off disk.
 */

const NOW = new Date('2026-09-08T11:00:00+05:30');

const LISTS: TaskList[] = [
  { id: 'l-marketing', title: 'Marketing', order: 0 },
  { id: 'action', title: 'Action Steps', order: 1 },
];

const BOARD: Task[] = [
  { id: 't-oil', title: 'Oil Hair', status: 'needsAction', listId: 'l-marketing', listName: 'Marketing', order: 0, subtasks: [], createdAt: 1 },
  { id: 't-ca', title: 'Email the CA', status: 'needsAction', listId: 'l-marketing', listName: 'Marketing', order: 1, subtasks: [], createdAt: 2 },
  { id: 't-web', title: 'Maintain the website', status: 'needsAction', listId: 'l-marketing', listName: 'Marketing', order: 2, subtasks: [], createdAt: 3 },
  { id: 't-books', title: 'Books to read', status: 'needsAction', listId: 'l-marketing', listName: 'Marketing', order: 3, subtasks: [], createdAt: 4 },
  { id: 't-wait', title: 'Get waitlist', status: 'needsAction', listId: 'l-marketing', listName: 'Marketing', order: 4, subtasks: [], createdAt: 5 },
];

beforeEach(() => {
  useStore.setState({ projects: [], taskLists: structuredClone(LISTS), backlogTasks: structuredClone(BOARD), tasks: [], focusLog: [] });
  useTrashStore.setState({ entries: [] });
  useSnapshotStore.getState().clearTurns();
});

/** Exactly what `mcp/index.ts` builds for one tool call. */
function contextFor(toolName: string): ToolContext {
  return {
    snapshotHandle: beginCapture('turn-1', toolName),
    now: NOW,
    timezone: 'Asia/Kolkata',
    store: liveAgentStore,
    snapshots: liveSnapshotCapture,
  };
}

/** The token as it actually reaches Atlas and comes back off a JSON file. */
function overTheWire(payload: UndoPayload | null): unknown {
  return JSON.parse(JSON.stringify(payload));
}

const backlog = () => useStore.getState().backlogTasks;
const statusOf = (id: string) => backlog().find((task) => task.id === id)?.status;

describe('one call, one token', () => {
  it('puts every task a batch touched into a single payload', async () => {
    const ctx = contextFor('complete_task');
    const result = await completeTask.execute({ taskIds: ['t-oil', 't-ca', 't-web', 't-books', 't-wait'] }, ctx);
    const payload = endCapture(ctx.snapshotHandle);

    expect(result.ok).toBe(true);
    // One payload, five entries — not five payloads. This is the whole claim:
    // Atlas files one log entry per call, so one call is one Revert button.
    expect(payload).not.toBeNull();
    expect(payload?.entries).toHaveLength(5);
    expect(payload?.entries.map((entry) => entry.id)).toEqual(['t-oil', 't-ca', 't-web', 't-books', 't-wait']);
  });

  it('reverses the whole batch from that one payload', async () => {
    const ctx = contextFor('complete_task');
    await completeTask.execute({ taskIds: ['t-oil', 't-ca', 't-web', 't-books', 't-wait'] }, ctx);
    const payload = endCapture(ctx.snapshotHandle);

    expect(backlog().every((task) => task.status === 'completed')).toBe(true);

    const report = applyUndo(overTheWire(payload));

    expect(report.ok).toBe(true);
    expect(backlog().every((task) => task.status === 'needsAction')).toBe(true);
    // And the stamp goes with it, or the task is "not done" and still carries
    // the moment it was finished.
    expect(backlog().every((task) => task.completedAt === undefined)).toBe(true);
  });

  it('reverses a batched edit field by field, back to what each task had', async () => {
    useStore.setState({
      backlogTasks: backlog().map((task) => (task.id === 't-ca' ? { ...task, priority: 'low' as const } : task)),
    });

    const ctx = contextFor('update_task');
    await updateTask.execute({ taskIds: ['t-oil', 't-ca', 't-web'], priority: 'urgent' }, ctx);
    const payload = endCapture(ctx.snapshotHandle);

    expect(backlog().filter((task) => task.priority === 'urgent')).toHaveLength(3);

    applyUndo(overTheWire(payload));

    // The one that had a value gets that value back; the two that had none go
    // back to having none. A blanket "clear it" would have lost the `low`.
    expect(backlog().find((task) => task.id === 't-ca')?.priority).toBe('low');
    expect(backlog().find((task) => task.id === 't-oil')?.priority).toBeUndefined();
    expect(backlog().find((task) => task.id === 't-web')?.priority).toBeUndefined();
  });

  it('takes back every task a batched create made', async () => {
    const ctx = contextFor('create_task');
    await createTask.execute({ tasks: ['Buy milk', 'Buy bread', 'Buy eggs'] }, ctx);
    const payload = endCapture(ctx.snapshotHandle);

    expect(backlog()).toHaveLength(BOARD.length + 3);
    // Three entries, each with `prior: null` — "this did not exist" is what
    // makes undoing a creation possible at all (D6).
    expect(payload?.entries.every((entry) => entry.prior === null)).toBe(true);

    const report = applyUndo(overTheWire(payload));

    expect(report.ok).toBe(true);
    expect(backlog()).toHaveLength(BOARD.length);
    /*
     * Undoing a creation on this side is a *soft* delete, which is D3 expiring:
     * Atlas can delete, deletion is into a 30-day Trash, so the undo is itself
     * undoable. Three creations, three Trash entries.
     */
    expect(useTrashStore.getState().entries).toHaveLength(3);
  });

  it('brings a whole batched deletion back out of the Trash', async () => {
    const ctx = contextFor('delete_task');
    await deleteTask.execute({ taskIds: ['t-oil', 't-ca', 't-web'] }, ctx);
    const payload = endCapture(ctx.snapshotHandle);

    expect(backlog()).toHaveLength(2);

    applyUndo(overTheWire(payload));

    expect(backlog().map((task) => task.id).sort()).toEqual(['t-ca', 't-oil', 't-web', 't-books', 't-wait'].sort());
  });

  it('covers only the part of a partial batch that landed', async () => {
    const ctx = contextFor('complete_task');
    const result = await completeTask.execute({ taskIds: ['t-oil', 'not-a-task', 't-ca'] }, ctx);
    const payload = endCapture(ctx.snapshotHandle);

    expect(result.ok).toBe(true);
    // Two entries, not three: an undo offering to reverse something that never
    // happened would be worse than no undo at all.
    expect(payload?.entries.map((entry) => entry.id)).toEqual(['t-oil', 't-ca']);

    applyUndo(overTheWire(payload));
    expect(statusOf('t-oil')).toBe('needsAction');
    expect(statusOf('t-ca')).toBe('needsAction');
  });

  it('produces no token at all when a batch changed nothing', async () => {
    const ctx = contextFor('complete_task');
    const result = await completeTask.execute({ taskIds: ['nope', 'also-nope'] }, ctx);

    expect(result.ok).toBe(false);
    // `mcp/index.ts` sends the token only for a write that landed; `null` here
    // is what stops Atlas drawing a Revert button over a call that did nothing.
    expect(endCapture(ctx.snapshotHandle)).toBeNull();
  });

  it('empties the ring after each call, so a long-lived process does not hoard copies', async () => {
    const ctx = contextFor('complete_task');
    await completeTask.execute({ taskIds: ['t-oil', 't-ca'] }, ctx);
    endCapture(ctx.snapshotHandle);

    // The durable half is Atlas's log on disk; the ring is used for its capture
    // logic and then dropped. Twenty of these would otherwise sit in memory
    // holding complete copies of everything Atlas read this week.
    expect(useSnapshotStore.getState().turns).toHaveLength(0);
  });
});
