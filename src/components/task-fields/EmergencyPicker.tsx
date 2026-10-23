/**
 * **"Drop everything for this", 0–5** — the app's second and last manual input
 * to the priority score (item 17).
 *
 * **The geometry is `HumanOverridePicker`'s, deliberately and exactly.** Two
 * manual dials on one screen that looked like two different kinds of control
 * would say the two questions were different kinds of question, and they are
 * not: both are a number you choose, both feed one term of one sum, and the
 * design system's own note behind that trough — *"the trough reads as a dial,
 * and the ramp says 'more of the same thing'"* — is as true of this one. Same
 * well, same stops, same `compact` sheet geometry, same ends-only labels.
 *
 * **The hue is coral where Importance is amber, and that is the only thing
 * that differs.** (It was rose, hue 20, until 29-1P2c2 made urgent coral's job;
 * rose is his routine now.) `colors.css` spends amber on a judgement someone has to make and
 * rose on danger, and this control is both at once — but what it *claims* is
 * danger. Reading down the sheet's first column, the amber trough is "how much
 * does this matter to me" and the rose one is "this is on fire", and the two
 * are never mistaken for one another at a glance, which two amber troughs
 * three inches apart would be.
 *
 * **Zero is a stop and it is the one-click clear.** Unlike Importance, where a
 * judged zero and an unjudged field are genuinely different states that
 * `isTaskScored` reads apart, an emergency of zero and no emergency are the
 * same fact — so `0` writes the field away rather than storing a zero, and
 * pressing the lit stop again does the same thing. There is nothing to
 * distinguish, so the control does not pretend there is.
 *
 * **THIS WRITES IMMEDIATELY. It is not staged in the draft, and that is the
 * decision worth not re-making.** The task sheet stages every *field* through
 * `useTaskDraft` and commits on Save; the same sheet already writes the five
 * share handlers straight to the store, on the argument that publishing a link
 * is an act rather than an edit. Declaring an emergency is that kind of act:
 * item 17's exit criterion is that *"flagging a task lifts it in Smart Start
 * immediately"*, the identical control is offered from a row's ⋯ menu where
 * there is no Save button to press, and a flag that needed saving would mean
 * the same gesture did two different things depending on where you made it.
 *
 * Two consequences the callers have to carry, both of them small:
 *   - the level must be read from the **live** task, not from the panel's
 *     `task` prop, which several call sites hold as a snapshot in local state;
 *   - `isDirty` never notices this, which is right — nothing is unsaved.
 */
import type { CSSProperties } from 'react';
import { EMERGENCY_MAX } from '../../store/useStore';

const STEPS = Array.from({ length: EMERGENCY_MAX + 1 }, (_, n) => n);

/** `HumanOverridePicker`'s ramp in coral: one hue, more of it each step. */
const HEAT = (n: number) => `oklch(0.7 0.19 28 / ${0.05 + (n / EMERGENCY_MAX) * 0.175})`;

/** The lit stop's three-stop coral tint, and the ink that reads on it. */
const ON_TINT =
  'linear-gradient(155deg, oklch(0.7 0.19 28 / 0.34) 0%, oklch(0.7 0.19 28 / 0.12) 55%, oklch(0.7 0.19 28 / 0.22) 100%)';
const ON_INK = 'var(--job-coral-text)';

/** The ends, and nothing between them. The scale is in the position. */
const ENDS = ['None', 'Drop everything'] as const;

export interface EmergencyPickerProps {
  /** The live stored level. `undefined` and `0` both draw the `0` stop. */
  value: number | undefined;
  /** Writes straight through — see the note at the top of this file. */
  onChange: (level: number) => void;
  /** The sheet's geometry: a shorter stop. `HumanOverridePicker`'s prop, same reason. */
  compact?: boolean;
  disabled?: boolean;
}

export default function EmergencyPicker({ value, onChange, compact = false, disabled = false }: EmergencyPickerProps) {
  const current = value ?? 0;

  return (
    <div
      className="select-none"
      style={{ display: 'grid', gap: 'var(--sp-3)', opacity: disabled ? 0.5 : 1 }}
    >
      <div
        style={{
          display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(0, 1fr)', gap: 2,
          padding: 3, borderRadius: 'var(--r-pill)',
          backgroundImage: 'var(--glass-well)',
          boxShadow: 'var(--glass-well-shadow)',
        }}
      >
        {STEPS.map((n) => {
          const on = current === n;
          return (
            <button
              key={n}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              aria-label={n === 0 ? 'No emergency' : `Emergency ${n} of ${EMERGENCY_MAX}`}
              /* Pressing the lit stop clears, which for this field means the
                 same thing as pressing 0 — see the header. */
              onClick={() => onChange(on ? 0 : n)}
              style={{
                height: compact ? 34 : 40, minWidth: 0, border: 0,
                cursor: disabled ? 'default' : 'pointer',
                padding: 0, borderRadius: 'var(--r-pill)',
                backgroundImage: on ? ON_TINT : `linear-gradient(155deg, ${HEAT(n)}, ${HEAT(n)})`,
                boxShadow: on
                  ? 'var(--glass-rim-2), 0 0 0 1px oklch(0.7 0.19 28 / 0.45), 0 0 24px -6px oklch(0.7 0.19 28 / 0.6)'
                  : 'none',
                color: on ? ON_INK : 'var(--fg-1)',
                font: 'var(--type-numeric)',
                fontSize: compact ? 'var(--text-xs)' : 'var(--text-sm)',
                fontVariantNumeric: 'tabular-nums',
                transition: 'var(--t-hover)',
              }}
            >
              {n}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {ENDS.map((word) => (
          <span
            key={word}
            style={{
              font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
              textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'], color: 'var(--fg-4)',
            }}
          >
            {word}
          </span>
        ))}
      </div>
    </div>
  );
}
