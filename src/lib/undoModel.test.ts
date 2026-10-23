import { describe, expect, it } from 'vitest';
import { describePress, type UndoSlices } from './undoModel';
import type { Task } from '../store/useStore';

const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id.toUpperCase(), status: 'needsAction', listId: 'l1', ...extra });
const slices = (backlogTasks: Task[], tasks: Task[]): UndoSlices => ({ backlogTasks, tasks, taskLists: [], projects: [] });

describe('describePress — a task taken out of today (29-1P6b)', () => {
  it('puts a swiped Today row back where it was', () => {
    const a = task('a');
    const before = slices([a], [task('x'), a, task('y')]);
    const after = slices([{ ...a, status: 'completed', completedAt: 1 }], [before.tasks[0], before.tasks[2]]);
    const change = describePress(before, after, new Set(['edit']));
    expect(change?.kind).toBe('tick');
    const back = change?.entries.find((e) => e.location === 'focusQueue');
    expect(back).toMatchObject({ id: 'a', queueIndex: 1 });
    /* The backlog's own entry comes first, so the task is itself again before its row returns. */
    expect(change?.entries.findIndex((e) => e.location === 'backlog')).toBeLessThan(change!.entries.indexOf(back!));
  });

  it('a start date moved the same way comes back the same way', () => {
    const a = task('a');
    const before = slices([a], [a]);
    const after = slices([{ ...a, startDate: '2026-10-13T00:00' }], []);
    const change = describePress(before, after, new Set(['edit']));
    expect(change?.kind).toBe('date');
    expect(change?.entries.some((e) => e.location === 'focusQueue' && e.queueIndex === 0)).toBe(true);
  });

  it('is never a reason to record a press on its own', () => {
    const a = task('a');
    expect(describePress(slices([a], [a]), slices([a], []), new Set(['edit']))).toBeNull();
  });
});

describe('describePress — a subtask that is also in today (29-1P7b)', () => {
  it('names one tick, not two, when its proxy row flips with it', () => {
    const sub = { id: 's1', title: 'Upload to the portal', status: 'needsAction' as const };
    const parent = task('p', { subtasks: [sub] });
    const proxy = task('s1', { title: sub.title });
    const before = slices([parent], [proxy]);
    const after = slices(
      [{ ...parent, subtasks: [{ ...sub, status: 'completed' }] }],
      [{ ...proxy, status: 'completed' }],
    );
    const change = describePress(before, after, new Set(['edit']));
    expect(change?.kind).toBe('tick');
    expect(change?.label).toBe('Ticked “Upload to the portal”');
  });
});
