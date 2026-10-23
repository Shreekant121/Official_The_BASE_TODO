import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LISTS, useStore, type Project, type Task, type TaskList } from '../src/store/useStore';
import { useTrashStore } from '../src/store/useTrashStore';
import { useSnapshotStore } from '../src/store/useSnapshotStore';
import { liveAgentStore, liveSnapshotCapture } from '../src/lib/agent/liveContext';
import { moveTask, placeInList } from '../src/lib/agent/tools/moveTools';
import { DRAWERS, drawerOf, frontDoorKindOf } from '../src/lib/agent/tools/index';
import { describeToolCall } from '../src/lib/agent/toolChip';
import type { ToolContext } from '../src/lib/agent/types';
import { applyUndo, beginCapture, endCapture, type UndoPayload } from '../src/lib/agent/toolServer/undo';

/**
 * BUILD-17 — ATLAS CAN MOVE AND REORDER TASKS.
 *
 * "Done when: he asks Atlas to move a task and it moves." Held here against the
 * real Zustand store and the real capture ring, with the undo token
 * round-tripped through JSON as it travels to Atlas's log and back — the
 * arrangement `boardUndo.test.ts` uses — because "runs free" is only his call
 * to make if Revert really puts every row back where it was.
 */

const NOW = new Date('2026-09-24T11:00:00+05:30');

const PROJECTS: Project[] = [
  { id: 'p-home', name: 'Home', createdAt: 0, order: 0 },
  { id: 'p-work', name: 'Work', createdAt: 1, order: 1 },
];

const LISTS: TaskList[] = [
  ...DEFAULT_LISTS,
  { id: 'l-chores', title: 'Chores', projectId: 'p-home', order: 0 },
  { id: 'l-garden', title: 'Garden', projectId: 'p-home', order: 1 },
  { id: 'l-admin', title: 'Admin', projectId: 'p-work', order: 0 },
  // Two lists called "Errands", so a bare name cannot say which.
  { id: 'l-errands-home', title: 'Errands', projectId: 'p-home', order: 2 },
  { id: 'l-errands-work', title: 'Errands', projectId: 'p-work', order: 1 },
];

const task = (id: string, title: string, listId: string, listName: string, order: number, extra: Partial<Task> = {}): Task => ({
  id, title, status: 'needsAction', listId, listName, order, subtasks: [], createdAt: order, ...extra,
});

const BOARD: Task[] = [
  task('t-bins', 'Take the bins out', 'l-chores', 'Chores', 0),
  task('t-dishes', 'Dishes', 'l-chores', 'Chores', 1, {
    subtasks: [{ id: 's-rinse', title: 'Rinse', status: 'needsAction', subtasks: [] }],
  }),
  task('t-laundry', 'Laundry', 'l-chores', 'Chores', 2),
  task('t-roses', 'Prune the roses', 'l-garden', 'Garden', 0),
  task('t-invoice', 'Send the invoice', 'l-admin', 'Admin', 0),
  task('t-taxes', 'File the taxes', 'l-admin', 'Admin', 1),
];

beforeEach(() => {
  useStore.setState({
    projects: structuredClone(PROJECTS),
    taskLists: structuredClone(LISTS),
    backlogTasks: structuredClone(BOARD),
    tasks: [],
    focusLog: [],
  });
  useTrashStore.setState({ entries: [] });
  useSnapshotStore.getState().clearTurns();
});

function contextFor(): ToolContext {
  return {
    snapshotHandle: beginCapture('turn-1', 'move_task'),
    now: NOW,
    timezone: 'Asia/Kolkata',
    store: liveAgentStore,
    snapshots: liveSnapshotCapture,
  };
}

async function move(args: Record<string, unknown>) {
  const ctx = contextFor();
  const result = await moveTask.execute(args, ctx);
  const payload = endCapture(ctx.snapshotHandle);
  return { result, token: JSON.parse(JSON.stringify(payload)) as UndoPayload | null };
}

const byId = (id: string) => useStore.getState().backlogTasks.find((t) => t.id === id)!;

/** A list's titles in the order the board draws them. */
const column = (listId: string) =>
  useStore
    .getState()
    .backlogTasks.filter((t) => t.listId === listId && !t.parent)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((t) => t.title);

