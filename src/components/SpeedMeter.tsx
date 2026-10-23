import { useEffect, useRef, useSyncExternalStore } from 'react';
import { readSpeedPref, subscribeSpeedPrefs } from '../lib/speedPrefs';
import { Z } from '../lib/zLayers';

/**
 * The frame-rate readout, bottom-left, while Settings → App → "Show frame
 * rate" is on (see `lib/speedPrefs.ts` for why it exists).
 *
 * It must not become the thing it measures. Two rules keep it honest:
 *
 *   - The text is written straight to the DOM once a second, not through
 *     React state, so the meter re-renders nothing and repaints one small
 *     label per second. A redraw sixty times a second is exactly the cost the
 *     2026-09-28 pulse fix removed (`ui/data/StatusPill.tsx`).
 *   - It counts `requestAnimationFrame` callbacks, which is the page's frame
 *     rate. A GPU that cannot keep up throttles those too, so a stutter on the
 *     device shows here as a low number and a count of slow frames.
 *
 * "slow" is a frame that took more than twice a 60Hz frame (33ms): one the
 * eye sees as a hitch. It keeps the worst second's count until the next
 * second replaces it, which is long enough to read mid-scroll.
 */
export default function SpeedMeter() {
  const on = useSyncExternalStore(subscribeSpeedPrefs, () => readSpeedPref('meter'));
  if (!on) return null;
  return <Meter />;
}

function Meter() {
  const label = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let windowStart = last;
    let frames = 0;
    let slow = 0;
    const tick = (now: number) => {
      const gap = now - last;
      last = now;
      frames += 1;
      if (gap > 34) slow += 1;
      if (now - windowStart >= 1000) {
        const fps = Math.round((frames * 1000) / (now - windowStart));
        if (label.current) label.current.textContent = `${fps} fps · ${slow} slow`;
        frames = 0;
        slow = 0;
        windowStart = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed', left: 12, bottom: 12, zIndex: Z.shortcuts,
        padding: '4px 10px', borderRadius: 'var(--r-pill)',
        background: 'oklch(0.12 0.01 200 / 0.92)', boxShadow: 'var(--glass-rim-1)',
        font: 'var(--type-numeric)', fontSize: 'var(--text-2xs)', color: 'var(--fg-2)',
        fontVariantNumeric: 'tabular-nums', pointerEvents: 'none',
      }}
    >
      <span ref={label}>— fps</span>
    </div>
  );
}
