import { describe, expect, it } from 'vitest';
import {
  countdownKind, dateAsEvent, dueBefore, resolveCountdownTarget, targetReading, taskAsEvent,
  type CountdownTarget, type TargetTask,
} from './countdownTarget';
import type { BaseEvent } from '../events/events';

const TZ = 'Asia/Kolkata';
/** A wall clock in Kolkata (+05:30, no daylight saving). */
const at = (local: string) => new Date(`${local}:00+05:30`);
const NOW = at('2026-10-21T10:00');
const NONE: ReadonlySet<string> = new Set();

const race: BaseEvent = { id: 'run', title: 'Mumbai Marathon', start: '2026-11-12T06:00', createdAt: 0 };
const trip: BaseEvent = { id: 'goa', title: 'Goa trip', start: '2026-10-30', end: '2026-11-02', createdAt: 0 };
const task = (id: string, over: Partial<TargetTask> = {}): TargetTask => ({ id, title: id, ...over });

describe('countdownKind', () => {
  it('is a task, then a date, then the event', () => {
    expect(countdownKind(undefined)).toBe('event');
    expect(countdownKind({ eventId: 'run' })).toBe('event');
    expect(countdownKind({ date: '2026-11-14' })).toBe('date');
    expect(countdownKind({ date: '2026-11-14', taskId: 't' })).toBe('task');
  });
});

describe('taskAsEvent', () => {
  it('counts to the deadline, in sky, from when the task was made', () => {
    const made = taskAsEvent(task('essay', { deadline: '2026-10-25T18:00', createdAt: 5, imageUrl: 'cover:abc' }), NOW, TZ);
    expect(made).toMatchObject({ id: 'task:essay', title: 'essay', start: '2026-10-25T18:00', colour: 'sky', imageUrl: 'cover:abc', createdAt: 5 });
  });

  it('has nothing to count to without a deadline', () => {
    expect(taskAsEvent(task('later'), NOW, TZ)).toBeNull();
    expect(taskAsEvent(task('bad', { deadline: 'soon' }), NOW, TZ)).toBeNull();
  });
});

describe('dateAsEvent', () => {
  it('is an all-day event with the name he typed', () => {
    expect(dateAsEvent('2026-11-14', ' Exams ', 7, NOW, TZ)).toMatchObject({ id: 'date', title: 'Exams', start: '2026-11-14', createdAt: 7 });
  });

  it('is named by the date itself when he typed none', () => {
    expect(dateAsEvent('2026-11-14', '', undefined, NOW, TZ)?.title).toBe('Sat 14 Nov');
    expect(dateAsEvent('2027-01-02', undefined, undefined, NOW, TZ)?.title).toBe('Sat 2 Jan 2027');
  });

  it('refuses a date that does not read, or one with a time', () => {
    expect(dateAsEvent('2026-02-30', 'x', 0, NOW, TZ)).toBeNull();
    expect(dateAsEvent('2026-11-14T09:00', 'x', 0, NOW, TZ)).toBeNull();
    expect(dateAsEvent(undefined, 'x', 0, NOW, TZ)).toBeNull();
  });
});

describe('resolveCountdownTarget', () => {
  const tasks = [task('essay', { deadline: '2026-10-25T18:00' }), task('undated')];

  it('takes the picked task, the picked date, the picked event', () => {
    expect(resolveCountdownTarget({ taskId: 'essay' }, [race], tasks, NOW, TZ)).toMatchObject({ kind: 'task', task: { id: 'essay' } });
    expect(resolveCountdownTarget({ date: '2026-11-14', dateName: 'Exams' }, [race], tasks, NOW, TZ)?.event.title).toBe('Exams');
    expect(resolveCountdownTarget({ eventId: 'goa' }, [race, trip], tasks, NOW, TZ)?.event.id).toBe('goa');
  });

  it('falls back to the soonest event for a task gone or undated, or nothing picked', () => {
    expect(resolveCountdownTarget({ taskId: 'gone' }, [race, trip], tasks, NOW, TZ)).toMatchObject({ kind: 'event', event: { id: 'goa' } });
    expect(resolveCountdownTarget({ taskId: 'undated' }, [race], tasks, NOW, TZ)?.event.id).toBe('run');
    expect(resolveCountdownTarget(undefined, [race, trip], tasks, NOW, TZ)?.event.id).toBe('goa');
    expect(resolveCountdownTarget({ taskId: 'gone' }, [], tasks, NOW, TZ)).toBeNull();
  });
});

