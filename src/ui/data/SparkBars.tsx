/**
 * Aurora Glass — SparkBars
 *
 * RECONCILED against the real `SparkBars.jsx` at UI-24.
 * ---------------------------------------------------------------------
 * Derived at UI-9 from `feedback/Waveform.tsx` and the tokens, because the
 * design project was unreachable for eight sessions. UI-21 landed the
 * handoff bundle; UI-24 diffed this file against
 * `design-system/components/data/SparkBars.*`. One miss was substantive:
 *
 * **THE BARS ARE GLASS.** The derived version painted every bar a flat
 * hue and rationed the difference with `opacity: 0.4` — a tinted bar, dim
 * or bright. The real file paints the resting bars with a white glass
 * gradient (`oklch(1 0 0 / 0.30)` → `oklch(1 0 0 / 0.12)`) under an inset
 * top rim, and gives the hue to the ACTIVE bar alone, as a gradient that
 * fades into its own translucency. `SparkBars.prompt.md` says why in one
 * line: *"Bars are glass; only the active one emits. That single highlight
 * is the entire information hierarchy."* Dimming a coloured bar says "less
 * of this"; a glass bar says "not this one" — which is the actual claim a
 * spark makes about the six days you are not standing on.
 *
 * That single change retires a whole prop. The derived file had `tone` for
 * the series and `activeTone` for the highlight, because both were
 * coloured. Resting bars are glass now, so there is one hue in the
 * component and `tone` is it — the source's own signature.
 *
 * Also taken from the real file:
 *   emission  `0 0 14px -2px hue` on the active bar, over `inset 0 1px 0
 *             oklch(1 0 0 / 0.5)`; the resting rim is `inset 0 1px 0
 *             oklch(1 0 0 / 0.22)`. Every bar carries a rim — that is what
 *             makes a 4px stub still read as glass rather than as a gap.
 *   floor     a bar is never shorter than 4px (was 2).
 *   gap       6 (was 4).
 *   labels    the optional axis row under the bars, which the derived file
 *             did not have at all: same `--type-kicker` in `--fg-4`, with
 *             the active one lifted to `--fg-2`. It shares the bars' own
 *             `gap` so the letters stay under their columns.
 *   naming    `data`, not `values`. One call site; a clean rename beats a
 *             synonym nobody can grep for.
 *   title     each bar carries its raw value as a native tooltip. It is the
 *             source's answer to "I need the exact number" that does not
 *             cost a label on every column.
 *
 * KEPT, deliberately, over the real file:
 *   - **`thickness`, and bars that SHRINK from it rather than `flex: 1`.**
 *     This is the one place the source is not followed, and it is note 3
 *     below: bars that stretch to fill a page-width header read as six
 *     segments of one track — "step 1 of 6" — which is a claim about
 *     completion this component is not making. The source gets away with
 *     `flex: 1` because its own container is a chart-sized box.
 *   - **`max`**, so a series can be scaled against a ceiling supplied from
 *     outside instead of against its own peak. Omit it and the behaviour is
 *     the source's — scaled against the tallest bar present. (It used to name
 *     `MAX_PRIORITY_SCORE` as the example; item 16 deleted that constant,
 *     because the score has no ceiling any more.)
 *   - **The six-tone table**, shared with `Waveform` (the source offers
 *     `accent | cyan` here and `accent | white` there; UI-21 settled on the
 *     superset and IMPROVEMENTS.md asks the two to stay consistent).
 *   - **`label` and the `aria-hidden` default.** The prototype has no a11y.
 *   - **`height` at 28.** The source's 72 is coupled to its `flex: 1` bars;
 *     6px-wide bars 72px tall read as spikes. Our one caller passes its own.
 *
 * NOTES ON THE DERIVATION THAT SURVIVED
 * -------------------------------------
 * 1. **A zero is a floor stub, not a missing bar.** On the Score screen
 *    most values start at zero, and a series that renders nothing for them
 *    would read as "no data" when the truth is "not scored yet". The real
 *    file agrees and sets the floor higher than the derivation guessed.
 * 2. **This is a readout, not a control.** No `onSelect`, deliberately:
 *    bars shrink to a few pixels wide, an order of magnitude under
 *    `--hit-min` (44px), so anything clickable here would be a target you
 *    cannot hit on the tablet half of this product.
 * 3. **It is a spark, not a chart.** See the `thickness` note above. Past
 *    roughly sixty values the shell clips, and that is the correct failure.
 *    Reach for a chart — the source says the same thing as "5–14 bars".
 */
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

