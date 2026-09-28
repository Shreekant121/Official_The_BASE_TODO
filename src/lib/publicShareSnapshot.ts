import {
  type FocusLogEntry,
  type Project,
  type Subtask,
  type Task,
  type TaskList,
} from '../store/useStore';

/**
 * What a public share link contains, and how it is built from the store.
 *
 * **Split out of `publicShare.ts` at item 13, and the split is not tidying.**
 * That file opens with `import { doc, setDoc, deleteDoc } from 'firebase/firestore'`
 * and `import { db, auth } from './firebase'`, and `firebase.ts` calls
 * `initializeApp` at module scope against `import.meta.env`. So importing any
 * part of it from Node — which is where `mcp/` runs — initialises a browser
 * Firebase client with undefined config, in a process that already holds an
 * Admin credential.
 *
 * Item 13 lets Atlas publish a share link (behind §5.2's front door), and the
 * link has to be a *working* one: writing `shareId` onto the task and hoping
 * the app is opened later would hand Shreekant a URL that 404s until he next
 * opens the tablet. So the MCP server writes the `publicShares/{id}` document
 * itself with the Admin SDK — and to do that it needs exactly the pure half of
 * `publicShare.ts`, which is this file.
 *
 * Nothing here touches Firebase, `window`, or any store. Everything is a
 * function of the entities passed in, which is what makes it usable from both
 * sides. `publicShare.ts` imports it and is otherwise unchanged.
 */

// ─── Public snapshot shapes (what an anonymous viewer receives) ──────────────

export interface PublicSubtask {
  id: string;
  title: string;
  done: boolean;
  deadline?: string;
  subtasks?: PublicSubtask[];
}

export interface PublicTask {
  id: string;
  title: string;
  description?: string;
  status: string;
  done: boolean;
  deadline?: string;
  estimatedTime?: number;
  valueINR?: number;
  tags?: string[];
  subtasks?: PublicSubtask[];
  subtaskDone: number;
  subtaskTotal: number;
  /** Epoch ms it was finished — the page's "Delivered 1 Sep". */
  completedAt?: number;
  /*
   * The client view's three facts (BUILD-14). Written only when the share has
   * it on (`showPeople`), so a view-only or outsourcing link never carries who
   * did what or for how long.
   */
  /** Assigned to the owner — the page puts the owner's name on it. */
  assignedToOwner?: boolean;
  /** Assigned to somebody by name (Atlas writes a name; the app an account id, which is never published). */
  assigneeName?: string;
  /** Seconds the focus log holds against this task. */
  spentSeconds?: number;
}

export interface PublicList {
  id: string;
  title: string;
  valueINR: number;
  taskCount: number;
  doneCount: number;
  tasks: PublicTask[];
}

export interface PublicProject {
  name: string;
  description?: string;
  color: string;
  icon?: string;
  /** The project's cover. Client view only — it is a whole image in the document. */
  coverUrl?: string;
  totalValueINR: number;
  lists: PublicList[];
}

export type ShareType = 'task' | 'list' | 'project';

/**
 * A focus run in progress on one of the shared tasks (client view only).
 *
 * Times, not a counter, for the reason `useFocusRun` gives: the page derives
 * the clock from `Date.now()`, so nothing has to be re-published every second.
 * `until` is what stops a tab that was closed mid-run from showing a timer for
 * ever: past it the page treats the run as over. It is the run's own clock
 * reaching zero plus a grace for overrunning, and a +5m re-publishes it.
 */
export interface PublicLiveRun {
  taskId: string;
  /** When he pressed play — the running timer counts from here. */
  since: number;
  /** The open stretch of work; "time so far" is `spentSeconds` plus this. */
  segmentStartedAt: number;
  until: number;
}

export interface PublicShareDoc {
  shareId: string;
  type: ShareType;
  ownerId: string;
  ownerName?: string;
  title: string;
  subtitle?: string;
  updatedAt: number;
  /**
   * Outsourcing switch: when true, anonymous viewers may claim tasks and submit
   * them for the owner's approval (see `lib/shareSubmissions.ts` + the matching
   * `publicShares/{id}/submissions` rule in `firestore.rules`). When false the
   * share is strictly read-only.
   */
  allowContributions?: boolean;
  /** Client view is on (BUILD-14). Never true beside `allowContributions`. */
  showPeople?: boolean;
  /** Epoch ms the link closes, when it has an end date. */
  expiresAt?: number;
  /**
   * Past `expiresAt`: the document is a stub with no title and no content,
   * so a closed link stops publishing the project, not only stops drawing it.
   */
  expired?: boolean;
  live?: PublicLiveRun;
  task?: PublicTask;
  list?: PublicList;
  project?: PublicProject;
}

// ─── Share id generation ─────────────────────────────────────────────────────