describe('targetReading', () => {
  const of = (t: TargetTask) => resolveCountdownTarget({ taskId: t.id }, [], [t], NOW, TZ)!;

  it("counts a task's deadline in days and hours", () => {
    expect(targetReading(of(task('essay', { deadline: '2026-10-25T18:00' })), NOW, TZ)).toEqual({ kind: 'count', value: '4', unit: 'days 8 hours' });
  });

  it('says Overdue once the deadline has gone by, and Done once ticked', () => {
    expect(targetReading(of(task('late', { deadline: '2026-10-21T09:30' })), NOW, TZ)).toEqual({ kind: 'word', word: 'Overdue' });
    expect(targetReading(of(task('late', { deadline: '2026-10-21T09:30', status: 'completed' })), NOW, TZ)).toEqual({ kind: 'word', word: 'Done' });
    expect(targetReading(of(task('soon', { deadline: '2026-10-28T09:30', status: 'completed' })), NOW, TZ)).toEqual({ kind: 'word', word: 'Done' });
  });

  it('counts a date in calendar days to its midnight, Today on the day', () => {
    const exams = resolveCountdownTarget({ date: '2026-11-14' }, [], [], NOW, TZ)!;
    expect(targetReading(exams, NOW, TZ)).toEqual({ kind: 'count', value: '23', unit: 'days 14 hours' });
    expect(targetReading(resolveCountdownTarget({ date: '2026-10-21' }, [], [], NOW, TZ)!, NOW, TZ)).toEqual({ kind: 'word', word: 'Today' });
    expect(targetReading(resolveCountdownTarget({ date: '2026-10-01' }, [], [], NOW, TZ)!, NOW, TZ)).toEqual({ kind: 'word', word: 'Passed' });
  });
});

describe('dueBefore', () => {
  const ids = (rows: { task: TargetTask; tied: boolean; overdue: boolean }[]) => rows.map((r) => `${r.task.id}${r.tied ? '*' : ''}${r.overdue ? '!' : ''}`);

  it("lists an event's linked tasks first, then every open task due before it, overdue too", () => {
    const target = resolveCountdownTarget({ eventId: 'run' }, [race], [], NOW, TZ)!;
    const tasks = [
      task('shoes', { eventId: 'run', deadline: '2026-11-12T06:00' }),
      task('bib', { eventId: 'run', deadline: '2026-11-12T06:00', status: 'completed' }),
      task('taxes', { deadline: '2026-11-01T18:00' }),
      task('missed', { deadline: '2026-10-19T18:00' }),
      task('after', { deadline: '2026-11-12T06:00' }),
      task('undated'),
      task('step', { deadline: '2026-10-22T18:00', parent: { id: 'x' } }),
      task('ignored', { deadline: '2026-10-22T18:00' }),
    ];
    expect(ids(dueBefore(tasks, target, NOW, TZ, new Set(['ignored'])))).toEqual(['shoes*', 'missed!', 'taxes']);
  });

  it('stops at midnight of an all-day event or date', () => {
    const target = resolveCountdownTarget({ date: '2026-10-30' }, [], [], NOW, TZ)!;
    const tasks = [task('eve', { deadline: '2026-10-29T23:59' }), task('day', { deadline: '2026-10-30T00:00' })];
    expect(ids(dueBefore(tasks, target, NOW, TZ, NONE))).toEqual(['eve']);
  });

  it("lists what a task waits on first, whatever its date, and never the task itself", () => {
    const essay = task('essay', { deadline: '2026-10-25T18:00', dependsOn: ['notes', 'books', 'done'] });
    const tasks = [
      essay,
      task('books'),
      task('notes', { deadline: '2026-10-24T18:00' }),
      task('done', { status: 'completed' }),
      task('email', { deadline: '2026-10-23T09:00' }),
    ];
    const target = resolveCountdownTarget({ taskId: 'essay' }, [], tasks, NOW, TZ)! as CountdownTarget;
    expect(ids(dueBefore(tasks, target, NOW, TZ, NONE))).toEqual(['notes*', 'books*', 'email']);
  });
});
