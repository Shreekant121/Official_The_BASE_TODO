/**
 * Aurora Glass — TaskRow
 * Ported from design-system/components/data/TaskRow.{jsx,d.ts} at UI-33.
 * Guidance: design-system/components/data/TaskRow.prompt.md
 *
 * *"The atom of the product — one task, scannable in a stack of forty."*
 * `screens/assistant.html` is what finally asked for it: the assistant's
 * answer to "what am I doing today?" is not a sentence, it is the rows
 * themselves, and UI-8 had no way to draw them.
 *
 * Taken from the real file, in full: the 64px floor, `--r-md`, hairline
 * `--glass-fill-1` lifting to `--glass-fill-2` on hover with the cast shadow
 * arriving at the same moment, `--glass-tint-accent` + `--glow-accent-sm`
 * when `selected`, the 0.55 dim under `done`, the 2px slide right on hover,
 * the mono `allocated` reading and the order the three trailing slots sit in.
 * `prompt.md` is why the row is `level={1}` and not `2`: *"a stack of them
 * doesn't turn into a wall of frosted panes."*
 *
 * THREE THINGS KEPT OVER THE PROTOTYPE
 *
 * 1. **The tick box is `Checkbox`.** The prototype hand-rolls a 24px box with
 *    a `stroke-dashoffset` tick — which is `forms/Checkbox` exactly, down to
 *    the `--r-xs` radius, the `--glass-well` trough and the emerald fill under
 *    `--glow-accent-sm`. UI-32 ported that component; drawing it a second time
 *    here would fork the app's most-pressed control and lose the focus-ring
 *    forwarding the prototype has no version of.
 *
 * 2. **Actions are revealed by `.ag-card-actions`, not by React hover state.**
 *    `prompt.md` asks for two behaviours — hidden until hover, *"and on tablet,
 *    render them always-visible instead, since there is no hover"* — and the
 *    prototype implements only the first. The app already answers both in one
 *    place (`ui/screens.css`), including `:focus-within`, which is what stops
 *    keyboard focus landing on an invisible control.
 *
 * 3. **`title` is not clamped to one line by `white-space: nowrap`.** The
 *    prototype ellipsises; a task title that is a whole sentence is the norm
 *    here, so it wraps and the row grows. The 64px is a floor, which is what
 *    `minHeight` means.
 */
import { useState } from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { Checkbox } from '../forms/Checkbox';
import { Strike } from '../forms/Strike';

/**
 * `title` is omitted from the DOM attributes and redeclared: the `.d.ts`
 * declares it `React.ReactNode` while `HTMLAttributes` has it as the tooltip
 * `string`, and the two cannot both be true. The component's meaning wins —
 * a caller that wants a tooltip has `aria-label` and the row's own text.
 */
export interface TaskRowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  /** Secondary line — list name, due date, subtask count. */
  meta?: ReactNode;
  /** Allocated time, pre-formatted with its unit (`45 min`). Rendered in mono. */
  allocated?: ReactNode;
  /** A `<StatusPill>`, if the row needs one. */
  status?: ReactNode;
  done?: boolean;
  /** Chosen for this session. Tints the row emerald — see `prompt.md`. */
  selected?: boolean;
  /** Supplying this renders the completion box. */
  onToggle?: () => void;
  /** Icon buttons, revealed on hover and always shown on a touch screen. */
  actions?: ReactNode;
}

export function TaskRow({
  title,
  meta,
  allocated,
  status,
  done = false,
  selected = false,
  onToggle,
  actions,
  className = '',
  style,
  ...rest
}: TaskRowProps) {
  const [hover, setHover] = useState(false);

  const shell: CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-5)',
    minHeight: 64,
    padding: 'var(--sp-4) var(--sp-6)',
    borderRadius: 'var(--r-md)',
    backgroundImage: selected
      ? 'var(--glass-tint-lime)'
      : hover
        ? 'var(--glass-fill-2)'
        : 'var(--glass-fill-1)',
    backdropFilter: 'var(--glass-bd-sm)',
    WebkitBackdropFilter: 'var(--glass-bd-sm)',
    boxShadow: selected
      ? 'var(--glass-rim-2), var(--job-lime-shine)'
      : hover
        ? 'var(--glass-rim-2), var(--glass-cast-2)'
        : 'var(--glass-rim-1)',
    opacity: done ? 0.55 : 1,
    transform: hover ? 'translateX(2px)' : 'translateX(0)',
    transition: 'var(--t-hover)',
    ...style,
  };

  return (
    <div
      className={['ag-card', className].filter(Boolean).join(' ')}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={shell}
      {...rest}
    >
      {onToggle && (
        <Checkbox
          checked={done}
          onChange={onToggle}
          aria-label={done ? 'Mark not done' : 'Mark done'}
        />
      )}

      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
        <span
          style={{
            font: 'var(--type-body)',
            color: done ? 'var(--fg-3)' : 'var(--fg-1)',
            overflowWrap: 'anywhere',
          }}
        >
          {/* 29-1P4b: a line that slides through rather than a line-through. */}
          <Strike on={done}>{title}</Strike>
        </span>
        {meta != null && (
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', overflowWrap: 'anywhere' }}>
            {meta}
          </span>
        )}
      </div>

      {allocated != null && (
        <span
          style={{
            font: 'var(--type-numeric)',
            fontSize: 'var(--text-sm)',
            color: 'var(--fg-3)',
            fontVariantNumeric: 'tabular-nums',
            flex: '0 0 auto',
          }}
        >
          {allocated}
        </span>
      )}
      {status}
      {actions && (
        <div className="ag-card-actions" style={{ display: 'flex', gap: 'var(--sp-2)', flex: '0 0 auto' }}>
          {actions}
        </div>
      )}
    </div>
  );
}
