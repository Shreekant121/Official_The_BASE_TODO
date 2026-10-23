import { describe, expect, it } from 'vitest';
import { trayTasks, undateRefusal } from './tray';

const t = (id: string, extra: Partial<{ title: string; status: string; deadline: string; parent: string }> = {}) => ({
  id, title: id, status: 'needsAction', ...extra,
});

describe('what is in the tray', () => {
  it('holds the open top-level tasks with no deadline, never a finished, dated, nested or ignored one', () => {
    const tasks = [
      t('open'),
      t('dated', { deadline: '2026-10-22T18:00' }),
      t('done', { status: 'completed' }),
      t('nested', { parent: 'open' }),
      t('ignored'),
    ];
    expect(trayTasks(tasks, () => 1, new Set(['ignored'])).map((x) => x.id)).toEqual(['open']);
  });

  it('puts the highest score first, and a tie by name', () => {
    const scores: Record<string, number> = { low: 2, high: 9, b: 5, a: 5 };
    const got = trayTasks([t('low'), t('b'), t('high'), t('a')], (x) => scores[x.id], new Set());
    expect(got.map((x) => x.id)).toEqual(['high', 'a', 'b', 'low']);
  });

  it('scores each task once, and leaves the array it was given alone', () => {
    const tasks = [t('one'), t('two'), t('three')];
    let asked = 0;
    trayTasks(tasks, () => { asked += 1; return asked; }, new Set());
    expect(asked).toBe(3);
    expect(tasks.map((x) => x.id)).toEqual(['one', 'two', 'three']);
  });
});

describe('what goes back onto it', () => {
  it('takes a one-off task, never a repeating one', () => {
    expect(undateRefusal({})).toBeNull();
    expect(undateRefusal({ recurrence: 'none' })).toBeNull();
    expect(undateRefusal({ recurrence: 'daily' })).toBe('repeat');
    expect(undateRefusal({ recurrence: 'custom', recurrenceRule: 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO' })).toBe('repeat');
  });
});
