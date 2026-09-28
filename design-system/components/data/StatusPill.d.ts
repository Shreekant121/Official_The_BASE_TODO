import * as React from 'react';

/**
 * Task or session state as a tinted glass pill.
 *
 * @startingPoint section="Data" subtitle="Seven semantic states; live ones ripple" viewport="700x130"
 */
export interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Maps to the `--status-*` tokens. `running` and `overrun` ripple. */
  status?: 'running' | 'queued' | 'review' | 'done' | 'overrun' | 'backburner' | 'archived';
  size?: 'sm' | 'md';
  /** Show the leading dot. Defaults to true. */
  dot?: boolean;
  /** Override the label. Defaults to the status name. */
  children?: React.ReactNode;
}

export declare function StatusPill(props: StatusPillProps): JSX.Element;
