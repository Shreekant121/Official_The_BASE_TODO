/**
 * "How much does this matter", 0–9 — the app's one manual importance dial.
 *
 * **THIS REPLACES BOTH `EisenhowerPicker` AND `PersonalScorePicker`, WHICH ARE
 * DELETED.** They were two controls asking one question. The scorer of the day
 * only ever *added* their two numbers together, so the pair was a 0–9 scale
 * split across a 2×2 grid and a five-stop trough, and answering it meant
 * reading two vocabularies — quadrant names on one axis pair, importance words
 * on another — to move a single term of one sum. One dial says the same thing
 * once, which is why the merge costs no task a point: 4 + 5 is 9.
 *
 * **The trough is `PersonalScorePicker`'s, and its argument carries over
 * whole.** From UI-30, quoting the design system's own note: *"Personal
 * importance is one hue heating up, not five hues: the trough reads as a dial,
 * and the ramp says 'more of the same thing'."* **The hue is white since
 * 29-1P2c3, his call (2026-10-07): "plain white glow".** It was amber, and
 * amber is gold's hue, which is rewards; this is his own judgement, not a
 * warning, an error, a date or anything Atlas did, so no job colour fits and
 * the ramp is light alone — like the subtask priority ladder's (29-1P2c2).
 * Ten stops make the trough read *more* like a dial than five did, not
 * less — the ramp has twice the room to brighten across.
 *
 * **What did not come across is the 2×2's four hues.** `EisenhowerPicker`
 * earned them by a real argument — each quadrant's hue was the `--status-*`
 * whose meaning it shared — but that argument was about *four named
 * categories*, and there are no categories here. A scale gets one hue. Keeping
 * them would have been decoration, which is the thing `colors.css` forbids.
 *
 * **Zero is a stop, and it is not the same as empty.** A task in this app may
 * legitimately be unscored — `isTaskScored` gates the Needs Attention queue on
 * exactly that — so the dial keeps both pickers' KEPT behaviour: pressing the
 * selected stop again clears it. `0` then means "I have judged this and it
 * matters none" and cleared means "nobody has judged this yet". They score the
 * same and they read differently, which is the honest arrangement: the
 * migration deliberately leaves a never-scored task cleared rather than
 * writing it a zero (see `upgradeTaskScoring`).
 *
 * **`compact` is the sheet's geometry, not a second design.** UI-30 killed
 * `PersonalScorePicker`'s `size` prop because two geometries meant two screens
 * showing different controls for one field. This is not that: same stops, same
 * words, same ramp — only the stop height changes, for the subtask row's
 * detail area where 44px of button would push the tree's own controls off.
 */
import type { CSSProperties } from 'react';
import { HUMAN_OVERRIDE_WORDS } from './scoreDisplay';
import { HUMAN_OVERRIDE_MAX } from '../../store/useStore';

const STEPS = Array.from({ length: HUMAN_OVERRIDE_MAX + 1 }, (_, n) => n);

/**
 * The source's ramp: one colour, more of it each step. `PersonalScorePicker`
 * ran `0.05 + n × 0.035` of amber over five stops; white reads stronger than
 * amber at the same alpha on this dark glass, so the white ramp spans a
 * little less (0.04 → 0.18) over ten stops.
 */
const HEAT = (n: number) => `oklch(1 0 0 / ${0.04 + (n / HUMAN_OVERRIDE_MAX) * 0.14})`;

/** The selected stop's three-stop white tint, and the ink that reads on it. */
const ON_TINT =
  'linear-gradient(155deg, oklch(1 0 0 / 0.26) 0%, oklch(1 0 0 / 0.09) 55%, oklch(1 0 0 / 0.17) 100%)';
const ON_INK = 'var(--fg-1)';

interface HumanOverridePickerProps {
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  /** The sheet's geometry — a shorter stop. See the note at the top of this file. */
  compact?: boolean;
}

export default function HumanOverridePicker({ value, onChange, compact = false }: HumanOverridePickerProps) {
  return (
    <div className="select-none" style={{ display: 'grid', gap: 'var(--sp-3)' }}>
      <div
        style={{
          display: 'grid', gridAutoFlow: 'column', gridAutoColumns: 'minmax(0, 1fr)', gap: 2,
          padding: 3, borderRadius: 'var(--r-pill)',
          backgroundImage: 'var(--glass-well)',
          boxShadow: 'var(--glass-well-shadow)',
        }}
      >
        {STEPS.map((n) => {
          const on = value === n;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={on}
              aria-label={`${n} — ${HUMAN_OVERRIDE_WORDS[n]}`}
              onClick={() => onChange(on ? undefined : n)}
              style={{
                height: compact ? 34 : 40, minWidth: 0, border: 0, cursor: 'pointer',
                padding: 0, borderRadius: 'var(--r-pill)',
                backgroundImage: on ? ON_TINT : `linear-gradient(155deg, ${HEAT(n)}, ${HEAT(n)})`,
                boxShadow: on
                  ? 'var(--glass-rim-2), 0 0 0 1px oklch(1 0 0 / 0.4), 0 0 24px -6px oklch(1 0 0 / 0.4)'
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

      {/* Only the ends are labelled. The scale is in the position. */}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {[HUMAN_OVERRIDE_WORDS[0], HUMAN_OVERRIDE_WORDS[HUMAN_OVERRIDE_MAX]].map((word) => (
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
