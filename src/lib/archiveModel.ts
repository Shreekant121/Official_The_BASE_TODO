/**
 * The Archive, as pure data (BUILD-11): what a put-away project or task is
 * kept as, how much of it fits, and how the shelves on `/archive` are sorted.
 *
 * **Archiving is the delete cascade with a different keeper.** Shreekant's
 * call, confirmed twice after being told it makes the two hard to tell apart:
 * an archived project or task *disappears from everything* — every board,
 * count, queue, search and Atlas. The app already had exactly one way of
 * making a thing disappear from everything, and it is `cascadeDelete.ts`: a
 * task is also a focus-queue row, a subtask proxy, somebody's `dependsOn`, a
 * `sharedListIds` cross-link. So archiving runs the same planner and takes the
 * whole thing *out of the store*, rather than setting a flag every one of the
 * app's readers — and Atlas's MCP server, which hydrates the same store in
 * Node — would each have to remember to check. A flag is one forgotten filter
 * away from an archived task turning up in Smart Start.
 *
 * Where it differs from the Trash is what keeps it:
 * - **Nothing ever purges it.** No thirty days, no sweep, no oldest-out trim.
 * - **Its share link stays up** (his call, 2026-09-24). A delete takes the
 *   `publicShares/{id}` document down because a link that outlives a deletion
 *   is a leak; an archived client project is finished work the client may
 *   still want to open. Nothing sweeps share documents, so the link simply
 *   keeps serving its last snapshot. Its **calendar blocks do go**, as a
 *   delete's do — out of sight means out of the calendar too.
 * - **Only projects and tasks.** A list is not drawn in `Archive.dc.html`, and
 *   a subtask archives with its parent only, the same scope rule the Trash has.
 *
 * It lives in its own document, `users/{uid}/data/archive`
 * (`lib/archiveSync.ts`), for the Trash's reason and more so: a store that
 * only grows cannot share the 1 MiB `data/main` it exists to shrink.
 */
import { firestoreValueSize } from './syncDocSize';
import type { Backref, DeletionPlan } from './cascadeDelete';
import type { Project, Task, TaskList } from '../store/useStore';

export type ArchiveKind = 'project' | 'task';

/**
 * Ceiling for the archive document, well under Firestore's 1 MiB. Unlike the
 * Trash, reaching it never drops anything already kept — "kept for good" means
 * the new archive is refused instead, and the thing stays where it was.
 */
export const ARCHIVE_BUDGET_BYTES = 900 * 1024;

/** One put-away thing, kept whole — a project with every list and task it held. */
export interface ArchiveEntry {
  /** The entry's own id, not the entity's: a task can be archived, put back and archived again. */
  id: string;
  kind: ArchiveKind;
  title: string;
  archivedAt: number;
  projects: Project[];
  taskLists: TaskList[];
  backlogTasks: Task[];
  /** See `DeletionPlan.ancestors` — where a task came from, for its tile and its way back. */
  ancestors: { project?: Project; list?: TaskList };
  /** See `DeletionPlan.backrefs` — references cut from records that stayed on the boards. */
  backrefs: { dependsOn: Backref[]; sharedListIds: Backref[] };
}

export function archiveEntryFromPlan(plan: DeletionPlan, id: string, now: number): ArchiveEntry | null {
  if (!plan.matched || (plan.kind !== 'project' && plan.kind !== 'task')) return null;
  return {
    id,
    kind: plan.kind,
    title: plan.title,
    archivedAt: now,
    projects: plan.removed.projects,
    taskLists: plan.removed.taskLists,
    backlogTasks: plan.removed.backlogTasks,
    ancestors: plan.ancestors,
    backrefs: plan.backrefs,
  };
}

/** Total size of the archive document's payload, by Firestore's own rules. */
export function archiveBytes(entries: ArchiveEntry[]): number {
  return firestoreValueSize(entries);
}

/** Whether one more entry still fits. `entries` is newest-first, as the store keeps it. */
export function fitsInArchive(entries: ArchiveEntry[], entry: ArchiveEntry): boolean {
  return archiveBytes([entry, ...entries]) <= ARCHIVE_BUDGET_BYTES;
}

