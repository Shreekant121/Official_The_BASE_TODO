import { beforeEach, describe, expect, it } from 'vitest';
import { createTask, getTask, updateTask } from './taskTools';
import { deleteEvent, listEvents, updateEvent } from './eventTools';
import { useEventStore } from '../../../store/useEventStore';
import { useStore, type Task } from '../../../store/useStore';
import { revertSnapshotEntries, useSnapshotStore, type SnapshotEntry } from '../../../store/useSnapshotStore';
import { liveAgentStore } from '../liveContext';
import type { ToolContext } from '../types';

/**
 * 29-2d1: Atlas makes a task due before an event, and moving or deleting the
 * event through its tools takes the tasks along — with Revert putting both
 * back. Events sit in 2030, one-offs, so the dates read the same in any zone.
 */

const TZ = 'Asia/Kolkata';
const NOW = new Date('2026-10-21T09:00:00+05:30');

function ctx(): ToolContext {
  const snapshots = useSnapshotStore.getState();
  return {
    snapshotHandle: snapshots.beginTurn('test'),
    now: NOW,
    timezone: TZ,
    store: liveAgentStore,
    snapshots: {
      captureTask: (h, id) => useSnapshotStore.getState().captureTask(h, id),
      captureList: () => {}, captureProject: () => {},
      captureEvent: (h, id) => useSnapshotStore.getState().captureEvent(h, id),
    },
  };
}

function undoOf(c: ToolContext): SnapshotEntry[] {
  return JSON.parse(JSON.stringify(useSnapshotStore.getState().takeDraft(c.snapshotHandle)?.entries ?? []));
}

const task = (id: string, over: Partial<Task> = {}): Task => ({ id, title: id, status: 'needsAction', listId: 'action-steps', order: 0, ...over });
const find = (id: string) => useStore.getState().backlogTasks.find((t) => t.id === id)!;

beforeEach(() => {
  useEventStore.setState({
    events: [
      { id: 'run', title: 'Mumbai Marathon', start: '2030-11-12T06:00', createdAt: 0 },
      { id: 'trip', title: 'Goa', start: '2030-12-20', createdAt: 0 },
    ],
  });
  useStore.setState({
    projects: [],
    taskLists: [{ id: 'action-steps', title: 'Action Steps', order: 0 }],
    backlogTasks: [task('shoes', { title: 'Buy running shoes' })],
    tasks: [],
    focusLog: [],
  });
});

describe('create_task and update_task with eventId', () => {
  it('a new task due before an event takes its date and the link', async () => {
    const result = await createTask.execute({ tasks: [{ title: 'Pack', eventId: 'trip' }] }, ctx());
    expect(result.ok).toBe(true);
    const made = useStore.getState().backlogTasks.find((t) => t.title === 'Pack')!;
    expect(made).toMatchObject({ eventId: 'trip', deadline: '2030-12-19T18:00' });
    expect(result.summary).toContain('due before Goa');
  });

  it('a new task due before an event, named as an open one he has, ties that one instead of a copy', async () => {
    const c = ctx();
    const result = await createTask.execute({ tasks: [{ title: 'buy running shoes', eventId: 'run' }] }, c);
    expect(result.summary).toContain('instead of made again');
    expect(useStore.getState().backlogTasks.filter((t) => /running shoes/i.test(t.title))).toHaveLength(1);
    expect(find('shoes')).toMatchObject({ eventId: 'run', deadline: '2030-11-12T06:00' });
    revertSnapshotEntries(undoOf(c), { undoCreations: true });
    expect(find('shoes').eventId).toBeUndefined();
  });

  it('links an existing task, and a clear lifts the link but keeps the date', async () => {
    await updateTask.execute({ taskIds: ['shoes'], eventId: 'run' }, ctx());
    expect(find('shoes')).toMatchObject({ eventId: 'run', deadline: '2030-11-12T06:00' });
    const read = await getTask.execute({ taskIds: ['shoes'] }, ctx());
    expect((read.data as { tasks: Record<string, unknown>[] }).tasks[0]).toMatchObject({ dueBefore: 'Mumbai Marathon' });
    await updateTask.execute({ taskIds: ['shoes'], clear: ['eventId'] }, ctx());
    expect(find('shoes').eventId).toBeUndefined();
    expect(find('shoes').deadline).toBe('2030-11-12T06:00');
  });

  it('takes a name only one event answers to, as gemma sent it (2026-10-21), and refuses one two answer to', async () => {
    await updateTask.execute({ taskIds: ['shoes'], eventId: 'mumbai marathon' }, ctx());
    expect(find('shoes').eventId).toBe('run');
    await updateTask.execute({ taskIds: ['shoes'], clear: ['eventId'] }, ctx());
    const part = await updateTask.execute({ taskIds: ['shoes'], eventId: 'the marathon' }, ctx());
    expect(part.summary).toContain('due before Mumbai Marathon');
    expect(find('shoes').eventId).toBe('run');
    useEventStore.getState().addEvent({ title: 'Goa wedding', start: '2030-12-27' });
    /* "Goa" is one event's exact name, so "my goa" asks by the words, which two titles hold. */
    const two = await updateTask.execute({ taskIds: ['shoes'], eventId: 'my goa' }, ctx());
    expect(two.ok).toBe(false);
    expect(two.summary).toContain('2 events');
  });

  it('refuses an unknown event, and a deadline sent with it', async () => {
    const unknown = await updateTask.execute({ taskIds: ['shoes'], eventId: 'nope' }, ctx());
    expect(unknown.ok).toBe(false);
    expect(unknown.summary).toContain('list_events');
    const both = await updateTask.execute({ taskIds: ['shoes'], eventId: 'run', deadline: '2030-11-01T09:00' }, ctx());
    expect(both.ok).toBe(false);
    expect(find('shoes').eventId).toBeUndefined();
  });
});

describe('the event tools carry its tasks', () => {
  beforeEach(() => useStore.getState().updateBacklogTask('shoes', { eventId: 'run', deadline: '2030-11-12T06:00' }));

  it('list_events names the tasks due before it', async () => {
    const listed = await listEvents.execute({}, ctx());
    const run = (listed.data as { events: Record<string, unknown>[] }).events.find((e) => e.eventId === 'run');
    expect(run?.tasksDueBefore).toEqual([{ taskId: 'shoes', title: 'Buy running shoes' }]);
  });

  it('moving the event moves the task, and Revert puts both back', async () => {
    const c = ctx();
    await updateEvent.execute({ events: [{ eventId: 'run', start: '2030-11-19T07:00' }] }, c);
    expect(find('shoes').deadline).toBe('2030-11-19T07:00');
    revertSnapshotEntries(undoOf(c), { undoCreations: true });
    expect(useEventStore.getState().events.find((e) => e.id === 'run')?.start).toBe('2030-11-12T06:00');
    expect(find('shoes')).toMatchObject({ deadline: '2030-11-12T06:00', eventId: 'run' });
  });

  it('deleting the event keeps the date, and Revert ties them again', async () => {
    const c = ctx();
    await deleteEvent.execute({ eventIds: ['run'] }, c);
    expect(find('shoes').eventId).toBeUndefined();
    expect(find('shoes').deadline).toBe('2030-11-12T06:00');
    revertSnapshotEntries(undoOf(c), { undoCreations: true });
    expect(find('shoes').eventId).toBe('run');
  });
});
