import * as React from 'react';

/**
 * A notification that expands in place instead of opening elsewhere.
 *
 * @startingPoint section="Feedback" subtitle="Collapsed rows that morph open to reveal body and actions" viewport="700x300"
 */
export interface NotificationCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Leading glyph, wrapped in a glass disc. */
  icon?: React.ReactNode;
  title: React.ReactNode;
  /** Relative timestamp, mono (`2m`, `1h`). */
  time?: React.ReactNode;
  /** Truncated to one line when collapsed, shown in full when open. */
  body?: React.ReactNode;
  /** Buttons revealed in the expanded state. */
  actions?: React.ReactNode;
  /** Tints the icon only — the card stays neutral. */
  tone?: 'neutral' | 'accent' | 'review' | 'overrun';
  /** Shows the unread dot. */
  unread?: boolean;
  defaultOpen?: boolean;
  /** Controlled mode. */
  open?: boolean;
  onToggle?: (open: boolean) => void;
}

export declare function NotificationCard(props: NotificationCardProps): JSX.Element;
