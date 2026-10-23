/**
 * BUILD-18 — what a project's board shows while he filters it (audit D1, the
 * old "project-toggle filter in the project header").
 *
 * Pure — no store, no React — so `boardFilter.test.ts` holds the rule.
 * `pages/ProjectView.tsx` asks it once per row while building `tasksByList`,
 * which every list on the board, the table and the Backburner draw from, so one
 * box and one row of chips narrow all of them at once.
 *
 * THE WORDS are Ctrl+K's rule (`paletteSearch.ts`), so the two searches never
 * disagree: every word typed has to appear in the task's title, its
 * description, or the name of the list it is drawn in — accents and case off, a
 * half-typed word still matching. The list's name is Atlas's rule
 * (`search_tasks`: "a bare list name works as a query"), so typing a list's name
 * leaves that list whole.
 *
 * THE CHIPS are BASE's three statuses and nothing else — the design's "Review"
 * is not a status here. All is the board as it was, Show done included; any
 * other chip asks for exactly that status, so Done shows finished work even
 * with Show done off (the switch is greyed out while a chip is on).
 *
 * Nothing here is stored: a filter is a look, not a setting, and a board that
 * opened tomorrow still filtered would read as tasks gone missing.
 */
import { normalise } from './paletteSearch';
import type { TaskStatus } from '../store/useStore';

export type StatusChip = 'all' | 'todo' | 'progress' | 'done';

/** The chips, in the toolbar's order, with what each one says. */
export const STATUS_CHIPS: ReadonlyArray<readonly [StatusChip, string]> = [
  ['all', 'All'],
  ['todo', 'To do'],
  ['progress', 'In progress'],
  ['done', 'Done'],
];

const CHIP_STATUS: Record<Exclude<StatusChip, 'all'>, TaskStatus> = {
  todo: 'needsAction',
  progress: 'in-progress',
  done: 'completed',
};

export interface BoardFilter {
  /** What was typed, cut into normalised words. Empty when nothing was. */
  words: string[];
  status: StatusChip;
}

export const NO_FILTER: BoardFilter = { words: [], status: 'all' };

export function boardFilter(text: string, status: StatusChip): BoardFilter {
  const n = normalise(text);
  return { words: n === '' ? [] : n.split(' '), status };
}

/** True when the board is narrowed by anything — a word or a chip but All. */
export function isFiltering(filter: BoardFilter): boolean {
  return filter.words.length > 0 || filter.status !== 'all';
}

/** Whether finished rows can be on screen: All with Show done, or Done. */
export function showsFinished(filter: BoardFilter, showDone: boolean): boolean {
  return filter.status === 'all' ? showDone : filter.status === 'done';
}

interface FilterableTask {
  title: string;
  description?: string;
  status: TaskStatus;
}

/**
 * What the board says when the filter leaves nothing on it — a lit sentence
 * (29-1P14c, his approved words): `**` marks what lights (`ui/feedback/litParts.ts`),
 * and what he typed loses its asterisks so it cannot light anything itself.
 */
export function noMatchSentence(text: string, status: StatusChip): string {
  const typed = text.trim().replace(/\s+/g, ' ').replace(/\*/g, '');
  if (typed !== '') return `Nothing matches **“${typed}”**. Try **another word**, or clear the filter.`;
  return {
    all: '**No tasks** here.',
    todo: 'Nothing **left to do** here.',
    progress: 'Nothing is **in progress** right now.',
    done: 'Nothing **finished** yet.',
  }[status];
}

/** Whether one row stays on the board, drawn in the list called `listTitle`. */
export function passesBoardFilter(
  task: FilterableTask,
  listTitle: string,
  filter: BoardFilter,
  showDone: boolean,
): boolean {
  if (filter.status === 'all') {
    if (!showDone && task.status === 'completed') return false;
  } else if (task.status !== CHIP_STATUS[filter.status]) {
    return false;
  }
  if (filter.words.length === 0) return true;
  const text = normalise(`${task.title} ${task.description ?? ''} ${listTitle}`);
  return filter.words.every((word) => text.includes(word));
}