describe('placeInList — the arithmetic', () => {
  const tasks = structuredClone(BOARD);
  const ids = (placements: { taskId: string }[]) => placements.map((p) => p.taskId);

  it('puts a block at the top or the bottom, in the order it was given, and numbers the list 0..n-1', () => {
    expect(placeInList(tasks, 'l-chores', ['t-laundry', 't-bins'], { kind: 'top' })).toEqual([
      { taskId: 't-laundry', order: 0 },
      { taskId: 't-bins', order: 1 },
      { taskId: 't-dishes', order: 2 },
    ]);
    expect(ids(placeInList(tasks, 'l-chores', ['t-bins'], { kind: 'bottom' }))).toEqual(['t-dishes', 't-laundry', 't-bins']);
  });

  it('puts a task just above or just below another, including one arriving from another list', () => {
    expect(ids(placeInList(tasks, 'l-chores', ['t-roses'], { kind: 'before', taskId: 't-dishes' }))).toEqual([
      't-bins', 't-roses', 't-dishes', 't-laundry',
    ]);
    expect(ids(placeInList(tasks, 'l-chores', ['t-bins'], { kind: 'after', taskId: 't-laundry' }))).toEqual([
      't-dishes', 't-laundry', 't-bins',
    ]);
  });

  it('keeps the board’s own order for ties — backlog position, as the board’s stable sort draws them', () => {
    const tied = [task('a', 'A', 'l', 'L', 0), task('b', 'B', 'l', 'L', 0), task('c', 'C', 'l', 'L', 0)];
    expect(ids(placeInList(tied, 'l', ['c'], { kind: 'top' }))).toEqual(['c', 'a', 'b']);
  });
});

describe('move_task — he asks Atlas to move a task, and it moves', () => {
  it('moves a task to another list by name, to the bottom, and relabels it', async () => {
    const { result } = await move({ taskIds: ['t-roses'], list: 'Admin' });

    expect(result.ok).toBe(true);
    expect(result.summary).toBe('Moved "Prune the roses" to Admin in Work.');
    expect(byId('t-roses')).toMatchObject({ listId: 'l-admin', listName: 'Admin', order: 2 });
    expect(column('l-admin')).toEqual(['Send the invoice', 'File the taxes', 'Prune the roses']);
    expect(column('l-garden')).toEqual([]);
  });

  it('reorders within a list, and several tasks travel together in the order given', async () => {
    const { result } = await move({ taskIds: ['t-laundry', 't-dishes'], position: 'top' });

    expect(result.summary).toBe('Moved "Laundry" and "Dishes" to the top of Chores in Home.');
    expect(column('l-chores')).toEqual(['Laundry', 'Dishes', 'Take the bins out']);
  });

  it('puts a task beside another one, and that task alone decides the list', async () => {
    const { result } = await move({ taskIds: ['t-invoice'], afterTaskId: 't-bins' });

    expect(result.summary).toBe('Moved "Send the invoice" in Chores in Home, just below "Take the bins out".');
    expect(column('l-chores')).toEqual(['Take the bins out', 'Send the invoice', 'Dishes', 'Laundry']);
    expect(column('l-admin')).toEqual(['File the taxes']);
  });

  it('moves into a project’s first list when only the project is named, and says so', async () => {
    const { result } = await move({ taskIds: ['t-invoice'], project: 'Home' });

    expect(byId('t-invoice')).toMatchObject({ listId: 'l-chores', order: 3 });
    expect(result.summary).toMatch(/"Home" has 3 lists, so they went to its first, Chores/);
  });

  it('refuses a list name two projects share, and takes it with the project', async () => {
    const ambiguous = await move({ taskIds: ['t-bins'], list: 'Errands' });
    expect(ambiguous.result.ok).toBe(false);
    expect(ambiguous.result.summary).toMatch(/2 lists are called "Errands"/);
    expect(byId('t-bins').listId).toBe('l-chores');

    await move({ taskIds: ['t-bins'], list: 'Errands', project: 'Work' });
    expect(byId('t-bins')).toMatchObject({ listId: 'l-errands-work', listName: 'Errands', order: 0 });
  });

  it('says a task already in place changed nothing, and writes nothing for it', async () => {
    const { result, token } = await move({ taskIds: ['t-bins'], position: 'top' });

    expect(result.ok).toBe(true);
    expect(result.summary).toBe('"Take the bins out" was already there, so nothing changed.');
    expect(token).toBeNull();
  });

  it('relabels the copy in today’s queue too, because it goes through updateBacklogTask', async () => {
    useStore.setState({ tasks: [structuredClone(byId('t-roses'))] });

    await move({ taskIds: ['t-roses'], list: 'Chores' });

    expect(useStore.getState().tasks[0]).toMatchObject({ id: 't-roses', listId: 'l-chores', listName: 'Chores' });
  });

  it('drops the share when a task moves home into a list it was shared into', async () => {
    useStore.setState({
      backlogTasks: useStore.getState().backlogTasks.map((t) => (t.id === 't-taxes' ? { ...t, sharedListIds: ['l-chores'] } : t)),
    });

    await move({ taskIds: ['t-taxes'], list: 'Chores' });

    expect(byId('t-taxes').listId).toBe('l-chores');
    expect('sharedListIds' in byId('t-taxes')).toBe(false);
  });
});

