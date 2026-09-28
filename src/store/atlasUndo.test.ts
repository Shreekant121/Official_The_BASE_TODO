/**
 * Putting an Atlas change back (item 13, DESIGN.md §5.3).
 *
 * WHAT THIS IS PROVING, AND WHY IT IS NOT THE RING'S EXISTING TEST
 * -----------------------------------------------------------------
 * The in-browser snapshot ring has always restored an *edit*. Atlas's action
 * log has to restore three things, and two of them the ring deliberately does
 * not:
 *
 * - a **creation**, by soft-deleting what was made (D3 is reversed for Atlas —
 *   deletion is soft, into a 30-day Trash, so undoing a creation is itself
 *   undoable). The ring leaves it standing, correctly, because the fallback
 *   agent has no delete tool at all;
 * - a **deletion**, out of the Trash rather than by patching a record that is
 *   no longer there;
 * - an **edit**, exactly as before.
 *
 * All three go through the real store — `deleteBacklogTask` is `applyDeletion`,
 * `restoreFromTrash` rebuilds the parent chain — because a hand-rolled undo
 * would re-create every cascade bug CLAUDE.md warns about, pointed backwards.
 *
 * The entries are driven through `revertSnapshotEntries` as **plain data**, the
 * way they arrive from Atlas over a pipe, rather than through the ring. That is
 * the claim that matters for the log: a token written to a JSON file on the
 * laptop last Tuesday still works today.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useStore, type Task, type TaskList } from './useStore';
import { useTrashStore } from './useTrashStore';
import { revertSnapshotEntries, type SnapshotEntry } from './useSnapshotStore';

const LISTS: TaskList[] = [{ id: 'l1', title: 'Build', projectId: 'p1', order: 0 }];

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Shortlist the CA',
    status: 'needsAction',
    listId: 'l1',
    listName: 'Build',
    order: 0,
    subtasks: [],
    createdAt: 1,
    ...over,
  };
}

/** A token as it comes back from Atlas: JSON, with no live objects in it. */
function overTheWire(entries: SnapshotEntry[]): SnapshotEntry[] {
  return JSON.parse(JSON.stringify(entries)) as SnapshotEntry[];
}

beforeEach(() => {
  useStore.setState({
    projects: [],
    taskLists: structuredClone(LISTS),
    backlogTasks: [],
    tasks: [],
    focusLog: [],
  });
  useTrashStore.setState({ entries: [] });
});

describe('an edit', () => {
  it('writes the captured fields back and reports it restored', () => {
    useStore.setState({ backlogTasks: [task({ deadline: '2026-03-20T18:00', estimatedTime: 45 })] });

    const entries = overTheWire([
      {
        kind: 'task',
        id: 't1',
        label: 'Shortlist the CA',
        location: 'backlog',
        prior: task({ deadline: '2026-03-12T09:00', estimatedTime: 15 }),
      },
    ]);

    const outcomes = revertSnapshotEntries(entries, { undoCreations: true });

    expect(outcomes[0].status).toBe('restored');
    const back = useStore.getState().backlogTasks[0];
    expect(back.deadline).toBe('2026-03-12T09:00');
    expect(back.estimatedTime).toBe(15);
  });

  it('says "unchanged" and writes nothing when the world already matches', () => {
    // Not a failure. If the state the undo wanted is the state that is there,
    // the undo is done — and the log must not claim to have moved something.
    useStore.setState({ backlogTasks: [task({ estimatedTime: 15 })] });

    const outcomes = revertSnapshotEntries(
      overTheWire([{ kind: 'task', id: 't1', label: 'Shortlist the CA', location: 'backlog', prior: task({ estimatedTime: 15 }) }]),
      { undoCreations: true },
    );

    expect(outcomes[0].status).toBe('unchanged');
  });
});

