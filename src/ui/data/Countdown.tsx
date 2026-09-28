/**
 * Aurora Glass — Countdown
 *
 * RECONCILED against the real `Countdown.jsx` at UI-24.
 * ---------------------------------------------------------------------
 * Derived at UI-10 from the tokens alone, because the design project was
 * unreachable for nine sessions. UI-21 landed the handoff bundle; UI-24
 * diffed this file against `design-system/components/data/Countdown.*`.
 * The derivation had read the type scale correctly — it was the STATES
 * that were wrong, and there were two of them:
 *
 * **1. AN OVERRUN COUNTS UP, SO IT IS SIGNED `+`.** The derived file
 * rendered a negative duration with a real minus (`−02:14`), reasoning
 * from tabular figures. `Countdown.prompt.md` settles it the other way in
 * one line: *"Negative seconds render as `+MM:SS` in rose with a rose
 * track. That is the overrun state — don't build a separate component for
 * it."* `+02:14` is the reading a person wants — *two minutes over* — and
 * `−02:14` is the same fact said backwards. Now `+`, and the overrun hue
 * is forced rather than left to the caller, exactly as the real file does.
 *
 * **2. THE TRACK WAS MISSING ENTIRELY.** The real file renders a 4px
 * carved rail under the numerals whenever `total` is supplied, and
 * `screens/focus.html:785` is the proof it is the focus clock's real
 * shape: `<Countdown seconds={left} total={task.alloc * 60} running
 * size="lg" />` — no ring around it. Ported here with the source's own
 * material. **`FocusMode` still wraps this in a `ProgressRing` and is not
 * rewired here** — that screen is UI-32's, and the component has to own
 * `total` before the screen can reach for it.
 *
 * Also taken from the real file:
 *   glow      `running` emits `--text-glow-white`, not `--text-glow-accent`.
 *             The numeral is `--fg-1`, so the emission is its own colour;
 *             the derived file spent the accent on a white numeral. Our
 *             extra tones follow the same rule — the glow is whatever hue
 *             the numeral is — which reduces exactly to the source at the
 *             source's own default.
 *   label     rides ABOVE the numerals as an `.ag-kicker`, not below.
 *             `base.css` describes that class as "the small uppercase run
 *             used above metrics", so the derived file had it upside down.
 *   spacing   the stack gap is `--sp-4`, not `--sp-2`.
 *   tracking  `-0.02em` on the numerals. Not `--tracking-display`: that is
 *             the sans display step (`--tracking-kicker` is the scale's one
 *             mono entry), and mono figures are wide enough already.
 *   overrun   emission is `0 0 28px oklch(0.70 0.15 20 / 0.5)`.
 *
 * KEPT, deliberately, over the real file:
 *   - **Two faces, `clock` and `span`** — note 1 below. The source has only
 *     `clock`, and `SetDeadlines` has no component to show `4h 30m` in if
 *     this one does not.
 *   - **The four-step size ladder.** The source offers `md | lg` = 48 | 88.
 *     Ours is 18 / 36 / 64 / 88, and every step is a token the type scale
 *     names for this job — `--text-5xl` is commented *"the countdown"* and
 *     `--text-6xl` *"focus-mode timer"*. Source `lg` is our `timer`.
 *   - **`tone`**, because an over-allocated PLAN is rose while its seconds
 *     are still positive (`SetDeadlines`), which auto-rose cannot see. A
 *     negative `seconds` still forces the overrun hue on top of it.
 *   - **`note`**, and the `aria-label` — note 4. The prototype has no a11y.
 *
 * NOTES ON THE DERIVATION THAT SURVIVED
 * -------------------------------------
 * 1. **Two faces, and `typography.css` licenses both.** A `clock` reads
 *    `1:23:45` — a number that is moving. A `span` reads `4h 30m` — a
 *    quantity that was decided. They are the "countdowns" and the
 *    "allocated minutes" of that file's one sentence, they are set in the
 *    same face at the same weight, and every screen needs one or the other:
 *    Focus counts down, Set Deadlines adds up.
 * 2. **Weight 300 at the two big sizes.** `--type-timer` is light and that
 *    is not an accident of the scale — a bold countdown reads as a threat,
 *    and this is a focus tool. `sm` and `md` take the normal weight,
 *    because a light face below ~36px goes thin and grey on a dark field.
 * 3. **A negative duration is rendered, not clamped** — see 1 above for
 *    what it now renders AS.
 * 4. **`aria-label` carries the value in words** ("4 hours 30 minutes"),
 *    since `4h 30m` and `1:23:45` are both read out as punctuation soup
 *    otherwise. The visible `label` kicker is folded into it when present.
 */
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

const TONE = {
  neutral: 'var(--fg-1)',
  accent: 'var(--accent)',
  amber: 'var(--hue-amber)',
  rose: 'var(--hue-rose)',
  muted: 'var(--fg-3)',
} as const;

export type CountdownTone = keyof typeof TONE;
export type CountdownSize = 'sm' | 'md' | 'lg' | 'timer';
export type CountdownFormat = 'clock' | 'span';

/** The real file's overrun emission, verbatim. */
const OVERRUN_GLOW = '0 0 28px oklch(0.70 0.15 20 / 0.5)';

/**
 * The emission each tone makes while `running`. The glow is the numeral's
 * own colour, so at `neutral` this is the source's `--text-glow-white`
 * exactly and the extra tones extend the same rule rather than a new one.
 */
