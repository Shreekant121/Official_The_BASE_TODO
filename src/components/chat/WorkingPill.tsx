/**
 * Waiting, drawn as one pill (item 13G).
 *
 * `atlas.html`'s `Working`, and its comment carries the rule this replaces:
 * *"It says thinking, or names one tool. **It is never a log.**"* What was
 * here before was a kicker beside a pulsing mark, and while a turn ran the
 * chips arrived under it one at a time — so a turn that called four tools drew
 * four rows of machine narration above the answer. One pill that renames
 * itself says the same thing in the space of a line.
 *
 * MOTION 4 OF 4 LIVES HERE
 * ------------------------
 * It arrives rather than appearing: `scale(.94)→1` on `--dur-morph`, `blur(6px)
 * →0` and `opacity` on `--dur-fast`, and the cast shadow on `--dur-base`. The
 * transform is on the slow curve and the opacity on the fast one deliberately
 * — the pill is legible almost at once and is still settling into place, which
 * is what makes it read as condensing out of the page rather than fading in
 * from nowhere (`tokens/motion.css`'s opening line).
 *
 * The accent dot inside it takes `var(--kf-pulse) 1600ms` infinite, the one emission
 * this screen is allowed: `readme.md` rations it to what is live, and a turn
 * that is running is the definition.
 *
 * THE ELLIPSIS IS ANIMATED, AND IT IS THE THING A SESSION SKIPS
 * -------------------------------------------------------------
 * One → two → three dots on a **420ms** interval, not a static `…`. It is the
 * only part of this screen's motion that is not a transition or a keyframe,
 * which is exactly why it gets missed.
 *
 * **It is also the only part that `prefers-reduced-motion` cannot reach.**
 * `tokens/motion.css` clamps every `--dur-*` to 1ms and puts
 * `animation-duration: 1ms !important` on `*`, so the 1600ms pulse *is*
 * covered by that rule — the number looks like an escape and is not. A
 * `setInterval` is a real one: no CSS clamp touches it. So it is stopped here,
 * deliberately, by asking the media query directly. Someone who has told their
 * machine to stop moving things gets three steady dots.
 */
import { useEffect, useState } from 'react';
import { Icon, useMedia } from '../../ui';

/** The mockup's own cadence. */
const ELLIPSIS_MS = 420;

const STILL = '(prefers-reduced-motion: reduce)';

export function WorkingPill({
  label,
  tool,
}: {
  /** What it is doing, in words. "Thinking" when there is nothing better. */
  label: string;
  /**
   * The one tool being run, if a tool is being run.
   *
   * One, never a list — a turn calling four tools renames this pill four
   * times, and the pill is the same pill throughout. The transition on its
   * transform is what makes that read as one thing changing its mind rather
   * than four things arriving.
   */
  tool?: string;
}) {
  const [dots, setDots] = useState(0);
  const [arrived, setArrived] = useState(false);
  const still = useMedia(STILL);

  useEffect(() => {
    /*
     * A frame late on purpose: the "from" styles have to be painted once for
     * the transition to have anywhere to come from. Mounting straight into the
     * arrived state would draw the pill finished.
     *
     * **The timer is the correctness half, and this is the second place in
     * this screen to need it.** A hidden or backgrounded tab throttles
     * `requestAnimationFrame` to nothing, and `arrived` gates `opacity` — so a
     * frame that never comes leaves the pill at `opacity: 0` for as long as the
     * tab stays unlooked-at. Measured: in a background tab no frame had fired
     * after 600ms and the pill's computed opacity was still 0, which means the
     * one thing on the screen that says Atlas is working was invisible exactly
     * when somebody had switched away to wait for it. `MiniNav`'s indicator had
     * the identical bug for the identical reason.
     *
     * Whichever of the two fires first wins; the other is cancelled.
     */
    const done = () => setArrived(true);
    const frame = requestAnimationFrame(done);
    const fallback = setTimeout(done, 64);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(fallback);
    };
  }, []);

  useEffect(() => {
    if (still) return;
    const timer = setInterval(() => setDots((n) => (n + 1) % 3), ELLIPSIS_MS);
    return () => clearInterval(timer);
  }, [still]);

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-4)',
        justifySelf: 'start', minHeight: 38, padding: '0 var(--sp-6) 0 var(--sp-5)',
        borderRadius: 'var(--r-pill)',
        backgroundImage: 'var(--glass-fill-1)',
        boxShadow: arrived ? 'var(--glass-rim-1), var(--glass-cast-1)' : 'var(--glass-rim-1)',
        opacity: arrived ? 1 : 0,
        transform: arrived ? 'scale(1)' : 'scale(0.94)',
        filter: arrived ? 'blur(0)' : 'blur(6px)',
        transition:
          'opacity var(--dur-fast) var(--ease-glass),' +
          ' transform var(--dur-morph) var(--ease-morph),' +
          ' filter var(--dur-fast) var(--ease-glass),' +
          ' box-shadow var(--dur-base) var(--ease-glass)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'grid', placeItems: 'center', width: 22, height: 22, flex: '0 0 auto',
          borderRadius: '50%', backgroundImage: 'var(--glass-tint-accent)',
          boxShadow: 'var(--glass-rim-1), var(--glow-accent-sm)',
          color: 'oklch(0.93 0.07 162)',
          animation: 'var(--kf-pulse) 1600ms var(--ease-glass) infinite',
        }}
      >
        <Icon name={tool ? 'search' : 'sparkles'} size={12} />
      </span>
      <span style={{ font: 'var(--type-caption)', color: 'var(--fg-2)', whiteSpace: 'nowrap' }}>
        {label}
        <span
          aria-hidden="true"
          style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-4)' }}
        >
          {'.'.repeat(still ? 3 : dots + 1)}
        </span>
      </span>
      {tool && (
        <span
          className="ag-kicker"
          style={{
            color: 'var(--fg-4)',
            borderLeft: '1px solid var(--line-faint)',
            paddingLeft: 'var(--sp-4)',
          }}
        >
          {tool}
        </span>
      )}
    </div>
  );
}
