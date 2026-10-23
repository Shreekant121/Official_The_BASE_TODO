import { create } from 'zustand';
import { useStore } from './useStore';
import { revertSnapshotEntries, type SnapshotEntry } from './useSnapshotStore';
import { useTrashStore } from './useTrashStore';
import { useArchiveStore } from './useArchiveStore';
import { undoGateClosed, withoutUndo } from './undoGate';
import { putBackFromArchive } from '../lib/archive';
import { describePress, type PressClass, type UndoKind, type UndoSlices } from '../lib/undoModel';

/**
 * His undo (29-1P4a): the last 20 things he did on this device, this session
 * — ticking, deleting, moving, date and priority changes (BIG-15's planning
 * call) — each put back through the store's own paths, and each put forward
 * again by redo. The toast's Undo (idea 6), Ctrl+Z and the tablet's two- and
 * three-finger taps (130) all come here; `components/UndoHost.tsx` is all
 * three.
 *
 * ── IN MEMORY ONLY, like `useSnapshotStore`, and for the same reason. ───────
 * Never `persist`, never in `SyncPayload`: each action holds whole copies of
 * what it touched, `data/main` is capped at 1 MB, and an undo is worth nothing
 * after a reload. Nor is it shared between devices — his call.
 *
 * ── HOW A PRESS IS RECORDED ─────────────────────────────────────────────────
 * The store actions a press can reach are wrapped once at startup
 * (`installUndoRecorder`, from `main.tsx`). The first wrapped call of a press
 * reads the slices; a microtask later — the press's synchronous work done — it
 * reads them again and `lib/undoModel.ts` says what changed and whether that
 * was something he would want back. A bulk tick of five tasks is one press and
 * one undo. A wrapped action called from inside another (the store calling
 * itself) is part of the outer one.
 *
 * Wrapping the store rather than the dozen tick boxes, menus and drops that
 * call it is what makes "everywhere" true: a row added next year undoes for
 * free, the same way `applyDeletion` makes every delete soft.
 *
 * Atlas's writes are not his: the tool server closes `undoGate` for each call,
 * and so does this store while it puts something back.
 *
 * ── UNDO AND REDO ARE NOT MIRRORS ───────────────────────────────────────────
 * Undo applies the entries captured before the press with
 * `revertSnapshotEntries` — the same function Atlas's Revert uses, so a tick
 * goes back through `updateBacklogTask` (and takes a repeat's successor with
 * it), a delete comes back out of the Trash, a moved task's list and place are
 * patched back. An archive comes off the shelf through `putBackFromArchive`.
 * Redo REPLAYS the press: the same store calls with the same arguments, which
 * re-archives an archive rather than deleting it, re-spawns a successor, and is
 * recorded afresh so it can be undone again.
 */

export interface UndoAction {
  id: number;
  kind: UndoKind;
  label: string;
  at: number;
  entries: SnapshotEntry[];
  /** The store calls the press made, for redo. */
  calls: { name: WrappedName; args: unknown[] }[];
  /** Named by the press itself (`sayThisPress`): toasted whatever its kind. */
  loud?: boolean;
}

/** The last 20 actions — his number. */
const CAPACITY = 20;

/** Which store actions a press can reach, and what kind of press each is. */
const WRAPPED = {
  updateBacklogTask: 'edit',
  updateTask: 'edit',
  setEmergencyBoost: 'edit',
  deleteBacklogTask: 'remove',
  deleteTaskList: 'remove',
  deleteProject: 'remove',
  archiveBacklogTask: 'archive',
  archiveProject: 'archive',
  moveTaskToList: 'move',
  reorderBacklogTasks: 'move',
  reorderTaskLists: 'move',
  reorderProjects: 'move',
  moveProject: 'move',
} as const satisfies Record<string, PressClass>;

type WrappedName = keyof typeof WRAPPED;

/** Who asked — the toast's button, a key chord, or fingers on the tablet. */
export type UndoVia = 'toast' | 'keys' | 'fingers';

interface UndoState {
  /** Newest first. */
  done: UndoAction[];
  /** What undo took back, newest first; emptied by any new press. */
  undone: UndoAction[];
  /** The press just recorded — what the toast reacts to. */
  latest: UndoAction | null;
  /** The undo or redo just run, and who asked — what `UndoHost` says about it. */
  ran: { op: 'undo' | 'redo'; action: UndoAction; via: UndoVia; seq: number } | null;
  /** Puts the newest action back. `onlyId` is a toast's: undo that one or nothing. */
  undo: (via: UndoVia, onlyId?: number) => UndoAction | null;
  redo: (via: UndoVia) => UndoAction | null;
  /** Sign-out: an action captured under one account must never write into the next. */
  clear: () => void;
}

let nextId = 1;

function slices(): UndoSlices {
  const s = useStore.getState();
  return { backlogTasks: s.backlogTasks, tasks: s.tasks, taskLists: s.taskLists, projects: s.projects };
}

