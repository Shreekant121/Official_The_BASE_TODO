import * as React from 'react';

/**
 * Text-led section switching with a sliding underline.
 *
 * @startingPoint section="Navigation" subtitle="Sliding emerald underline with counts" viewport="700x160"
 */
export interface Tab {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  /** Mono count shown after the label. */
  count?: number;
}

export interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  tabs: Array<string | Tab>;
  value?: string;
  onChange?: (value: string) => void;
}

export declare function Tabs(props: TabsProps): JSX.Element;
