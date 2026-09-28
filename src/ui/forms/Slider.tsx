/**
 * Aurora Glass — Slider
 * Reconciled against design-system/components/forms/Slider.{jsx,d.ts,prompt.md}
 * in UI-27. RECONCILED.
 *
 * WHAT WAS TAKEN FROM THE SOURCE
 * ------------------------------
 * All of the material, and the shape of the control. The real file is not a
 * div with pointer maths either — it is a **transparent `<input type="range">`
 * laid over painted layers**, which is exactly the structure this file already
 * needed and now copies outright:
 *
 *   - Track 6px in a `--glass-well` trough with `--glass-well-shadow` and
 *     **no hairline ring** — the invented `0 0 0 1px var(--line-faint)` is gone.
 *   - **The fill is emerald and it emits.** `linear-gradient(90deg,
 *     oklch(0.70 0.15 162 / 0.5), var(--accent))` under
 *     `0 0 14px -2px oklch(0.70 0.15 162 / 0.6)`. This file used to default the
 *     fill to white glass, rationing the accent on the argument that a
 *     committed half "is not live, it is just set". `Slider.prompt.md` answers
 *     that directly — *"The fill emits emerald light because it represents
 *     committed time — the same accent logic as a running timer"* — and
 *     `readme.md`'s own definition of the ration lists **"a committed block"**
 *     beside the running timer. The documented rule wins, so `tone` now
 *     defaults to `accent` and `neutral` is gone.
 *   - **The bead grows on grab, 18 → 22px.** `prompt.md`: *"That physical
 *     response is the whole point; do not remove it."* The old file did the
 *     opposite — a 22px knob that scaled to 0.94 when pressed, so grabbing it
 *     made it *smaller*. It is a flat `--fg-1` frost bead now, over
 *     `0 3px 10px oklch(0 0 0 / 0.55)` and an accent glow, not a glass pane.
 *   - `showValue` and `format` — min / current / max beneath the track, the
 *     current one in the fill's own colour. `format` is what makes the readout
 *     say "4h 30m" instead of "16200"; `prompt.md` calls it required whenever
 *     the number has a unit.
 *
 * WHAT WAS KEPT
 * -------------
 * 1. **The `<input type="range">` is still the control**, not a decoration
 *    over one: keyboard (arrows/Home/End at the right step), the `slider` role
 *    with live `aria-valuenow`, and pointer capture all come free. It also
 *    matters to this app specifically — `SortableList`'s two sensors let a
 *    press on an `input` through (see `isInteractiveTarget`), so a slider can
 *    sit inside a drag row without stealing the row's grab. The painted layers
 *    are `pointer-events: none` so every press still lands on the input.
 * 2. **`label` is required**, and `valueText` still exists. The source has no
 *    accessible name at all and no `aria-valuetext`; a track with no visible
 *    text of its own needs both, and `valueText` is the place to say
 *    "4h 30m" rather than "16200". It defaults to `format(value)`.
 * 3. **The fill and the bead centre on the same point, and it is not the raw
 *    percentage.** A real range input insets its thumb by half its own width
 *    at each end and maps the pointer through that inset, so a fill drawn to a
 *    flat `%` disagrees with where the control thinks the value is. The input's
 *    own (invisible) thumb is therefore sized to `--ag-slider-thumb`, and both
 *    the fill's width and the bead's centre are
 *    `thumb/2 + pct × (100% − thumb)`. That is why `--ag-slider-pct` is a
 *    unitless fraction: `screens.css` has to do arithmetic with it.
 *    The bead grows about that centre with a `transform`, so the pointer
 *    mapping does not move when it does.
 * 4. **`tone`** — an app addition, and the reason the four status hues exist
 *    here. The source has one colour because it has one use; a slider whose
 *    value carries a status (an overrun budget reading rose) should be able to
 *    say so without forking the component. `accent` is the default and is
 *    token-for-token the source's.
 *
 * NOT PORTED: `size`. The source has one geometry and so does this now — the
 * old `sm`/`md` pair was invented and nothing ever asked for `sm`.
 */
import type { CSSProperties, InputHTMLAttributes, ReactNode } from 'react';

/**
 * Each tone is the fill's two gradient stops, the emission under it, and the
 * bead's own glow. The `accent` row is the source's own arithmetic — half
 * alpha into full colour, emission at 0.6 — and the rest apply it to the four
 * status hues at their own `oklch` coordinates. The bead glows on the numbers
 * `--glow-accent-sm` is built from, so the default is that token exactly.
 */