// ─── What a tile says ────────────────────────────────────────────────────────

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "14 Jan" — the day it was put away. The year is the shelf's job. */
export function formatArchivedAt(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Where a task was, as it would be named on the board: its project, else its list. */
export function originOf(entry: ArchiveEntry): { from: string; list: string } {
  const task = entry.backlogTasks[0];
  const list = entry.ancestors.list?.title ?? task?.listName ?? '';
  return { from: entry.ancestors.project?.name ?? list, list };
}

/** A project's tasks, finished and not — the tile's dots and its one line. */
export function projectCounts(entry: ArchiveEntry): { done: number; open: number } {
  const done = entry.backlogTasks.filter((t) => t.status === 'completed').length;
  return { done, open: entry.backlogTasks.length - done };
}

/** "18 tasks · all done", "9 tasks · 4 done, 5 open", "Nothing in it". */
export function describeHeld(entry: ArchiveEntry): string {
  const { done, open } = projectCounts(entry);
  const total = done + open;
  if (total === 0) return 'Nothing in it';
  if (open === 0) return `${plural(total, 'task')} · all done`;
  if (done === 0) return `${plural(total, 'task')} · none done`;
  return `${plural(total, 'task')} · ${done} done, ${open} open`;
}

/**
 * "Sep – Nov 2025": from the project's creation to the last task finished in
 * it. Nothing here records hours worked, so where `Archive.dc.html` prints
 * "6h 40m logged" the tile prints this instead — a number the app can stand
 * behind rather than one it would have to invent.
 */
export function activeSpan(entry: ArchiveEntry): string | null {
  const starts = [
    ...entry.projects.map((p) => p.createdAt),
    ...entry.backlogTasks.map((t) => t.createdAt),
  ].filter((n): n is number => typeof n === 'number' && n > 0);
  if (starts.length === 0) return null;
  const ends = entry.backlogTasks.map((t) => t.completedAt).filter((n): n is number => typeof n === 'number' && n > 0);
  const from = new Date(Math.min(...starts));
  const to = new Date(Math.max(...starts, ...ends));
  const month = (d: Date) => MONTHS[d.getMonth()];
  if (from.getFullYear() !== to.getFullYear()) {
    return `${month(from)} ${from.getFullYear()} – ${month(to)} ${to.getFullYear()}`;
  }
  return from.getMonth() === to.getMonth()
    ? `${month(to)} ${to.getFullYear()}`
    : `${month(from)} – ${month(to)} ${to.getFullYear()}`;
}

/** A task tile's last line: "45 min · 1 / 3 subtasks". */
export function describeTask(task: Task | undefined): string {
  if (!task) return '';
  const parts: string[] = [];
  const minutes = task.allocatedTime ?? task.estimatedTime;
  if (minutes) parts.push(`${minutes} min`);
  const subs = task.subtasks ?? [];
  parts.push(subs.length === 0
    ? 'no subtasks'
    : `${subs.filter((s) => s.status === 'completed').length} / ${subs.length} subtasks`);
  return parts.join(' · ');
}

// ─── The shelves ─────────────────────────────────────────────────────────────

export type ShelfMode = 'when' | 'project';

export interface Shelf {
  key: string;
  label: string;
  /** "2 projects · 1 task". */
  sub: string;
  entries: ArchiveEntry[];
}

/** "Jul – Sep 2026" — the calendar quarter an entry was put away in. */
export function quarterOf(ms: number): { key: string; label: string } {
  const d = new Date(ms);
  const q = Math.floor(d.getMonth() / 3);
  return {
    key: `${d.getFullYear()}-q${q + 1}`,
    label: `${MONTHS[q * 3]} – ${MONTHS[q * 3 + 2]} ${d.getFullYear()}`,
  };
}

function tally(entries: ArchiveEntry[]): string {
  const p = entries.filter((e) => e.kind === 'project').length;
  const t = entries.length - p;
  return [p > 0 && plural(p, 'project'), t > 0 && plural(t, 'task')].filter(Boolean).join(' · ');
}

/**
 * What the search box matches: the name, where it came from, the day it was
 * put away and the quarter's label — so "Jan" or "2025" finds a shelf, which
 * is the empty result's own suggestion ("Try a project name or a month").
 */
function haystack(entry: ArchiveEntry): string {
  const { from, list } = originOf(entry);
  return [
    entry.title, from, list, formatArchivedAt(entry.archivedAt),
    quarterOf(entry.archivedAt).label, entry.projects[0]?.description ?? '',
  ].join(' ').toLowerCase();
}

/**
 * The screen's whole arrangement. Newest first throughout. **By when** is one
 * shelf per quarter; **by project** puts every archived project on one shelf
 * and then the loose tasks under the project (or list) each came from.
 */
export function shelvesOf(entries: ArchiveEntry[], mode: ShelfMode, query = ''): Shelf[] {
  const q = query.trim().toLowerCase();
  const visible = entries
    .filter((e) => q === '' || haystack(e).includes(q))
    .slice()
    .sort((a, b) => b.archivedAt - a.archivedAt);

  const shelves = new Map<string, Shelf>();
  const put = (key: string, label: string, entry: ArchiveEntry) => {
    const shelf = shelves.get(key) ?? { key, label, sub: '', entries: [] };
    shelf.entries.push(entry);
    shelves.set(key, shelf);
  };

  if (mode === 'when') {
    for (const e of visible) {
      const { key, label } = quarterOf(e.archivedAt);
      put(key, label, e);
    }
  } else {
    for (const e of visible) if (e.kind === 'project') put('projects', 'Archived projects', e);
    for (const e of visible) {
      if (e.kind !== 'task') continue;
      const { from } = originOf(e);
      put(`from:${from}`, from || 'No list', e);
    }
  }

  return [...shelves.values()].map((s) => ({ ...s, sub: tally(s.entries) }));
}

/** "2 projects · 5 tasks" for the Settings door and the screen's tally. */
export function describeArchive(entries: ArchiveEntry[]): string {
  const p = entries.filter((e) => e.kind === 'project').length;
  return `${plural(p, 'project')} · ${plural(entries.length - p, 'task')}`;
}