const TONE = {
  accent:  'var(--accent)',
  cyan:    'var(--hue-cyan)',
  violet:  'var(--hue-violet)',
  amber:   'var(--hue-amber)',
  rose:    'var(--hue-rose)',
  neutral: 'var(--fg-3)',
} as const;

export type SparkTone = keyof typeof TONE;

/** Note 1 — the height a zero still occupies, in px. The real file's number. */
const FLOOR = 4;

/** Resting bars are glass, not tint. The real file's own stops. */
const REST_FILL = 'linear-gradient(180deg, oklch(1 0 0 / 0.30), oklch(1 0 0 / 0.12))';
const REST_RIM = 'inset 0 1px 0 oklch(1 0 0 / 0.22)';
const LIVE_RIM = 'inset 0 1px 0 oklch(1 0 0 / 0.5)';

export interface SparkBarsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Raw values. Scaled against `max`, or against their own peak without it. */
  data: number[];
  /** Top of the scale. Defaults to the largest value present. */
  max?: number;
  /** The one bar that is lit. Out of range means none. */
  activeIndex?: number;
  /** Full height of the tallest bar, in px. */
  height?: number;
  /** A bar's natural width, in px. It shrinks below this, never above — note 3. */
  thickness?: number;
  gap?: number;
  /** The active bar's hue. It is the only colour in the component. */
  tone?: SparkTone;
  /** Optional axis labels, same length as `data`. */
  labels?: ReactNode[];
  /** Accessible name. Omit when adjacent text already says this. */
  label?: string;
}

export function SparkBars({
  data,
  max,
  activeIndex = -1,
  height = 28,
  thickness = 6,
  gap = 4,
  tone = 'accent',
  labels,
  label,
  className = '',
  style,
  ...rest
}: SparkBarsProps) {
  const ceiling = max ?? Math.max(...data, 0);
  const hue = TONE[tone] ?? TONE.accent;

  /* The bar row and the label row are separate tracks of one grid so the
     labels sit under the bars without joining their flex line. */
  const shell: CSSProperties = {
    display: 'grid',
    gap: 'var(--sp-3)',
    minWidth: 0,
    ...style,
  };

  const bar: CSSProperties = {
    /* Note 3 — shrinks from `thickness`, never grows past it. */
    flex: '0 1 auto',
    width: thickness,
    minWidth: 2,
    borderRadius: 'var(--r-pill)',
  };

  return (
    <div
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={shell}
      {...rest}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', gap, height, minWidth: 0, overflow: 'hidden' }}>
        {data.map((value, i) => {
          const pct = ceiling === 0 ? 0 : Math.max(0, Math.min(1, value / ceiling));
          const active = i === activeIndex;
          return (
            <span
              key={i}
              title={String(value)}
              style={{
                ...bar,
                /* Note 1 — never smaller than the stub, so an unscored slot
                   is an empty bar rather than a gap in the series. */
                height: Math.max(FLOOR, Math.round(pct * height)),
                backgroundImage: active
                  ? `linear-gradient(180deg, ${hue}, color-mix(in oklab, ${hue} 45%, transparent))`
                  : REST_FILL,
                /* Emission is rationed to the one bar that is live; the rest
                   are glass, and the rim is what keeps them reading as glass. */
                boxShadow: active ? `0 0 14px -2px ${hue}, ${LIVE_RIM}` : REST_RIM,
                transition:
                  'height var(--dur-slow) var(--ease-glass), background var(--dur-base) var(--ease-glass), box-shadow var(--dur-base) var(--ease-glass)',
              }}
            />
          );
        })}
      </div>

      {labels && (
        <div
          style={{
            display: 'flex',
            gap,
            minWidth: 0,
            font: 'var(--type-kicker)',
            letterSpacing: 'var(--tracking-kicker)',
            textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'],
            color: 'var(--fg-4)',
          }}
        >
          {labels.map((l, i) => (
            <span
              key={i}
              style={{
                ...bar,
                textAlign: 'center',
                color: i === activeIndex ? 'var(--fg-2)' : undefined,
              }}
            >
              {l}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
