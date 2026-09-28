import * as React from 'react';

/**
 * Binary toggle — trough fills with accent light as the knob travels.
 *
 * @startingPoint section="Forms" subtitle="Spring-driven toggle with an emitting on-state" viewport="700x140"
 */
export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
  /** Optional trailing label. Wraps the control in a <label>. */
  label?: React.ReactNode;
}

export declare function Switch(props: SwitchProps): JSX.Element;
