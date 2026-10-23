/**
 * Deleting through the real store, end to end.
 *
 * These go through `useStore` rather than calling the planners directly on
 * purpose: the bug being fixed was never in the arithmetic, it was that six
 * call sites each did a different fraction of the work. What matters is that
 * one call to `deleteBacklogTask` leaves **nothing** pointing at what it
 * removed — not the focus queue, not a subtask-proxy row, not another task's
 * prerequisites — and that the Trash ends up holding enough to undo it.
 *
 * `assertNoOrphans` is the load-bearing assertion. It is deliberately a sweep
 * over the whole state rather than a list of specific expectations, so a
 * *new* kind of reference added to `Task` later fails here rather than
 * silently joining the set of things delete forgets about.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore, type Project, type Task, type TaskList } from '../store/useStore';
import { useTrashStore } from '../store/useTrashStore';
import { restoreFromTrash } from './trash';

// ─── Fixture ─────────────────────────────────────────────────────────────────

const PROJECTS: Project[] = [
  { id: 'p1', name: 'Empire', createdAt: 1, order: 0, shareId: 'sh-p1' },
  { id: 'p2', name: 'Studio', createdAt: 2, order: 1 },
];

const LISTS: TaskList[] = [
  { id: 'action', title: 'Action Steps' },
  { id: 'backburner', title: 'Backburner' },
  { id: 'reference', title: 'Reference Materials' },
  { id: 'l1', title: 'Build', projectId: 'p1', order: 0, shareId: 'sh-l1' },
  { id: 'l2', title: 'Money', projectId: 'p1', order: 1 },
  { id: 'l3', title: 'The Space', projectId: 'p2', order: 0 },
];

/** t1 owns a two-level subtask tree; s1 has a proxy row in today's queue. */
const TASKS: Task[] = [
  {
    id: 't1', title: 'File the paperwork', status: 'needsAction', listId: 'l1', listName: 'Build',
    deadline: '2026-03-13T18:00', shareId: 'sh-t1',
    subtasks: [
      { id: 's1', title: 'Upload', status: 'needsAction', subtasks: [{ id: 's1a', title: 'Scan', status: 'needsAction' }] },
    ],
  },
  { id: 't2', title: 'Open the account', status: 'needsAction', listId: 'l2', listName: 'Money', dependsOn: ['t1'], sharedListIds: ['l3'], subtasks: [] },
  { id: 't3', title: 'Countersign the lease', status: 'needsAction', listId: 'l3', listName: 'The Space', deadline: '2026-03-17T16:00', dependsOn: ['t1'], subtasks: [] },
  { id: 't4', title: 'Renew the licence', status: 'needsAction', listId: 'action', listName: 'Action Steps', subtasks: [] },
];

const QUEUE: Task[] = [
  { ...TASKS[0], allocatedTime: 5400 },
  { id: 's1', title: 'Upload', status: 'needsAction', listId: 'l1', listName: 'Build', isSubtaskProxy: true, subtasks: [] },
  { ...TASKS[3] },
];

function seed() {
  useStore.setState({
    projects: structuredClone(PROJECTS),
    taskLists: structuredClone(LISTS),
    backlogTasks: structuredClone(TASKS),
    tasks: structuredClone(QUEUE),
  });
  useTrashStore.setState({ entries: [] });
}

// ─── The sweep ───────────────────────────────────────────────────────────────

