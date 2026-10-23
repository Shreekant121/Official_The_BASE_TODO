import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { cleanEventDraft, isBaseEvent, type BaseEvent, type EventDraft } from '../lib/events/events';
import { eventDatesChanged, followMoves, tasksLinkedTo } from '../lib/events/eventLinks';
import { resolveUserTimeZone } from '../lib/agent/dates';
import { useStore } from './useStore';
import { withoutUndo } from './undoGate';

/**
 * Events (29-2a) — their own store, their own localStorage key and their own
 * Firestore document, `users/{uid}/data/events` (`lib/eventSync.ts`), **never
 * `data/main`**: the queue's engineering note, for the 1 MB cap, and for the
 * reason `useDashboardStore` gives — `mcp/` writes `data/main` back whole
 * after every Atlas call through `hydrateFromPayload`, and a slice one of the
 * two paths forgot would be written back empty.
 *
 * Atlas reaches it all the same: `mcp/store.ts` reads and writes this
 * document beside `data/main`, and the tools (`agent/tools/eventTools.ts`)
 * call these actions, on the laptop and in the page alike.
 *
 * Every write goes through `cleanEventDraft`, so what is stored never holds
 * an `undefined` (Firestore refuses it) or an empty word. The document is
 * written whole, last write wins, like the Dashboard's.
 *
 * 29-2d1: tasks due before an event (`Task.eventId`) follow it from here, the
 * one door every change of an event goes through on both hosts — the sheet and
 * Atlas's `update_event` alike. A change of its date moves each open linked
 * task to the event's (`followMoves`); deleting it lifts the link and keeps the
 * date. Both write through `updateBacklogTask`, so the deadline maths, the
 * calendar block and the task's story see an ordinary edit. Outside his undo:
 * the event's own change is not in it either, and undoing half would leave a
 * linked task off its event's date. Adopting the cloud's copy follows nothing —
 * the device that changed the event moved its tasks, and they sync in
 * `data/main`.
 */
export interface EventsDoc {
  events: BaseEvent[];
}

interface EventState extends EventsDoc {
  /**
   * A new event from a draft; `null` when the draft has no title or start.
   * `id` is for Atlas, which captures the id for its undo before it exists.
   */
  addEvent: (draft: Partial<EventDraft>, id?: string) => string | null;
  /**
   * Changes fields. A field passed as `undefined` (or `''`) is cleared. A
   * change that would leave no title or no start is refused: `false`.
   */
  updateEvent: (id: string, patch: Partial<EventDraft>) => boolean;
  removeEvent: (id: string) => void;
  /** An undo putting a whole record back as it was, in or out of the list. */
  putEvent: (event: BaseEvent) => void;
  /** The cloud sync adopting what the server holds. */
  adopt: (doc: EventsDoc) => void;
}

const newId = () => crypto.randomUUID();

export const useEventStore = create<EventState>()(
  persist(
    (set, get) => ({
      events: [],

      addEvent: (draft, id = newId()) => {
        const clean = cleanEventDraft(draft);
        if (!clean || get().events.some((e) => e.id === id)) return null;
        set((s) => ({ events: [...s.events, { id, createdAt: Date.now(), ...clean }] }));
        return id;
      },

      updateEvent: (id, patch) => {
        const current = get().events.find((e) => e.id === id);
        if (!current) return false;
        const { id: _id, createdAt, ...fields } = current;
        void _id;
        const clean = cleanEventDraft({ ...fields, ...patch });
        if (!clean) return false;
        const next: BaseEvent = { id, createdAt, ...clean };
        set((s) => ({ events: s.events.map((e) => (e.id === id ? next : e)) }));
        if (eventDatesChanged(current, next)) followEvent(next);
        return true;
      },

      removeEvent: (id) => {
        set((s) => ({ events: s.events.filter((e) => e.id !== id) }));
        const linked = tasksLinkedTo(useStore.getState().backlogTasks, id);
        if (linked.length > 0) withoutUndo(() => linked.forEach((t) => useStore.getState().updateBacklogTask(t.id, { eventId: undefined })));
      },

      putEvent: (event) =>
        set((s) => (s.events.some((e) => e.id === event.id)
          ? { events: s.events.map((e) => (e.id === event.id ? event : e)) }
          : { events: [...s.events, event] })),

      adopt: (doc) => set({ events: sanitizeEvents(doc.events) }),
    }),
    {
      name: 'base-events',
      version: 1,
      partialize: (s): EventsDoc => ({ events: s.events }),
      merge: (persisted, current) => ({ ...current, events: sanitizeEvents((persisted as Partial<EventsDoc> | undefined)?.events) }),
    },
  ),
);

/** Moves the open tasks due before `event` to its date (29-2d1). */
function followEvent(event: BaseEvent): void {
  const moves = followMoves(useStore.getState().backlogTasks, event, new Date(), resolveUserTimeZone());
  if (moves.length === 0) return;
  withoutUndo(() => {
    for (const move of moves) useStore.getState().updateBacklogTask(move.taskId, { deadline: move.deadline, eventId: event.id });
  });
}

/**
 * 29-2c1: whose events this store holds as the cloud last said — set by
 * `eventSync` once the document has been read this session. The calendar
 * pass writes and sweeps events only for that account: before then the list
 * is this device's last copy, and sweeping by it could delete an event made
 * on the tablet.
 */
let cloudReadFor: string | null = null;
export function markEventsRead(uid: string | null): void {
  cloudReadFor = uid;
}
/** The events, once the cloud has been read for `uid`; `null` before. */
export function eventsReadFor(uid: string): BaseEvent[] | null {
  return cloudReadFor === uid ? useEventStore.getState().events : null;
}

/** What a device or the cloud handed over, minus anything unreadable — never the whole list for one bad record. */
export function sanitizeEvents(raw: unknown): BaseEvent[] {
  return Array.isArray(raw) ? raw.filter(isBaseEvent) : [];
}

export function isEventsDoc(data: unknown): data is EventsDoc {
  return !!data && typeof data === 'object' && Array.isArray((data as EventsDoc).events);
}
