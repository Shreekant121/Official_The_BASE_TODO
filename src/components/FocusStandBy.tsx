/**
 * The StandBy clock (29-1P10c, idea 100): Focus as a bedside clock. On the
 * tablet held sideways with the clock running, a minute after his last touch,
 * the whole screen becomes the task's clock and the task's name on black —
 * nothing else. A tap puts Focus back; left alone, it returns. When and
 * whether it is night are `lib/standBy.ts`.
 *
 * It is a layer over Focus, not a screen of its own, so nothing about the run
 * changes under it: the clock keeps counting, brown noise keeps playing (both
 * `FocusRunHost`'s), and Focus's wake lock keeps the screen on. Past zero the
 * numbers go gold and count up as on Focus (`over="flow"`). At night (the
 * Dashboard's greeting's night) everything is dim red on pure black, gold
 * included, his call: a light by the bed, the one exception to one colour,
 * one job (`--standby-night` in `v3.css`); "+" still says flow.
 */
import { Countdown } from '../ui';
import { Z } from '../lib/zLayers';

/**
 * How many ems wide the numerals are, so the clock fills the width it has:
 * "1:23:45" is Focus's own 4.4 (`CLOCK_EM`), "23:45" about 3.1, and flow's
 * "+" and its gap add 0.9. Sized by what is shown, so "25:00" is not drawn
 * as small as a clock with hours.
 */
function clockEm(seconds: number): number {
  return (Math.abs(seconds) >= 3600 ? 4.4 : 3.1) + (seconds < 0 ? 0.9 : 0);
}

/**
 * The face: the clock as big as the box allows, the task's name under it.
 * Fills its parent (the whole window on Focus, a card on `/design`).
 */
export function StandByFace({
  seconds, title, running, night,
}: {
  seconds: number;
  title: string;
  running: boolean;
  night: boolean;
}) {
  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'grid', placeItems: 'center',
        containerType: 'size', overflow: 'hidden',
        /* Pure black at night: on his OLED that is a dark screen, not a grey one. */
        background: night ? 'oklch(0 0 0)' : 'var(--void-0)',
        transition: 'background var(--dur-slow) var(--ease-glass)',
      }}
    >
      <div style={{ display: 'grid', justifyItems: 'center', gap: '3cqb', width: '100%', minWidth: 0 }}>
        <Countdown
          seconds={seconds}
          format="clock"
          running={running}
          over="flow"
          numeralSize={`min(calc(92cqi / ${clockEm(seconds)}), 56cqb)`}
          numeralWeight="var(--weight-bold)"
          tint={night ? 'var(--standby-night)' : undefined}
        />
        <span
          style={{
            maxWidth: '86cqi', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
            fontSize: 'max(var(--text-md), 6cqb)', fontWeight: 'var(--weight-semi)',
            lineHeight: 'var(--leading-tight)',
            color: night ? 'var(--standby-night-dim)' : 'var(--fg-3)',
          }}
        >
          {title}
        </span>
      </div>
    </div>
  );
}

/**
 * StandBy over Focus, fading in. A tap anywhere is `onWake`. The fade is a
 * CSS animation, not Framer: it runs on the compositor, and it finishes under
 * the harness's fake clock, which a Framer fade never does.
 */
export function StandByLayer({ onWake, ...face }: Parameters<typeof StandByFace>[0] & { onWake: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`StandBy clock, ${face.title}. Tap to show Focus.`}
      data-standby={face.night ? 'night' : 'day'}
      onClick={onWake}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onWake(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: Z.toast, cursor: 'pointer', outline: 'none',
        animation: 'var(--kf-condense) var(--dur-slow) var(--ease-glass) both',
      }}
    >
      <StandByFace {...face} />
    </div>
  );
}