describe('what it refuses', () => {
  it('will not move a step on its own, and moves the rest of the batch', async () => {
    const { result } = await move({ taskIds: ['s-rinse', 't-bins'], list: 'Garden' });

    expect(result.ok).toBe(true);
    expect(result.summary).toMatch(/"Rinse": it is a step inside "Dishes"/);
    expect(byId('t-bins').listId).toBe('l-garden');
    expect(byId('t-dishes').subtasks?.map((s) => s.id)).toEqual(['s-rinse']);
  });

  it('refuses arguments that disagree, before writing anything', async () => {
    const both = await move({ taskIds: ['t-bins'], position: 'top', afterTaskId: 't-dishes' });
    expect(both.result.ok).toBe(false);
    expect(both.result.summary).toMatch(/only one of "position", "beforeTaskId" and "afterTaskId"/);

    const elsewhere = await move({ taskIds: ['t-bins'], list: 'Admin', beforeTaskId: 't-roses' });
    expect(elsewhere.result.summary).toMatch(/"Prune the roses" is in Garden in Home, not Admin in Work/);

    const nothing = await move({ taskIds: ['t-bins'] });
    expect(nothing.result.summary).toMatch(/there is nothing to do/);

    expect(useStore.getState().backlogTasks).toEqual(BOARD);
  });
});

describe('Revert', () => {
  it('puts every row back — the moved task in its old list, and the list it landed in in its old order', async () => {
    const { token } = await move({ taskIds: ['t-roses', 't-laundry'], list: 'Admin', position: 'top' });
    expect(column('l-admin')).toEqual(['Prune the roses', 'Laundry', 'Send the invoice', 'File the taxes']);

    const report = applyUndo(token);

    expect(report.ok).toBe(true);
    expect(useStore.getState().backlogTasks).toEqual(BOARD);
  });
});

describe('where it is registered', () => {
  it('is in the Tasks drawer, runs free, and is not given to the in-browser fallback', () => {
    expect(drawerOf('move_task')).toBe('tasks');
    expect(DRAWERS.tasks.description).toMatch(/moving it to another list or project and reordering it/);
    expect(moveTask.mutates).toBe(true);
    expect(frontDoorKindOf(moveTask)).toBeUndefined();
  });

  it('draws as a move on the chat and the log, not as its own name', async () => {
    const { result } = await move({ taskIds: ['t-roses'], list: 'Admin', position: 'top' });
    const chip = describeToolCall(
      { name: 'move_task', args: { taskIds: ['t-roses'], list: 'Admin', position: 'top' }, ok: result.ok, summary: result.summary, data: result.data, durationMs: 1 },
      'Asia/Kolkata',
      NOW,
    );
    expect(chip).toMatchObject({ icon: 'update', verb: 'Moved', subject: 'Prune the roses', detail: 'in Admin · Work · to the top', wrote: true });
  });
});
