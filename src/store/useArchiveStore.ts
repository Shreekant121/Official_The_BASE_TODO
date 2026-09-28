import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { archiveEntryFromPlan, fitsInArchive, type ArchiveEntry } from '../lib/archiveModel';
import type { DeletionPlan } from '../lib/cascadeDelete';

/**
 * The Archive (BUILD-11) — a *third* store, persisted under its own
 * localStorage key and synced to its own Firestore document
 * (`lib/archiveSync.ts`), for the reason `useTrashStore` is the second: an
 * archived project carries every task it held, and the whole point of putting
 * it away is that it stops counting against `data/main`.
 *
 * It has no purge, no expiry and no trim. The only ways out of it are "Put
 * back" (`lib/archive.ts`) and the cloud adopting another device's copy.
 *
 * Nothing here imports `useStore`, for `useTrashStore`'s reason: the two
 * stores must not reference each other at runtime. `useStore` records into
 * this one; putting an entry back writes both, and lives above them.
 */
interface ArchiveState {
  entries: ArchiveEntry[];
  /**
   * Called by `useStore`'s archive actions, never directly. `false` means
   * nothing was kept — no match, or the document is full — and the caller
   * must then leave the thing where it is.
   */
  record: (plan: DeletionPlan, now?: number) => boolean;
  remove: (entryId: string) => void;
  /** Used by the cloud sync to adopt what the server holds. */
  setEntries: (entries: ArchiveEntry[]) => void;
}

export const useArchiveStore = create<ArchiveState>()(
  persist(
    (set, get) => ({
      entries: [],

      record: (plan, now = Date.now()) => {
        const entry = archiveEntryFromPlan(plan, crypto.randomUUID(), now);
        if (!entry || !fitsInArchive(get().entries, entry)) return false;
        set({ entries: [entry, ...get().entries] });
        return true;
      },

      remove: (entryId) => set((state) => ({ entries: state.entries.filter((e) => e.id !== entryId) })),

      setEntries: (entries) => set({ entries }),
    }),
    {
      name: 'mutineer-os-archive',
      version: 1,
      migrate: (persisted) => {
        const state = persisted as { entries?: unknown };
        if (!Array.isArray(state.entries)) state.entries = [];
        return state as unknown as ArchiveState;
      },
    },
  ),
);
