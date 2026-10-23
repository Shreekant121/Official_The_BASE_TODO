import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  BLOCK_SPECS, RENAMED_KINDS, clampSize, defaultLayout, moveBlock, upgradeBlocks,
  type BlockKind, type BlockSettings, type DashboardBlock,
} from '../lib/dashboard/layout';
import type { NotNow } from '../lib/dashboard/blockData';
import {
  clampDay, defaultHours, pruneOverrides, sanitizeHours, type HandLogEntry, type HoursSettings,
} from '../lib/dashboard/hours';

/**
 * The Dashboard (BIG-6) — its own store, its own localStorage key, and its own
 * Firestore document (`lib/dashboardSync.ts`), **never `data/main`**.
 *
 * Not for the 1 MB budget alone. `mcp/` hydrates `data/main` into the app's
 * store on the laptop and writes the whole document back after every Atlas
 * call, through `hydrateFromPayload`; a slice added there that one of the two
 * paths forgot would be written back as its default and wipe his layout the
 * first time Atlas touched a task. In a document Atlas never opens, it cannot.
 *
 * `notNow` is every "Not now" pressed on the one-thing card. It hides a task
 * for the rest of that day, and it is kept — capped — because what he declines
 * is one of BIG-8's five learning signals.
 *
 * `hours` and `timeLog` are 29-1b's: the weekly hours, today's override, and
 * time he logged by hand. They are here rather than in `data/main` for the
 * same reason, and the hand log is not in `focusLog` because hand-logged time
 * counts on the Dashboard only (his call) — `focusLog` feeds a task's "time
 * taken" and a client's share link. **Today's hours are one number with
 * `sessionDuration`**; `lib/dashboard/todayHours.ts` keeps that true, so set
 * them through it, not `setOverride` alone.
 *
 * The document is written whole, last write wins, like the layout: two
 * devices logging time by hand while both offline keep the later one's.
 *
 * `firstRun` is 29-1c4's: `'ask'` on a new account's first document, until
 * the three questions are answered or skipped on either device. It is only
 * ever set where the cloud had no Dashboard at all (`lib/dashboardSync.ts`),
 * so an account that already had one is never asked — his call, new accounts
 * only. Absent, never `undefined`: Firestore refuses the value.
 */
const NOT_NOW_CAP = 300;
/** Years of a few entries a day, and still a small document. */
const TIME_LOG_CAP = 3000;

export interface DashboardDoc {
  blocks: DashboardBlock[];
  notNow: NotNow[];
  hours: HoursSettings;
  timeLog: HandLogEntry[];
  firstRun?: 'ask';
}

/** The document as it is written: `firstRun` absent rather than `undefined`. */
export function dashboardDocOf(s: DashboardDoc): DashboardDoc {
  const doc: DashboardDoc = { blocks: s.blocks, notNow: s.notNow, hours: s.hours, timeLog: s.timeLog };
  if (s.firstRun === 'ask') doc.firstRun = 'ask';
  return doc;
}

interface DashboardState extends DashboardDoc {
  /** At the end, unless `at` — the place he dragged it to from the shelf (29-1P13). */
  addBlock: (kind: BlockKind, settings?: BlockSettings, at?: number) => string;
  removeBlock: (id: string) => void;
  moveBlock: (id: string, toIndex: number) => void;
  resizeBlock: (id: string, w: number, h: number) => void;
  updateSettings: (id: string, settings: BlockSettings) => void;
  passOn: (taskId: string, at?: number) => void;
  /** One weekday's default, 0 = Sunday. */
  setWeekly: (weekday: number, seconds: number) => void;
  /** A day's override; `null` goes back to the weekday's default. Old ones are pruned against `day`. */
  setOverride: (day: string, seconds: number | null) => void;
  logTime: (entry: Omit<HandLogEntry, 'id' | 'at'>) => void;
  removeTimeLog: (id: string) => void;
  /** The cloud sync adopting what the server holds. */
  adopt: (doc: DashboardDoc) => void;
  /** A new account's first Dashboard: ask the three questions (29-1c4). */
  askFirstRun: () => void;
  /**
   * The questions answered — the layout and weekly hours they built — or
   * skipped (nothing passed), which keeps the default. Either way never again.
   */
  finishFirstRun: (setup?: { blocks: DashboardBlock[]; weekly: number[] }) => void;
}

