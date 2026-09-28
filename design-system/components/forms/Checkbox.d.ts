import * as React from 'react';

/**
 * Completion control. The tick draws on; the label strikes through.
 *
 * @startingPoint section="Forms" subtitle="Drawing tick with strike-through label" viewport="700x140"
 */
export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size'> {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  size?: 'sm' | 'md';
  disabled?: boolean;
  label?: React.ReactNode;
}

export declare function Checkbox(props: CheckboxProps): JSX.Element;
