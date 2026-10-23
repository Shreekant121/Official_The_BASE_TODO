/**
 * Aurora Glass — SegmentedControl
 * Ported from design-system/components/actions/SegmentedControl.{jsx,d.ts}.
 * Guidance: design-system/components/actions/SegmentedControl.prompt.md
 *
 * PORTED AT UI-29, not before, because nothing needed it. The design system
 * draws a firm line between the three exclusive controls and `Tabs` already
 * writes it down:
 *
 *   Tabs              → content SECTIONS, sliding underline.
 *   SegmentedControl  → MODES (Daily / Weekly), recessed trough.
 *   MiniNav           → top-level navigation, floats.
 *
 * `screens/project.html` puts Board / List on one of these, which is the
 * first MODE switch in the app: the same tasks, shaped two ways.
 *
 * The trough is deliberately *recessed* and the indicator *raised* — the
 * `prompt.md` says that inversion is what makes the mechanism legible — and
 * the pill animates `left` and `width` so it visibly travels between
 * positions rather than cross-fading.
 *
 * KEPT over the real file: the roving-tabindex keyboard model. The prototype
 * renders `role="tablist"` with plain buttons, so every segment is a tab stop
 * and neither arrow key does anything — a `tablist` that cannot be arrowed is
 * a lie to a screen reader. Arrow keys move and select, Home/End jump to the
 * ends, and only the selected segment is tabbable. Nothing visual changed.
 *
 * `look="soft"` (29-1P1, BIG-15) is the design system's "segmented,
 * pressed-in": the trough pressed into the page and the chosen one raised
 * out of it, in the soft material, rounded rectangles rather than pills. It
 * is the look for picking one of a few views — Board / List, Day / Week /
 * Month — and 29-1P2 moves every view switch onto it. Same keyboard model,
 * same travelling pad; `glass` stays the default so nothing moved here.
 */
import { useRef } from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

export interface SegmentedOption {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  /**
   * An icon-only segment's name (29-1P7c, the density switch): pass `label:
   * null`, and this becomes its accessible name and its tooltip, and the
   * segment drops the text-sized minimum width.
   */
  ariaLabel?: string;
}

export interface SegmentedControlProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** Plain strings, or objects for icon support. Two to four items — beyond that use `Tabs`. */
  options: Array<string | SegmentedOption>;
  /** Controlled selection. */
  value: string;
  onChange: (value: string) => void;
  size?: 'sm' | 'md';
  /** `glass` (default) or `soft`, the pressed-in look for view switches. */
  look?: 'glass' | 'soft';
}

const PAD = 4;

export function SegmentedControl({
  options = [],
  value,
  onChange,
  size = 'md',
  look = 'glass',
  className = '',
  style,
  ...rest
}: SegmentedControlProps) {
  const items: SegmentedOption[] = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const idx = Math.max(0, items.findIndex((o) => o.value === value));
  const h = size === 'sm' ? 34 : 44;
  const soft = look === 'soft';
  const pad = soft ? 5 : PAD;
  const radius = soft ? 'var(--r-md)' : 'var(--r-pill)';
  const inner = soft ? 'var(--r-sm)' : 'var(--r-pill)';

  /** Arrow keys move the selection, which is what `role="tablist"` promises. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1
      : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1
        : 0;
    let next = -1;
    if (step !== 0) next = (idx + step + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next < 0 || !items[next]) return;
    e.preventDefault();
    onChange(items[next].value);
    refs.current[items[next].value]?.focus();
  };

  return (
    <div
      role="tablist"
      className={className}
      onKeyDown={onKeyDown}
      style={{
        position: 'relative',
        display: 'inline-grid',
        gridAutoFlow: 'column',
        gridAutoColumns: '1fr',
        alignItems: 'stretch',
        padding: pad,
        height: soft ? h + 2 : h,
        borderRadius: radius,
        backgroundImage: soft ? 'var(--soft-fill)' : 'var(--glass-fill-1)',
        backdropFilter: soft ? undefined : 'var(--glass-bd-sm)',
        WebkitBackdropFilter: soft ? undefined : 'var(--glass-bd-sm)',
        /* Recessed: a rim and an inner shade, never a cast. */
        boxShadow: soft ? 'var(--soft-pressed)' : 'var(--glass-rim-1), inset 0 2px 8px -4px oklch(0.105 0.014 265 / 0.8)',
        ...style,
      }}
      {...rest}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: pad,
          bottom: pad,
          left: `calc(${pad}px + ${idx} * ((100% - ${pad * 2}px) / ${items.length || 1}))`,
          width: `calc((100% - ${pad * 2}px) / ${items.length || 1})`,
          borderRadius: inner,
          backgroundImage: soft ? 'var(--soft-fill-lift)' : 'var(--glass-fill-solid)',
          boxShadow: soft ? 'var(--soft-raised)' : 'var(--glass-rim-3), var(--glass-cast-1)',
          transition: 'left var(--dur-morph) var(--ease-morph), width var(--dur-morph) var(--ease-morph)',
        }}
      />
      {items.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => { refs.current[o.value] = el; }}
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            type="button"
            aria-label={o.ariaLabel}
            title={o.ariaLabel}
            onClick={() => onChange(o.value)}
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--sp-2)',
              minWidth: o.label == null ? (size === 'sm' ? 38 : 44) : size === 'sm' ? 66 : 84,
              padding: `0 ${size === 'sm' ? 'var(--sp-5)' : 'var(--sp-6)'}`,
              border: 0,
              background: 'transparent',
              borderRadius: inner,
              color: on ? 'var(--fg-1)' : 'var(--fg-3)',
              font: 'var(--type-label)',
              fontSize: size === 'sm' ? 'var(--text-xs)' : 'var(--text-sm)',
              cursor: 'pointer',
              transition: 'color var(--dur-base) var(--ease-glass)',
            } satisfies CSSProperties}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
