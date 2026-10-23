import { describe, expect, it } from 'vitest';
import {
  appendToStory, buildStory, newRedAlerts, storyDiff, storyLine, trimStory,
  type StoryEvent,
} from './taskStory';
import type { FocusLogEntry, Task, TaskList } from '../store/useStore';

const TZ = 'Asia/Kolkata';
/* Thursday 12 March 2026, 10:00 in Kolkata. */
const NOW = Date.parse('2026-03-12T04:30:00Z');
const DAY = 86_400_000;

const LISTS: TaskList[] = [
  { id: 'l-build', title: 'Build' },
  { id: 'l-doing', title: 'Doing' },
];

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', title: 'Rewrite the landing page copy', status: 'needsAction', listId: 'l-build',
  createdAt: NOW - 10 * DAY, ...over,
});

const diff = (before: Task[], after: Task[], by?: 'atlas') =>
  storyDiff(before, after, { now: NOW, lists: LISTS, ...(by ? { by } : {}) });

describe('taskStory: what a change says (his 1C — every edit)', () => {
  it('says nothing when nothing about a task changed', () => {
    const t = task();
    expect(diff([t], [t]).size).toBe(0);
    expect(diff([t], [{ ...t, order: 4 }]).size).toBe(0);
  });

  it('a new task is "Made in" its list; an old one turning up was put back', () => {
    const fresh = task({ id: 'n', createdAt: NOW - 1000 });
    expect(diff([], [fresh]).get('n')).toEqual([{ at: NOW, k: 'made', list: 'Build' }]);
    expect(diff([], [task()]).get('t1')).toEqual([{ at: NOW, k: 'back' }]);
  });

  it('a task leaving is Deleted, or Archived when the Archive has it', () => {
    expect(diff([task()], []).get('t1')).toEqual([{ at: NOW, k: 'gone' }]);
    const archived = storyDiff([task()], [], { now: NOW, lists: LISTS, archived: new Set(['t1']) });
    expect(archived.get('t1')).toEqual([{ at: NOW, k: 'gone', archived: true }]);
  });

  it('done and opened again are their own moments, not a status edit', () => {
    const done = { ...task(), status: 'completed' as const, completedAt: NOW };
    expect(diff([task()], [done]).get('t1')).toEqual([{ at: NOW, k: 'done' }]);
    expect(diff([done], [task()]).get('t1')).toEqual([{ at: NOW, k: 'reopened' }]);
  });

  it('marks what Atlas did', () => {
    expect(diff([task()], [task({ title: 'Landing copy' })], 'atlas').get('t1'))
      .toEqual([{ at: NOW, by: 'atlas', k: 'title', from: 'Rewrite the landing page copy' }]);
  });

  it('a deadline pushed by the cascade says which prerequisite moved', () => {
    const pre = task({ id: 'pre', title: 'Pick the domain', deadline: '2026-03-14T18:00' });
    const t = task({ dependsOn: ['pre'], deadline: '2026-03-15T18:00' });
    const out = diff([pre, t], [{ ...pre, deadline: '2026-03-20T18:00' }, { ...t, deadline: '2026-03-21T18:00' }]);
    expect(out.get('pre')).toEqual([{ at: NOW, k: 'deadline', to: '2026-03-20T18:00' }]);
    expect(out.get('t1')).toEqual([{ at: NOW, k: 'deadline', to: '2026-03-21T18:00', because: 'Pick the domain' }]);
  });

  it('the moments: moved, put off, Emergency, importance, handed over, milestone, a step', () => {
    const before = task({
      avoidedCount: 1,
      subtasks: [{ id: 's1', title: 'Hero section' }, { id: 's2', title: 'FAQ' }],
    });
    const after: Task = {
      ...before,
      listId: 'l-doing', listName: 'Doing', avoidedCount: 2, emergencyBoost: 3, humanOverride: 7,
      assignee: 'Priya', milestone: true,
      subtasks: [{ id: 's1', title: 'Hero section', status: 'completed' }, { id: 's2', title: 'FAQ' }],
    };
    expect(diff([before], [after]).get('t1')!.map((e) => e.k))
      .toEqual(['moved', 'avoided', 'emergency', 'importance', 'assigned', 'milestone', 'step']);
  });

  it('plain edits made at once are one line, the estimate once though it is two fields', () => {
    const after = task({ description: 'New copy', estimatedTime: 90, allocatedTime: 90, recurrence: 'weekly' });
    expect(diff([task()], [after]).get('t1')).toEqual([{ at: NOW, k: 'edit', f: ['description', 'estimate', 'repeat'] }]);
  });

  it('a step added or renamed is an edit of the steps; a tick alone is not', () => {
    const one = task({ subtasks: [{ id: 's1', title: 'Hero' }] });
    const added = task({ subtasks: [{ id: 's1', title: 'Hero' }, { id: 's2', title: 'FAQ' }] });
    expect(diff([one], [added]).get('t1')).toEqual([{ at: NOW, k: 'edit', f: ['steps'] }]);
    const ticked = task({ subtasks: [{ id: 's1', title: 'Hero', status: 'completed' }] });
    expect(diff([one], [ticked]).get('t1')).toEqual([{ at: NOW, k: 'step', t: 'Hero' }]);
  });

  it('never writes an undefined value (Firestore refuses the whole write)', () => {
    const out = diff([task({ deadline: '2026-03-14T18:00', assignee: 'Priya' })], [task()]).get('t1')!;
    for (const e of out) for (const v of Object.values(e)) expect(v).not.toBeUndefined();
    expect(out).toEqual([{ at: NOW, k: 'deadline' }, { at: NOW, k: 'assigned' }]);
  });

  it('a Red Alert is new only once, and is the same object on any device', () => {
    const red = newRedAlerts(new Set(['a']), new Map([['a', 20], ['b', 21.34]]), NOW);
    expect([...red.keys()]).toEqual(['b']);
    expect(red.get('b')).toEqual([{ at: NOW, k: 'red', score: 21.3 }]);
  });
});

