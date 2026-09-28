/**
 * New Session — the select target (UI-31).
 *
 * `screens/session.html:233`, and the mockup states what it is for in a
 * comment above it: *"Hollow ring when available, emerald tick once the task
 * is committed — the same object in two states, never two different
 * controls."*
 *
 * UI-14 had two different controls. The available row carried a dead `circle`
 * glyph (the row itself was the button) and the queued row a `check-circle-2`,
 * so the thing you pressed to commit a task and the thing that told you it was
 * committed were not the same object, and neither of them was reachable on its
 * own. This is one 26px button on both sides: `aria-pressed` says which state
 * it is in, and pressing it toggles.
 *
 * **THE TICK IS EMERALD, AND THAT REVERSES UI-14.** That session made it cyan
 * on the argument that `--status-queued` is *"in the queue, not started"* and
 * emerald is rationed to LIVE. `readme.md` settles it the other way in the
 * sentence that defines the ration: *"One accent: emerald. It means live — a
 * running timer, **a committed block**, a completed task."* A task you have
 * put in today's queue is a committed block, which is the same clause UI-27
 * leaned on to make `Slider`'s fill emerald; and the elevation section adds
 * that glow is for objects that are live **or selected**. The source agrees
 * with the rule — `--glass-tint-accent` under `--glass-rim-2, --glow-accent-sm`
 * — so this is the documented rule and the prototype pointing the same way.
 * `--status-queued` keeps its own job: it is a task's stored *status*, which
 * this is not.
 *
 * The check DRAWS ITSELF rather than appearing — `strokeDashoffset` 16 → 0 on
 * `--dur-base`. Same tick `project/parts.tsx` uses, which is the board's
 * completion control; the two screens draw the same stroke because the design
 * system only has one.
 *
 * **`locked` — item 19.** A blocked task cannot simply be picked into today
 * any more; it takes the row's own "Schedule anyway", which is a second,
 * deliberate press. So the dot goes to `not-allowed` at 40% — the same numbers
 * the board's `Tick` takes for the same state, because these are the two
 * halves of one control vocabulary and a third dimming would read as a third
 * meaning. It is never locked on the queued side: taking a task back OUT of
 * today writes nothing anywhere and must always be possible.
 */
import { useState } from 'react';

export interface SelectDotProps {
  /** Committed to today. Drives both the material and `aria-pressed`. */
  on: boolean;
  onClick: () => void;
  /** The whole sentence — "Add X to today" / "Remove X from today". */
  label: string;
  /** Waiting on unfinished work: the row's "Schedule anyway" is the way in. */
  locked?: boolean;
}

export function SelectDot({ on, onClick, label, locked = false }: SelectDotProps) {
  const [hover, setHover] = useState(false);

  return (
    <button
      type="button"
      onClick={() => { if (!locked) onClick(); }}
      disabled={locked}
      aria-pressed={on}
      aria-label={label}
      title={label}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid',
        placeItems: 'center',
        flex: '0 0 auto',
        width: 26,
        height: 26,
        padding: 0,
        border: 0,
        cursor: locked ? 'not-allowed' : 'pointer',
        opacity: locked ? 0.4 : 1,
        borderRadius: '50%',
        backgroundImage: on ? 'var(--glass-tint-accent)' : 'var(--glass-well)',
        boxShadow: on
          ? 'var(--glass-rim-2), var(--glow-accent-sm)'
          : hover && !locked
            ? 'var(--glass-well-shadow), 0 0 0 1px var(--accent-hairline)'
            : 'var(--glass-well-shadow), 0 0 0 1px var(--line-soft)',
        color: on ? 'var(--accent)' : 'var(--fg-3)',
        transition: 'var(--t-hover)',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <path
          d="M3.5 8.5 L6.5 11.5 L12.5 4.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            strokeDasharray: 16,
            strokeDashoffset: on ? 0 : 16,
            transition: 'stroke-dashoffset var(--dur-base) var(--ease-glass)',
          }}
        />
      </svg>
    </button>
  );
}
