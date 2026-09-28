/**
 * The Archive (BUILD-11), driven through the real store.
 *
 * The claim worth holding is the one the item is judged on: an archived
 * project or task is **gone from everything** — the board, the focus queue,
 * other tasks' prerequisites — and **Put back** returns it exactly, through
 * the Trash's own `planRestore`. Plus the two ways it differs from a delete:
 * it never touches the Trash, and it leaves the share link up while still
 * taking the calendar block down.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useStore, type Project, type Task, type TaskList } from './useStore';
import { useTrashStore } from './useTrashStore';
import { useArchiveStore } from './useArchiveStore';
import { useUIStore } from './useUIStore';
import { archiveProject, archiveTask, putBackFromArchive } from '../lib/archive';
import { setDeletionEffectHandler } from '../lib/deletionEffects';
import type { DeletionPlan } from '../lib/cascadeDelete';
import {
  ARCHIVE_BUDGET_BYTES,
  activeSpan,
  describeHeld,
  shelvesOf,
  type ArchiveEntry,
} from '../lib/archiveModel';

const PROJECT: Project = { id: 'p1', name: 'Diwali gift boxes', color: '#fff', createdAt: new Date(2025, 8, 3).getTime(), order: 0, shareId: 'share-p1' };
const LISTS: TaskList[] = [
  { id: 'action-steps', title: 'Action Steps' },
  { id: 'l1', title: 'Suppliers', projectId: 'p1', order: 0 },
];

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1', title: 'Order ribbon', status: 'needsAction', listId: 'l1', listName: 'Suppliers',
    order: 0, subtasks: [], createdAt: 1, ...over,
  };
}

let announced: DeletionPlan[] = [];

beforeEach(() => {
  announced = [];
  setDeletionEffectHandler((plan) => { announced.push(plan); });
  useStore.setState({
    projects: [structuredClone(PROJECT)],
    taskLists: structuredClone(LISTS),
    backlogTasks: [
      task({ id: 't1', deadline: '2026-03-20T17:00', status: 'completed' }),
      task({ id: 't2', title: 'Pack boxes' }),
      task({ id: 'loose', title: 'Renew trade licence', listId: 'action-steps', listName: 'Action Steps', dependsOn: ['t2'] }),
    ],
    tasks: [task({ id: 't2', title: 'Pack boxes' })],
  });
  useTrashStore.setState({ entries: [] });
  useArchiveStore.setState({ entries: [] });
  useUIStore.getState().clearArchiveNotice();
});

afterEach(() => setDeletionEffectHandler(null));

describe('archiving a project', () => {
  it('takes it, its lists and its tasks out of every slice, and keeps them whole', () => {
    expect(archiveProject('p1')).toBe(true);

    const s = useStore.getState();
    expect(s.projects).toEqual([]);
    expect(s.taskLists.map((l) => l.id)).toEqual(['action-steps']);
    expect(s.backlogTasks.map((t) => t.id)).toEqual(['loose']);
    expect(s.tasks).toEqual([]);
    // A loose task that waited on one of its tasks is no longer blocked by a thing you cannot see.
    expect(s.backlogTasks[0].dependsOn).toEqual([]);

    const [entry] = useArchiveStore.getState().entries;
    expect(entry.kind).toBe('project');
    expect(entry.title).toBe('Diwali gift boxes');
    expect(entry.backlogTasks.map((t) => t.id).sort()).toEqual(['t1', 't2']);
    expect(useTrashStore.getState().entries).toEqual([]);
    expect(useUIStore.getState().archiveNotice?.title).toBe('Archived Diwali gift boxes');
  });

  it('keeps the share link up but takes the calendar block down', () => {
    archiveProject('p1');
    expect(announced).toHaveLength(1);
    expect(announced[0].shareIds).toEqual([]);
    expect(announced[0].calendarTaskIds).toEqual(['t1']);
  });

  it('puts back to Home with its tasks, sews the cut prerequisite back on, and queues nothing', () => {
    archiveProject('p1');
    const [entry] = useArchiveStore.getState().entries;

    const result = putBackFromArchive(entry.id);
    expect(result?.reroutedTaskIds).toEqual([]);

    const s = useStore.getState();
    expect(s.projects.map((p) => p.id)).toEqual(['p1']);
    expect(s.projects[0].shareId).toBe('share-p1');
    expect(s.taskLists.map((l) => l.id).sort()).toEqual(['action-steps', 'l1']);
    expect(s.backlogTasks.map((t) => t.id).sort()).toEqual(['loose', 't1', 't2']);
    expect(s.backlogTasks.find((t) => t.id === 'loose')?.dependsOn).toEqual(['t2']);
    expect(s.tasks).toEqual([]);
    expect(useArchiveStore.getState().entries).toEqual([]);
  });
});

describe('archiving a task', () => {
  it('takes one task out and leaves its project standing', () => {
    expect(archiveTask('t2')).toBe(true);
    const s = useStore.getState();
    expect(s.projects).toHaveLength(1);
    expect(s.backlogTasks.map((t) => t.id).sort()).toEqual(['loose', 't1']);
    expect(s.tasks).toEqual([]);

    const [entry] = useArchiveStore.getState().entries;
    expect(entry.kind).toBe('task');
    expect(entry.ancestors.project?.id).toBe('p1');
    expect(entry.ancestors.list?.id).toBe('l1');
  });

  it('comes back into the list it left', () => {
    archiveTask('t2');
    putBackFromArchive(useArchiveStore.getState().entries[0].id);
    const back = useStore.getState().backlogTasks.find((t) => t.id === 't2');
    expect(back?.listId).toBe('l1');
  });

  it('does nothing, and says nothing, for an id that is not a task on the board', () => {
    expect(archiveTask('nope')).toBe(false);
    expect(useArchiveStore.getState().entries).toEqual([]);
    expect(useUIStore.getState().archiveNotice).toBeNull();
  });
});

describe('a full archive', () => {
  it('refuses the new one and removes nothing, rather than dropping an old one', () => {
    const huge: ArchiveEntry = {
      id: 'old', kind: 'task', title: 'x'.repeat(ARCHIVE_BUDGET_BYTES), archivedAt: 1,
      projects: [], taskLists: [], backlogTasks: [], ancestors: {}, backrefs: { dependsOn: [], sharedListIds: [] },
    };
    useArchiveStore.setState({ entries: [huge] });

    expect(archiveProject('p1')).toBe(false);
    expect(useStore.getState().projects).toHaveLength(1);
    expect(useArchiveStore.getState().entries.map((e) => e.id)).toEqual(['old']);
    expect(useUIStore.getState().archiveNotice?.tone).toBe('overrun');
    expect(announced).toEqual([]);
  });
});

describe('the shelves', () => {
  const at = (y: number, m: number, d: number) => new Date(y, m, d, 12).getTime();
  const entry = (over: Partial<ArchiveEntry>): ArchiveEntry => ({
    id: 'e', kind: 'task', title: 'T', archivedAt: 0, projects: [], taskLists: [], backlogTasks: [task()],
    ancestors: { list: LISTS[1], project: PROJECT }, backrefs: { dependsOn: [], sharedListIds: [] }, ...over,
  });
  const entries = [
    entry({ id: 'a', kind: 'project', title: 'Diwali gift boxes', archivedAt: at(2026, 0, 14), projects: [PROJECT], ancestors: {} }),
    entry({ id: 'b', title: 'Quote for the kiln', archivedAt: at(2026, 4, 9) }),
    entry({ id: 'c', title: 'Draft pricing copy', archivedAt: at(2026, 7, 12) }),
    entry({ id: 'd', title: 'Renew licence', archivedAt: at(2026, 0, 20), ancestors: { list: LISTS[0] } }),
  ];

  it('by when: one shelf per quarter, newest first, newest first within', () => {
    const shelves = shelvesOf(entries, 'when');
    expect(shelves.map((s) => s.label)).toEqual(['Jul – Sep 2026', 'Apr – Jun 2026', 'Jan – Mar 2026']);
    expect(shelves[2].entries.map((e) => e.id)).toEqual(['d', 'a']);
    expect(shelves[2].sub).toBe('1 project · 1 task');
  });

  it('by project: the projects first, then loose tasks under where each came from', () => {
    const shelves = shelvesOf(entries, 'project');
    expect(shelves.map((s) => s.label)).toEqual(['Archived projects', 'Diwali gift boxes', 'Action Steps']);
    expect(shelves[1].entries.map((e) => e.id)).toEqual(['c', 'b']);
  });

  it('search finds a month, as the empty result suggests trying', () => {
    expect(shelvesOf(entries, 'when', 'jan').flatMap((s) => s.entries.map((e) => e.id))).toEqual(['d', 'a']);
    expect(shelvesOf(entries, 'when', 'kiln').flatMap((s) => s.entries.map((e) => e.id))).toEqual(['b']);
    expect(shelvesOf(entries, 'when', 'nothing like it')).toEqual([]);
  });

  it('a project tile says what it held and when it was active, not hours nobody logged', () => {
    const p = entry({
      kind: 'project', projects: [PROJECT],
      backlogTasks: [
        task({ status: 'completed', createdAt: at(2025, 9, 1), completedAt: at(2025, 10, 2) }),
        task({ id: 't2', createdAt: at(2025, 9, 5) }),
      ],
    });
    expect(describeHeld(p)).toBe('2 tasks · 1 done, 1 open');
    expect(activeSpan(p)).toBe('Sep – Nov 2025');
  });
});
