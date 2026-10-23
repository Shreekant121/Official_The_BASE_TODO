/**
 * What one press changed, and what to call it — the pure half of his undo
 * (29-1P4a, idea 6 of round 1 and 130 of round 8). `store/useUndoStore.ts` is
 * the other half: it takes the store's slices before and after a press, and
 * this module says which entities moved, whether that is something he would
 * want back, and the sentence the toast and the bubble print.
 *
 * WHY A DIFF AND NOT A LIST OF WHAT EACH BUTTON DOES
 * --------------------------------------------------
 * A tick reaches the store from a dozen rows, and one press can move more
 * than the thing pressed: ticking a repeating task spawns its successor, a new
 * date pushes every task waiting on it (item 18), a delete takes a project's
 * whole tree. Reading the slices on either side of the press catches all of
 * it, so an undo puts back everything the press did and nothing it did not.
 * Zustand's state is replaced, never mutated, so "did this task change?" is an
 * identity check first and a JSON comparison only for the few that fail it.
 *
 * The entries are `useSnapshotStore`'s own `SnapshotEntry` shape, so putting
 * them back is the same `revertSnapshotEntries` Atlas's Revert uses — through
 * `updateBacklogTask`, the Trash's restore, and the rest of the store's paths.
 */
import type { Project, Subtask, Task, TaskList } from '../store/useStore';
import type { SnapshotEntry } from '../store/useSnapshotStore';

/** The slices a press can change that undo knows how to put back. */
export interface UndoSlices {
  backlogTasks: Task[];
  tasks: Task[];
  taskLists: TaskList[];
  projects: Project[];
}

/**
 * His four kinds (BIG-15's planning calls): ticking, deleting, moving, and
 * date and priority changes. Archive rides with delete — it is the delete
 * cascade with another keeper, and its toast is the one `ArchiveToast` draws.
 */
export type UndoKind = 'tick' | 'untick' | 'delete' | 'archive' | 'move' | 'date' | 'priority' | 'mixed';

/** A field whose change, on its own, makes an edit worth undoing. */
const DATE_FIELDS = ['deadline', 'startDate'] as const;
const PRIORITY_FIELDS = ['priority', 'humanOverride', 'emergencyBoost'] as const;
const MOVE_FIELDS = ['listId', 'order', 'parentId'] as const;

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function byId<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

interface Changed<T> {
  before: T | null;
  after: T | null;
}

/** Every entity whose record differs, was removed, or was added. */
function changedIn<T extends { id: string }>(before: T[], after: T[]): Changed<T>[] {
  if (before === after) return [];
  const was = byId(before);
  const now = byId(after);
  const out: Changed<T>[] = [];
  for (const [id, b] of was) {
    const a = now.get(id) ?? null;
    if (a === b) continue;
    if (a && same(a, b)) continue;
    out.push({ before: b, after: a });
  }
  for (const [id, a] of now) if (!was.has(id)) out.push({ before: null, after: a });
  return out;
}

/** Subtasks whose done-ness flipped, anywhere down the tree. */
function flippedSubtasks(before: Subtask[] = [], after: Subtask[] = []): { sub: Subtask; done: boolean }[] {
  const out: { sub: Subtask; done: boolean }[] = [];
  const was = byId(before);
  for (const s of after) {
    const b = was.get(s.id);
    if (!b) continue;
    const doneNow = s.status === 'completed';
    if ((b.status === 'completed') !== doneNow) out.push({ sub: s, done: doneNow });
    out.push(...flippedSubtasks(b.subtasks, s.subtasks));
  }
  return out;
}

function touched(b: object, a: object, fields: readonly string[]): boolean {
  const br = b as Record<string, unknown>;
  const ar = a as Record<string, unknown>;
  return fields.some((f) => !same(br[f], ar[f]));
}

export interface UndoChange {
  kind: UndoKind;
  /** What the toast says: "Ticked “Oil Hair”". */
  label: string;
  /** Captured BEFORE the press, in the order a revert must apply them. */
  entries: SnapshotEntry[];
}

/** How the press reached the store, which decides whether a plain edit counts. */
export type PressClass = 'edit' | 'remove' | 'archive' | 'move';

const quote = (s: string | undefined) => `“${(s || 'Untitled').trim()}”`;
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/**
 * The undo for one press, or `null` when nothing he would want back moved —
 * a title typed, a timer's seconds, a cover swapped.
 *
 * `classes` is which store actions the press called. A delete, an archive or
 * a move always counts; a plain edit only when it touched a tick, a date, a
 * priority or a place.
 */
