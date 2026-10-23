import { create } from 'zustand';
import { useTrashStore } from './useTrashStore';
import { restoreFromTrash } from '../lib/trash';
import { useEventStore } from './useEventStore';
import type { BaseEvent } from '../lib/events/events';
import {
  SUBTASK_PROXY_FIELDS,
  findSubtaskWithRoot,
  useStore,
  type Project,
  type Subtask,
  type Task,
  type TaskList,
} from './useStore';

/**
 * Undo for anything that mutates the task graph — used by the AI agent (every
 * turn is one snapshot with a one-click revert) but deliberately written as a
 * plain store-level facility, since the app has no undo of any kind today.
 *
 * ── C1: this store is IN-MEMORY ONLY. ───────────────────────────────────────
 * It must never use Zustand `persist`, and its state must never be added to
 * the slices written by `lib/firestoreSync.ts`. That module serialises the
 * *entire* app state into one Firestore document (`users/{uid}/data/main`) on
 * every change, and Firestore caps a document at 1 MB. A ring of 20 turns,
 * each holding complete prior copies of every entity touched, is exactly the
 * kind of unbounded-ish payload that would eat that budget and start failing
 * writes for real task data. Snapshots are worth nothing after a reload
 * anyway — they exist to undo something you just watched happen.
 *
 * Reverting deliberately goes through the normal store actions
 * (`updateBacklogTask` / `updateTask` / `updateTaskList` / `updateProject`)
 * rather than `useStore.setState`, so the debounced Firestore push, the Google
 * Calendar reconcile and the public-share reconcile all fire exactly as they
 * would for a hand edit.
 */

/**
 * `event` is 29-2a's: an event lives in its own store and document, and goes
 * to no Trash, so its undo is the whole record put back (`putEvent`) — or, for
 * one the change made, taken away.
 */
export type SnapshotKind = 'task' | 'list' | 'project' | 'event';

/**
 * Where a captured task lived, so the revert writes it back the same way it
 * was read. A single id can name a top-level backlog task, a subtask nested
 * anywhere in the backlog, or a focus-queue-only row (`tasks`).
 */
export type TaskLocation = 'backlog' | 'subtask' | 'focusQueue';

export interface SnapshotEntry {
  kind: SnapshotKind;
  id: string;
  /** Name at capture time, so a revert report still reads sensibly after a rename. */
  label: string;
  location?: TaskLocation;
  /** Deep clone of the entity before the turn touched it. `null` = it did not exist yet. */
  prior: Task | Subtask | TaskList | Project | BaseEvent | null;
  /**
   * A `focusQueue` row's place in today's queue before the change. Set when
   * a press took the row OUT of the queue (29-1P6b: a swiped Today row, a
   * delete), so putting it back puts it where it was.
   */
  queueIndex?: number;
}

export interface SnapshotTurn {
  id: string;
  label: string;
  createdAt: number;
  entries: SnapshotEntry[];
  /** Epoch ms of the most recent revert of this turn, if any. */
  revertedAt?: number;
}

/** Passed back into every `capture*` call and finally to `commitTurn`. */
export interface TurnHandle {
  id: string;
  label: string;
  startedAt: number;
}

export type RevertStatus =
  /** Written back in full. */
  | 'restored'
  /** Written back, but some fields could not be (see `unrestoredFields`). */
  | 'partial'
  /** Nothing changed between capture and revert — no write was issued. */
  | 'unchanged'
  /** Gone since the snapshot was taken. Skipped, never thrown on. */
  | 'missing'
  /** Created during the turn, so there is no prior value to restore. */
  | 'created';

export interface RevertOutcome {
  kind: SnapshotKind;
  id: string;
  label: string;
  status: RevertStatus;
  unrestoredFields?: string[];
}

export interface RevertResult {
  /** False only when `turnId` names no turn in the ring. */
  ok: boolean;
  turnId: string;
  label: string;
  outcomes: RevertOutcome[];
  restoredCount: number;
  skippedCount: number;
  /** One sentence fit for a toast. */
  summary: string;
}

/** D6 — the last 20 turns. Older ones are evicted on commit. */
const RING_CAPACITY = 20;

/**
 * A turn that was begun but never committed (a tool threw, a Live session
 * dropped mid-turn) would otherwise pin its captured entities forever. Drafts
 * older than this are dropped the next time a turn starts.
 */
const DRAFT_TTL_MS = 10 * 60_000;

/**
 * Open, uncommitted turns. Kept out of Zustand state on purpose: a turn
 * captures once per entity it touches, and putting drafts in state would
 * notify every subscriber on each of those captures for data no UI can
 * usefully render yet. Only committed turns are observable.
 */
