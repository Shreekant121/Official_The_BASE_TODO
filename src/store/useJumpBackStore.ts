import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { noteScroll, noteTask, visit, type JumpSpot } from '../lib/jumpBack';

/**
 * Jump back in (29-1P8c, idea 154) — the projects he had open on THIS device,
 * and where he was in each. `lib/jumpBack.ts` is the model; this only keeps it.
 *
 * Its own localStorage key and nothing in Firestore, his call: the laptop and
 * the tablet each remember their own, like a board's view and density
 * (`useRememberedState`). Never `data/main` — which tab was open is not task
 * data, and that document is rewritten whole under a 1 MB cap.
 *
 * `landing` is the one hand-off between a tap and the board it opens: Home's
 * row and Ctrl+K set it and navigate, and the project's board takes it on its
 * way in (scroll there, glow the task once) and clears it. In memory only —
 * a landing that outlived the tap would scroll a board he opened some other
 * way.
 */
interface JumpBackState {
  spots: JumpSpot[];
  landing: JumpSpot | null;
  visited: (projectId: string) => void;
  taskTouched: (projectId: string, task: { id: string; listId?: string }) => void;
  scrolled: (projectId: string, scrollTop: number) => void;
  setLanding: (spot: JumpSpot | null) => void;
}

export const useJumpBackStore = create<JumpBackState>()(
  persist(
    (set) => ({
      spots: [],
      landing: null,
      visited: (projectId) => set((s) => ({ spots: visit(s.spots, projectId, Date.now()) })),
      taskTouched: (projectId, task) => set((s) => ({ spots: noteTask(s.spots, projectId, task, Date.now()) })),
      scrolled: (projectId, scrollTop) => set((s) => {
        const spots = noteScroll(s.spots, projectId, scrollTop);
        return spots === s.spots ? s : { spots };
      }),
      setLanding: (landing) => set({ landing }),
    }),
    {
      name: 'base-jump-back',
      version: 1,
      partialize: (s) => ({ spots: s.spots }),
    },
  ),
);