const newId = () => crypto.randomUUID();

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      blocks: defaultLayout(newId),
      notNow: [],
      hours: defaultHours(),
      timeLog: [],

      addBlock: (kind, settings, at) => {
        const spec = BLOCK_SPECS[kind];
        const id = newId();
        const block: DashboardBlock = { id, kind, w: spec.defaultW, h: spec.defaultH, ...(settings ? { settings } : {}) };
        /* At the end unless he dragged it somewhere: adding never moves
           anything he placed but by his own hand. */
        set((s) => {
          const blocks = [...s.blocks];
          blocks.splice(at === undefined ? blocks.length : Math.max(0, Math.min(blocks.length, at)), 0, block);
          return { blocks };
        });
        return id;
      },

      removeBlock: (id) => set((s) => ({ blocks: s.blocks.filter((b) => b.id !== id) })),

      moveBlock: (id, toIndex) => set((s) => ({ blocks: moveBlock(s.blocks, id, toIndex) })),

      resizeBlock: (id, w, h) =>
        set((s) => ({
          blocks: s.blocks.map((b) => (b.id === id ? { ...b, ...clampSize(b.kind, w, h) } : b)),
        })),

      /* A setting passed as `undefined` is removed, not stored — "back to the
         busiest project" — since Firestore refuses an undefined value. */
      updateSettings: (id, settings) =>
        set((s) => ({
          blocks: s.blocks.map((b) => {
            if (b.id !== id) return b;
            const merged: Record<string, unknown> = { ...b.settings, ...settings };
            for (const key of Object.keys(merged)) if (merged[key] === undefined) delete merged[key];
            return { ...b, settings: merged as BlockSettings };
          }),
        })),

      passOn: (taskId, at = Date.now()) =>
        set((s) => ({ notNow: [...s.notNow, { taskId, at }].slice(-NOT_NOW_CAP) })),

      setWeekly: (weekday, seconds) =>
        set((s) => {
          const weekly = [...s.hours.weekly];
          weekly[weekday] = clampDay(seconds);
          return { hours: { ...s.hours, weekly } };
        }),

      setOverride: (day, seconds) =>
        set((s) => {
          const overrides = pruneOverrides(s.hours.overrides, day);
          if (seconds === null) delete overrides[day];
          else overrides[day] = clampDay(seconds);
          return { hours: { ...s.hours, overrides } };
        }),

      logTime: (entry) =>
        set((s) => {
          const record: HandLogEntry = { id: newId(), day: entry.day, seconds: Math.max(0, Math.round(entry.seconds)), label: entry.label, at: Date.now() };
          /* Absent, never `undefined`: Firestore refuses the value. */
          if (entry.taskId) record.taskId = entry.taskId;
          if (entry.projectId) record.projectId = entry.projectId;
          return { timeLog: [...s.timeLog, record].slice(-TIME_LOG_CAP) };
        }),

      removeTimeLog: (id) => set((s) => ({ timeLog: s.timeLog.filter((e) => e.id !== id) })),

      adopt: (doc) => set({
        blocks: upgradeBlocks(doc.blocks), notNow: doc.notNow, hours: sanitizeHours(doc.hours), timeLog: sanitizeTimeLog(doc.timeLog),
        firstRun: doc.firstRun === 'ask' ? 'ask' : undefined,
      }),

      askFirstRun: () => set({ firstRun: 'ask' }),

      finishFirstRun: (setup) =>
        set((s) => (setup
          ? { firstRun: undefined, blocks: setup.blocks, hours: { ...s.hours, weekly: setup.weekly.map(clampDay) } }
          : { firstRun: undefined })),
    }),
    {
      name: 'base-dashboard',
      version: 3,
      partialize: (s) => dashboardDocOf(s),
      /* v1 had no hours and no hand log: they start at his defaults. v2 could
         hold `sample-countdown`, which is the real countdown since 29-2a. */
      migrate: (persisted) => {
        const state = persisted as Partial<DashboardDoc>;
        return {
          blocks: Array.isArray(state.blocks) ? upgradeBlocks(state.blocks) : defaultLayout(newId),
          notNow: Array.isArray(state.notNow) ? state.notNow : [],
          hours: sanitizeHours(state.hours),
          timeLog: sanitizeTimeLog(state.timeLog),
          ...(state.firstRun === 'ask' ? { firstRun: 'ask' } : {}),
        } as unknown as DashboardState;
      },
    },
  ),
);

function sanitizeTimeLog(raw: unknown): HandLogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is HandLogEntry =>
      !!e && typeof e.id === 'string' && typeof e.day === 'string' && Number.isFinite(e.seconds) && typeof e.label === 'string',
  );
}

/**
 * A document that came from the cloud, shaped well enough to adopt. One
 * written before 29-1b has no `hours` or `timeLog`; `adopt` fills them in,
 * and turns a sample whose real block is built into it (`upgradeBlocks`).
 */
export function isDashboardDoc(data: unknown): data is DashboardDoc {
  if (!data || typeof data !== 'object') return false;
  const d = data as DashboardDoc;
  return (
    Array.isArray(d.blocks) &&
    d.blocks.every((b) => b && typeof b.id === 'string' && (b.kind in BLOCK_SPECS || b.kind in RENAMED_KINDS) && Number.isFinite(b.w) && Number.isFinite(b.h)) &&
    Array.isArray(d.notNow)
  );
}