// Deliberately unguessable (random, not derived from the entity id) so that
// possessing one share link never lets a viewer enumerate a user's other
// entities. Ambiguity-free alphabet (no 0/O/1/l/I) for clean copy/paste.
const SHARE_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

export function makeShareId(length = 12): string {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) out += SHARE_ID_ALPHABET[bytes[i] % SHARE_ID_ALPHABET.length];
  return out;
}

/** The path a share link lives at, on whatever origin the app is served from. */
export function sharePath(shareId: string): string {
  return `/s/${shareId}`;
}

// ─── Snapshot builders ───────────────────────────────────────────────────────

function countSubtasks(subs: Subtask[]): { done: number; total: number } {
  return subs.reduce(
    (acc, s) => {
      const child = countSubtasks(s.subtasks ?? []);
      return {
        total: acc.total + 1 + child.total,
        done: acc.done + (s.status === 'completed' ? 1 : 0) + child.done,
      };
    },
    { done: 0, total: 0 },
  );
}

/**
 * **No score reaches a public snapshot (item 16).** It is your private
 * judgement of your own work, and a client learning which of their requests
 * you rank last is information you gain nothing from publishing. The field is
 * off both interfaces above, so a new snapshot cannot carry one even by
 * accident; a snapshot published before this session still has the key in
 * Firestore and `SharePage` simply no longer looks at it.
 */
function snapshotSubtask(s: Subtask): PublicSubtask {
  return {
    id: s.id,
    title: s.title,
    done: s.status === 'completed',
    deadline: s.deadline,
    subtasks: s.subtasks && s.subtasks.length > 0 ? s.subtasks.map(snapshotSubtask) : undefined,
  };
}

/**
 * What the client view adds to a task, or `null` when the share does not have
 * it on. Built once per document by `buildShareDoc`.
 */
interface PeopleLayer {
  ownerId: string;
  /** Focus-log seconds per task id. */
  spent: Map<string, number>;
}

/**
 * An account id is 28 letters and digits; a name is not. The app's assignee
 * picker stores an account id (`task-fields/AssigneeField.tsx`), and until
 * Contacts (item 21) there is no name behind any id but the owner's — so an id
 * is never published, and the page draws that task with nobody on it.
 */
const ACCOUNT_ID = /^[A-Za-z0-9]{20,}$/;

function peopleFacts(task: Task, people: PeopleLayer): Partial<PublicTask> {
  const facts: Partial<PublicTask> = {};
  const who = task.assignee?.trim();
  if (who === people.ownerId) facts.assignedToOwner = true;
  else if (who && !ACCOUNT_ID.test(who)) facts.assigneeName = who.slice(0, 60);
  const spent = people.spent.get(task.id);
  if (spent) facts.spentSeconds = Math.round(spent);
  return facts;
}

export function snapshotTask(task: Task, people?: PeopleLayer | null): PublicTask {
  const counts = countSubtasks(task.subtasks ?? []);
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    done: task.status === 'completed',
    deadline: task.deadline,
    estimatedTime: task.estimatedTime,
    valueINR: task.valueINR,
    tags: task.tags && task.tags.length > 0 ? task.tags : undefined,
    subtasks: task.subtasks && task.subtasks.length > 0 ? task.subtasks.map(snapshotSubtask) : undefined,
    subtaskDone: counts.done,
    subtaskTotal: counts.total,
    completedAt: task.status === 'completed' ? task.completedAt : undefined,
    ...(people ? peopleFacts(task, people) : {}),
  };
}

/**
 * Top-level, *non-hidden* tasks that live in this list (primary or shared into
 * it), ordered. Tasks flagged `hiddenFromShare` are "blinded" — never included
 * in a public snapshot, so a client never sees them.
 */
function listTasks(listId: string, allTasks: Task[]): Task[] {
  return allTasks
    .filter((t) => (t.listId === listId || t.sharedListIds?.includes(listId)) && !t.parent && !t.hiddenFromShare)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function snapshotList(list: TaskList, allTasks: Task[], people?: PeopleLayer | null): PublicList {
  const tasks = listTasks(list.id, allTasks);
  return {
    id: list.id,
    title: list.title,
    // Value totals reflect only the visible (non-blinded) tasks, so hiding a
    // task also removes its ₹ from the public rollup.
    valueINR: tasks.reduce((sum, t) => sum + (t.valueINR ?? 0), 0),
    taskCount: tasks.length,
    doneCount: tasks.filter((t) => t.status === 'completed').length,
    tasks: tasks.map((t) => snapshotTask(t, people)),
  };
}

export function snapshotProject(
  project: Project,
  allLists: TaskList[],
  allTasks: Task[],
  people?: PeopleLayer | null,
): PublicProject {
  const lists = allLists
    .filter((l) => l.projectId === project.id && !l.hiddenFromShare)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((l) => snapshotList(l, allTasks, people));
  return {
    name: project.name,
    description: project.description,
    color: project.color,
    icon: project.icon,
    coverUrl: people ? project.imageUrl : undefined,
    totalValueINR: lists.reduce((sum, l) => sum + l.valueINR, 0),
    lists,
  };
}

/**
 * The instant a link with this end date closes: the local midnight after it,
 * so "until 30 Oct" works all of the 30th. `undefined` for no end date or one
 * that does not parse — a typo must not close a link.
 */
export function shareExpiryInstant(expiresOn: string | undefined): number | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expiresOn ?? '');
  if (!m) return undefined;
  const at = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1).getTime();
  return Number.isNaN(at) ? undefined : at;
}

