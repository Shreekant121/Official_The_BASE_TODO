/**
 * Offline, and it's fine (29-1P14d1, idea 114) — what the pill at the top of
 * the screen says, as a pure model.
 *
 * When the device loses the internet the pill says "Offline · saving on this
 * tablet"; when it is back it turns lime, says how many changes reached the
 * cloud, and slips away. Four phases, one step function, no clock and no I/O:
 * `lib/connectionWatch.ts` feeds it the browser's online/offline events and
 * Firestore's "every pending write is acknowledged", and owns the timer.
 *
 * **A change is one save of `data/main`** — the debounced push in
 * `firestoreSync.ts`, which gathers the edits of a second and a half into one
 * write. That is the document his tasks, lists and projects live in; a
 * Dashboard layout or a tint saved offline still syncs, it is just not counted.
 * Counted only while offline: a save made online is not one that waited.
 */

export type PillPhase = 'idle' | 'offline' | 'syncing' | 'back';

export interface PillState {
  phase: PillPhase;
  /** Saves made while offline, carried until the pill has said them. */
  changes: number;
}

export type PillEvent =
  | { type: 'offline' }
  | { type: 'online' }
  | { type: 'change' }
  /** Firestore has acknowledged every write it was holding. */
  | { type: 'synced' }
  /** The lime pill has been read; it slips away. */
  | { type: 'hide' };

export const PILL_IDLE: PillState = { phase: 'idle', changes: 0 };

/** How long "Back online" stays before it slips away (the idea page's 2.2s). */
export const BACK_HOLD_MS = 2200;

export function stepPill(state: PillState, event: PillEvent): PillState {
  switch (event.type) {
    case 'offline':
      // Lost again before the last lot finished: those saves are still waiting.
      if (state.phase === 'offline') return state;
      return { phase: 'offline', changes: state.phase === 'syncing' ? state.changes : 0 };
    case 'online':
      return state.phase === 'offline' ? { phase: 'syncing', changes: state.changes } : state;
    case 'change':
      return state.phase === 'offline' ? { phase: 'offline', changes: state.changes + 1 } : state;
    case 'synced':
      return state.phase === 'syncing' ? { phase: 'back', changes: state.changes } : state;
    case 'hide':
      return state.phase === 'back' ? PILL_IDLE : state;
  }
}

function changesWord(n: number): string {
  return `${n} ${n === 1 ? 'change' : 'changes'}`;
}

/** The pill's words, or null when there is no pill. */
export function pillWords(state: PillState, device: 'tablet' | 'laptop'): string | null {
  switch (state.phase) {
    case 'idle':
      return null;
    case 'offline':
      return `Offline · saving on this ${device}`;
    case 'syncing':
      return state.changes ? `Back online · syncing ${changesWord(state.changes)}` : 'Back online';
    case 'back':
      return state.changes ? `Back online · synced ${changesWord(state.changes)}` : 'Back online';
  }
}