const drafts = new Map<string, SnapshotTurn>();

function clone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Deep equality good enough for the task graph, which is plain JSON data
 * (strings, numbers, booleans, arrays and object literals) end to end.
 */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The minimal patch turning `current` back into `prior`. Keys the turn *added*
 * map to an explicit `undefined` — a bare `{ ...current, ...prior }` spread
 * would leave a newly-set field in place, which is the difference between an
 * undo and a half-undo. Firestore is initialised with
 * `ignoreUndefinedProperties` (see `lib/firebase.ts`), so those keys are
 * dropped on write instead of throwing.
 */
function restorePatch(
  prior: Record<string, unknown>,
  current: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(prior), ...Object.keys(current)])) {
    if (!valuesEqual(prior[key], current[key])) patch[key] = prior[key];
  }
  return patch;
}

/**
 * Reads a captured entity back out of the live store, from the same place it
 * was captured from. `null` means it has been deleted since — the caller
 * reports that and moves on rather than throwing.
 */
function readCurrent(entry: SnapshotEntry): Record<string, unknown> | null {
  const state = useStore.getState();
  let found: Task | Subtask | TaskList | Project | BaseEvent | undefined;
  if (entry.kind === 'event') {
    found = useEventStore.getState().events.find((e) => e.id === entry.id);
  } else if (entry.kind === 'list') {
    found = state.taskLists.find((l) => l.id === entry.id);
  } else if (entry.kind === 'project') {
    found = state.projects.find((p) => p.id === entry.id);
  } else if (entry.location === 'backlog') {
    found = state.backlogTasks.find((t) => t.id === entry.id);
  } else if (entry.location === 'subtask') {
    found = findSubtaskWithRoot(state.backlogTasks, entry.id)?.subtask;
  } else if (entry.location === 'focusQueue') {
    found = state.tasks.find((t) => t.id === entry.id);
  }
  return found ? (found as unknown as Record<string, unknown>) : null;
}

function locateTask(id: string): { location: TaskLocation; entity: Task | Subtask } | null {
  const state = useStore.getState();
  const backlog = state.backlogTasks.find((t) => t.id === id);
  if (backlog) return { location: 'backlog', entity: backlog };
  const nested = findSubtaskWithRoot(state.backlogTasks, id);
  if (nested) return { location: 'subtask', entity: nested.subtask };
  // Last: a row that only exists in the "Selected for Today" focus queue.
  const queued = state.tasks.find((t) => t.id === id);
  if (queued) return { location: 'focusQueue', entity: queued };
  return null;
}

