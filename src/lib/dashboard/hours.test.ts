/**
 * Hours worked against hours available, and "doesn't count as worked"
 * (BIG-6, 29-1b). His calls, 2026-09-30: 12 hours on weekdays and 6 at the
 * weekend by default; a one-tap override for today; worked = the timer plus
 * time logged by hand; a project, list or task can be marked as not counting,
 * it passes down, **one task inside can switch itself back on**, and time that
 * doesn't count is shown greyed, outside the totals.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addDays, availableOn, defaultHours, pruneOverrides, sanitizeHours, smartStartHours, weekOf, weekdayOfDay,
  workByDay, type HandLogEntry,
} from './hours';
import { workedJudge } from '../workedTime';
import { useStore, type FocusLogEntry, type Project, type Task, type TaskList } from '../../store/useStore';

const H = 3600;

function project(id: string, over: Partial<Project> = {}): Project {
  return { id, name: id, createdAt: 0, order: 0, ...over };
}
function list(id: string, projectId: string, over: Partial<TaskList> = {}): TaskList {
  return { id, title: id, projectId, ...over };
}
function task(id: string, listId: string, over: Partial<Task> = {}): Task {
  return { id, title: id, status: 'needsAction', listId, ...over };
}
function focus(id: string, taskId: string, startedAt: number, seconds: number, over: Partial<FocusLogEntry> = {}): FocusLogEntry {
  return { id, taskId, taskTitle: taskId, seconds, startedAt, endedAt: startedAt + seconds * 1000, ...over };
}
function hand(id: string, day: string, seconds: number, over: Partial<HandLogEntry> = {}): HandLogEntry {
  return { id, day, seconds, label: id, at: 0, ...over };
}

/* Personal › Self Care (doesn't count), and Work beside it. */
const PROJECTS = [project('personal'), project('work')];
const LISTS = [list('self-care', 'personal', { notWorked: true }), list('errands', 'personal'), list('build', 'work')];

