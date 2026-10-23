/**
 * One badge at a time (29-1P7a, idea 162, from iOS's notification stacks).
 *
 * A task card could carry Red Alert, an Emergency mark and its score side by
 * side, and three chips shouting at once is the same as none. This shows the
 * first badge it is given and folds the rest into a small "+N"; point at the
 * +N (or tap it) and the others slide out beside it, move away and they fold
 * back. **The caller decides the order** — his, 2026-10-13: Red Alert, then
 * Emergency, then the score — and passes only the badges that are really
 * there: a `<RedAlertBadge redAlert={false}>` is an element that draws
 * nothing, and handing one in would count it.
 *
 * Every badge is in the page from the start, folded to no width, so opening is
 * a transition on width and opacity only while it happens; nothing runs at
 * rest. The +N is a real button: a keyboard reaches it, and a press on it
 * neither opens the card under it nor starts a drag (`cardPress.ts`,
 * `SortableList`'s sensors both let a button keep its press).
 *
 * A finger has no "move away", so on touch the fold closes on the next press
 * anywhere outside it.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

export interface BadgeFoldItem {
  key: string;
  node: ReactNode;
}

export interface BadgeFoldProps {
  /** Most important first. Falsy entries are skipped, so `cond && {...}` reads naturally. */
  items: Array<BadgeFoldItem | false | null | undefined>;
  /** Space between badges once they are out. */
  gap?: number;
  style?: CSSProperties;
}

const OPEN_MAX = 180;

export function BadgeFold({ items, gap = 8, style }: BadgeFoldProps) {
  const shown = items.filter((i): i is BadgeFoldItem => !!i);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const hidden = shown.length - 1;

  /* A finger's fold closes on the next press outside it. */
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open]);

  if (shown.length === 0) return null;
  if (hidden === 0) return <>{shown[0].node}</>;

  const ease = 'var(--ease-springy)';
  return (
    <span
      ref={root}
      data-badge-fold={open ? 'open' : 'folded'}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') setOpen(false); }}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false); }}
      style={{ display: 'inline-flex', alignItems: 'center', flex: '0 0 auto', minWidth: 0, ...style }}
    >
      {shown.map((item, i) => (
        <span
          key={item.key}
          aria-hidden={i > 0 && !open ? true : undefined}
          style={i === 0 ? { display: 'inline-flex', flex: '0 0 auto' } : {
            display: 'inline-flex', flex: '0 0 auto', overflow: 'hidden',
            maxWidth: open ? OPEN_MAX : 0,
            marginLeft: open ? gap : 0,
            opacity: open ? 1 : 0,
            transition: `max-width 0.4s ${ease}, margin-left 0.4s ${ease}, opacity 0.3s var(--ease-glass)`,
          }}
        >
          {item.node}
        </span>
      ))}
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Fold the badges' : `Show ${hidden} more badge${hidden === 1 ? '' : 's'}`}
        tabIndex={open ? -1 : 0}
        onPointerEnter={(e) => { if (e.pointerType === 'mouse') setOpen(true); }}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        style={{
          flex: '0 0 auto', display: 'inline-grid', placeItems: 'center',
          height: 20, padding: open ? 0 : '0 7px', border: 0, cursor: 'pointer',
          overflow: 'hidden',
          maxWidth: open ? 0 : 40,
          marginLeft: open ? 0 : gap - 2,
          opacity: open ? 0 : 1,
          borderRadius: 'var(--r-pill)',
          backgroundImage: 'var(--glass-well)',
          boxShadow: 'var(--glass-well-shadow)',
          color: 'var(--fg-3)',
          font: 'var(--type-kicker)', fontVariantNumeric: 'tabular-nums',
          transition: `max-width 0.4s ${ease}, margin-left 0.4s ${ease}, padding 0.4s ${ease}, opacity 0.2s var(--ease-glass)`,
        }}
      >
        +{hidden}
      </button>
    </span>
  );
}
