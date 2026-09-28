import { describe, expect, it } from 'vitest';
import { doneLabel, foldFinishedRepeats } from './derive';
import type { Task } from '../../store/useStore';

const task = (id: string, extra: Partial<Task> = {}): Task => ({ id, title: id, status: 'todo', ...extra }) as Task;

describe('foldFinishedRepeats', () => {
  it('folds finished occurrences of one series into the latest, keeping the open one', () => {
    const tasks = [
      task('open', { seriesId: 's', occurrence: 4 }),
      task('a', { seriesId: 's', occurrence: 1, status: 'completed', completedAt: 100 }),
      task('c', { seriesId: 's', occurrence: 3, status: 'completed', completedAt: 300 }),
      task('b', { seriesId: 's', occurrence: 2, status: 'completed', completedAt: 200 }),
      task('solo', { status: 'completed', completedAt: 50 }),
    ];
    expect(foldFinishedRepeats(tasks).map((r) => [r.task.id, r.count])).toEqual([
      ['open', 1], ['c', 3], ['solo', 1],
    ]);
  });

  it('groups by series, never by title', () => {
    const tasks = [
      task('x', { title: 'Oil Hair', seriesId: 's1', status: 'completed', completedAt: 1 }),
      task('y', { title: 'Oil Hair', seriesId: 's2', status: 'completed', completedAt: 2 }),
      task('z', { title: 'Oil Hair', status: 'completed', completedAt: 3 }),
    ];
    expect(foldFinishedRepeats(tasks).map((r) => r.count)).toEqual([1, 1, 1]);
  });
});

describe('doneLabel', () => {
  const at = Date.UTC(2026, 2, 12, 12);
  const now = new Date(at);
  it('reads relative, then falls back to a date', () => {
    expect(doneLabel(at - 20_000, now)).toBe('done just now');
    expect(doneLabel(at - 5 * 60_000, now)).toBe('done 5 min ago');
    expect(doneLabel(at - 3 * 3_600_000, now)).toBe('done 3h ago');
    expect(doneLabel(at - 30 * 3_600_000, now)).toBe('done yesterday');
    expect(doneLabel(at - 2 * 86_400_000, now)).toBe('done 2 days ago');
    expect(doneLabel(at - 21 * 86_400_000, now)).toBe('done 3 weeks ago');
    expect(doneLabel(at - 90 * 86_400_000, now)).toMatch(/^done \d+ \w+|^done \w+ \d+/);
  });
});
