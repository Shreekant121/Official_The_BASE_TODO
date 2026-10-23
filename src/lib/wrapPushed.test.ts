import { describe, expect, it } from 'vitest';
import { countPushes, pushedMost, pushedWords } from './wrapPushed';
import { daysOfMonth } from './monthWrapped';
import { formatMinutes } from './dashboard/blockData';
import type { StoryEvent } from './taskStory';
import type { FocusLogEntry, Task } from '../store/useStore';

const TZ = 'Asia/Kolkata';
const ist = (s: string) => Date.parse(`${s}+05:30`);
const SEPT = new Set(daysOfMonth('2026-09'));
const span = (seconds: number) => formatMinutes(seconds / 60);
const task = (id: string, extra: Partial<Task> = {}) =>
  ({ id, title: `Task ${id}`, listId: 'l', status: 'todo', createdAt: 0, ...extra }) as unknown as Task;

describe('what counts as a push', () => {
  it('counts Put off, a start moved later and a deadline moved later, inside the period', () => {
    const story: StoryEvent[] = [
      { at: ist('2026-08-30T10:00:00'), k: 'deadline', to: '2026-09-05' }, // the first deadline: nothing to be later than
      { at: ist('2026-09-02T10:00:00'), k: 'deadline', to: '2026-09-08' }, // later: a push
      { at: ist('2026-09-03T10:00:00'), k: 'deadline', to: '2026-09-06' }, // earlier: not one
      { at: ist('2026-09-04T10:00:00'), k: 'avoided', n: 1 }, // Put off
      { at: ist('2026-09-05T21:00:00'), k: 'start', to: '2026-09-06T09:00' }, // Tomorrow
      { at: ist('2026-09-06T10:00:00'), k: 'start', to: '2026-09-06T08:00' }, // same day, earlier: not one
      { at: ist('2026-10-01T10:00:00'), k: 'avoided', n: 2 }, // October
    ];
    expect(countPushes(story, SEPT, TZ)).toBe(3);
  });

  it('never counts the cascade (item 18) or a first date', () => {
    const story: StoryEvent[] = [
      { at: ist('2026-09-01T10:00:00'), k: 'deadline', to: '2026-09-05' },
      { at: ist('2026-09-02T10:00:00'), k: 'deadline', to: '2026-09-09', because: 'Draft' },
      { at: ist('2026-09-03T10:00:00'), k: 'deadline', to: '2026-09-12' }, // later than the cascade's date: his push
    ];
    expect(countPushes(story, SEPT, TZ)).toBe(1);
  });

  it('reads the moments in time order, however they were stored', () => {
    const story: StoryEvent[] = [
      { at: ist('2026-09-03T10:00:00'), k: 'deadline', to: '2026-09-12' },
      { at: ist('2026-09-01T10:00:00'), k: 'deadline', to: '2026-09-05' },
    ];
    expect(countPushes(story, SEPT, TZ)).toBe(1);
  });
});

describe('the task pushed most', () => {
  const putOff = (n: number, day = 2): StoryEvent[] =>
    Array.from({ length: n }, (_, i) => ({ at: ist(`2026-09-${String(day + i).padStart(2, '0')}T10:00:00`), k: 'avoided', n: i + 1 }));
  const focusLog = [
    { id: 'f1', taskId: 'b', taskTitle: 'b', seconds: 600, startedAt: 0, endedAt: 600_000 },
  ] as FocusLogEntry[];

  it('picks the most pushed, says whether it was done and how long it took', () => {
    const got = pushedMost({
      stories: new Map([['a', putOff(2)], ['b', putOff(4)], ['c', putOff(3)]]),
      backlog: [task('a'), task('b', { status: 'completed' }), task('c')],
      days: SEPT, focusLog, ignored: new Set(), timeZone: TZ,
    });
    expect(got).toEqual({ id: 'b', title: 'Task b', pushes: 4, done: true, seconds: 600 });
  });

  it('leaves out ignored work, a task no longer on the board, and one push', () => {
    const got = pushedMost({
      stories: new Map([['a', putOff(5)], ['gone', putOff(6)], ['c', putOff(1)]]),
      backlog: [task('a'), task('c')],
      days: SEPT, focusLog, ignored: new Set(['a']), timeZone: TZ,
    });
    expect(got).toBeNull();
  });

  it('breaks a tie towards the newest task', () => {
    const got = pushedMost({
      stories: new Map([['old', putOff(2)], ['new', putOff(2)]]),
      backlog: [task('old', { createdAt: 1 }), task('new', { createdAt: 2 })],
      days: SEPT, focusLog: [], ignored: new Set(), timeZone: TZ,
    });
    expect(got?.id).toBe('new');
  });

  it('says what became of it, and never scolds', () => {
    expect(pushedWords({ done: true, seconds: 600 }, span)).toBe('When you finally did it, it took 10 minutes.');
    expect(pushedWords({ done: true, seconds: 60 }, span)).toBe('When you finally did it, it took one minute.');
    expect(pushedWords({ done: true, seconds: 5400 }, span)).toBe('When you finally did it, it took 1h 30m.');
    expect(pushedWords({ done: true, seconds: 0 }, span)).toBe('And then, one day, you just did it.');
    expect(pushedWords({ done: false, seconds: 0 }, span)).toBe('It is still on the list, waiting for its day.');
  });
});