describe('a creation', () => {
  it('soft-deletes what Atlas made, and the task lands in the Trash', () => {
    useStore.setState({ backlogTasks: [task({ id: 'new1', title: 'Chase Rahul' })] });

    const outcomes = revertSnapshotEntries(
      overTheWire([{ kind: 'task', id: 'new1', label: 'Chase Rahul', location: 'backlog', prior: null }]),
      { undoCreations: true },
    );

    expect(outcomes[0].status).toBe('restored');
    expect(useStore.getState().backlogTasks).toHaveLength(0);
    // Soft, so the undo is itself undoable — which is the whole reason D3
    // could be reversed here.
    expect(useTrashStore.getState().entries[0].backlogTasks[0].title).toBe('Chase Rahul');
  });

  it('leaves it standing on the in-browser path, which has no delete tool', () => {
    useStore.setState({ backlogTasks: [task({ id: 'new1', title: 'Chase Rahul' })] });

    const outcomes = revertSnapshotEntries(
      overTheWire([{ kind: 'task', id: 'new1', label: 'Chase Rahul', location: 'backlog', prior: null }]),
      { undoCreations: false },
    );

    expect(outcomes[0].status).toBe('created');
    expect(useStore.getState().backlogTasks).toHaveLength(1);
  });

  it('reports "missing" rather than failing when it has already gone', () => {
    const outcomes = revertSnapshotEntries(
      overTheWire([{ kind: 'task', id: 'gone', label: 'Chase Rahul', location: 'backlog', prior: null }]),
      { undoCreations: true },
    );
    expect(outcomes[0].status).toBe('missing');
  });
});

describe('a deletion', () => {
  it('comes back out of the Trash, not out of a field patch', () => {
    /*
     * The record is not there to patch. `restoreFromTrash` is the only path
     * that rebuilds the parent chain and clears the entry, and reaching past
     * it would put the task somewhere nothing renders — worse than not
     * restoring it at all.
     */
    useStore.setState({ backlogTasks: [task({ title: 'Sign the lease' })] });
    useStore.getState().deleteBacklogTask('t1');
    expect(useStore.getState().backlogTasks).toHaveLength(0);

    const outcomes = revertSnapshotEntries(
      overTheWire([
        { kind: 'task', id: 't1', label: 'Sign the lease', location: 'backlog', prior: task({ title: 'Sign the lease' }) },
      ]),
      { undoCreations: true },
    );

    expect(outcomes[0].status).toBe('restored');
    expect(useStore.getState().backlogTasks.map((t) => t.title)).toEqual(['Sign the lease']);
    expect(useTrashStore.getState().entries).toHaveLength(0);
  });

  it('reports "missing" when it is not in the Trash either — emptied, or expired', () => {
    const outcomes = revertSnapshotEntries(
      overTheWire([{ kind: 'task', id: 'nope', label: 'Long gone', location: 'backlog', prior: task({ id: 'nope' }) }]),
      { undoCreations: true },
    );
    // Skipped and said so, never thrown on: the other four entries in the same
    // turn still have to be put back.
    expect(outcomes[0].status).toBe('missing');
  });
});

describe('a whole turn', () => {
  it('puts back several changes, and one that cannot be undone does not stop the rest', () => {
    useStore.setState({
      backlogTasks: [
        task({ id: 't1', title: 'Shortlist the CA', deadline: '2026-03-20T18:00' }),
        task({ id: 't2', title: 'Chase Rahul' }),
      ],
    });

    const outcomes = revertSnapshotEntries(
      overTheWire([
        { kind: 'task', id: 't1', label: 'Shortlist the CA', location: 'backlog', prior: task({ id: 't1', title: 'Shortlist the CA' }) },
        { kind: 'task', id: 't2', label: 'Chase Rahul', location: 'backlog', prior: null },
        { kind: 'task', id: 'ghost', label: 'Something deleted from the tablet', location: 'backlog', prior: task({ id: 'ghost' }) },
      ]),
      { undoCreations: true },
    );

    expect(outcomes.map((outcome) => outcome.status)).toEqual(['restored', 'restored', 'missing']);
    expect(useStore.getState().backlogTasks.map((t) => t.id)).toEqual(['t1']);
    expect(useStore.getState().backlogTasks[0].deadline).toBeUndefined();
  });
});
