/**
 * **When a task was handed to someone, through the real store** (29-1P13).
 *
 * The Dashboard's "Waiting on" block counts the days from `assignedAt`, and
 * `applyTaskUpdate` stamps it, so every path that names a person — the task
 * sheet, Atlas through `mcp/` — gets it without knowing it exists. What is
 * worth pinning: a new name restarts the count, saving the sheet with the same
 * name does not, and taking the name off removes the key (not `undefined`,
 * which Firestore refuses).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStore, type Task } from './useStore';

const base: Task = { id: 't1', title: 'The brand logo', status: 'needsAction', listId: 'action-steps', subtasks: [] };

describe('assignedAt', () => {
  beforeEach(() => {
    vi.useRealTimers();
    useStore.setState({ backlogTasks: [{ ...base }], tasks: [] });
  });

  const get = () => useStore.getState().backlogTasks.find((t) => t.id === 't1')!;

  it('is stamped when a name goes on, and again when it changes', () => {
    vi.useFakeTimers({ now: 1_000 });
    useStore.getState().updateBacklogTask('t1', { assignee: 'Priya' });
    expect(get().assignedAt).toBe(1_000);

    vi.setSystemTime(5_000);
    useStore.getState().updateBacklogTask('t1', { assignee: ' Priya ', title: 'The brand logo, v2' });
    expect(get().assignedAt).toBe(1_000);

    vi.setSystemTime(9_000);
    useStore.getState().updateBacklogTask('t1', { assignee: 'Rahul' });
    expect(get().assignedAt).toBe(9_000);
  });

  it('is removed, not set to undefined, when the name comes off', () => {
    useStore.getState().updateBacklogTask('t1', { assignee: 'Priya' });
    useStore.getState().updateBacklogTask('t1', { assignee: '' });
    expect(get()).not.toHaveProperty('assignedAt');
  });

  it('leaves an edit that does not touch the assignee alone', () => {
    useStore.getState().updateBacklogTask('t1', { title: 'Renamed' });
    expect(get()).not.toHaveProperty('assignedAt');
  });
});
