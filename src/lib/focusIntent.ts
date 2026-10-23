/**
 * "When this ends, I'll have…" — the line he writes before a task's clock
 * starts, and what Mark done asks him about it (29-1P10a, idea 96).
 *
 * Pure: no store, no clock. `useFocusRun` holds the line while the task is on
 * the clock and calls `stampFocusEntry` when the task leaves it.
 *
 * WHERE THE LINE IS KEPT
 * ----------------------
 * On the focus log, for step 30's prime time — but on **one** entry per task
 * run, the last one, never on every stretch. The log lives in `data/main`
 * (1 MB, up to 5000 entries); an 80-character line on every pause-and-resume
 * stretch could have spent 400 KB of it. So the run keeps the line in memory
 * and, when the task leaves the clock (done, skipped, deferred, replaced),
 * writes it onto the latest entry it banked for that task — with the answer,
 * when Mark done asked one.
 *
 * His call, 2026-10-14: **"Not yet" keeps the task open**, so it is never an
 * answer that reaches the log — only Yes and Partly finish a task.
 */
import type { FocusLogEntry } from '../store/useStore';

/** What Mark done's question can end on. "Not yet" cancels the press instead. */
export type FocusOutcome = 'yes' | 'partly';

/** A line, not a paragraph: what the box takes and what the log keeps. */
export const INTENT_MAX = 80;

/** How long the one breath lasts before the clock starts (idea 95): in, then out. */
export const SETTLE_MS = 5000;
/** When "Breathe in…" turns into "…and out." */
export const SETTLE_TURN_MS = 2500;

/** Trimmed, one line, capped. An empty answer is no answer. */
export function cleanIntent(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, INTENT_MAX);
}

/**
 * Mark done's question, in his own words: "You said you'd have uploaded the
 * signed forms. Did you?" A full stop he typed is dropped, so it never reads
 * "forms.. Did you?".
 */
export function doneQuestion(intent: string): string {
  const line = cleanIntent(intent).replace(/[.!?…]+$/, '');
  return `You said you’d have ${line}. Did you?`;
}

/**
 * The log with the line (and the answer) written onto the latest entry for
 * `taskId` that ended at or after `since` — this run of the task, never an
 * older session's. The same array when there is nothing to write or no such
 * entry (a task skipped before its clock ever ran has no stretch to carry it).
 */
export function stampFocusEntry(
  log: FocusLogEntry[],
  taskId: string,
  since: number,
  patch: { intent?: string; outcome?: FocusOutcome },
): FocusLogEntry[] {
  const intent = patch.intent ? cleanIntent(patch.intent) : '';
  if (!intent && !patch.outcome) return log;
  for (let i = log.length - 1; i >= 0; i--) {
    const entry = log[i];
    if (entry.taskId !== taskId) continue;
    if (entry.endedAt < since) return log;
    /* Never an `undefined` value: Firestore refuses the whole document. */
    const next: FocusLogEntry = { ...entry };
    if (intent) next.intent = intent;
    if (patch.outcome) next.outcome = patch.outcome;
    const copy = log.slice();
    copy[i] = next;
    return copy;
  }
  return log;
}
