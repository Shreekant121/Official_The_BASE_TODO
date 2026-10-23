/**
 * Shortcut keys in menus (idea 18, 29-1P6a, BIG-15; macOS, Linear). A menu
 * row with a key draws it at its end as little raised keys — `G` `H` for a
 * go-to sequence, one cap for a single key — so the key is learnt by using
 * the menu. `MorphMenu` rows (`shortcut`) and the Ctrl+K palette's commands
 * (`keys`) draw it; which key is whose comes from `lib/shortcutBindings.ts`,
 * never from the row, so a key he moved shows where he moved it.
 *
 * Laptop only: with no fine pointer there is no keyboard to press them on,
 * and the tablet's rows stay as they were.
 *
 * Smaller than the shortcut sheet's own caps (`components/shortcuts/parts.tsx`,
 * 28px) because they sit inside a 46px row, but the same object: a fill and a
 * rim, raised, never a well.
 */
import type { CSSProperties } from 'react';
import { useMedia } from '../useMedia';

const CAP: CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  minWidth: 20,
  height: 20,
  padding: '0 5px',
  borderRadius: 6,
  backgroundImage: 'var(--glass-fill-2)',
  /* The rim, and a darker lip along the foot: a key stands up off the row. */
  boxShadow: 'var(--glass-rim-2), 0 1.5px 0 oklch(0 0 0 / 0.45)',
  font: 'var(--type-numeric)',
  fontSize: 10.5,
  lineHeight: 1,
  color: 'var(--fg-2)',
};

export function KeyCaps({ keys, style }: { keys: string[]; style?: CSSProperties }) {
  const keyboard = useMedia('(hover: hover) and (pointer: fine)');
  if (!keyboard || keys.length === 0) return null;
  return (
    <span
      aria-label={`Shortcut: ${keys.join(' then ')}`}
      style={{ display: 'flex', alignItems: 'center', gap: 3, flex: '0 0 auto', ...style }}
    >
      {keys.map((k, i) => <span key={i} aria-hidden="true" style={CAP}>{k}</span>)}
    </span>
  );
}
