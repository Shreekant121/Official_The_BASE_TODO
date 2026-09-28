import * as React from 'react';

/**
 * Floating pill navigation with a morphing active indicator.
 *
 * @startingPoint section="Navigation" subtitle="Floating icon rail, horizontal or vertical" viewport="700x220"
 */
export interface MiniNavItem {
  value: string;
  /** Also used as the accessible name. */
  label: string;
  icon: React.ReactNode;
  /** Any non-null value renders an alert dot. */
  badge?: unknown;
}

export interface MiniNavProps extends React.HTMLAttributes<HTMLElement> {
  items: MiniNavItem[];
  value?: string;
  onChange?: (value: string) => void;
  orientation?: 'horizontal' | 'vertical';
  /** Adds tiny uppercase labels under each icon. */
  showLabels?: boolean;
}

export declare function MiniNav(props: MiniNavProps): JSX.Element;
