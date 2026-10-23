/**
 * Aurora Glass — Waveform
 *
 * RECONCILED against the real `Waveform.jsx` at UI-21.
 * ---------------------------------------------------------------------
 * Derived at UI-8 from `motion.css`'s `ag-bar` keyframe (which the token
 * file itself comments "Waveform / equaliser bar"), because the design
 * project was unreachable for eleven sessions. UI-21 mirrored the real
 * file and diffed it. One miss was substantive:
 *
 * **THE ENVELOPE.** The real file shapes every bar by
 * `sin(t·π)` across the field — tall in the middle, short at the ends —
 * and `Waveform.prompt.md` says why in one line: *"The bar envelope peaks
 * in the middle, so it reads as a voice rather than an equaliser."* The
 * derived version made every bar full height, which is precisely the
 * equaliser it was supposed not to be. That is now fixed, with the real
 * file's own numbers (`0.28 + env * 0.72`).
 *
 * Also taken from the real file:
 *   idle      collapses to a flat 3px line, not a scaled-down bar.
 *             `prompt.md`: *"active={false} collapses to a 3px line —
 *             that's the idle state; don't unmount the component."*
 *   timing    per-bar duration and delay come from the source's own
 *             arithmetic (`700 + (i·137 mod 520)`, `(i·61 mod 700)`),
 *             which spreads across ANY bar count. The derived version
 *             held a fixed table of seven periods that simply repeated
 *             once you asked for an eighth bar.
 *   bars      defaults to 28. `d.ts` says "20–36 reads best". Its one
 *             caller passed `bars={4}` explicitly, so nothing on screen
 *             changed — it was mirror fidelity.
 *
 * ITS CALLER IS DOCK MODE, SINCE DESIGN-1.
 * ---------------------------------------------------------------------
 * `prompt.md`'s first line is *"voice capture, visualised"*, to be paired
 * with *"a `lg` `IconButton` holding a mic glyph"* — and this app finally
 * has voice. `components/chat/DockMode.tsx` puts it inside the orb twice:
 * emerald `active` bars while the microphone is hearing him, white ones
 * while Atlas is reading an answer out. That is `screens/voice.html`'s own
 * reach for this component, tone for tone.
 *
 * Between UI-33 and then it had none, which was correct at the time and is
 * the note this replaces: `ChatPage` had put a four-bar meter in a header
 * that was metering nothing, and `screens/assistant.html` reached for this
 * component nowhere. A turn running is still a pulsing mark beside the
 * reply, not a meter.
 *
 * KEPT, deliberately, over the real file:
 *   - **Seven tones, not two.** The source offers `accent | white` — both
 *     are here, `white` restored at DESIGN-1 for the speaking orb; this
 *     app also needs the semantic hues, and `data/SparkBars.tsx` builds
 *     on the same table. A superset breaks nothing.
 *   - **`thickness`**, because `SparkBars` shrinks from it (see UI-21).
 *   - **The glow ration.** `tokens/elevation.css`: "GLOW says *this is
 *     EMITTING*… A resting neutral surface never glows." Both files agree
 *     the live bars glow; only ours also drops the glow when idle.
 *   - **`aria-hidden` unless the caller passes `label`.** The prototype
 *     has no a11y at all. This nearly always sits beside text that
 *     already says "Working…", and a second announcement is noise.
 */
import type { CSSProperties, HTMLAttributes } from 'react';

const TONE = {
  accent:  'var(--accent)',
  /* The source's second tone, restored at DESIGN-1 — `Waveform.jsx` is
     `tone === 'white' ? 'var(--fg-1)' : 'var(--accent)'`, and the derived
     table here had dropped it. `screens/voice.html` is what needs it: the
     orb speaks in white bars and hears in emerald ones, which is the whole
     of how that screen rations the accent colour. */
  white:   'var(--fg-1)',
  cyan:    'var(--hue-cyan)',
  violet:  'var(--job-violet)',
  /* 29-1P2c3: brown noise is calm focus, which is teal's job. */
  teal:    'var(--job-teal)',
  amber:   'var(--hue-amber)',
  rose:    'var(--hue-rose)',
  neutral: 'var(--fg-3)',
} as const;

export type WaveformTone = keyof typeof TONE;

/** Idle height, in px. The real file's flat line — see the header. */
const IDLE_PX = 3;

/**
 * The real file's own per-bar shape, lifted verbatim.
 *
 * `env` is a half sine across the field, so the middle bars are tallest —
 * this is the envelope that makes the control read as a voice rather than
 * an equaliser. `dur` and `delay` are deliberately non-repeating so the
 * bars never march in step (equal durations read as a progress indicator);
 * unlike a fixed table they keep spreading at any bar count.
 */
function seedBars(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const t = i / Math.max(count - 1, 1);
    const env = Math.sin(t * Math.PI);
    return {
      dur: 700 + ((i * 137) % 520),
      delay: (i * 61) % 700,
      scale: 0.28 + env * 0.72,
    };
  });
}

export interface WaveformProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** How many bars. 4–7 reads as a meter; more reads as a chart. */
  bars?: number;
  /** Full height of a bar at its peak, in px. */
  height?: number;
  /** Bar thickness, in px. */
  thickness?: number;
  /** Emerald by default, because that is what "live" is in this system. */
  tone?: WaveformTone;
  /** Moving, or resting at the low mark. See note 1. */
  active?: boolean;
  /** Accessible name. Omit when adjacent text already says this. */
  label?: string;
}

export function Waveform({
  bars = 28,
  height = 44,
  thickness = 3,
  tone = 'accent',
  active = true,
  label,
  className = '',
  style,
  ...rest
}: WaveformProps) {
  const count = Math.max(1, Math.floor(bars));
  const hue = TONE[tone] ?? TONE.accent;
  const seed = seedBars(count);

  const shell: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: thickness,
    height,
    flex: '0 0 auto',
    ...style,
  };

  return (
    <span
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={shell}
      {...rest}
    >
      {seed.map((b, i) => (
        <span
          key={i}
          style={{
            display: 'block',
            width: thickness,
            /* The envelope: tall in the middle, short at the ends. `ag-bar`
               then scales each bar between 0.28 and 1 of THIS height, so
               the field keeps its voice shape while it moves. Idle is a
               flat line rather than a shorter bar. */
            height: active ? Math.max(6, height * b.scale) : IDLE_PX,
            borderRadius: 'var(--r-pill)',
            background: hue,
            transformOrigin: 'center',
            /* Emission, not elevation — see the header. Rationed to the
               live state; an idle meter is a flat neutral mark. */
            boxShadow: active ? `0 0 8px -1px color-mix(in oklab, ${hue} 55%, transparent)` : 'none',
            opacity: active ? 0.55 + b.scale * 0.45 : 0.3,
            animation: active
              ? `var(--kf-bar) ${b.dur}ms var(--ease-in-out) ${b.delay}ms infinite`
              : undefined,
            transition: 'height var(--dur-base) var(--ease-glass), opacity var(--dur-base) var(--ease-glass), box-shadow var(--dur-base) var(--ease-glass)',
          }}
        />
      ))}
    </span>
  );
}
