/**
 * BUILD-14's two pure halves: what the share page says (`shareView.ts`) and
 * what a share document is allowed to carry (`buildShareDoc`).
 *
 * The second half is the one that matters for privacy, so it is asserted as
 * absences: a view-only link carries no names and no hours, an outsourcing
 * link never carries the client view even with the flag left on, and a closed
 * link carries no title and no tasks at all.
 *
 * Every date is built from a local wall-clock string, the way the app stores
 * them, so the sentences hold in whatever zone the tests run.
 */
import { describe, expect, it } from 'vitest';
import { buildShareDoc, shareExpiryInstant } from './publicShareSnapshot';
import type { FocusLogEntry, Project, Task, TaskList } from '../store/useStore';
import {
  clockText, dueLine, durationText, estimateText, initials, isClosed, liveRunShown, projectListsDeep, readSummary,
  shareTasks, workPhase,
} from './shareView';

const at = (local: string) => new Date(local).getTime();
const NOW = at('2026-09-23T10:00');
const inr = (n: number) => `₹${n}`;

describe('dueLine', () => {
  it('counts calendar days, not 24-hour blocks', () => {
    expect(dueLine({ done: false, deadline: '2026-09-26T09:00' }, NOW)).toEqual({ text: 'Due 26 Sep · in 3 days', late: false });
    expect(dueLine({ done: false, deadline: '2026-09-24T23:00' }, NOW)?.text).toBe('Due tomorrow');
  });

  it('says late in days, and amber', () => {
    expect(dueLine({ done: false, deadline: '2026-09-20T18:00' }, NOW)).toEqual({ text: 'Due 20 Sep · 3 days late', late: true });
    expect(dueLine({ done: false, deadline: '2026-09-22T18:00' }, NOW)?.text).toBe('Due 22 Sep · 1 day late');
  });

  it('is late on the day once the hour has passed', () => {
    expect(dueLine({ done: false, deadline: '2026-09-23T09:00' }, NOW)).toEqual({ text: 'Due today · late', late: true });
    expect(dueLine({ done: false, deadline: '2026-09-23T17:00' }, NOW)).toEqual({ text: 'Due today', late: false });
  });

  it('drops the countdown past two weeks, and adds the year only when it differs', () => {
    expect(dueLine({ done: false, deadline: '2026-10-24T09:00' }, NOW)?.text).toBe('Due 24 Oct');
    expect(dueLine({ done: false, deadline: '2027-01-05T09:00' }, NOW)?.text).toBe('Due 5 Jan 2027');
  });

  it('reads a finished task as delivered, whatever its deadline', () => {
    expect(dueLine({ done: true, deadline: '2026-09-01T09:00', completedAt: at('2026-09-05T12:00') }, NOW)?.text).toBe('Delivered 5 Sep');
    expect(dueLine({ done: true }, NOW)?.text).toBe('Delivered');
  });

  it('says nothing for no date, or a date that does not parse', () => {
    expect(dueLine({ done: false }, NOW)).toBeNull();
    expect(dueLine({ done: false, deadline: 'soon' }, NOW)).toBeNull();
  });
});

describe('time wording', () => {
  it('estimates', () => {
    expect(estimateText(45)).toBe('45 m');
    expect(estimateText(120)).toBe('2 h');
    expect(estimateText(90)).toBe('1.5 h');
  });
  it('durations and clocks', () => {
    expect(durationText(30)).toBe('under a minute');
    expect(durationText(38 * 60)).toBe('38m');
    expect(durationText(6 * 3600 + 10 * 60 + 59)).toBe('6h 10m');
    expect(clockText(5047)).toBe('1:24:07');
    expect(clockText(-3)).toBe('0:00:00');
  });
  it('initials', () => {
    expect(initials('Shreekant Brahmbhatt')).toBe('SB');
    expect(initials('Priya')).toBe('PR');
    expect(initials('  ')).toBe('');
  });
});

describe('workPhase', () => {
  const task = { id: 't1', done: false };
  const sub = (state: 'in_progress' | 'submitted' | 'released') => ({ taskId: 't1', workerName: 'Priya', state, updatedAt: 0 });

  it('a released claim is open again', () => {
    expect(workPhase(task, undefined, [])).toBe('open');
    expect(workPhase(task, sub('released'), ['t1'])).toBe('open');
  });
  it('a claim from this device is mine, then sent; anyone else’s is taken', () => {
    expect(workPhase(task, sub('in_progress'), ['t1'])).toBe('mine');
    expect(workPhase(task, sub('submitted'), ['t1'])).toBe('sent');
    expect(workPhase(task, sub('in_progress'), [])).toBe('taken');
  });
  it('approval beats every claim', () => {
    expect(workPhase({ id: 't1', done: true }, sub('submitted'), ['t1'])).toBe('approved');
  });
});

