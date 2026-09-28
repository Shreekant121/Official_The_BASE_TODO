import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  entryFromPlan,
  purgeExpired,
  trimTrash,
  type TrashEntry,
} from '../lib/trashModel';
import type { DeletionPlan } from '../lib/cascadeDelete';

/**
 * The Trash — deliberately a *second* store, persisted under its own
 * localStorage key and synced to its own Firestore document
 * (`lib/trashSync.ts`).
 *
 * It is not part of `useStore` because a deleted project brings all of its
 * tasks with it: put that in the main store and deleting things would grow the
 * document that `useStore`'s 1 MiB cap applies to, which is the opposite of
 * what deleting is for. Keeping it separate also means a corrupt or oversized
 * trash can never take the app's real data down with it.
 *
 * Nothing here imports `useStore` — the two stores must not reference each
 * other at runtime. `useStore` records deletions into this one; putting an
 * entry back is a write to *both*, and lives in `lib/trash.ts` above them.
 */
interface TrashState {
  entries: TrashEntry[];
  /** Newest first. Called by `useStore`'s delete actions, never directly. */
  record: (plan: DeletionPlan, now?: number) => void;
  remove: (entryId: string) => void;
  empty: () => void;
  /** The on-load sweep. Returns how many entries it dropped. */
  purge: (now?: number) => number;
  /** Used by the cloud sync to adopt what the server holds. */
  setEntries: (entries: TrashEntry[]) => void;
}

export const useTrashStore = create<TrashState>()(
  persist(
    (set, get) => ({
      entries: [],

      record: (plan, now = Date.now()) => {
        if (!plan.matched) return;
        const entry = entryFromPlan(plan, crypto.randomUUID(), now);
        set({ entries: trimTrash([entry, ...get().entries]) });
      },

      remove: (entryId) => set((state) => ({ entries: state.entries.filter((e) => e.id !== entryId) })),

      empty: () => set({ entries: [] }),

      purge: (now = Date.now()) => {
        const { kept, purged } = purgeExpired(get().entries, now);
        if (purged.length > 0) set({ entries: kept });
        return purged.length;
      },

      setEntries: (entries) => set({ entries: trimTrash(entries) }),
    }),
    {
      name: 'mutineer-os-trash',
      version: 1,
      migrate: (persisted) => {
        const state = persisted as { entries?: unknown };
        if (!Array.isArray(state.entries)) state.entries = [];
        return state as unknown as TrashState;
      },
    },
  ),
);
