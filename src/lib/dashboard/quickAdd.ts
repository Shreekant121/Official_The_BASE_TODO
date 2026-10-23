/**
 * The quick-add block (29-1c1, idea 143: a brain-dump note) — pure, no React,
 * no store.
 *
 * HIS CALLS (2026-09-30, 2026-10-15)
 * ----------------------------------
 * - A note he jots into, one thing per line, with no titles or lists to pick.
 * - **One task per line** when he turns it into tasks.
 * - Into **a list chosen per block, Action Steps by default.** Filing each line
 *   somewhere of its own (calls to Admin, ideas to Someday) is Atlas's, with
 *   BIG-8's title-only entry (step 31) — not this file's.
 *
 * What a line is, written down because a note is typed loosely: the bullets
 * and numbers people put in front of a list ("- ", "• ", "1. ", "[ ] ") are
 * not part of the task's name, and a blank line is not a task.
 */
import type { TaskList } from '../../store/useStore';

/** Where a block files its tasks when it names no list, or names one that is gone. */
export const QUICK_ADD_DEFAULT_LIST = 'action';

/** Longest note kept. A brain dump, not a document — and the Dashboard document is written whole. */
export const NOTE_MAX_CHARS = 4000;

/** Longest task name made from one line; the rest of a pasted paragraph is cut, not lost into a title. */
export const LINE_MAX_CHARS = 300;

/** A bullet, a tick box or a number in front of a line: "- ", "* ", "• ", "– ", "[ ] ", "[x] ", "1. ", "2) ". */
const LEADER = /^(?:[-*•–—]\s*)?(?:\[[ xX]?\]\s*)?(?:\d{1,3}[.)]\s+)?/;

/** One task name per line that has words on it, in the note's order. */
export function noteLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().replace(LEADER, '').trim().slice(0, LINE_MAX_CHARS).trim())
    .filter((line) => line.length > 0);
}

/**
 * The list a block files into: the one it names while that list still
 * exists, else Action Steps. A list deleted or archived since the block was
 * set up must not swallow his lines into nowhere.
 */
export function quickAddList(lists: readonly Pick<TaskList, 'id' | 'title'>[], listId: string | undefined): Pick<TaskList, 'id' | 'title'> {
  const picked = listId ? lists.find((l) => l.id === listId) : undefined;
  if (picked) return picked;
  return lists.find((l) => l.id === QUICK_ADD_DEFAULT_LIST) ?? { id: QUICK_ADD_DEFAULT_LIST, title: 'Action Steps' };
}

/** "Add 3 tasks", "Add 1 task". */
export function addLabel(count: number): string {
  return `Add ${count} task${count === 1 ? '' : 's'}`;
}
