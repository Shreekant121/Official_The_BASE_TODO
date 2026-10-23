/**
 * The design system's `Labelled`, and the two readings that go in it (UI-30).
 *
 * WHY THIS IS A SHARED FILE. UI-26 built this as a private `Field` inside
 * `TaskDetailPanel.tsx`, because the task sheet was the only screen that had
 * a mockup asking for it. `screens/scoring.html` defines the same `Labelled`
 * — kicker, a reading beside it, the control, a hint under it — and the same
 * `Points`, character for character with `TaskSheet.jsx`'s. Two copies of one
 * vocabulary is how two screens start disagreeing about what a field looks
 * like, which is the argument `NeedsPills.tsx` was extracted on. So the sheet
 * imports it from here now and nothing about what it renders moved.
 *
 * **IT IS ALSO WHERE A FIELD'S WIDTH IS SETTLED.** The `.ag-labelled` class
 * below carries a `min-width: 0` reset over the whole subtree, which is what
 * stops a long task title pushing a field's controls out of its column. It
 * belongs on this component and not on the sheet because this is the boundary
 * of a field, and both screens that have fields draw them through here. The
 * mechanism — why `overflow: hidden` and a `min-width: 0` ancestor were not
 * enough — is written out beside the rule in `src/ui/screens.css`.
 *
 * **The ring goes round the whole field, not round the label.** That is
 * UI-26's call and it still holds: the source flashes the label's kicker and
 * rings the `Well` it owns, because it builds every input itself; ours are
 * components in this folder with their own wells and their own focus states,
 * so the flash is drawn one level out — which also means it works for the ones
 * that are a grid of tiles rather than a single trough. The source's amber
 * KICKER came across as well (`Kicker tone={flash ? amber : fg-3}`), since
 * that half costs nothing and says which label is being pointed at.
 */
import type { ReactNode } from 'react';
import { FieldLabel, Icon, type IconName } from '../../ui';
import type { NeedId } from './needs';

export interface LabelledProps {
  label: string;
  icon?: IconName;
  /**
   * One short sentence under the control, explaining what it feeds. **Bare
   * text — this is wrapped in a `<Hint>` below**, and a `<Hint>` passed in
   * lands as a `<p>` inside a `<p>`, which the parser un-nests: the sentence
   * ends up outside the field, unstyled. Use the exported `Hint` only for a
   * sentence that belongs to a whole section rather than to one field.
   */
  hint?: ReactNode;
  /** Right-aligned reading beside the label — a points value, a count, a word. */
  right?: ReactNode;
  /** A Needs chip was pressed for this field; ring it for a beat. */
  flash?: boolean;
  /**
   * Marks this field as the target of a Needs chip. Rendered as a
   * `data-need` attribute rather than handed back through a callback ref:
   * `react-hooks/refs` rejects building a ref-writing closure during render,
   * and a screen only ever has one of each of these on it, so the chip can
   * simply look its field up when it is pressed.
   */
  needId?: NeedId;
  children: ReactNode;
}

export function Labelled({ label, icon, hint, right, flash, needId, children }: LabelledProps) {
  return (
    <div
      /* `.ag-labelled` is not paint — it carries the one rule that keeps a
         field inside its column when its contents are long. The whole
         mechanism is written up in `screens.css` beside the rule. */
      className="ag-labelled"
      data-need={needId}
      style={{
        display: 'grid', gap: 'var(--sp-3)', alignContent: 'start', minWidth: 0,
        /* Inset so the ring hugs the field's own controls rather than the
           pane's padding, and negative-margined back so nothing shifts. */
        margin: 'calc(var(--sp-4) * -1)',
        padding: 'var(--sp-4)',
        borderRadius: 'var(--r-md)',
        /* The field a "Needs …" chip points at: a warning, so the warning's
           grey (29-1P2c2), bright enough to find. */
        boxShadow: flash ? '0 0 0 1px var(--status-warn), 0 0 22px -6px var(--status-warn)' : 'none',
        transition: 'box-shadow var(--dur-base) var(--ease-glass)',
      }}
    >
      <FieldLabel
        icon={icon && <Icon name={icon} size={13} />}
        hint={right}
        tone={flash ? 'var(--fg-1)' : undefined}
      >
        {label}
      </FieldLabel>
      {children}
      {hint != null && <Hint>{hint}</Hint>}
    </div>
  );
}

/** The explanatory voice: one short sentence, full stop, muted. */
export function Hint({ children }: { children: ReactNode }) {
  return (
    <p style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
      {children}
    </p>
  );
}

export interface PointsProps {
  value: number;
  tone?: string;
  size?: string;
}

/**
 * A points badge. Mono, tabular, and — the source's own note — *"it never
 * carries a hue of its own; the pane it sits in already says whether things
 * are urgent."* A caller may still pass one for the single case the source
 * does: a deadline inside the band that is about to be a problem.
 *
 * The minus is U+2212, not a hyphen: at tabular width a hyphen sits half a
 * stroke high and reads as a dash between two numbers.
 */
export function Points({ value, tone = 'var(--fg-2)', size = 'var(--text-xs)' }: PointsProps) {
  const sign = value > 0 ? '+' : value < 0 ? '\u2212' : '';
  return (
    <span
      style={{
        font: 'var(--type-numeric)', fontSize: size, fontVariantNumeric: 'tabular-nums',
        color: tone, whiteSpace: 'nowrap',
      }}
    >
      {sign}{Math.abs(value)}
    </span>
  );
}
