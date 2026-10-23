/**
 * His undo (29-1P4a), driven through the real store: the recorder wraps the
 * real actions, a press is recorded a microtask later, and undo goes back
 * through `updateBacklogTask`, the Trash and the archive's put-back.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useStore, type Project, type Task, type TaskList } from './useStore';
import { useTrashStore } from './useTrashStore';
import { useArchiveStore } from './useArchiveStore';
import { installUndoRecorder, useUndoStore } from './useUndoStore';
import { withoutUndo } from './undoGate';

const LISTS: TaskList[] = [
  { id: 'l1', title: 'Build', projectId: 'p1', order: 0 },
  { id: 'l2', title: 'Backburner', projectId: 'p1', order: 1 },
];
const PROJECTS = [{ id: 'p1', name: 'Launch', order: 0, createdAt: 0 }] as unknown as Project[];

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id, title: `Task ${id}`, status: 'needsAction', listId: 'l1', listName: 'Build', order: Number(id.slice(1)), ...over,
});

function seed(tasks: Task[]) {
  useStore.setState({
    projects: structuredClone(PROJECTS),
    taskLists: structuredClone(LISTS),
    backlogTasks: structuredClone(tasks),
    tasks: [],
    focusLog: [],
  });
  useTrashStore.setState({ entries: [] });
  useArchiveStore.setState({ entries: [] });
  useUndoStore.getState().clear();
}

/** A press is recorded once its synchronous work is done. */
const settle = () => new Promise<void>((resolve) => queueMicrotask(resolve));
const store = () => useStore.getState();
const find = (id: string) => store().backlogTasks.find((t) => t.id === id);
const undo = () => useUndoStore.getState().undo('keys');
const redo = () => useUndoStore.getState().redo('keys');

beforeAll(() => installUndoRecorder());
beforeEach(() => seed([task('t1'), task('t2'), task('t3')]));

describe('recording a press', () => {
  it('records a tick, names it, and undoes it through the store', async () => {
    store().updateBacklogTask('t1', { status: 'completed' });
    await settle();
    expect(useUndoStore.getState().done[0]).toMatchObject({ kind: 'tick', label: 'Ticked “Task t1”' });

    undo();
    expect(find('t1')?.status).toBe('needsAction');
    expect(useUndoStore.getState().done).toHaveLength(0);
  });

  it('leaves a typed title out — only ticks, deletes, moves, dates and importance count', async () => {
    store().updateBacklogTask('t1', { title: 'Renamed' });
    await settle();
    expect(useUndoStore.getState().done).toHaveLength(0);
  });

  it('counts a bulk tick of several tasks as one press', async () => {
    store().updateBacklogTask('t1', { status: 'completed' });
    store().updateBacklogTask('t2', { status: 'completed' });
    await settle();
    expect(useUndoStore.getState().done).toHaveLength(1);
    expect(useUndoStore.getState().done[0].label).toBe('Ticked 2 tasks');

    undo();
    expect(find('t1')?.status).toBe('needsAction');
    expect(find('t2')?.status).toBe('needsAction');
  });

  it('ignores what Atlas does', async () => {
    withoutUndo(() => store().updateBacklogTask('t1', { status: 'completed' }));
    await settle();
    expect(useUndoStore.getState().done).toHaveLength(0);
  });

  it('keeps only the last 20', async () => {
    for (let i = 0; i < 23; i++) {
      store().updateBacklogTask('t1', { status: i % 2 === 0 ? 'completed' : 'needsAction' });
      await settle();
    }
    expect(useUndoStore.getState().done).toHaveLength(20);
  });
});

describe('putting things back', () => {
  it('brings a deleted task back out of the Trash, and redo deletes it again', async () => {
    store().deleteBacklogTask('t2');
    await settle();
    expect(find('t2')).toBeUndefined();
    expect(useUndoStore.getState().done[0]).toMatchObject({ kind: 'delete', label: 'Deleted “Task t2”' });

    undo();
    expect(find('t2')?.title).toBe('Task t2');
    expect(useTrashStore.getState().entries).toHaveLength(0);

    redo();
    expect(find('t2')).toBeUndefined();
    expect(useTrashStore.getState().entries).toHaveLength(1);
  });

  it('brings a deleted list back with its tasks', async () => {
    store().deleteTaskList('l1');
    await settle();
    expect(store().backlogTasks).toHaveLength(0);
    expect(useUndoStore.getState().done[0].label).toBe('Deleted the list “Build”');

    undo();
    expect(store().taskLists.map((l) => l.id)).toContain('l1');
    expect(store().backlogTasks.map((t) => t.id).sort()).toEqual(['t1', 't2', 't3']);
  });

  it('moves a task back to the list it came from, in its old place', async () => {
    store().moveTaskToList('t1', 'l2');
    await settle();
    expect(useUndoStore.getState().done[0]).toMatchObject({ kind: 'move', label: 'Moved “Task t1” to Backburner' });

    undo();
    expect(find('t1')).toMatchObject({ listId: 'l1', listName: 'Build', order: 1 });
  });

  it('takes an archive off the shelf, and redo archives it again rather than deleting it', async () => {
    store().archiveBacklogTask('t3');
    await settle();
    expect(useUndoStore.getState().done[0]).toMatchObject({ kind: 'archive', label: 'Archived “Task t3”' });

    undo();
    expect(find('t3')).toBeDefined();
    expect(useArchiveStore.getState().entries).toHaveLength(0);

    redo();
    expect(find('t3')).toBeUndefined();
    expect(useArchiveStore.getState().entries).toHaveLength(1);
    expect(useTrashStore.getState().entries).toHaveLength(0);
  });

  it('puts a date and an importance back', async () => {
    store().updateBacklogTask('t1', { deadline: '2026-03-20T12:00' });
    await settle();
    expect(useUndoStore.getState().done[0].kind).toBe('date');
    store().updateBacklogTask('t1', { humanOverride: 9 });
    await settle();
    expect(useUndoStore.getState().done[0].kind).toBe('priority');

    undo();
    undo();
    expect(find('t1')?.deadline).toBeUndefined();
    expect(find('t1')?.humanOverride).toBeUndefined();
  });

  it('un-ticking a repeating task takes its successor back, and nothing goes to the Trash', async () => {
    seed([task('t1', { deadline: '2026-03-10T12:00', recurrence: 'daily' })]);
    store().updateBacklogTask('t1', { status: 'completed' });
    await settle();
    expect(store().backlogTasks).toHaveLength(2);

    undo();
    expect(store().backlogTasks.map((t) => t.id)).toEqual(['t1']);
    expect(find('t1')?.status).toBe('needsAction');
    expect(useTrashStore.getState().entries).toHaveLength(0);
  });

  it('a new press empties redo', async () => {
    store().updateBacklogTask('t1', { status: 'completed' });
    await settle();
    undo();
    expect(useUndoStore.getState().undone).toHaveLength(1);
    store().updateBacklogTask('t2', { status: 'completed' });
    await settle();
    expect(useUndoStore.getState().undone).toHaveLength(0);
  });

  it('the toast undoes only its own press', async () => {
    store().updateBacklogTask('t1', { status: 'completed' });
    await settle();
    const first = useUndoStore.getState().done[0].id;
    store().updateBacklogTask('t2', { status: 'completed' });
    await settle();
    expect(useUndoStore.getState().undo('toast', first)).toBeNull();
    expect(find('t2')?.status).toBe('completed');
  });
});
