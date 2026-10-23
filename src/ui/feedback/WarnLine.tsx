/**
 * A warning in a line of text: "needs a look", said quietly.
 *
 * 29-1P2c2, his call: **warnings are grey with their icon.** They used to be
 * amber (the old `--status-review`, hue 82), which is gold's exact hue, and yellow is
 * saved for gold (rewards). Once the colour is gone the glyph is the whole
 * signal, so a warning that was only coloured words gets this: the triangle,
 * then the words, both in `--status-warn`.
 *
 * Only for a warning. Something that failed or broke is coral
 * (`--status-overrun`), and a plain caption is just a caption.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from '../core/Icon';

export interface WarnLineProps {
  children: ReactNode;
  /** `p` for a sentence on its own, `span` inside a field's stack. */
  as?: 'p' | 'span';
  /** Defaults to the warning triangle. */
  icon?: IconName;
  role?: 'alert' | 'status';
  style?: CSSProperties;
}

export function WarnLine({ children, as = 'p', icon = 'triangle-alert', role, style }: WarnLineProps) {
  const Tag = as;
  return (
    <Tag
      role={role}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-3)', margin: 0,
        font: 'var(--type-caption)', color: 'var(--status-warn)', textWrap: 'pretty',
        ...style,
      }}
    >
      <Icon name={icon} size={13} style={{ flex: '0 0 auto', marginTop: 2 }} />
      <span style={{ minWidth: 0 }}>{children}</span>
    </Tag>
  );
}
