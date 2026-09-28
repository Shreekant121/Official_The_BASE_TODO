import * as React from 'react';

/**
 * Transient confirmation pill.
 *
 * @startingPoint section="Feedback" subtitle="Condensing confirmation pills" viewport="700x180"
 */
export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: React.ReactNode;
  /** Optional muted second line. */
  detail?: React.ReactNode;
  tone?: 'accent' | 'review' | 'overrun' | 'neutral';
  /** Renders the dismiss button. */
  onDismiss?: () => void;
}

export declare function Toast(props: ToastProps): JSX.Element;
