import { create } from 'zustand';
import type { EventDraft } from '../lib/events/events';

/**
 * Which event sheet is open (29-2a), in memory only. Three places open it —
 * the Countdown widget, Capture and Ctrl+K — and `EventSheetHost` (in
 * `App.tsx`, every screen) draws it, so none of them owns a sheet of its own.
 */
export type EventSheetOpen =
  | { kind: 'event'; eventId?: string; draft?: Partial<EventDraft> }
  | { kind: 'archive' };

interface EventSheetState {
  open: EventSheetOpen | null;
  /** An event to edit, or a new one, started from `draft` when given. */
  openEvent: (eventId?: string, draft?: Partial<EventDraft>) => void;
  openArchive: () => void;
  close: () => void;
}

export const useEventSheet = create<EventSheetState>()((set) => ({
  open: null,
  openEvent: (eventId, draft) => set({ open: { kind: 'event', ...(eventId ? { eventId } : {}), ...(draft ? { draft } : {}) } }),
  openArchive: () => set({ open: { kind: 'archive' } }),
  close: () => set({ open: null }),
}));