describe('taskStory: keeping it to 30 (his 3A)', () => {
  const many = (n: number): StoryEvent[] => Array.from({ length: n }, (_, i) => ({ at: NOW + i, k: 'edit', f: ['description'] }));

  it('keeps the newest, and "Made" always', () => {
    const made: StoryEvent = { at: NOW - DAY, k: 'made' };
    const out = trimStory([made, ...many(40)]);
    expect(out).toHaveLength(30);
    expect(out[0]).toBe(made);
    expect(out[1].at).toBe(NOW + 11);
    expect(out.at(-1)!.at).toBe(NOW + 39);
  });

  it('adds the same moment once', () => {
    const red: StoryEvent = { at: NOW, k: 'red', score: 20 };
    expect(appendToStory([red], [{ ...red }, { at: NOW + 1, k: 'done' }])).toEqual([red, { at: NOW + 1, k: 'done' }]);
  });
});

describe('taskStory: the story as the sheet shows it', () => {
  const focus = (endedAt: number, seconds: number): FocusLogEntry => ({
    id: `f${endedAt}`, taskId: 't1', taskTitle: 'x', seconds, startedAt: endedAt - seconds * 1000, endedAt,
  });

  it('works out Made, Done and focus from what the task already keeps', () => {
    const t = task({ status: 'completed', completedAt: NOW - 1000 });
    const story = buildStory([], t, [focus(NOW - 2 * DAY, 3300), focus(NOW - 3 * 3600_000, 1800), focus(NOW - 3600_000, 1200)], TZ);
    expect(story.map((e) => e.k)).toEqual(['done', 'focus', 'focus', 'made']);
    expect(story[1]).toMatchObject({ k: 'focus', sec: 3000, n: 2 });
  });

  it('a stored Made or Done wins over the worked-out one', () => {
    const t = task({ status: 'completed', completedAt: NOW });
    const stored: StoryEvent[] = [{ at: NOW - DAY, k: 'made', list: 'Build' }, { at: NOW + 500, k: 'done' }];
    expect(buildStory(stored, t, [], TZ)).toEqual([stored[1], stored[0]]);
  });

  it('reads in plain words, in each job colour, violet for Atlas', () => {
    expect(storyLine({ at: NOW, k: 'focus', sec: 5700, n: 2 }, NOW, TZ))
      .toEqual({ text: 'Focused 1 h 35 m', sub: 'Today · 2 stretches', tone: 'teal' });
    expect(storyLine({ at: NOW - DAY, k: 'start', to: '2026-03-12' }, NOW, TZ))
      .toEqual({ text: 'Pushed to tomorrow', sub: 'Yesterday', tone: 'sky' });
    expect(storyLine({ at: NOW - 5 * DAY, k: 'deadline', to: '2026-03-16T18:00', because: 'Pick the domain' }, NOW, TZ))
      .toEqual({ text: 'Due 16 Mar', sub: '7 Mar · because “Pick the domain” moved', tone: 'sky' });
    expect(storyLine({ at: NOW, k: 'edit', f: ['description', 'estimate'], by: 'atlas' }, NOW, TZ))
      .toEqual({ text: 'Changed the description and estimate', sub: 'Today · by Atlas', tone: 'violet' });
    expect(storyLine({ at: NOW - 400 * DAY, k: 'made' }, NOW, TZ).sub).toBe('5 Feb 2025');
  });
});
