/**
 * The mic that becomes a timer (29-1P15d, idea 78, from his "timer" video).
 *
 * While BASE listens, the microphone is a pill: minutes on one side, seconds
 * on the other, a glowing light in the middle. When what he said has landed
 * the light turns lime for a moment, then the pill folds back into the mic.
 * `MicButton` is the pill you press, beside Send; dock mode draws the same
 * face, larger, under its orb while it hears him (there is nothing to press
 * there: it listens for "Atlas" on its own).
 *
 * **Violet while listening, lime when it has your words**, his call
 * (2026-10-20): the card's red is coral here, and coral means something broke.
 * Listening is Atlas's, so violet; "got it" is done, so lime. The card's
 * reflection underneath is left out — beside Send it would fall across the
 * composer's own glass, and on the dock it would be a second orb.
 *
 * **It stops on its own after two minutes**, his call (2026-10-15):
 * `MIC_CAP_MS` in `lib/voice/useVoice.ts`, enforced where the microphone is
 * opened (`useDictation`, `DockMode`), not here — this file only draws.
 */
import { Icon } from '../../ui';

export type MicFace = 'idle' | 'listening' | 'done';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The face, at any size: 34px tall beside Send (`scale` 1), larger on the dock.
 * It stretches on `--ease-springy`, the card's own spring, so it overshoots a
 * hair and settles, as the video did.
 * Width, the two sides and the light all move on transitions, so a change of
 * `face` is the whole animation; nothing here loops but the light's pulse, and
 * only while it listens.
 */
export function MicTimerFace({
  face,
  seconds,
  scale = 1,
  error = false,
}: {
  face: MicFace;
  seconds: number;
  scale?: number;
  /** The last try failed: the idle mic is crossed out, in coral. */
  error?: boolean;
}) {
  const h = 34 * scale;
  const wide = face !== 'idle';
  const core = wide ? 26 * scale : h;
  const side = {
    position: 'absolute', top: 0, bottom: 0, width: 26 * scale,
    display: 'grid', placeContent: 'center', justifyItems: 'center', lineHeight: 1,
    opacity: wide ? 1 : 0,
    /* In after the pill has opened, out at once as it closes. */
    transition: wide ? 'opacity var(--dur-base) var(--ease-glass) 120ms' : 'opacity var(--dur-fast) var(--ease-glass)',
    pointerEvents: 'none',
  } as const;
  const number = {
    font: 'var(--type-numeric)', fontSize: 15 * scale, fontWeight: 300, fontVariantNumeric: 'tabular-nums',
    color: 'var(--fg-1)',
  } as const;
  const unit = { font: 'var(--type-caption)', fontSize: 8 * scale, color: 'var(--fg-4)', marginTop: 2 * scale } as const;

  return (
    <span
      aria-hidden="true"
      data-mic-face={face}
      style={{
        position: 'relative', display: 'grid', placeItems: 'center', flex: '0 0 auto',
        width: wide ? 112 * scale : h, height: h, borderRadius: h / 2,
        backgroundImage: 'var(--glass-fill-1)',
        boxShadow: wide ? 'var(--glass-rim-2), var(--glass-cast-1)' : 'var(--glass-rim-1)',
        transition: 'width var(--dur-sheet) var(--ease-springy), box-shadow var(--dur-base) var(--ease-glass)',
      }}
    >
      <span style={{ ...side, left: 10 * scale }}>
        <span style={number}>{pad(Math.floor(seconds / 60))}</span>
        <span style={unit}>min</span>
      </span>
      <span
        style={{
          display: 'grid', placeItems: 'center', width: core, height: core, borderRadius: '50%',
          backgroundImage:
            face === 'listening' ? 'var(--job-violet-gel)' : face === 'done' ? 'var(--glass-tint-lime)' : 'none',
          boxShadow:
            face === 'listening'
              ? 'var(--job-violet-rim), var(--job-violet-glow-sm)'
              : face === 'done'
                ? 'inset 0 0 0 1px var(--job-lime-line), var(--job-lime-shine)'
                : 'none',
          color: face === 'done' ? 'var(--job-lime-text)' : error ? 'var(--status-overrun)' : 'var(--fg-4)',
          transition:
            'width var(--dur-sheet) var(--ease-springy), height var(--dur-sheet) var(--ease-springy),' +
            ' box-shadow var(--dur-base) var(--ease-glass), color var(--dur-base) var(--ease-glass)',
        }}
      >
        {face === 'listening' ? (
          <span
            style={{
              width: 8 * scale, height: 8 * scale, borderRadius: '50%',
              backgroundColor: 'var(--job-violet-shimmer-lit)',
              boxShadow: '0 0 8px 1px var(--job-violet-shimmer)',
              animation: 'var(--kf-pulse) 1600ms var(--ease-glass) infinite',
            }}
          />
        ) : (
          <Icon name={face === 'done' ? 'check' : error ? 'mic-off' : 'mic'} size={Math.round(16 * scale)} />
        )}
      </span>
      <span style={{ ...side, right: 10 * scale }}>
        <span style={number}>{pad(seconds % 60)}</span>
        <span style={unit}>sec</span>
      </span>
    </span>
  );
}
