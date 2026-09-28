import * as React from 'react';

/**
 * Mutually exclusive choices in a glass trough, with an indicator pill
 * that travels between positions.
 *
 * @startingPoint section="Actions" subtitle="Morphing indicator pill for 2–4 exclusive choices" viewport="700x140"
 */
export interface SegmentedOption {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
}

export interface SegmentedControlProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Plain strings, or objects for icon support. Two to four items — beyond that use Tabs. */
  options: Array<string | SegmentedOption>;
  /** Controlled selection. Omit to let the control manage its own state. */
  value?: string;
  /** Fires with the newly selected value. */
  onChange?: (value: string) => void;
  size?: 'sm' | 'md';
}

export declare function SegmentedControl(props: SegmentedControlProps): JSX.Element;
