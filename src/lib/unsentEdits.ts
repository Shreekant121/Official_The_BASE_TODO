/**
 * FIX-15 — changes made offline survive the tab dying.
 *
 * A save that the cloud has not confirmed lives only in Firestore's memory
 * (`lib/firebase.ts` keeps no `localCache`). The stores themselves are in
 * localStorage, so the change is still on the device after Brave kills the
 * tab; but the next open used to adopt the cloud's copy wholesale, and the
 * change was gone. Reproduced 2026-10-20 on a scratch account: renamed a task
 * offline, closed the tab, reopened online, the old name came back.
 *
 * So this file remembers, in localStorage beside the stores, WHICH records
 * this device changed since the cloud last confirmed a save: ids per slice,
 * whether a slice's order moved, and which plain values changed. On the next
 * open, if that list is there, the cloud's copy is the base and only those
 * records are laid over it (`merge`), then the result is saved. Not "the
 * device wins": a tablet that died offline on Monday must not undo three days
 * of laptop work on Friday. Same record changed on both: the device's version
 * wins (there is no edit time on a record to say which came later).
 *
 * Three documents, one list each, because a delete or an archive moves a task
 * between them: `data/main` (its focus log is not tracked here, since
 * `hydrateFromPayload` already unions it), `data/trash` and `data/archive`.
 * Keeping only main's would have kept an offline delete and lost its Trash
 * entry, which is worse than either.
 */
import type { SyncPayload } from './syncPayload';
import type { TrashEntry } from './trashModel';
import type { ArchiveEntry } from './archiveModel';

type Kv = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
type Rec = { id: string };

export interface Unsent {
  uid: string;
  /** Records added, changed or removed here, by id. */
  ids: Record<string, string[]>;
  /** Slices whose order was changed here (a drag), not only their records. */
  reordered: string[];
  values: string[];
}

function storage(): Kv | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const empty = (uid: string): Unsent => ({ uid, ids: {}, reordered: [], values: [] });

function sameOrder(a: string[], b: string[]): boolean {
  const inB = new Set(b);
  const inA = new Set(a);
  const x = a.filter((id) => inB.has(id));
  const y = b.filter((id) => inA.has(id));
  return x.every((id, i) => id === y[i]);
}

/**
 * One slice: the cloud's records, with this device's changed ones laid over
 * (or removed). The order is the cloud's, unless the order moved here; then it
 * is this device's, with records added elsewhere slotted in after the record
 * they followed there.
 */
function mergeRecords<T extends Rec>(cloud: T[], local: T[], touched: Set<string>, reordered: boolean): T[] {
  const cloudById = new Map(cloud.map((r) => [r.id, r]));
  const localById = new Map(local.map((r) => [r.id, r]));
  const pick = (id: string) => (touched.has(id) ? localById.get(id) : cloudById.get(id));
  const [first, second] = reordered ? [local, cloud] : [cloud, local];
  const out: T[] = [];
  const placed = new Set<string>();
  for (const r of first) {
    const v = pick(r.id);
    if (v && !placed.has(r.id)) {
      out.push(v);
      placed.add(r.id);
    }
  }
  let at = 0;
  for (const r of second) {
    if (placed.has(r.id)) {
      at = out.findIndex((x) => x.id === r.id) + 1;
      continue;
    }
    const v = pick(r.id);
    if (!v) continue;
    out.splice(at, 0, v);
    placed.add(r.id);
    at += 1;
  }
  return out;
}

const KEYS: string[] = [];

/** Every document's list, dropped: a different account has taken this browser's stores. */
export function forgetUnsent(kv: Kv | null = storage()) {
  for (const key of KEYS) {
    try {
      kv?.removeItem(key);
    } catch {
      // Nothing to do.
    }
  }
  for (const reset of resets) reset();
}

const resets: (() => void)[] = [];

/** For tests: forget the live lists, as a reload does (localStorage is kept). */
export function resetUnsentForTests() {
  for (const reset of resets) reset();
}

