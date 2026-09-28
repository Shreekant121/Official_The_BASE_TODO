import * as React from 'react';

/**
 * One task in the list the user lives in.
 *
 * @startingPoint section="Data" subtitle="Hover-lifting rows with drawing tick and revealed actions" viewport="700x280"
 */
export interface TaskRowProps extends React.HTMLAttributes<HTMLDivElement> {
  title: React.ReactNode;
  /** Secondary line — list name, due date, subtask count. */
  meta?: React.ReactNode;
  /** Allocated time, pre-formatted (`45 min`). Rendered in mono. */
  allocated?: React.ReactNode;
  /** A `<StatusPill>`, if the row needs one. */
  status?: React.ReactNode;
  done?: boolean;
  /** Selected for the session. Tints the row emerald. */
  selected?: boolean;
  /** Supplying this renders the completion box. */
  onToggle?: () => void;
  /** Icon buttons revealed on hover. */
  actions?: React.ReactNode;
}

export declare function TaskRow(props: TaskRowProps): JSX.Element;