describe('readSummary', () => {
  const t = (over: Partial<Parameters<typeof readSummary>[0][number]>) => ({
    id: 'x', title: 'x', status: 'needsAction', done: false, subtaskDone: 0, subtaskTotal: 0, ...over,
  });

  it('leaves out a figure with nothing behind it', () => {
    const s = readSummary([t({ id: 'a' }), t({ id: 'b', done: true })], NOW, inr);
    expect(s.stats.map((x) => x.key)).toEqual(['progress']);
    expect(s.hasMoney).toBe(false);
    expect(s.progress).toBe(0.5);
  });

  it('weighs progress by hours when every task is estimated, and names the next deadline', () => {
    const tasks = [
      t({ id: 'a', done: true, estimatedTime: 60, valueINR: 1000 }),
      t({ id: 'b', estimatedTime: 180, valueINR: 3000, deadline: '2026-09-26T09:00', title: 'Visual direction' }),
      t({ id: 'c', estimatedTime: 60, deadline: '2026-10-03T09:00' }),
    ];
    const s = readSummary(tasks, NOW, inr);
    expect(s.progress).toBe(0.2);
    expect(s.stats.find((x) => x.key === 'next')).toMatchObject({ value: '26 Sep', sub: 'Visual direction, in 3 days' });
    expect(s.stats.find((x) => x.key === 'estimate')).toMatchObject({ value: '5 h', sub: '1 h delivered' });
    expect(s.stats.find((x) => x.key === 'budget')).toMatchObject({ value: '₹4000', sub: '₹1000 delivered', money: true });
  });

  it('counts tasks when one has no estimate, and says so when nothing is delivered', () => {
    const s = readSummary([
      t({ id: 'a', done: true, valueINR: 1000 }),
      t({ id: 'b', estimatedTime: 180 }),
      t({ id: 'c', estimatedTime: 60 }),
    ], NOW, inr);
    expect(s.progress).toBeCloseTo(1 / 3);
    expect(s.stats.find((x) => x.key === 'estimate')).toMatchObject({ value: '4 h', sub: 'None delivered yet' });
  });
});

// ─── buildShareDoc ───────────────────────────────────────────────────────────

const OWNER = 'Xy7Qp2Lm9Rt4Vb8Nc1Kd5Fg3Hj6';
const project = (over: Partial<Project> = {}): Project => ({
  id: 'p1', name: 'Website refresh', createdAt: 0, order: 0, shareId: 's1',
  imageUrl: 'data:image/jpeg;base64,AAAA', ...over,
});
const lists: TaskList[] = [{ id: 'l1', title: 'Design', projectId: 'p1' }];
const tasks: Task[] = [
  { id: 't1', title: 'Wireframes', status: 'completed', listId: 'l1', assignee: OWNER, completedAt: at('2026-09-12T12:00') },
  { id: 't2', title: 'Copy', status: 'in-progress', listId: 'l1', assignee: 'Riya' },
  { id: 't3', title: 'Photos', status: 'needsAction', listId: 'l1', assignee: 'Ab12Cd34Ef56Gh78Ij90Kl12Mn34' },
];
const focusLog = [
  { id: 'f1', taskId: 't1', taskTitle: 'Wireframes', seconds: 3600, startedAt: 0, endedAt: 3600 },
  { id: 'f2', taskId: 't1', taskTitle: 'Wireframes', seconds: 600, startedAt: 4000, endedAt: 4600 },
] as FocusLogEntry[];
const live = { taskId: 't2', since: NOW - 60_000, segmentStartedAt: NOW - 60_000, until: NOW + 3_600_000 };

function doc(over: Partial<Project> = {}) {
  return buildShareDoc('s1', OWNER, 'Shreekant', {
    type: 'project', project: project(over), allLists: lists, allTasks: tasks,
  }, { focusLog, live, now: NOW });
}