export function unsentTracker<S extends object>(key: string, recordSlices: (keyof S & string)[], valueSlices: (keyof S & string)[] = []) {
  KEYS.push(key);
  /** `seq` counts edits, so a confirmed save clears the list only if nothing changed after it was sent. */
  let live: { uid: string; seq: number; unsent: Unsent } | null = null;
  resets.push(() => {
    live = null;
  });

  function read(uid: string, kv: Kv | null = storage()): Unsent | null {
    try {
      const raw = kv?.getItem(key);
      if (!raw) return null;
      const u = JSON.parse(raw) as Unsent;
      return u && u.uid === uid ? u : null;
    } catch {
      return null;
    }
  }

  function liveFor(uid: string, kv: Kv | null) {
    if (!live || live.uid !== uid) live = { uid, seq: 0, unsent: read(uid, kv) ?? empty(uid) };
    return live;
  }

  /** Adds what changed to `into`. False when no tracked slice changed (stores hold UI state too). */
  function noteChanges(prev: S, next: S, into: Unsent): boolean {
    let changed = false;
    for (const slice of recordSlices) {
      const before = prev[slice] as Rec[];
      const after = next[slice] as Rec[];
      if (before === after) continue;
      const ids = new Set(into.ids[slice] ?? []);
      const old = new Map(before.map((r) => [r.id, r]));
      const kept = new Set<string>();
      for (const r of after) {
        kept.add(r.id);
        if (old.get(r.id) !== r) ids.add(r.id);
      }
      for (const id of old.keys()) if (!kept.has(id)) ids.add(id);
      if (!sameOrder(before.map((r) => r.id), after.map((r) => r.id)) && !into.reordered.includes(slice)) {
        into.reordered.push(slice);
      }
      into.ids[slice] = [...ids];
      changed = true;
    }
    for (const slice of valueSlices) {
      if (prev[slice] === next[slice]) continue;
      if (!into.values.includes(slice)) into.values.push(slice);
      changed = true;
    }
    return changed;
  }

  return {
    read,

    /** A local edit was made: noted at once, before any debounce. */
    track(uid: string, prev: S, next: S, kv: Kv | null = storage()) {
      const l = liveFor(uid, kv);
      if (!noteChanges(prev, next, l.unsent)) return;
      l.seq += 1;
      try {
        kv?.setItem(key, JSON.stringify(l.unsent));
      } catch {
        // Best-effort: worst case the next open adopts the cloud, as it always did.
      }
    },

    /** Taken when a save is sent; hand it back to `confirmed` when the cloud says yes. */
    seq(uid: string, kv: Kv | null = storage()): number {
      return liveFor(uid, kv).seq;
    },

    confirmed(uid: string, seq: number, kv: Kv | null = storage()) {
      const l = liveFor(uid, kv);
      if (l.seq !== seq) return;
      l.unsent = empty(uid);
      try {
        kv?.removeItem(key);
      } catch {
        // Left behind, it only makes the next open merge an already-saved state.
      }
    },

    merge<C extends S>(cloud: C, local: S, unsent: Unsent): C {
      const out = { ...cloud };
      for (const slice of recordSlices) {
        const ids = unsent.ids[slice];
        const reordered = unsent.reordered.includes(slice);
        if (!ids?.length && !reordered) continue;
        (out[slice] as Rec[]) = mergeRecords(cloud[slice] as Rec[], local[slice] as Rec[], new Set(ids ?? []), reordered);
      }
      for (const slice of valueSlices) {
        if (unsent.values.includes(slice)) out[slice] = local[slice] as C[typeof slice];
      }
      return out;
    },
  };
}

export type Slices = Omit<SyncPayload, 'focusLog'>;

/** `data/main`, minus the focus log (unioned on every read already). */
export const mainUnsent = unsentTracker<Slices>(
  'base-unsent-edits',
  ['taskLists', 'backlogTasks', 'tasks', 'projects'],
  ['sessionDuration', 'taskTimeMemory'],
);
export const trashUnsent = unsentTracker<{ entries: TrashEntry[] }>('base-unsent-trash', ['entries']);
export const archiveUnsent = unsentTracker<{ entries: ArchiveEntry[] }>('base-unsent-archive', ['entries']);