describe('days and weeks', () => {
  it('knows a weekday and walks the calendar across a month end', () => {
    expect(weekdayOfDay('2026-03-12')).toBe(4); // a Thursday
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('a week is Monday to Sunday, whichever day it is asked from', () => {
    const week = ['2026-03-09', '2026-03-10', '2026-03-11', '2026-03-12', '2026-03-13', '2026-03-14', '2026-03-15'];
    expect(weekOf('2026-03-12')).toEqual(week);
    expect(weekOf('2026-03-09')).toEqual(week);
    expect(weekOf('2026-03-15')).toEqual(week);
  });
});

describe('hours available', () => {
  it('starts at his numbers: 12 hours on weekdays, 6 at the weekend', () => {
    const h = defaultHours();
    expect(availableOn(h, '2026-03-12')).toBe(12 * H); // Thursday
    expect(availableOn(h, '2026-03-14')).toBe(6 * H); // Saturday
    expect(availableOn(h, '2026-03-15')).toBe(6 * H); // Sunday
  });

  it("today's override wins for that day only", () => {
    const h = { ...defaultHours(), overrides: { '2026-03-12': 4 * H } };
    expect(availableOn(h, '2026-03-12')).toBe(4 * H);
    expect(availableOn(h, '2026-03-13')).toBe(12 * H);
  });

  it('keeps three weeks of overrides, so past bars are drawn against what he had', () => {
    const kept = pruneOverrides({ '2026-02-01': H, '2026-02-20': 2 * H, '2026-03-12': 3 * H }, '2026-03-12');
    expect(kept).toEqual({ '2026-02-20': 2 * H, '2026-03-12': 3 * H });
  });

  it('a document from before 29-1b, or a broken one, reads as the defaults', () => {
    expect(sanitizeHours(undefined)).toEqual(defaultHours());
    expect(sanitizeHours({ weekly: [1, 2], overrides: { nonsense: 5, '2026-03-12': 90_000 } })).toEqual({
      weekly: defaultHours().weekly,
      overrides: { '2026-03-12': 24 * H },
    });
  });
});

describe("what counts as worked", () => {
  it('a list that does not count takes its tasks with it; one task can switch itself back on', () => {
    const tasks = [task('oil', 'self-care'), task('gym', 'self-care', { notWorked: false }), task('bank', 'errands')];
    const judge = workedJudge(tasks, LISTS, PROJECTS);
    const reason = judge.taskReason('oil');
    expect(reason?.kind === 'list' && reason.list.id).toBe('self-care');
    expect(judge.taskReason('gym')).toBeUndefined();
    expect(judge.taskReason('bank')).toBeUndefined();
  });

  it('a project passes it to every list and project inside, at any depth', () => {
    const projects = [project('mega', { notWorked: true }), project('inner', { parentId: 'mega' })];
    const judge = workedJudge([task('t', 'l')], [list('l', 'inner')], projects);
    const reason = judge.taskReason('t');
    expect(reason?.kind === 'project' && reason.project.id).toBe('mega');
    expect(judge.projectReason('inner')?.kind).toBe('project');
  });

  it('a task can be marked on its own, and a subtask answers as its task', () => {
    const tasks = [task('t', 'build', { notWorked: true, subtasks: [{ id: 's', title: 's' }] })];
    const judge = workedJudge(tasks, LISTS, PROJECTS);
    expect(judge.taskReason('t')?.kind).toBe('task');
    expect(judge.taskReason('s')?.kind).toBe('task');
  });

  it('a task that is gone is judged by where its log entry said it was', () => {
    const judge = workedJudge([], LISTS, PROJECTS);
    expect(judge.taskReason('gone', 'self-care', 'personal')?.kind).toBe('list');
    expect(judge.taskReason('gone', 'deleted-list', 'work')).toBeUndefined();
  });
});

describe('hours worked, by day', () => {
  const TZ = 'Asia/Kolkata';
  /* 12 March 2026, 10:00 IST. */
  const MORNING = Date.UTC(2026, 2, 12, 4, 30);
  const DAYS = ['2026-03-11', '2026-03-12'];
  const tasks = [task('write', 'build'), task('oil', 'self-care')];
  const judge = workedJudge(tasks, LISTS, PROJECTS);

  it('adds the timer and the hand log, and greys what does not count', () => {
    const [yesterday, today] = workByDay(
      DAYS,
      [focus('f1', 'write', MORNING, 3600), focus('f2', 'oil', MORNING + 4_000_000, 900), focus('f3', 'write', MORNING - 86_400_000, 1800)],
      [hand('calls', '2026-03-12', 2700), hand('oil by hand', '2026-03-12', 600, { taskId: 'oil' })],
      judge,
      TZ,
    );
    expect(today).toEqual({ day: '2026-03-12', timer: 3600, hand: 2700, notCounted: 1500 });
    expect(yesterday).toEqual({ day: '2026-03-11', timer: 1800, hand: 0, notCounted: 0 });
  });

  it('a stretch belongs to the day it started, on his clock, not UTC', () => {
    /* 11 March, 23:50 IST = 18:20 UTC; it runs past midnight. */
    const late = Date.UTC(2026, 2, 11, 18, 20);
    const [yesterday, today] = workByDay(DAYS, [focus('f', 'write', late, 1800)], [], judge, TZ);
    expect(yesterday.timer).toBe(1800);
    expect(today.timer).toBe(0);
  });

  it('counts the stretch running now, before it is banked', () => {
    const [, today] = workByDay(DAYS, [], [], judge, TZ, { taskId: 'write', listId: 'build', startedAt: MORNING, now: MORNING + 1_200_000 });
    expect(today.timer).toBe(1200);
  });

  it('time by hand against a project that does not count is greyed too', () => {
    const judge2 = workedJudge([], LISTS, [project('personal', { notWorked: true }), project('work')]);
    const [, today] = workByDay(DAYS, [], [hand('h', '2026-03-12', 600, { projectId: 'personal' })], judge2, TZ);
    expect(today).toMatchObject({ hand: 0, notCounted: 600 });
  });
});

describe("Smart Start's box", () => {
  it('opens at the hours left, to the quarter hour, and never below half an hour', () => {
    expect(smartStartHours(5 * H + 20 * 60)).toBe('5.25');
    expect(smartStartHours(12 * H)).toBe('12');
    expect(smartStartHours(0)).toBe('0.5');
    expect(smartStartHours(-H)).toBe('0.5');
  });
});

describe('the switch in the store', () => {
  beforeEach(() => {
    useStore.setState({
      projects: [project('p')],
      taskLists: [list('l', 'p')],
      backlogTasks: [task('t', 'l')],
    });
  });

  it('writes true, false and nothing — and nothing is a removed key, never undefined', () => {
    const { setNotWorked } = useStore.getState();
    setNotWorked({ kind: 'task', id: 't' }, false);
    expect(useStore.getState().backlogTasks[0].notWorked).toBe(false);
    setNotWorked({ kind: 'task', id: 't' }, undefined);
    expect('notWorked' in useStore.getState().backlogTasks[0]).toBe(false);
    setNotWorked({ kind: 'list', id: 'l' }, true);
    expect(useStore.getState().taskLists[0].notWorked).toBe(true);
    /* "Counts anyway" means nothing on a list or a project: it is just off. */
    setNotWorked({ kind: 'project', id: 'p' }, false);
    expect('notWorked' in useStore.getState().projects[0]).toBe(false);
  });
});