export function describePress(before: UndoSlices, after: UndoSlices, classes: ReadonlySet<PressClass>): UndoChange | null {
  const tasks = changedIn(before.backlogTasks, after.backlogTasks);
  const lists = changedIn(before.taskLists, after.taskLists);
  const projects = changedIn(before.projects, after.projects);

  /* A focus-queue row is a copy of a backlog task, and the backlog entry
     already carries it back (`updateBacklogTask` mirrors into the queue). Only
     a row that is nothing but a queue row — a subtask's proxy — needs its own. */
  const backlogIds = new Set([...before.backlogTasks, ...after.backlogTasks].map((t) => t.id));
  const queue = changedIn(before.tasks, after.tasks).filter((c) => c.before && c.after && !backlogIds.has(c.before.id));
  /* …but a task the same press took OUT of today's queue (29-1P6b: a swiped
     Today row on New Session; a delete) is put back in it, where it was. Never
     a reason to record a press on its own — taking a task out of today with
     its dot was never an undo. */
  const leftToday = changedIn(before.tasks, after.tasks).filter((c) => c.before && !c.after && backlogIds.has(c.before.id));

  if (tasks.length + lists.length + projects.length + queue.length === 0) return null;

  /* What kind of press it was, read off the records. */
  const ticked: string[] = [];
  const unticked: string[] = [];
  /* By id, once: a subtask that is also in today's queue flips twice in one
     press — inside its parent in the backlog, and as its proxy row, which
     carries the subtask's own id — and was announced as "Ticked 2 tasks"
     (found by 29-1P7b, where ticking a step from the card made it common). */
  const flipped = new Set<string>();
  const flip = (id: string, done: boolean, title: string) => {
    if (flipped.has(id)) return;
    flipped.add(id);
    (done ? ticked : unticked).push(title);
  };
  const dated: string[] = [];
  const ranked: string[] = [];
  /* A task carried to another list; one renumbered where it was (a drag
     renumbers every neighbour, so those name the list, not a task). */
  const carried: { title: string; listId?: string }[] = [];
  const reordered = new Set<string>();
  const nested: { name: string; parentId?: string }[] = [];
  let reorderedProjects = false;
  let reorderedLists = false;
  for (const { before: b, after: a } of [...tasks, ...queue]) {
    if (!b || !a) continue;
    if ((b.status === 'completed') !== (a.status === 'completed')) flip(a.id, a.status === 'completed', a.title);
    for (const f of flippedSubtasks(b.subtasks, a.subtasks)) flip(f.sub.id, f.done, f.sub.title);
    if (touched(b, a, DATE_FIELDS)) dated.push(a.title);
    if (touched(b, a, PRIORITY_FIELDS)) ranked.push(a.title);
    if (b.listId !== a.listId) carried.push({ title: a.title, listId: a.listId });
    else if (classes.has('move') && touched(b, a, MOVE_FIELDS) && a.listId) reordered.add(a.listId);
  }
  if (classes.has('move')) {
    for (const { before: b, after: a } of projects) {
      if (!b || !a) continue;
      if (b.parentId !== a.parentId) nested.push({ name: a.name, parentId: a.parentId });
      else if (touched(b, a, MOVE_FIELDS)) reorderedProjects = true;
    }
    for (const { before: b, after: a } of lists) if (b && a && touched(b, a, MOVE_FIELDS)) reorderedLists = true;
  }

  const removed = {
    tasks: tasks.filter((c) => c.before && !c.after).map((c) => c.before!),
    lists: lists.filter((c) => c.before && !c.after).map((c) => c.before!),
    projects: projects.filter((c) => c.before && !c.after).map((c) => c.before!),
  };
  const anyRemoved = removed.tasks.length + removed.lists.length + removed.projects.length > 0;

  let kind: UndoKind;
  let label: string;
  if (anyRemoved && (classes.has('remove') || classes.has('archive'))) {
    kind = classes.has('archive') ? 'archive' : 'delete';
    const verb = kind === 'archive' ? 'Archived' : 'Deleted';
    /* The top of what went: a project names itself, not its forty tasks. */
    if (removed.projects.length === 1) label = `${verb} the project ${quote(removed.projects[0].name)}`;
    else if (removed.projects.length > 1) label = `${verb} ${plural(removed.projects.length, 'project')}`;
    else if (removed.lists.length === 1) label = `${verb} the list ${quote(removed.lists[0].title)}`;
    else if (removed.lists.length > 1) label = `${verb} ${plural(removed.lists.length, 'list')}`;
    else if (removed.tasks.length === 1) label = `${verb} ${quote(removed.tasks[0].title)}`;
    else label = `${verb} ${plural(removed.tasks.length, 'task')}`;
  } else {
    const kinds: { kind: UndoKind; label: string }[] = [];
    if (ticked.length) kinds.push({ kind: 'tick', label: ticked.length === 1 ? `Ticked ${quote(ticked[0])}` : `Ticked ${plural(ticked.length, 'task')}` });
    if (unticked.length) kinds.push({ kind: 'untick', label: unticked.length === 1 ? `Unticked ${quote(unticked[0])}` : `Unticked ${plural(unticked.length, 'task')}` });
    const moveLabel = (() => {
      if (carried.length === 1) {
        const list = after.taskLists.find((l) => l.id === carried[0].listId)?.title;
        return `Moved ${quote(carried[0].title)}${list ? ` to ${list}` : ''}`;
      }
      if (carried.length > 1) return `Moved ${plural(carried.length, 'task')}`;
      if (nested.length === 1) {
        const parent = nested[0].parentId ? after.projects.find((p) => p.id === nested[0].parentId)?.name : undefined;
        return `Moved ${quote(nested[0].name)}${parent ? ` into ${quote(parent)}` : ' to the top'}`;
      }
      if (nested.length > 1) return `Moved ${plural(nested.length, 'project')}`;
      if (reordered.size === 1) {
        const list = after.taskLists.find((l) => l.id === [...reordered][0])?.title;
        return list ? `Reordered ${quote(list)}` : 'Reordered a list';
      }
      if (reordered.size > 1) return 'Reordered tasks';
      if (reorderedLists) return 'Reordered the lists';
      if (reorderedProjects) return 'Reordered your projects';
      return null;
    })();
    if (moveLabel) kinds.push({ kind: 'move', label: moveLabel });
    /* A tick's own date bookkeeping (completedAt, a pushed successor) is the
       tick, not a separate date change — only a date nobody ticked counts. */
    if (dated.length && !ticked.length && !unticked.length) kinds.push({ kind: 'date', label: `Changed the date of ${dated.length === 1 ? quote(dated[0]) : plural(dated.length, 'task')}` });
    if (ranked.length) kinds.push({ kind: 'priority', label: `Changed the importance of ${ranked.length === 1 ? quote(ranked[0]) : plural(ranked.length, 'task')}` });

    if (kinds.length === 0) return null;
    if (kinds.length === 1) ({ kind, label } = kinds[0]);
    else {
      /* A tick or a date beside a move leads; the move came with it. */
      const lead = kinds.find((k) => k.kind !== 'move') ?? kinds[0];
      kind = kinds.every((k) => k.kind === lead.kind || k.kind === 'move') ? lead.kind : 'mixed';
      label = kind === 'mixed' ? `${plural(kinds.length, 'change')}` : lead.label;
    }
  }

  /*
   * The order a revert applies them in is load-bearing. What existed before
   * goes back first; what the press CREATED goes last. Ticking a repeating
   * task spawns its successor, and un-ticking through `updateBacklogTask`
   * already takes an untouched successor back — so by the time its own entry
   * is reached it is gone, and nothing is sent to the Trash for it. Projects
   * before lists before tasks, so a restored tree has its parents first.
   */
  const entries: SnapshotEntry[] = [];
  const created: SnapshotEntry[] = [];
  const push = (e: SnapshotEntry) => (e.prior ? entries : created).push(e);
  for (const c of projects) push({ kind: 'project', id: (c.before ?? c.after)!.id, label: (c.before ?? c.after)!.name, prior: c.before ? structuredClone(c.before) : null });
  for (const c of lists) push({ kind: 'list', id: (c.before ?? c.after)!.id, label: (c.before ?? c.after)!.title, prior: c.before ? structuredClone(c.before) : null });
  for (const c of tasks) push({ kind: 'task', id: (c.before ?? c.after)!.id, label: (c.before ?? c.after)!.title, location: 'backlog', prior: c.before ? structuredClone(c.before) : null });
  for (const c of queue) push({ kind: 'task', id: c.before!.id, label: c.before!.title, location: 'focusQueue', prior: structuredClone(c.before!) });
  for (const c of leftToday) {
    push({
      kind: 'task', id: c.before!.id, label: c.before!.title, location: 'focusQueue',
      prior: structuredClone(c.before!), queueIndex: before.tasks.findIndex((t) => t.id === c.before!.id),
    });
  }

  return { kind, label, entries: [...entries, ...created] };
}
