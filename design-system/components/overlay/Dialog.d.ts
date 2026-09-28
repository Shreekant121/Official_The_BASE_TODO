import * as React from 'react';

/**
 * Modal sheet of heavy glass over a blurred page.
 *
 * @startingPoint section="Overlay" subtitle="Condensing modal on a blurred backdrop" viewport="700x360"
 */
export interface DialogProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  title?: React.ReactNode;
  /** One muted sentence under the title. */
  description?: React.ReactNode;
  /** Called on Escape, backdrop click, and by your own buttons. */
  onClose?: () => void;
  /** Footer buttons, right-aligned. */
  actions?: React.ReactNode;
  width?: number;
}

export declare function Dialog(props: DialogProps): JSX.Element;