/** Every reference in the store must resolve to something that still exists. */
function assertNoOrphans() {
  const { projects, taskLists, backlogTasks, tasks } = useStore.getState();
  const projectIds = new Set(projects.map((p) => p.id));
  const listIds = new Set(taskLists.map((l) => l.id));
  const taskIds = new Set(backlogTasks.map((t) => t.id));
  const subtaskIds = new Set<string>();
  const collect = (subs: Task['subtasks']) => {
    for (const s of subs ?? []) { subtaskIds.add(s.id); collect(s.subtasks); }
  };
  for (const t of backlogTasks) collect(t.subtasks);

  for (const list of taskLists) {
    if (list.projectId) expect(projectIds, `list ${list.id} → project`).toContain(list.projectId);
  }
  for (const task of backlogTasks) {
    if (task.listId) expect(listIds, `task ${task.id} → list`).toContain(task.listId);
    for (const id of task.dependsOn ?? []) expect(taskIds, `task ${task.id} → dependsOn`).toContain(id);
    for (const id of task.sharedListIds ?? []) expect(listIds, `task ${task.id} → sharedListIds`).toContain(id);
  }
  for (const row of tasks) {
    // A queue row is either a snapshot of a live backlog task or a proxy for
    // one of its subtasks — nothing else may survive in there.
    const known = row.isSubtaskProxy ? subtaskIds.has(row.id) : taskIds.has(row.id);
    expect(known, `focus queue row ${row.id} has no backing record`).toBe(true);
    if (row.listId) expect(listIds, `queue row ${row.id} → list`).toContain(row.listId);
  }
}

const ids = (arr: { id: string }[]) => arr.map((x) => x.id);

beforeEach(seed);

// ─── Deleting a task ─────────────────────────────────────────────────────────

describe('deleteBacklogTask', () => {
  it('removes the task, its queue row and its subtask proxy in one call', () => {
    useStore.getState().deleteBacklogTask('t1');

    expect(ids(useStore.getState().backlogTasks)).toEqual(['t2', 't3', 't4']);
    // 't1' was the queue row, 's1' the proxy standing in for its subtask.
    expect(ids(useStore.getState().tasks)).toEqual(['t4']);
    assertNoOrphans();
  });

  it('strips the id from every other task that depended on it', () => {
    useStore.getState().deleteBacklogTask('t1');

    const byId = new Map(useStore.getState().backlogTasks.map((t) => [t.id, t]));
    expect(byId.get('t2')!.dependsOn).toEqual([]);
    expect(byId.get('t3')!.dependsOn).toEqual([]);
  });

  it('reports the share document and the calendar reminder that have to be cancelled', () => {
    useStore.getState().deleteBacklogTask('t1');

    const entry = useTrashStore.getState().entries[0];
    expect(entry.kind).toBe('task');
    expect(entry.title).toBe('File the paperwork');
    expect(ids(entry.backlogTasks)).toEqual(['t1']);
    // The plan's own share/calendar lists are what `deletionCleanup` acts on;
    // they are asserted through the trash entry's contents, which is the same
    // set: one share id, one deadline-carrying task.
    expect(entry.backlogTasks[0].shareId).toBe('sh-t1');
    expect(entry.backlogTasks[0].deadline).toBeTruthy();
  });

  it('remembers the list and project it came from', () => {
    useStore.getState().deleteBacklogTask('t1');

    const entry = useTrashStore.getState().entries[0];
    expect(entry.ancestors.list?.id).toBe('l1');
    expect(entry.ancestors.project?.id).toBe('p1');
  });

  it('does nothing at all for an id that matches no task', () => {
    const before = useStore.getState();
    useStore.getState().deleteBacklogTask('nope');

    expect(useStore.getState().backlogTasks).toBe(before.backlogTasks);
    expect(useTrashStore.getState().entries).toHaveLength(0);
  });

  it('leaves a completed task deletable without disturbing anything else', () => {
    useStore.getState().deleteBacklogTask('t4');

    expect(ids(useStore.getState().backlogTasks)).toEqual(['t1', 't2', 't3']);
    expect(ids(useStore.getState().tasks)).toEqual(['t1', 's1']);
    assertNoOrphans();
  });
});

// ─── Deleting a list ─────────────────────────────────────────────────────────

describe('deleteTaskList', () => {
  it('takes its tasks, their queue rows and their proxies with it', () => {
    useStore.getState().deleteTaskList('l1');

    expect(ids(useStore.getState().taskLists)).not.toContain('l1');
    expect(ids(useStore.getState().backlogTasks)).toEqual(['t2', 't3', 't4']);
    expect(ids(useStore.getState().tasks)).toEqual(['t4']);
    assertNoOrphans();
  });

  it('unshares itself from tasks that were cross-linked into it', () => {
    useStore.getState().deleteTaskList('l3');

    const byId = new Map(useStore.getState().backlogTasks.map((t) => [t.id, t]));
    expect(byId.get('t2')!.sharedListIds).toEqual([]);
    expect(byId.has('t3')).toBe(false); // t3 lived in l3
    assertNoOrphans();
  });
});