const GLOW: Record<CountdownTone, string> = {
  neutral: 'var(--text-glow-white)',
  accent: 'var(--text-glow-accent)',
  amber: '0 0 26px oklch(0.80 0.14 82 / 0.5)',
  rose: OVERRUN_GLOW,
  muted: 'none',
};

/** Note 2 — light above 36px, normal below it. */
const SIZE = {
  sm: { fs: 'var(--text-lg)', weight: 'var(--weight-normal)' },
  md: { fs: 'var(--text-3xl)', weight: 'var(--weight-normal)' },
  lg: { fs: 'var(--text-5xl)', weight: 'var(--weight-light)' },
  timer: { fs: 'var(--text-6xl)', weight: 'var(--weight-light)' },
} as const;

export interface CountdownProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** The duration in seconds. Negative is over, and is shown as `+MM:SS`. */
  seconds: number;
  /** Total allocated seconds. Supplying it renders the progress track. */
  total?: number;
  /** `clock` a number that is moving · `span` a quantity that was decided. */
  format?: CountdownFormat;
  size?: CountdownSize;
  tone?: CountdownTone;
  /** True only while it is genuinely counting. Adds the emission glow. */
  running?: boolean;
  /** Small uppercase kicker above the numerals. */
  label?: ReactNode;
  /** A line under the numerals — the "why" behind the tone. */
  note?: ReactNode;
}

/** `1:23:45`, or `23:45` under an hour. */
function clockParts(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** What a screen reader says instead of the punctuation. */
function spokenDuration(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const said = [
    h > 0 ? `${h} hour${h === 1 ? '' : 's'}` : '',
    m > 0 ? `${m} minute${m === 1 ? '' : 's'}` : '',
    s > 0 && h === 0 ? `${s} second${s === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  return said.length > 0 ? said.join(' ') : 'zero';
}

export function Countdown({
  seconds,
  total,
  format = 'clock',
  size = 'md',
  tone = 'neutral',
  running = false,
  label,
  note,
  className = '',
  style,
  ...rest
}: CountdownProps) {
  const s = SIZE[size] ?? SIZE.md;
  const over = seconds < 0;
  /* The real file forces the overrun hue rather than asking the caller —
     "don't build a separate component for it" cuts both ways. */
  const hue = over ? 'var(--status-overrun)' : (TONE[tone] ?? TONE.neutral);
  const elapsed = Math.abs(Math.round(seconds));

  const numerals: CSSProperties = {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: '0.14em',
    fontFamily: 'var(--font-mono)',
    fontSize: s.fs,
    fontWeight: s.weight,
    lineHeight: 'var(--leading-tight)',
    letterSpacing: '-0.02em',
    fontVariantNumeric: 'tabular-nums',
    color: hue,
    /* `elevation.css` — emission is what a live timer does and what a
       resting readout must not. An overrun emits whether or not it is
       still counting: it is the screen's problem now. */
    textShadow: over ? OVERRUN_GLOW : running ? (GLOW[tone] ?? GLOW.neutral) : 'none',
    transition: 'color var(--dur-base) var(--ease-glass), text-shadow var(--dur-base) var(--ease-glass)',
  };

  /* Unit letters ride at under half the numeral size and drop to --fg-4, so
     "4h 30m" reads as one number rather than as four characters. */
  const unit: CSSProperties = { fontSize: '0.44em', color: 'var(--fg-4)', fontWeight: 'var(--weight-normal)' };

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);

  const spoken = `${over ? 'over by ' : ''}${spokenDuration(elapsed)}`;
  const filled =
    total == null
      ? 0
      : Math.max(0, Math.min(100, over ? 100 : ((total - seconds) / Math.max(total, 1)) * 100));

  return (
    <div
      className={className}
      role="group"
      aria-label={label != null && typeof label === 'string' ? `${label}: ${spoken}` : spoken}
      style={{ display: 'grid', justifyItems: 'center', gap: 'var(--sp-4)', ...style }}
      {...rest}
    >
      {label != null && <span className="ag-kicker">{label}</span>}

      <div style={numerals} aria-hidden="true">
        {over && <span>+</span>}
        {format === 'span' ? (
          <>
            {/* Under an hour the "0h" is noise, so it goes. */}
            {h > 0 && (
              <span>
                {h}
                <span style={unit}>h</span>
              </span>
            )}
            <span>
              {h > 0 ? String(m).padStart(2, '0') : m}
              <span style={unit}>m</span>
            </span>
          </>
        ) : (
          <span>{clockParts(elapsed)}</span>
        )}
      </div>

      {total != null && (
        <div
          aria-hidden="true"
          style={{
            width: '100%',
            maxWidth: 260,
            height: 4,
            borderRadius: 'var(--r-pill)',
            backgroundImage: 'var(--glass-well)',
            boxShadow: 'var(--glass-well-shadow)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${filled}%`,
              borderRadius: 'var(--r-pill)',
              background: over ? 'var(--status-overrun)' : 'var(--accent)',
              boxShadow: `0 0 12px -1px ${over ? 'var(--status-overrun)' : 'var(--accent)'}`,
              /* Linear, and on the second — a clock's rail must not ease. */
              transition: 'width 1s linear, background var(--dur-base) var(--ease-glass)',
            }}
          />
        </div>
      )}

      {note != null && (
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textAlign: 'center' }}>{note}</span>
      )}
    </div>
  );
}