interface Burst {
  before: UndoSlices;
  classes: Set<PressClass>;
  calls: UndoAction['calls'];
  /** A redo's replay: it must not empty the redo stack it came from. */
  replay: boolean;
  /** `sayThisPress`'s words, in place of the model's. */
  say?: string;
}

let burst: Burst | null = null;
let depth = 0;

function closeBurst(): UndoAction | null {
  const b = burst;
  burst = null;
  if (!b) return null;
  const change = describePress(b.before, slices(), b.classes);
  if (!change) return null;
  const action: UndoAction = { id: nextId++, ...change, ...(b.say ? { label: b.say, loud: true } : null), at: Date.now(), calls: b.calls };
  useUndoStore.setState((s) => ({
    done: [action, ...s.done].slice(0, CAPACITY),
    undone: b.replay ? s.undone : [],
    latest: action,
  }));
  return action;
}

function copyArgs(args: unknown[]): unknown[] {
  try {
    return structuredClone(args);
  } catch {
    return args;
  }
}

/**
 * A thing that has left the store and is not in the Trash is on the archive
 * shelf. `revertSnapshotEntries` only knows the Trash (Atlas cannot archive),
 * so the shelf is emptied first and its entries then read as already back.
 */
function putBackArchived(entries: SnapshotEntry[]): void {
  const { projects, taskLists, backlogTasks } = useStore.getState();
  const here = new Set([...projects, ...taskLists, ...backlogTasks].map((x) => x.id));
  const trashed = new Set(useTrashStore.getState().entries.flatMap((e) => [...e.projects, ...e.taskLists, ...e.backlogTasks].map((x) => x.id)));
  for (const entry of entries) {
    if (!entry.prior || here.has(entry.id) || trashed.has(entry.id)) continue;
    const shelf = useArchiveStore.getState().entries.find((e) =>
      [...e.projects, ...e.taskLists, ...e.backlogTasks].some((x) => x.id === entry.id));
    if (!shelf) continue;
    const result = putBackFromArchive(shelf.id);
    if (result) for (const x of [...shelf.projects, ...shelf.taskLists, ...shelf.backlogTasks]) here.add(x.id);
  }
}

export const useUndoStore = create<UndoState>()((set, get) => ({
  done: [],
  undone: [],
  latest: null,
  ran: null,

  undo: (via, onlyId) => {
    /* A press still settling (its microtask not yet run) is the newest. */
    closeBurst();
    const [top, ...rest] = get().done;
    if (!top || (onlyId !== undefined && top.id !== onlyId)) return null;
    withoutUndo(() => {
      putBackArchived(top.entries);
      revertSnapshotEntries(top.entries, { undoCreations: true });
    });
    set((s) => ({
      done: rest,
      undone: [top, ...s.undone].slice(0, CAPACITY),
      latest: null,
      ran: { op: 'undo', action: top, via, seq: (s.ran?.seq ?? 0) + 1 },
    }));
    return top;
  },

  redo: (via) => {
    closeBurst();
    const [top, ...rest] = get().undone;
    if (!top) return null;
    set({ undone: rest });
    burst = { before: slices(), classes: new Set(), calls: [], replay: true };
    const store = useStore.getState() as unknown as Record<WrappedName, (...args: unknown[]) => unknown>;
    for (const call of top.calls) store[call.name](...copyArgs(call.args));
    const again = closeBurst();
    if (again) set((s) => ({ latest: null, ran: { op: 'redo', action: again, via, seq: (s.ran?.seq ?? 0) + 1 } }));
    return again;
  },

  clear: () => {
    burst = null;
    set({ done: [], undone: [], latest: null, ran: null });
  },
}));

/**
 * Names the press that has just run and asks for its toast, whatever its kind
 * (29-1P6b). Call it straight AFTER the store call, in the same tick: the press
 * is still open then, and nothing lingers to name the next one. A date change
 * is normally silent; a swipe that starts a task tomorrow changes nothing he
 * can see on the row, so it says so, with the Undo.
 */
export function sayThisPress(label: string): void {
  if (burst && !burst.replay) burst.say = label;
}

let installed = false;

/**
 * Wraps the store actions a press can reach. Once, at startup, before
 * anything renders — `main.tsx`. Not in `mcp/`: nobody presses anything in
 * Node, and Atlas has its own Revert.
 */
export function installUndoRecorder(): void {
  if (installed) return;
  installed = true;
  const state = useStore.getState() as unknown as Record<WrappedName, (...args: unknown[]) => unknown>;
  const patch: Partial<Record<WrappedName, (...args: unknown[]) => unknown>> = {};
  for (const name of Object.keys(WRAPPED) as WrappedName[]) {
    const original = state[name];
    patch[name] = (...args: unknown[]) => {
      if (depth > 0 || undoGateClosed()) return original(...args);
      if (!burst) {
        burst = { before: slices(), classes: new Set(), calls: [], replay: false };
        queueMicrotask(closeBurst);
      }
      burst.classes.add(WRAPPED[name]);
      burst.calls.push({ name, args: copyArgs(args) });
      depth += 1;
      try {
        return original(...args);
      } finally {
        depth -= 1;
      }
    };
  }
  useStore.setState(patch as never);
}