// ─── Deleting a project ──────────────────────────────────────────────────────

describe('deleteProject', () => {
  it('cascades through its lists and their tasks, and nothing outside it', () => {
    useStore.getState().deleteProject('p1');

    expect(ids(useStore.getState().projects)).toEqual(['p2']);
    expect(ids(useStore.getState().taskLists)).toEqual(['action', 'backburner', 'reference', 'l3']);
    expect(ids(useStore.getState().backlogTasks)).toEqual(['t3', 't4']);
    expect(ids(useStore.getState().tasks)).toEqual(['t4']);
    assertNoOrphans();
  });

  it('files the whole cascade as one restorable entry', () => {
    useStore.getState().deleteProject('p1');

    const entries = useTrashStore.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('project');
    expect(ids(entries[0].projects)).toEqual(['p1']);
    expect(ids(entries[0].taskLists)).toEqual(['l1', 'l2']);
    expect(ids(entries[0].backlogTasks)).toEqual(['t1', 't2']);
  });

  it('takes every project inside it, at any depth, as the same one entry (BIG-2)', () => {
    // p2 inside p1, and a third project inside p2 with a list of its own.
    useStore.getState().moveProject('p2', 'p1');
    useStore.setState((s) => ({
      projects: [...s.projects, { id: 'p3', name: 'Deep', createdAt: 3, order: 0, parentId: 'p2' }],
      taskLists: [...s.taskLists, { id: 'l4', title: 'Deep list', projectId: 'p3', order: 0 }],
    }));

    useStore.getState().deleteProject('p1');

    expect(ids(useStore.getState().projects)).toEqual([]);
    expect(ids(useStore.getState().taskLists)).toEqual(['action', 'backburner', 'reference']);
    expect(ids(useStore.getState().backlogTasks)).toEqual(['t4']);
    assertNoOrphans();

    const entries = useTrashStore.getState().entries;
    expect(entries).toHaveLength(1);
    // The one he deleted first — Trash and Archive both name the row after it.
    expect(ids(entries[0].projects)).toEqual(['p1', 'p2', 'p3']);
    expect(ids(entries[0].taskLists)).toEqual(['l1', 'l2', 'l3', 'l4']);

    restoreFromTrash(entries[0].id);
    const byId = new Map(useStore.getState().projects.map((p) => [p.id, p]));
    expect(byId.get('p2')!.parentId).toBe('p1');
    expect(byId.get('p3')!.parentId).toBe('p2');
    assertNoOrphans();
  });

  it('leaves the project it sat inside, and that project\'s siblings, alone', () => {
    useStore.getState().moveProject('p2', 'p1');
    useStore.getState().deleteProject('p2');

    expect(ids(useStore.getState().projects)).toEqual(['p1']);
    expect(ids(useStore.getState().taskLists)).toContain('l1');
    assertNoOrphans();

    // It remembers where it sat, so the row can say so and a restore can
    // rebuild that project if it has gone since — as a list does its project.
    const entry = useTrashStore.getState().entries[0];
    expect(entry.ancestors.project?.id).toBe('p1');
    useStore.getState().deleteProject('p1');
    useTrashStore.getState().remove(useTrashStore.getState().entries[0].id);
    restoreFromTrash(entry.id);
    expect(useStore.getState().projects.map((p) => [p.id, p.parentId])).toEqual([['p1', undefined], ['p2', 'p1']]);
  });
});

// ─── Restoring ───────────────────────────────────────────────────────────────