const TONE = {
  accent: {
    from: 'oklch(0.70 0.15 162 / 0.5)',
    to: 'oklch(0.70 0.15 162)',
    glow: 'oklch(0.70 0.15 162 / 0.6)',
    bead: 'var(--glow-accent-sm)',
  },
  cyan: {
    from: 'oklch(0.70 0.15 210 / 0.5)',
    to: 'oklch(0.70 0.15 210)',
    glow: 'oklch(0.70 0.15 210 / 0.6)',
    bead: '0 0 0 1px oklch(0.70 0.15 210 / 0.34), 0 0 16px -2px oklch(0.70 0.15 210 / 0.45)',
  },
  violet: {
    from: 'oklch(0.70 0.15 296 / 0.5)',
    to: 'oklch(0.70 0.15 296)',
    glow: 'oklch(0.70 0.15 296 / 0.6)',
    bead: '0 0 0 1px oklch(0.70 0.15 296 / 0.34), 0 0 16px -2px oklch(0.70 0.15 296 / 0.45)',
  },
  amber: {
    from: 'oklch(0.75 0.15 82 / 0.5)',
    to: 'oklch(0.75 0.15 82)',
    glow: 'oklch(0.75 0.15 82 / 0.6)',
    bead: '0 0 0 1px oklch(0.75 0.15 82 / 0.34), 0 0 16px -2px oklch(0.75 0.15 82 / 0.45)',
  },
  rose: {
    from: 'oklch(0.70 0.15 20 / 0.5)',
    to: 'oklch(0.70 0.15 20)',
    glow: 'oklch(0.70 0.15 20 / 0.6)',
    bead: '0 0 0 1px oklch(0.70 0.15 20 / 0.34), 0 0 16px -2px oklch(0.70 0.15 20 / 0.45)',
  },
} as const;

export type SliderTone = keyof typeof TONE;

/** The source's geometry, in px. The bead is the second number on grab. */
const TRACK = 6;
const BEAD = 18;
const BEAD_GRABBED = 22;

export interface SliderProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type' | 'value' | 'onChange'> {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  /** Called with the parsed number, not the event. */
  onValueChange?: (value: number) => void;
  /** See note 4 — `accent` unless the value carries a status of its own. */
  tone?: SliderTone;
  /** Formatter for the three readouts, e.g. `m => m + ' min'`. */
  format?: (value: number) => ReactNode;
  /** Show min / current / max beneath the track. Defaults to true. */
  showValue?: boolean;
  /** Required accessible name — the track has no visible text of its own. */
  label: string;
  /** What the value IS, in words: "4h 00m", not "14400". Defaults to `format`. */
  valueText?: string;
}

export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onValueChange,
  tone = 'accent',
  format,
  showValue = true,
  label,
  valueText,
  disabled = false,
  className = '',
  style,
  ...rest
}: SliderProps) {
  const t = TONE[tone] ?? TONE.accent;
  const span = max - min;
  /* Note 3 — a fraction, so screens.css can offset it by half a bead. */
  const pct = span === 0 ? 0 : Math.max(0, Math.min(1, (value - min) / span));
  const read = (n: number) => (format ? format(n) : n);

  const composed: CSSProperties = {
    '--ag-slider-pct': pct,
    '--ag-slider-track': `${TRACK}px`,
    '--ag-slider-thumb': `${BEAD}px`,
    '--ag-slider-grab': BEAD_GRABBED / BEAD,
    '--ag-slider-from': t.from,
    '--ag-slider-to': t.to,
    '--ag-slider-glow': t.glow,
    '--ag-slider-bead-glow': t.bead,
    ...style,
  } as CSSProperties;

  return (
    <div className={['ag-slider', className].filter(Boolean).join(' ')} style={composed}>
      <div className="ag-slider__rail">
        {/*
          First in the DOM so the painted layers can answer to its `:hover`,
          `:active` and `:focus-visible` through a sibling combinator. They
          paint over it and take no pointer events, so the press still lands
          here. `data-ag-field` opts the hit box out of the global focus
          outline in base.css — the ring belongs on the bead.
        */}
        <input
          type="range"
          data-ag-field=""
          className="ag-slider__input"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-label={label}
          aria-valuetext={valueText ?? (format ? String(format(value)) : undefined)}
          onChange={(e) => onValueChange?.(Number(e.target.value))}
          {...rest}
        />
        <span aria-hidden="true" className="ag-slider__track" />
        <span aria-hidden="true" className="ag-slider__fill" />
        <span aria-hidden="true" className="ag-slider__bead" />
      </div>

      {showValue && (
        <div aria-hidden="true" className="ag-slider__scale">
          <span>{read(min)}</span>
          <span className="ag-slider__scale-now">{read(value)}</span>
          <span>{read(max)}</span>
        </div>
      )}
    </div>
  );
}
