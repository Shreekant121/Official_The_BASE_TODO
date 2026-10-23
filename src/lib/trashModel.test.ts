/**
 * The Trash's own rules: when an entry expires, what happens when the document
 * fills up, and the restore cases the store-level tests cannot reach — an
 * entry that predates ancestor snapshots, and a list whose project is gone for
 * good. Those are the paths where a restore quietly loses a task by putting it
 * somewhere nothing renders, which is worse than not restoring it at all.
 */
import { describe, expect, it } from 'vitest';
import {
  daysLeft,
  describeEntryContents,
  planRestore,
  purgeExpired,
  trimTrash,
  TRASH_ENTRY_LIMIT,
  TRASH_RETENTION_MS,
  type TrashEntry,
} from './trashModel';
import type { Project, Task, TaskList } from '../store/useStore';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

const ACTION: TaskList = { id: 'action', title: 'Action Steps' };

function entry(over: Partial<TrashEntry> = {}): TrashEntry {
  return {
    id: 'e1',
    kind: 'task',
    title: 'A task',
    deletedAt: NOW,
    projects: [],
    taskLists: [],
    backlogTasks: [],
    ancestors: {},
    backrefs: { dependsOn: [], sharedListIds: [] },
    ...over,
  };
}

function task(over: Partial<Task> = {}): Task {
  return { id: 't1', title: 'A task', status: 'needsAction', subtasks: [], ...over };
}

// ─── Expiry ──────────────────────────────────────────────────────────────────

describe('the thirty-day window', () => {
  it('keeps an entry until the moment it lapses, then drops it', () => {
    const fresh = entry({ id: 'fresh', deletedAt: NOW - 29 * DAY });
    const lapsed = entry({ id: 'lapsed', deletedAt: NOW - TRASH_RETENTION_MS });

    const { kept, purged } = purgeExpired([fresh, lapsed], NOW);

    expect(kept.map((e) => e.id)).toEqual(['fresh']);
    expect(purged.map((e) => e.id)).toEqual(['lapsed']);
  });

  it('counts down in whole days and never goes negative', () => {
    expect(daysLeft(entry({ deletedAt: NOW }), NOW)).toBe(30);
    expect(daysLeft(entry({ deletedAt: NOW - 29.5 * DAY }), NOW)).toBe(1);
    expect(daysLeft(entry({ deletedAt: NOW - 40 * DAY }), NOW)).toBe(0);
  });
});

// ─── Budget ──────────────────────────────────────────────────────────────────

describe('the document budget', () => {
  it('drops the oldest entries once there are too many', () => {
    const many = Array.from({ length: TRASH_ENTRY_LIMIT + 5 }, (_, i) => entry({ id: `e${i}` }));

    const trimmed = trimTrash(many);

    expect(trimmed).toHaveLength(TRASH_ENTRY_LIMIT);
    expect(trimmed[0].id).toBe('e0'); // newest first, so the front is kept
    expect(trimmed.at(-1)!.id).toBe(`e${TRASH_ENTRY_LIMIT - 1}`);
  });

  it('drops by size too, oldest first, and never the newest entry', () => {
    // 400 KB of description each: two fit inside the budget, three do not.
    const heavy = (id: string) => entry({
      id,
      backlogTasks: [task({ id: `${id}-t`, description: 'x'.repeat(400_000) })],
    });

    const trimmed = trimTrash([heavy('newest'), heavy('older'), heavy('oldest')]);

    expect(trimmed.map((e) => e.id)).toEqual(['newest', 'older']);
  });

  it('keeps a single oversized entry rather than losing it silently', () => {
    const huge = entry({ id: 'huge', backlogTasks: [task({ description: 'x'.repeat(2_000_000) })] });

    expect(trimTrash([huge]).map((e) => e.id)).toEqual(['huge']);
  });
});

// ─── Restore edge cases ──────────────────────────────────────────────────────

describe('planRestore', () => {
  const empty = { projects: [] as Project[], taskLists: [ACTION], backlogTasks: [] as Task[] };

  it('rebuilds the project and list a task came from', () => {
    const result = planRestore(empty, entry({
      backlogTasks: [task({ listId: 'l1' })],
      ancestors: {
        project: { id: 'p1', name: 'Empire', createdAt: 1, order: 0 },
        list: { id: 'l1', title: 'Build', projectId: 'p1' },
      },
    }), ACTION);

    expect(result.next.projects.map((p) => p.id)).toEqual(['p1']);
    expect(result.next.taskLists.map((l) => l.id)).toEqual(['action', 'l1']);
    expect(result.next.backlogTasks[0].listId).toBe('l1');
    expect(result.reroutedTaskIds).toEqual([]);
  });

  it('falls back to Action Steps when there is no chain to rebuild', () => {
    // An entry written before ancestors were recorded — the list id it points
    // at means nothing any more.
    const result = planRestore(empty, entry({
      backlogTasks: [task({ listId: 'gone', listName: 'Gone' })],
    }), ACTION);

    expect(result.next.backlogTasks[0].listId).toBe('action');
    expect(result.next.backlogTasks[0].listName).toBe('Action Steps');
    expect(result.reroutedTaskIds).toEqual(['t1']);
  });

  it('refuses to restore a list whose project is gone, and reroutes instead', () => {
    // Restoring `l1` here would hand the task a home that renders nowhere:
    // the project view is the only place a project list is drawn.
    const result = planRestore(empty, entry({
      backlogTasks: [task({ listId: 'l1' })],
      ancestors: { list: { id: 'l1', title: 'Build', projectId: 'p-deleted' } },
    }), ACTION);

    expect(result.next.taskLists.map((l) => l.id)).toEqual(['action']);
    expect(result.next.backlogTasks[0].listId).toBe('action');
    expect(result.reroutedTaskIds).toEqual(['t1']);
  });

  it('is idempotent — restoring twice adds nothing a second time', () => {
    const one = entry({ backlogTasks: [task({ listId: 'action' })] });

    const first = planRestore(empty, one, ACTION);
    const second = planRestore(first.next, one, ACTION);

    expect(second.next.backlogTasks).toHaveLength(1);
    expect(second.next.taskLists).toHaveLength(1);
  });

  it('drops a recorded prerequisite that no longer exists rather than restoring a dangling id', () => {
    const survivor = task({ id: 'survivor', dependsOn: [] });
    const result = planRestore(
      { ...empty, backlogTasks: [survivor] },
      entry({ backrefs: { dependsOn: [{ taskId: 'survivor', ids: ['purged'] }], sharedListIds: [] } }),
      ACTION,
    );

    expect(result.next.backlogTasks[0].dependsOn).toEqual([]);
  });
});

// ─── Row summary ─────────────────────────────────────────────────────────────

describe('describeEntryContents', () => {
  it('says what a project brings back with it', () => {
    expect(describeEntryContents(entry({
      kind: 'project',
      taskLists: [{ id: 'l1', title: 'Build' }],
      backlogTasks: [task({ id: 'a' }), task({ id: 'b' })],
    }))).toBe('1 list · 2 tasks');
  });

  it('says nothing about a single task, which the row already labels', () => {
    expect(describeEntryContents(entry({ backlogTasks: [task()] }))).toBe('');
  });

  it('calls an empty list empty', () => {
    expect(describeEntryContents(entry({ kind: 'list', taskLists: [{ id: 'l1', title: 'Build' }] })))
      .toBe('1 list');
    expect(describeEntryContents(entry({ kind: 'list' }))).toBe('empty');
  });
});
