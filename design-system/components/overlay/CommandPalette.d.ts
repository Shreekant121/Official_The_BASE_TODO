import * as React from 'react';

/**
 * ⌘K search over tasks and commands.
 *
 * @startingPoint section="Overlay" subtitle="Filtering palette with keyboard navigation" viewport="700x420"
 */
export interface Command {
  value?: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  /** Uppercase category shown on the right, also searchable. */
  group?: string;
  shortcut?: React.ReactNode;
  onSelect?: () => void;
}

export interface CommandPaletteProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  commands: Command[];
  placeholder?: string;
  onClose?: () => void;
  /** Fires after a command is chosen, in addition to its own `onSelect`. */
  onRun?: (command: Command) => void;
}

export declare function CommandPalette(props: CommandPaletteProps): JSX.Element;
