import * as React from 'react';

export interface TaskSheetSubtask {
  id: string;
  title: string;
  done: boolean;
}

export interface TaskSheetLink {
  /** Shown instead of the URL when present. Keep it to two or three words. */
  label?: string;
  url: string;
}

export interface TaskSheetRepeat {
  every: number;
  unit: 'days' | 'weeks' | 'months' | 'years';
  /** 0–6, Sunday first. Only read when unit is 'weeks'. */
  days?: number[];
  ends: 'never' | 'after';
  /** Occurrence count when ends is 'after'. */
  count?: number;
}

export interface TaskSheetTask {
  id?: string;
  title: string;
  /** Breadcrumb head. Omit inside a single-project surface. */
  project?: string;
  list: string;
  status: 'todo' | 'doing' | 'done';
  /** Eisenhower quadrant — worth 1–4 points. null shows as a Needs chip. */
  quadrant?: 'schedule' | 'do' | 'eliminate' | 'delegate' | null;
  /** 1–5. The only subjective input in the score. */
  importance?: number;
  /** Rupees. Rolls up into the list and project totals. */
  value?: number;
  /** Someone else is blocked until this lands. Worth 1 point. */
  quasi?: boolean;
  /** datetime-local string. The Deadline factor is DERIVED from it. */
  deadline?: string;
  start?: string;
  /** Minutes. Over 120 costs half a point. */
  est?: number | '';
  desc?: string;
  notes?: string;
  repeat?: TaskSheetRepeat | null;
  /** Which occurrence of the series this instance is. */
  occurrence?: number | null;
  reminder?: string;
  /** Triage lists this task also appears in. */
  shared?: string[];
  /** Title of the prerequisite task. A soft warning, never a block. */
  blockedBy?: string;
  assignee?: string | null;
  tags?: string[];
  links?: TaskSheetLink[];
  subtasks?: TaskSheetSubtask[];
  publicLink?: string | null;
  visibleInShared?: boolean;
  cover?: string | null;
}

export interface TaskSheetProps {
  /** The task to edit. Changing the object identity re-seeds the sheet. */
  task: TaskSheetTask | null;
  /** List names for the "List" picker. */
  lists?: string[];
  /** Triage list names for "Also shown in". */
  shareLists?: string[];
  /** Candidate prerequisite task titles. */
  prereqs?: string[];
  /** Pin "now" for deadline maths — pass a fixed ISO string in mocks. */
  now?: string | Date;
  onClose?: () => void;
  /** Receives the edited task. Falls back to onClose when omitted. */
  onSave?: (task: TaskSheetTask) => void;
  /** Fired from the footer confirm strip, never from the trash icon. */
  onDelete?: (task: TaskSheetTask) => void;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Every field of one task, on one sheet of heavy glass. Header states what
 * the task is, three columns carry score inputs / the work / timing and
 * context, footer carries the two verbs. Score, deadline points and the
 * "still needed" count are derived — never typed.
 */
export declare function TaskSheet(props: TaskSheetProps): JSX.Element | null;