describe('buildShareDoc — what a link may carry', () => {
  it('a view-only link carries no names, no hours, no run and no cover', () => {
    const d = doc();
    const out = d.project!.lists[0].tasks;
    expect(d.showPeople).toBeUndefined();
    expect(d.live).toBeUndefined();
    expect(d.project!.coverUrl).toBeUndefined();
    for (const t of out) {
      expect(t.assignedToOwner).toBeUndefined();
      expect(t.assigneeName).toBeUndefined();
      expect(t.spentSeconds).toBeUndefined();
    }
    expect(out[0].completedAt).toBe(at('2026-09-12T12:00'));
  });

  it('the client view adds them, and never publishes an account id', () => {
    const d = doc({ shareShowPeople: true });
    const [t1, t2, t3] = d.project!.lists[0].tasks;
    expect(d.showPeople).toBe(true);
    expect(d.live).toEqual(live);
    expect(d.project!.coverUrl).toBe('data:image/jpeg;base64,AAAA');
    expect(t1).toMatchObject({ assignedToOwner: true, spentSeconds: 4200 });
    expect(t2.assigneeName).toBe('Riya');
    expect(t3.assigneeName).toBeUndefined();
    expect(t3.assignedToOwner).toBeUndefined();
  });

  it('an outsourcing link never shows people, even with the flag left on', () => {
    const d = doc({ shareShowPeople: true, shareAllowContributions: true });
    expect(d.allowContributions).toBe(true);
    expect(d.showPeople).toBeUndefined();
    expect(d.live).toBeUndefined();
    expect(d.project!.lists[0].tasks[0].spentSeconds).toBeUndefined();
  });

  it('a run on a task the link does not hold, or past its end, is not published', () => {
    const elsewhere = buildShareDoc('s1', OWNER, undefined, {
      type: 'project', project: project({ shareShowPeople: true }), allLists: lists, allTasks: tasks,
    }, { live: { ...live, taskId: 'not-here' }, now: NOW });
    expect(elsewhere.live).toBeUndefined();
    const over = buildShareDoc('s1', OWNER, undefined, {
      type: 'project', project: project({ shareShowPeople: true }), allLists: lists, allTasks: tasks,
    }, { live: { ...live, until: NOW - 1 }, now: NOW });
    expect(over.live).toBeUndefined();
  });

  it('works to the end of its last day, then publishes nothing but the fact', () => {
    const open = doc({ shareExpiresOn: '2026-09-23', shareShowPeople: true });
    expect(open.expiresAt).toBe(at('2026-09-24T00:00'));
    expect(open.expired).toBeUndefined();
    expect(open.title).toBe('Website refresh');

    const closed = doc({ shareExpiresOn: '2026-09-22', shareAllowContributions: true });
    expect(closed).toMatchObject({ expired: true, title: '', allowContributions: false, type: 'project' });
    expect(closed.project).toBeUndefined();
    expect(closed.subtitle).toBeUndefined();
    expect(isClosed(closed, NOW)).toBe(true);
  });

  it('an end date that does not parse closes nothing', () => {
    expect(shareExpiryInstant('2026-9-3')).toBeUndefined();
    expect(shareExpiryInstant(undefined)).toBeUndefined();
    expect(doc({ shareExpiresOn: 'soon' }).expiresAt).toBeUndefined();
  });

  it('the page closes a link by its date before any rewrite strips it', () => {
    expect(isClosed({ expiresAt: NOW }, NOW)).toBe(true);
    expect(isClosed({ expiresAt: NOW + 1 }, NOW)).toBe(false);
  });

  it('the page drops a run that has outlived its tab', () => {
    const d = doc({ shareShowPeople: true });
    expect(liveRunShown(d, NOW)).toEqual(live);
    expect(liveRunShown(d, live.until)).toBeNull();
  });
});

describe("a mega project's link (BIG-2)", () => {
  const P = (id: string, parentId?: string): Project =>
    ({ id, name: id.toUpperCase(), createdAt: 0, order: 0, ...(parentId ? { parentId } : {}) });
  const L = (id: string, projectId: string): TaskList => ({ id, title: id, projectId, order: 0 }) as TaskList;
  const T = (id: string, listId: string, valueINR = 0): Task =>
    ({ id, title: id, listId, status: 'needsAction', subtasks: [], valueINR }) as Task;
  const projects = [P('mega'), P('inner', 'mega'), P('deep', 'inner'), P('other')];
  const lists = [L('own', 'mega'), L('in', 'inner'), L('down', 'deep'), L('elsewhere', 'other')];
  const tasks = [T('a', 'own', 100), T('b', 'in', 20), T('c', 'down', 3), T('d', 'elsewhere', 5000)];

  const doc = buildShareDoc('sh', 'owner', 'Shreekant', {
    type: 'project', project: projects[0], allLists: lists, allTasks: tasks, allProjects: projects,
  }, { now: NOW });

  it('publishes every project inside it, at any depth, and nothing outside it', () => {
    expect(projectListsDeep(doc.project).map((x) => x.title)).toEqual(['own', 'INNER › in', 'INNER › DEEP › down']);
    expect(shareTasks(doc).map((t) => t.id)).toEqual(['a', 'b', 'c']);
    expect(doc.project!.totalValueINR).toBe(123);
  });

  it("keeps the shared project's own description and cover off the ones inside", () => {
    const inner = doc.project!.children![0];
    expect('description' in inner).toBe(false);
    expect(inner.coverUrl).toBeUndefined();
  });

  it('writes no children key for a project with none, so an old page reads it as before', () => {
    const solo = buildShareDoc('sh', 'owner', undefined, {
      type: 'project', project: projects[3], allLists: lists, allTasks: tasks, allProjects: projects,
    }, { now: NOW });
    expect('children' in solo.project!).toBe(false);
  });
});
