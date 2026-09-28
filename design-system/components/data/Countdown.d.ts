import * as React from 'react';

/**
 * The focus-session clock. Light mono at display size.
 *
 * @startingPoint section="Data" subtitle="Session timer with overrun state" viewport="700x260"
 */
export interface CountdownProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Seconds remaining. Pass a negative number to render an overrun (`+02:14`, rose). */
  seconds: number;
  /** Total allocated seconds. Supplying it renders the progress track. */
  total?: number;
  /** Adds the soft white emission while the clock ticks. */
  running?: boolean;
  size?: 'md' | 'lg';
  label?: React.ReactNode;
}

export declare function Countdown(props: CountdownProps): JSX.Element;
