/**
 * The task's status, as three pills you press (UI-13).
 *
 * Built out of `StatusPill` itself rather than out of a second set of hues:
 * these are the same three states the rest of the app reads back, so
 * "To Do / In Progress / Done" are `queued` / `running` / `done` in the design
 * system's own vocabulary, and the ripple on `running` comes free — it is the
 * one state that is genuinely live, which is the whole of `StatusPill`'s
 * signalling rule.
 *
 * `StatusPill` is a `<span>`, so each one is wrapped in a bare `<button>` that
 * carries the semantics — the pill is the picture, the button is the control.
 * `aria-pressed` says which is on, so the group reads correctly to a screen
 * reader without inventing a radiogroup the visual does not look like.
 *
 * **An unselected pill is greyed rather than re-styled.** `colors.css` is
 * explicit that the status hues are never decoration, and three hues glowing
 * at once when only one of them is true is exactly that — so the two you have
 * not chosen drop their colour entirely and the one you have keeps it. That is
 * what the old row did with `active ? color : ''`, said in one property.
 *
 * Greying is not enough on its own, which is why these carry
 * `.ag-status-choice`: "In Progress" is `running`, and `running` ripples
 * FOREVER, so an option nobody had chosen sat there pulsing. The rule in
 * `screens.css` stops the ripple on an unchosen option and says why at
 * length — it is the reason the Score screen can be photographed at all.
 *
 * **`lockedComplete` — item 19, and it takes out exactly one pill.** A task
 * waiting on unfinished work cannot be marked Done, so "Done" goes disabled
 * with `not-allowed` and the caller's sentence on its `title`; "To Do" and "In
 * Progress" stay live, because a locked task still edits and moving it between
 * those two is a real thing to want. This is the whole reason the lock is
 * expressed here rather than at the two call sites: the task sheet and Needs
 * Attention both render this control, and a rule written twice is a rule that
 * ends up meaning two things.
 *
 * The dimming does NOT stack. A disabled "Done" that is also unselected would
 * be at 0.5 × 0.4 and effectively gone from the screen — a control you cannot
 * see is not a control you have been refused, it is one you cannot find. So
 * the two resolve to one opacity, and a locked "Done" sits at the same 0.4
 * every other refused control in the app takes (`Tick`, `SelectDot`).
 */
import { StatusPill } from '../../ui';
import type { TaskStatus } from '../../store/useStore';
/* The table moved to a component-free file at UI-26, so the task sheet's
   header can restate the current status from the same three rows. */
import { STATUS_OPTIONS } from './taskStatusOptions';

interface StatusPillsProps {
  value: TaskStatus;
  onChange: (status: TaskStatus) => void;
  /**
   * Item 19 — this task is waiting on unfinished work, so "Done" is refused.
   * The whole sentence, not a boolean: it becomes the pill's `title`, and
   * "you can't" without "because of X" is not something anyone can act on.
   */
  lockedComplete?: string;
}

export default function StatusPills({ value, onChange, lockedComplete }: StatusPillsProps) {
  return (
    <div className="flex flex-wrap" style={{ gap: 'var(--sp-3)' }}>
      {STATUS_OPTIONS.map(({ value: option, label, status }) => {
        const active = value === option;
        const locked = !!lockedComplete && option === 'completed';
        return (
          <button
            key={option}
            type="button"
            className="ag-status-choice"
            aria-pressed={active}
            disabled={locked}
            title={locked ? lockedComplete : undefined}
            onClick={() => { if (!locked) onChange(option); }}
            style={{
              display: 'inline-flex', padding: 0, border: 0, background: 'transparent',
              borderRadius: 'var(--r-pill)',
              cursor: locked ? 'not-allowed' : 'pointer',
              filter: active && !locked ? undefined : 'grayscale(1)',
              /* One opacity, never the product of two — see the note above. */
              opacity: locked ? 0.4 : active ? 1 : 0.5,
              transition: 'opacity var(--dur-base) var(--ease-glass), filter var(--dur-base) var(--ease-glass)',
            }}
          >
            <StatusPill status={status}>{label}</StatusPill>
          </button>
        );
      })}
    </div>
  );
}
