/**
 * The removable chip three of the task-field editors need (UI-13) — a tag, a
 * prerequisite, a list this task is also shown in.
 *
 * DERIVED FROM `StatusPill`, NOT A COPY OF IT, and the split is the whole
 * reason it exists. `StatusPill` is a READOUT of one of the seven task states,
 * so it sets its own label in the kicker face, uppercased, and cannot be
 * dismissed. These chips carry CONTENT — a task's title, a list's name, a tag
 * — which must not be uppercased or set in mono, and every one of them can be
 * removed. Same geometry, same hue vocabulary, a different job.
 *
 * **This module is what `fieldStyles.ts` became.** That file was a bag of
 * class strings, shared so the task card and the scoring page could not drift
 * apart the way their two copy-pasted versions had. Everything in it is now a
 * design-system component — `inputCls`/`pillInputCls` are both `Input` (the
 * system's control radius is already `--r-pill`, so the two were never really
 * different), `selectStyle` is `Input type="datetime-local"`, `labelCls` is
 * `FieldLabel` — except the chip, which is the one shape the design system has
 * no control for. So the chip is here, as a component built from tokens rather
 * than as a style object handed around.
 *
 * The tones are semantic and there are only three, which is the point:
 * `neutral` is the resting chip and carries no hue at all, `review` is a
 * warning — grey since 29-1P2c2 (it was amber), the glyph a caller passes is
 * the signal — and `done` is the design system's own `--status-done`.
 * A chip never gets a hue to tell it apart from the chip beside it.
 */
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Icon, useMotion } from '../../ui';

const TONE = {
  neutral: { fill: 'var(--glass-fill-2)', color: 'var(--fg-2)' },
  /* "Needs …": a warning, grey (29-1P2c2) — its glyph is the signal. */
  review:  { fill: 'var(--glass-tint-warn)', color: 'var(--status-warn)' },
  done:    { fill: 'var(--glass-tint-lime)', color: 'var(--status-done)' },
} as const;

export type FieldChipTone = keyof typeof TONE;

export interface FieldChipProps {
  tone?: FieldChipTone;
  /** Leading 12px glyph. */
  icon?: ReactNode;
  children: ReactNode;
  onRemove?: () => void;
  /** Accessible name for the remove button — it is an X and nothing else. */
  removeLabel?: string;
  title?: string;
}

export default function FieldChip({
  tone = 'neutral', icon, children, onRemove, removeLabel = 'Remove', title,
}: FieldChipProps) {
  const { fill, color } = TONE[tone];
  /* The condense's own numbers, from the scope this chip is drawn in (V3-3,
     where the task sheet first opened inside a V3 screen). */
  const m = useMotion();

  return (
    <motion.span
      /* The design system's arrival is a condense, not a pop — `ag-condense`
         is scale(0.96), and a chip that flew in from 0.8 read as a different
         material from every pane around it. */
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: m.dur.base, ease: m.ease.glass }}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--sp-3)',
        maxWidth: '100%',
        minHeight: 28,
        padding: `0 ${onRemove ? 'var(--sp-3)' : 'var(--sp-5)'} 0 var(--sp-5)`,
        borderRadius: 'var(--r-pill)',
        backgroundImage: fill,
        boxShadow: 'var(--glass-rim-1)',
        backdropFilter: 'var(--glass-bd-sm)',
        WebkitBackdropFilter: 'var(--glass-bd-sm)',
        font: 'var(--type-body)',
        fontSize: 'var(--text-xs)',
        letterSpacing: 'var(--tracking-ui)',
        color,
      }}
    >
      {icon && <span style={{ display: 'flex', flex: '0 0 auto' }}>{icon}</span>}
      <span
        style={{
          minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {children}
      </span>
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          style={{
            display: 'grid', placeItems: 'center', flex: '0 0 auto',
            width: 20, height: 20, padding: 0, border: 0,
            borderRadius: 'var(--r-circle)', background: 'transparent',
            color: 'inherit', opacity: 0.65, cursor: 'pointer',
            transition: 'opacity var(--dur-fast) var(--ease-glass)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.65'; }}
        >
          <Icon name="x" size={12} />
        </button>
      )}
    </motion.span>
  );
}
