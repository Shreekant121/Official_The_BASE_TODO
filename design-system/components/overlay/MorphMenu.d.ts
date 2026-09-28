import * as React from 'react';

/**
 * A menu that morphs out of its own trigger.
 *
 * @startingPoint section="Overlay" subtitle="Pill-to-card morph, grouped items, in-place confirm" viewport="700x560"
 */
export interface MorphMenuItem {
  value?: string;
  label?: React.ReactNode;
  icon?: React.ReactNode;
  /** Right-aligned mono hint, e.g. `⌘K`. */
  shortcut?: React.ReactNode;
  /** Right-aligned mono value — a current setting, e.g. `₹1.6L`. Never both this and `shortcut`. */
  meta?: React.ReactNode;
  /** `danger` renders the item in rose. */
  tone?: 'default' | 'danger';
  onSelect?: () => void;
  /**
   * Destructive items arm in place instead of opening a dialog: the row
   * collapses and this strip grows in its slot. Escape disarms before it
   * closes the menu.
   */
  confirm?: {
    /** Name the object. "Delete Studio Launch?" — never "Are you sure?". */
    label: React.ReactNode;
    /** One line on what is lost. */
    hint?: React.ReactNode;
    /** Confirm button copy. Defaults to `Delete`. */
    action?: string;
    onConfirm?: () => void;
  };
  /** Label swapped in for 1.4s on select; the menu stays open. For "Copy link" → "Link copied". */
  flash?: React.ReactNode;
  flashIcon?: React.ReactNode;
  /** Renders a separator instead of an item. */
  divider?: boolean;
  /** Renders an uppercase mono group label instead of an item. */
  section?: React.ReactNode;
}

export interface MorphMenuProps extends React.HTMLAttributes<HTMLDivElement> {
  /** The clickable element — usually an `IconButton` or `Button`. */
  trigger: React.ReactNode;
  items: MorphMenuItem[];
  /**
   * The object being acted on, restated inside the panel. Required
   * whenever the menu can cover its own subject (any card menu).
   */
  header?: { title: React.ReactNode; meta?: React.ReactNode; badge?: React.ReactNode } | React.ReactNode;
  /** Which trigger edge the panel hangs from. */
  align?: 'start' | 'end';
  width?: number;
  /** Controlled mode. Use it to keep one menu open at a time in a grid. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export declare function MorphMenu(props: MorphMenuProps): JSX.Element;