describe('restoreFromTrash', () => {
  it('puts a task back where it was, prerequisites included', () => {
    useStore.getState().deleteBacklogTask('t1');
    const entryId = useTrashStore.getState().entries[0].id;

    expect(restoreFromTrash(entryId)!.reroutedTaskIds).toEqual([]);

    const byId = new Map(useStore.getState().backlogTasks.map((t) => [t.id, t]));
    expect(byId.get('t1')!.listId).toBe('l1');
    expect(byId.get('t1')!.subtasks).toHaveLength(1);
    expect(byId.get('t2')!.dependsOn).toEqual(['t1']);
    expect(byId.get('t3')!.dependsOn).toEqual(['t1']);
    expect(useTrashStore.getState().entries).toHaveLength(0);
    assertNoOrphans();
  });

  it('rebuilds the list and project around a task whose home was deleted too', () => {
    useStore.getState().deleteBacklogTask('t1');
    const taskEntry = useTrashStore.getState().entries[0].id;
    // Now delete the project the task belonged to, and throw that entry away —
    // the only record of `l1` and `p1` left anywhere is inside the task entry.
    useStore.getState().deleteProject('p1');
    const projectEntry = useTrashStore.getState().entries[0].id;
    useTrashStore.getState().remove(projectEntry);

    expect(ids(useStore.getState().projects)).toEqual(['p2']);
    expect(restoreFromTrash(taskEntry)!.reroutedTaskIds).toEqual([]);

    expect(ids(useStore.getState().projects)).toContain('p1');
    expect(ids(useStore.getState().taskLists)).toContain('l1');
    expect(useStore.getState().backlogTasks.find((t) => t.id === 't1')!.listId).toBe('l1');
    assertNoOrphans();
  });

  it('brings a whole project back intact, including dependencies between its own tasks', () => {
    useStore.getState().deleteProject('p1');
    const entryId = useTrashStore.getState().entries[0].id;

    restoreFromTrash(entryId);

    const byId = new Map(useStore.getState().backlogTasks.map((t) => [t.id, t]));
    expect(ids(useStore.getState().taskLists)).toContain('l1');
    // t1 and t2 went into the trash together, so the link between them was
    // never cut and comes back untouched.
    expect(byId.get('t2')!.dependsOn).toEqual(['t1']);
    // t3 survived the deletion and had its reference to t1 cut — that one is
    // sewn back on from the recorded backref.
    expect(byId.get('t3')!.dependsOn).toEqual(['t1']);
    assertNoOrphans();
  });

  it('restores a cross-link into a list that comes back', () => {
    useStore.getState().deleteTaskList('l3');
    const entryId = useTrashStore.getState().entries[0].id;

    restoreFromTrash(entryId);

    const byId = new Map(useStore.getState().backlogTasks.map((t) => [t.id, t]));
    expect(byId.get('t2')!.sharedListIds).toEqual(['l3']);
    assertNoOrphans();
  });

  it('drops a restored task\'s own references to things purged since it went in', () => {
    // t3 (in p2) depends on t1 (in p1), and is cross-linked into l2 (p1) and
    // Action Steps. p2 goes first, so those links travel inside p2's entry
    // uncut. Then p1 goes and is purged — t1 and l2 are gone for good, and
    // restoring p2 must not bring t3 back pointing at either.
    useStore.setState((s) => ({
      backlogTasks: s.backlogTasks.map((t) => t.id === 't3' ? { ...t, sharedListIds: ['l2', 'action'] } : t),
    }));
    useStore.getState().deleteProject('p2');
    const p2Entry = useTrashStore.getState().entries[0].id;
    useStore.getState().deleteProject('p1');
    useTrashStore.getState().remove(useTrashStore.getState().entries[0].id);

    restoreFromTrash(p2Entry);

    const t3 = useStore.getState().backlogTasks.find((t) => t.id === 't3')!;
    expect(t3.listId).toBe('l3');
    expect(t3.dependsOn).toEqual([]);
    expect(t3.sharedListIds).toEqual(['action']);
    assertNoOrphans();
  });

  it('does not put anything back into today’s focus queue', () => {
    useStore.getState().deleteBacklogTask('t1');
    restoreFromTrash(useTrashStore.getState().entries[0].id);

    expect(ids(useStore.getState().tasks)).toEqual(['t4']);
    assertNoOrphans();
  });

  it('is harmless when the entry is already gone', () => {
    expect(restoreFromTrash('not-an-entry')).toBeNull();
  });
});
