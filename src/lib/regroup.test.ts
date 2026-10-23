import { describe, expect, it } from 'vitest';
import {
  DUE_GROUPS, SCORE_GROUPS, asGroupBy, dueGroupOf, groupInto, scoreGroupOf, type ScoreFacts,
} from './regroup';

const TZ = 'Asia/Kolkata';
/* Thursday 12 March 2026, 10:00 in Kolkata. */
const NOW = new Date('2026-03-12T04:30:00Z');
const open = (deadline?: string) => ({ status: 'needsAction', deadline });

describe('regroup: by due date (idea 158)', () => {
  it('reads each day in his zone', () => {
    expect(dueGroupOf(open('2026-03-11T18:00'), NOW, TZ)).toBe('overdue');
    expect(dueGroupOf(open('2026-03-12T09:00'), NOW, TZ)).toBe('overdue');
    expect(dueGroupOf(open('2026-03-12T23:30'), NOW, TZ)).toBe('today');
    expect(dueGroupOf(open('2026-03-13T00:15'), NOW, TZ)).toBe('tomorrow');
    expect(dueGroupOf(open('2026-03-14T09:00'), NOW, TZ)).toBe('week');
    expect(dueGroupOf(open('2026-03-18T23:59'), NOW, TZ)).toBe('week');
    expect(dueGroupOf(open('2026-03-19T00:00'), NOW, TZ)).toBe('later');
  });

  it('puts the undated in No date and the finished in Done', () => {
    expect(dueGroupOf(open(), NOW, TZ)).toBe('none');
    expect(dueGroupOf(open('not a date'), NOW, TZ)).toBe('none');
    expect(dueGroupOf({ status: 'completed', deadline: '2026-03-01T09:00' }, NOW, TZ)).toBe('done');
  });
});

describe('regroup: by Score', () => {
  const facts = (f: Partial<ScoreFacts>): ScoreFacts => ({
    done: false, redAlert: false, emergency: false, score: 0, peak: 100, ...f,
  });

  it('puts Red Alert before an Emergency before the score', () => {
    expect(scoreGroupOf(facts({ redAlert: true, emergency: true, score: 100 }))).toBe('alert');
    expect(scoreGroupOf(facts({ emergency: true, score: 1 }))).toBe('emergency');
  });

  it('splits the rest by the warm ramp against the peak', () => {
    expect(scoreGroupOf(facts({ score: 100 }))).toBe('hot');
    expect(scoreGroupOf(facts({ score: 70 }))).toBe('hot');
    expect(scoreGroupOf(facts({ score: 60 }))).toBe('warm');
    expect(scoreGroupOf(facts({ score: 36 }))).toBe('warm');
    expect(scoreGroupOf(facts({ score: 35 }))).toBe('rest');
    expect(scoreGroupOf(facts({ score: 0 }))).toBe('rest');
  });

  it('sends a finished task to Done whatever it scored', () => {
    expect(scoreGroupOf(facts({ done: true, redAlert: true, score: 100 }))).toBe('done');
  });
});

describe('regroup: sorting into groups', () => {
  it('keeps the specs order, drops empty groups, sorts inside each', () => {
    const tasks = [
      { id: 'a', g: 'later', n: 2 }, { id: 'b', g: 'overdue', n: 1 },
      { id: 'c', g: 'later', n: 1 }, { id: 'd', g: 'done', n: 0 },
    ] as const;
    const out = groupInto(DUE_GROUPS, tasks, (t) => t.g, (x, y) => x.n - y.n);
    expect(out.map((g) => g.spec.key)).toEqual(['overdue', 'later', 'done']);
    expect(out[1].tasks.map((t) => t.id)).toEqual(['c', 'a']);
  });

  it('ends both groupings in Done', () => {
    expect(DUE_GROUPS.at(-1)?.key).toBe('done');
    expect(SCORE_GROUPS.at(-1)?.key).toBe('done');
  });

  it('reads a remembered value back safely', () => {
    expect(asGroupBy('score')).toBe('score');
    expect(asGroupBy('priority')).toBe('list');
    expect(asGroupBy(null)).toBe('list');
  });
});
