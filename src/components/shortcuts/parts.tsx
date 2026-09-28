/**
 * The shortcut sheet's material, shared by its two views — the list of
 * what is live (`contexts/ShortcutsContext.tsx`) and the editor (BUILD-10,
 * `ShortcutsEditor.tsx`). Moved here verbatim from the context file so the
 * two cannot drift into two looks for one sheet.
 */
import { Children, isValidElement, type ReactNode } from 'react';

/* A keycap is a raised object, so it takes a fill and a rim — never the
   well treatment, which would read as something you type into. (The
   editor's key field is the one cap you DO type into, and takes the well.) */
export function Cap({ children, quiet }: { children: ReactNode; quiet?: boolean }) {
  if (quiet) {
    return <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', padding: '0 2px' }}>{children}</span>;
  }
  return (
    <span
      style={{
        display: 'grid',
        placeItems: 'center',
        minWidth: 28,
        height: 28,
        padding: '0 var(--sp-3)',
        borderRadius: 'var(--r-sm)',
        backgroundImage: 'var(--glass-fill-2)',
        boxShadow: 'var(--glass-rim-2), var(--glass-cast-1)',
        font: 'var(--type-numeric)',
        fontSize: 'var(--text-xs)',
        color: 'var(--fg-1)',
      }}
    >
      {children}
    </span>
  );
}

/** A row of caps, with `then` drawn unboxed. */
export function Caps({ keys }: { keys: string[] }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flex: '0 0 auto' }}>
      {keys.map((k, j) => <Cap key={j} quiet={k === 'then'}>{k}</Cap>)}
    </span>
  );
}

/** One kicker-labelled group of rows, in a single hairline-ruled trough. */
export function Trough({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-4)' }}>
      <span className="ag-kicker" style={{ color: 'var(--fg-4)' }}>{label}</span>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          borderRadius: 'var(--r-lg)',
          backgroundImage: 'var(--glass-fill-1)',
          boxShadow: 'var(--glass-rim-1)',
          padding: '0 var(--sp-6)',
        }}
      >
        {Children.toArray(children).map((child, i) => (
          /* The child's own key (made unique by `toArray`), so removing a
             row does not hand the next row's field to a new element. The
             hairline is an inset shadow, not a border: a border on this
             wrapper sits outside the row's 46px and grows every row by one. */
          <div
            key={isValidElement(child) ? child.key ?? i : i}
            style={{ boxShadow: i === 0 ? 'none' : 'inset 0 1px 0 var(--line-faint)' }}
          >
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A trough row: the label (and an optional caption under it) left, `end` right. */
export function Row({ label, caption, end }: { label: ReactNode; caption?: ReactNode; end?: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-5)',
        minHeight: 46,
        padding: 'var(--sp-3) 0',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
        <span
          style={{
            font: 'var(--type-body)',
            fontSize: 'var(--text-sm)',
            color: 'var(--fg-2)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {label}
        </span>
        {caption && <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>{caption}</span>}
      </span>
      {end}
    </div>
  );
}