/** Whether a captured entity is in the store right now, wherever it lives. */
function existsNow(entry: SnapshotEntry): boolean {
  const state = useStore.getState();
  if (entry.kind === 'event') return useEventStore.getState().events.some((e) => e.id === entry.id);
  if (entry.kind === 'project') return state.projects.some((p) => p.id === entry.id);
  if (entry.kind === 'list') return state.taskLists.some((l) => l.id === entry.id);
  return locateTask(entry.id) !== null;
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function describeOutcomes(label: string, outcomes: RevertOutcome[]): string {
  const restored = outcomes.filter((o) => o.status === 'restored' || o.status === 'partial').length;
  const unchanged = outcomes.filter((o) => o.status === 'unchanged').length;
  const missing = outcomes.filter((o) => o.status === 'missing').length;
  const created = outcomes.filter((o) => o.status === 'created').length;
  const partial = outcomes.filter((o) => o.status === 'partial');

  const parts: string[] = [];
  if (restored > 0) parts.push(`restored ${pluralize(restored, 'item')}`);
  if (unchanged > 0) parts.push(`${unchanged} already matched`);
  if (missing > 0) parts.push(`skipped ${pluralize(missing, 'item')} that no longer exists`);
  if (created > 0) parts.push(`left ${pluralize(created, 'newly created item')} in place`);
  if (partial.length > 0) {
    const fields = [...new Set(partial.flatMap((o) => o.unrestoredFields ?? []))].join(', ');
    parts.push(`could not restore ${fields} on ${pluralize(partial.length, 'subtask')}`);
  }

  if (parts.length === 0) return `Nothing to revert for "${label}".`;
  return `Reverted "${label}": ${parts.join('; ')}.`;
}

/**
 * Puts a set of captured entities back, whoever captured them.
 *
 * SPLIT OUT OF `revertTurn` AT ITEM 13, AND NOT ONLY TO SHARE CODE
 * -----------------------------------------------------------------
 * Atlas's action log (DESIGN.md §5.3) needs exactly this and cannot use the
 * ring: the ring is in-memory, lives in a browser, and an Atlas turn never
 * touches it. What Atlas keeps instead is the *entries themselves*, serialised
 * into its log on the laptop, and handed back over MCP when Shreekant taps
 * Revert. So the undo logic has to be callable with entries that arrived as
 * JSON from another process — which is what this is.
 *
 * The entries are plain data by construction (`prior` is a `structuredClone`
 * of a task, list or project, all of which are JSON end to end), so a
 * round trip through a pipe loses nothing.
 *
 * `undoCreations` IS THE ONE BEHAVIOURAL DIFFERENCE, AND IT IS D3 EXPIRING
 * -------------------------------------------------------------------------
 * An entry with `prior: null` is something that did not exist before the turn.
 * The ring has always reported that as `created` and left it in place, because
 * undoing a creation means *deleting* and deletion was manual-only under D3.
 *
 * D3 is reversed for Atlas: it can delete, deletion is soft, and the task goes
 * to a 30-day Trash. So a revert from the action log that left the created
 * task standing would not be a revert — Shreekant would tap "put this back"
 * and watch the thing Atlas made stay exactly where it was. On that path a
 * creation is undone by deleting, which is itself undoable, twice over.
 *
 * The in-browser ring keeps the old behaviour, and that is not inertia: the
 * fallback agent's tool list has no delete in it at all, so a creation it made
 * is one a user can only remove by hand anyway.
 */
export function revertSnapshotEntries(
  entries: SnapshotEntry[],
  options: { undoCreations?: boolean } = {},
): RevertOutcome[] {
  const store = useStore.getState();
  const outcomes: RevertOutcome[] = [];
  /*
   * BUILD-3: ids this revert has itself sent to the Trash. Undoing a
   * `create_project` deletes the project first, and that cascade takes the
   * lists created with it — which then read as gone. They are gone because
   * the undo worked, and reporting them as "no longer exists and was skipped"
   * would tell Shreekant the opposite of what happened.
   */
  const removedHere = new Set<string>();

  for (const entry of entries) {
    const base: RevertOutcome = { kind: entry.kind, id: entry.id, label: entry.label, status: 'restored' };

    if (!entry.prior) {
      if (!options.undoCreations) {
        outcomes.push({ ...base, status: 'created' });
        continue;
      }

      // Gone already — somebody deleted it between the change and the undo,
      // which is the outcome the undo wanted anyway.
      if (!existsNow(entry)) {
        outcomes.push({ ...base, status: removedHere.has(entry.id) ? 'restored' : 'missing' });
        continue;
      }

      // An event made by the change is simply taken away: events have no Trash.
      if (entry.kind === 'event') {
        useEventStore.getState().removeEvent(entry.id);
        outcomes.push({ ...base, status: 'restored' });
        continue;
      }

      // The store's own delete, not a filter: it is `applyDeletion`, which
      // cascades the subtree, records the Trash entry and clears the
      // cross-links. CLAUDE.md is explicit that hand-rolling any of that
      // re-creates the bug it exists to fix. A project or a list created by
      // the change goes the same way (BUILD-3), and so into the Trash too.
      const newestBefore = useTrashStore.getState().entries[0];
      if (entry.kind === 'project') store.deleteProject(entry.id);
      else if (entry.kind === 'list') store.deleteTaskList(entry.id);
      else store.deleteBacklogTask(entry.id);

      // Only an entry this delete actually recorded: a subtask id matches no
      // plan, and then the newest entry is somebody else's.
      const trashed = useTrashStore.getState().entries[0];
      if (trashed && trashed !== newestBefore) {
        for (const item of [...trashed.projects, ...trashed.taskLists, ...trashed.backlogTasks]) removedHere.add(item.id);
      }
      outcomes.push({ ...base, status: 'restored' });
      continue;
    }

    const prior = entry.prior as unknown as Record<string, unknown>;
    const current = readCurrent(entry);

    /* An event is put back whole, deleted or edited alike: the record is all
       there is of it, and the store's `putEvent` takes it either way. */
    if (entry.kind === 'event') {
      const same = current !== null && Object.keys(restorePatch(prior, current)).length === 0;
      if (!same) useEventStore.getState().putEvent(structuredClone(entry.prior as BaseEvent));
      outcomes.push({ ...base, status: same ? 'unchanged' : 'restored' });
      continue;
    }

    /* A row that left today's queue goes back into it, where it was (29-1P6b).
       The queue holds copies, so the captured copy is the row itself; the
       backlog entry before it has already put the task's own fields back. */
    if (!current && entry.location === 'focusQueue') {
      const queue = useStore.getState().tasks;
      const at = Math.max(0, Math.min(entry.queueIndex ?? queue.length, queue.length));
      store.setTasks([...queue.slice(0, at), structuredClone(entry.prior as Task), ...queue.slice(at)]);
      outcomes.push(base);
      continue;
    }

    if (!current) {
      /*
       * It existed before the change and does not exist now, which almost
       * always means the change *was* a deletion. The Trash is where it went,
       * so that is where the undo goes to get it — and `restoreFromTrash`
       * rebuilds the parent chain, which a field patch could not do even if
       * there were a record to patch.
       *
       * BUILD-3: a deleted project or list is looked for by its own id. Its
       * Trash entry holds the lists and tasks that went with it, so one
       * restore brings the whole thing back, and `delete_project` captures the
       * project alone for exactly that reason.
       */
      const entryInTrash = useTrashStore.getState().entries.find((candidate) => {
        if (entry.kind === 'project') return candidate.projects.some((project) => project.id === entry.id);
        if (entry.kind === 'list') return candidate.taskLists.some((list) => list.id === entry.id);
        return candidate.backlogTasks.some((task) => task.id === entry.id);
      });

      if (entryInTrash && restoreFromTrash(entryInTrash.id)) {
        outcomes.push({ ...base, status: 'restored' });
      } else {
        outcomes.push({ ...base, status: 'missing' });
      }
      continue;
    }

    const patch = restorePatch(prior, current);
    if (Object.keys(patch).length === 0) {
      outcomes.push({ ...base, status: 'unchanged' });
      continue;
    }

    if (entry.kind === 'list') {
      // A title goes back through the store's rename, which also refreshes the
      // `listName` fallback on every task in the list (BUILD-3's `update_list`
      // renames that way, so its undo does too).
      const { title, ...rest } = patch as Partial<TaskList>;
      if (typeof title === 'string') store.renameTaskList(entry.id, title);
      if (Object.keys(rest).length > 0) store.updateTaskList(entry.id, rest);
      outcomes.push(base);
    } else if (entry.kind === 'project') {
      store.updateProject(entry.id, patch as Partial<Project>);
      outcomes.push(base);
    } else if (entry.location === 'focusQueue') {
      store.updateTask(entry.id, patch as Partial<Task>);
      outcomes.push(base);
    } else {
      /* 29-2d1: a date put back says its event link too, even unchanged, or
         `applyTaskUpdate` reads it as a date set by hand and drops the link. */
      if ('deadline' in patch && !('eventId' in patch)) patch.eventId = prior.eventId;
      store.updateBacklogTask(entry.id, patch as Partial<Task>);
      // An update addressed by subtask id only writes through the fields a
      // `Subtask` actually has. Report anything outside that set instead of
      // claiming a clean revert.
      const unrestoredFields = entry.location === 'subtask'
        ? Object.keys(patch).filter((k) => !(SUBTASK_PROXY_FIELDS as readonly string[]).includes(k))
        : [];
      outcomes.push(
        unrestoredFields.length > 0 ? { ...base, status: 'partial', unrestoredFields } : base,
      );
    }
  }

  return outcomes;
}

/** The sentence a revert reports, shared by the ring and by the action log. */
export function describeRevert(label: string, outcomes: RevertOutcome[]): string {
  return describeOutcomes(label, outcomes);
}

interface SnapshotState {
  /** Committed turns, newest first. Capped at `RING_CAPACITY`. */
  turns: SnapshotTurn[];

  beginTurn: (label: string) => TurnHandle;
  captureTask: (handle: TurnHandle, taskId: string) => void;
  captureList: (handle: TurnHandle, listId: string) => void;
  captureProject: (handle: TurnHandle, projectId: string) => void;
  captureEvent: (handle: TurnHandle, eventId: string) => void;
  /** Pushes onto the ring and evicts the oldest. Returns `null` if nothing was captured. */
  commitTurn: (handle: TurnHandle) => SnapshotTurn | null;
  /**
   * Closes a capture and hands it back **without** putting it on the ring.
   *
   * Atlas's undo (`lib/agent/toolServer/undo.ts`) runs the capture for one
   * tool call and ships the entries to the action log; the ring is never the
   * record there. Since BIG-12 that also happens in this browser, with the lid
   * shut — and the ring here is the basic assistant's Revert history, which a
   * commit-then-clear would wipe.
   */
  takeDraft: (handle: TurnHandle) => SnapshotTurn | null;
  revertTurn: (turnId: string) => RevertResult;
  listTurns: () => SnapshotTurn[];
  /**
   * Drops the whole ring. Must be called on sign-out / account switch —
   * reverting a turn captured under one uid would write that user's task data
   * into another's store.
   */
  clearTurns: () => void;
}

export const useSnapshotStore = create<SnapshotState>()((set, get) => ({
  turns: [],

  beginTurn: (label) => {
    const now = Date.now();
    for (const [id, draft] of drafts) {
      if (now - draft.createdAt > DRAFT_TTL_MS) drafts.delete(id);
    }
    const handle: TurnHandle = { id: crypto.randomUUID(), label, startedAt: now };
    drafts.set(handle.id, { id: handle.id, label, createdAt: now, entries: [] });
    return handle;
  },

  captureTask: (handle, taskId) => {
    const draft = drafts.get(handle.id);
    if (!draft) return;
    // Capturing twice in one turn keeps the FIRST value — that is the state
    // the turn started from, which is what a revert has to get back to.
    if (draft.entries.some((e) => e.kind === 'task' && e.id === taskId)) return;

    const found = locateTask(taskId);
    draft.entries.push({
      kind: 'task',
      id: taskId,
      label: found?.entity.title ?? taskId,
      location: found?.location,
      prior: found ? clone(found.entity) : null,
    });
  },

  captureList: (handle, listId) => {
    const draft = drafts.get(handle.id);
    if (!draft) return;
    if (draft.entries.some((e) => e.kind === 'list' && e.id === listId)) return;

    const list = useStore.getState().taskLists.find((l) => l.id === listId);
    draft.entries.push({
      kind: 'list',
      id: listId,
      label: list?.title ?? listId,
      prior: list ? clone(list) : null,
    });
  },

  captureProject: (handle, projectId) => {
    const draft = drafts.get(handle.id);
    if (!draft) return;
    if (draft.entries.some((e) => e.kind === 'project' && e.id === projectId)) return;

    const project = useStore.getState().projects.find((p) => p.id === projectId);
    draft.entries.push({
      kind: 'project',
      id: projectId,
      label: project?.name ?? projectId,
      prior: project ? clone(project) : null,
    });
  },

  captureEvent: (handle, eventId) => {
    const draft = drafts.get(handle.id);
    if (!draft) return;
    if (draft.entries.some((e) => e.kind === 'event' && e.id === eventId)) return;

    const event = useEventStore.getState().events.find((e) => e.id === eventId);
    draft.entries.push({
      kind: 'event',
      id: eventId,
      label: event?.title ?? eventId,
      prior: event ? clone(event) : null,
    });
  },

  commitTurn: (handle) => {
    const draft = drafts.get(handle.id);
    drafts.delete(handle.id);
    // A turn that only answered a question touched nothing and should not
    // burn a ring slot, pushing a real undoable turn out.
    if (!draft || draft.entries.length === 0) return null;

    set((state) => ({ turns: [draft, ...state.turns].slice(0, RING_CAPACITY) }));
    return draft;
  },

  takeDraft: (handle) => {
    const draft = drafts.get(handle.id);
    drafts.delete(handle.id);
    return draft && draft.entries.length > 0 ? draft : null;
  },

  revertTurn: (turnId) => {
    const turn = get().turns.find((t) => t.id === turnId);
    if (!turn) {
      return {
        ok: false,
        turnId,
        label: '',
        outcomes: [],
        restoredCount: 0,
        skippedCount: 0,
        summary: 'That change is no longer in the undo history.',
      };
    }

    /*
     * `undoCreations: false` keeps this path exactly as it was. See
     * `revertSnapshotEntries` for the whole of that decision: the in-browser
     * ring belongs to the fallback assistant, which has no delete tool and
     * runs under D3, and Atlas's action log is the caller that asks for the
     * other behaviour.
     */
    const outcomes = revertSnapshotEntries(turn.entries, { undoCreations: false });

    set((state) => ({
      turns: state.turns.map((t) => (t.id === turnId ? { ...t, revertedAt: Date.now() } : t)),
    }));

    return {
      ok: true,
      turnId,
      label: turn.label,
      outcomes,
      restoredCount: outcomes.filter((o) => o.status === 'restored' || o.status === 'partial').length,
      skippedCount: outcomes.filter((o) => o.status === 'missing' || o.status === 'created').length,
      summary: describeOutcomes(turn.label, outcomes),
    };
  },

  listTurns: () => get().turns,

  clearTurns: () => {
    drafts.clear();
    set({ turns: [] });
  },
}));