/**
 * The three share settings a task, a list and a project each carry, under the
 * same names. The Share dialog edits them as one patch.
 */
export type ShareSettings = Pick<Project, 'shareAllowContributions' | 'shareShowPeople' | 'shareExpiresOn'>;

/** What the browser knows and a snapshot of the store does not. */
export interface ShareDocExtras {
  /** The synced focus log — the client view's "time taken". */
  focusLog?: FocusLogEntry[];
  /** The focus run going on right now, if any. Only the browser has one. */
  live?: PublicLiveRun | null;
  /** Injected by tests; the clock otherwise. */
  now?: number;
}

function taskIdsOf(doc: Pick<PublicShareDoc, 'task' | 'list' | 'project'>): Set<string> {
  const ids = new Set<string>();
  if (doc.task) ids.add(doc.task.id);
  for (const t of doc.list?.tasks ?? []) ids.add(t.id);
  for (const l of doc.project?.lists ?? []) for (const t of l.tasks) ids.add(t.id);
  return ids;
}

/**
 * The whole document for one share, built from the store and nothing else.
 *
 * The three `share*` writers in `publicShare.ts` and the MCP server both go
 * through this, so a browser-published link and an Atlas-published one are
 * byte-identical documents. `ownerName` is passed in rather than read from
 * `auth`, because on the laptop there is no signed-in browser user — only a
 * uid — and inventing a display name there would put a wrong one on the page.
 */
export function buildShareDoc(
  shareId: string,
  ownerId: string,
  ownerName: string | undefined,
  entity:
    | { type: 'task'; task: Task }
    | { type: 'list'; list: TaskList; allTasks: Task[] }
    | { type: 'project'; project: Project; allLists: TaskList[]; allTasks: Task[] },
  extras: ShareDocExtras = {},
): PublicShareDoc {
  const now = extras.now ?? Date.now();
  const settings = entity.type === 'task' ? entity.task : entity.type === 'list' ? entity.list : entity.project;
  const allowContributions = settings.shareAllowContributions ?? false;
  const expiresAt = shareExpiryInstant(settings.shareExpiresOn);
  const base = {
    shareId, ownerId, ownerName, updatedAt: now,
    ...(expiresAt !== undefined ? { expiresAt } : {}),
  };

  /*
   * A closed link keeps no title and no content. The page would draw the
   * closed state from the date alone, but the document is publicly readable,
   * and a link its owner closed should stop *publishing*, not only stop
   * drawing. `allowContributions: false` also shuts the submissions rule.
   * The next write after its end date is what strips it — the app rewrites
   * every share after any edit, so in practice the same day.
   */
  if (expiresAt !== undefined && now >= expiresAt) {
    return { ...base, type: entity.type, title: '', expired: true, allowContributions: false };
  }

  // Client view: never on an outsourcing link, whatever the flag says.
  const showPeople = !allowContributions && (settings.shareShowPeople ?? false);
  let people: PeopleLayer | null = null;
  if (showPeople) {
    const spent = new Map<string, number>();
    for (const e of extras.focusLog ?? []) spent.set(e.taskId, (spent.get(e.taskId) ?? 0) + e.seconds);
    people = { ownerId, spent };
  }

  const body: Pick<PublicShareDoc, 'type' | 'title' | 'subtitle' | 'task' | 'list' | 'project'> =
    entity.type === 'task'
      ? {
          type: 'task',
          title: entity.task.title,
          subtitle: entity.task.listName,
          task: snapshotTask(entity.task, people),
        }
      : entity.type === 'list'
        ? {
            type: 'list',
            title: entity.list.title,
            subtitle: 'Task list',
            list: snapshotList(entity.list, entity.allTasks, people),
          }
        : {
            type: 'project',
            title: entity.project.name,
            subtitle: entity.project.description,
            project: snapshotProject(entity.project, entity.allLists, entity.allTasks, people),
          };

  const live = extras.live;
  const liveHere = showPeople && live && now < live.until && taskIdsOf(body).has(live.taskId);

  return {
    ...base,
    ...body,
    allowContributions,
    ...(showPeople ? { showPeople: true } : {}),
    ...(liveHere ? { live } : {}),
  };
}
