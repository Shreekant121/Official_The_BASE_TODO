/**
 * **The two marks a row carries because of something a person did** (item 17).
 *
 * They live together, and apart from `RedAlertBadge`, because that is the real
 * distinction between them. Red Alert is what the *engine* concluded — `W`
 * past its midpoint — and it is a `StatusPill`, the app's one vocabulary for a
 * state a task is in. These two are the record of what *you* did: you declared
 * an emergency, or you pushed the task away in Focus Mode and it counted. A
 * task's state and a task's history are not the same kind of fact and they do
 * not get the same object.
 *
 * **Neither one is a `StatusPill`, and that is `StatusPill.prompt.md`'s rule
 * rather than a preference**: *"Don't invent statuses. The seven map to the
 * product's real vocabulary; a new one needs a new token."* An emergency is
 * not an eighth state — a task can be running, queued or overrunning *and*
 * flagged — so it takes the chip geometry `Tag` and `BlockedLine` use, a
 * carved surface with a glyph and a number, and no dot.
 *
 * **Emergency is coral and Avoided is neutral, and the pairing is the point.**
 * Coral is what this system spends on danger (rose until 29-1P2c2), which is exactly the claim the
 * flag makes, and the ⚡ plus the level make it readable without the hue. Where
 * it sits beside a coral Red Alert pill they are saying the same *kind* of
 * thing from two directions — the engine's reading and yours — and a second
 * hue between them would imply a difference that is not there. What keeps them
 * apart at a glance is that only the pill ripples: **`overrun` is one of the
 * two live-rippling states and nothing else in the app moves**, so the
 * conclusion pulses and the mark does not.
 *
 * Avoided goes the other way, and takes `parts.tsx`'s `Fact` untouched. Its
 * own note is the argument: *"Never a coloured pill — colour means status
 * here."* Being deferred four times is a measured fact about the task, the
 * same shape as its estimate or its subtask count, and it belongs on the facts
 * line beside them rather than shouting from the title line. `BlockedLine`
 * settled the identical question the same way: *"a warning colour on a row you
 * cannot act on is still a warning you cannot act on."*
 */
import type { CSSProperties } from 'react';
import { Icon } from '../../ui';
import { Fact } from '../project/parts';
import { EMERGENCY_MAX } from '../../store/useStore';

export interface EmergencyMarkProps {
  /** `Task.emergencyBoost`. Nothing renders at 0 or undefined. */
  level: number | undefined;
  /**
   * The engine scored this emergency at zero because its anchor date has gone
   * by. The mark then says so in the tooltip and goes to the neutral well:
   * the flag is still on the task, and it has stopped counting. Passing
   * `false` on a row that has no way of knowing is fine — it simply reads as
   * live, which is what an un-lapsed emergency is.
   */
  lapsed?: boolean;
  /** Drop the word and keep the glyph and the level. For rows with no width to spend. */
  compact?: boolean;
  style?: React.CSSProperties;
}

export function EmergencyMark({ level, lapsed = false, compact = false, style }: EmergencyMarkProps) {
  if (!level || level <= 0) return null;

  const tone = lapsed ? 'var(--fg-4)' : 'var(--job-coral-tag-fg)';

  return (
    <span
      title={
        lapsed
          ? `Flagged an emergency at ${level} of ${EMERGENCY_MAX}, but the deadline it was anchored to has passed — it no longer counts towards the score.`
          : `Emergency ${level} of ${EMERGENCY_MAX} — flagged by hand as "drop everything for this".`
      }
      style={{
        flex: '0 0 auto',
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px var(--sp-4) 3px var(--sp-3)', borderRadius: 'var(--r-pill)',
        backgroundImage: lapsed ? 'var(--glass-well)' : 'var(--glass-tint-coral)',
        boxShadow: lapsed ? 'var(--glass-well-shadow)' : 'var(--glass-rim-1)',
        color: tone,
        textDecoration: lapsed ? 'line-through' : 'none',
        ...style,
      }}
    >
      <Icon name="zap" size={12} style={{ flex: '0 0 auto', color: 'inherit' }} />
      <span
        className="ag-tnum"
        style={{
          font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
          textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'], color: 'inherit', whiteSpace: 'nowrap',
        }}
      >
        {compact ? level : `Emergency ${level}`}
      </span>
    </span>
  );
}

export interface IgnoredMarkProps {
  /** The sentence behind it — `ignoreSentence` from `lib/ignoredWork.ts`. */
  title: string;
  style?: CSSProperties;
}

/**
 * `Ignored` (BIG-3) — where the score would be on a task, and on the head of a
 * list or a project that is ignored. A quiet well, never a colour: ignored work
 * is fully visible on its own board and is not a warning about anything.
 */
export function IgnoredMark({ title, style }: IgnoredMarkProps) {
  return (
    <span
      title={title}
      style={{
        flex: '0 0 auto',
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px var(--sp-4) 3px var(--sp-3)', borderRadius: 'var(--r-pill)',
        backgroundImage: 'var(--glass-well)',
        boxShadow: 'var(--glass-well-shadow)',
        color: 'var(--fg-4)',
        ...style,
      }}
    >
      <Icon name="moon" size={12} style={{ flex: '0 0 auto', color: 'inherit' }} />
      <span
        style={{
          font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
          textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'], color: 'inherit', whiteSpace: 'nowrap',
        }}
      >
        Ignored
      </span>
    </span>
  );
}

export interface AvoidedMarkProps {
  /** `Task.avoidedCount`. Nothing renders at 0 or undefined. */
  count: number | undefined;
  /** `var(--fg-4)` on a finished row, like every other fact beside it. */
  tone?: string;
}

/**
 * `Avoided ×3` — how many times you deferred this in Focus Mode.
 *
 * The counter saturates at `AVOIDED_MAX` in the store, so this never has to
 * decide what to print past it: what the row shows and what the factor bar
 * scores are the same number by construction.
 */
export function AvoidedMark({ count, tone }: AvoidedMarkProps) {
  if (!count || count <= 0) return null;

  return (
    <Fact
      icon="skip-forward"
      tone={tone}
      title={`Deferred ${count} time${count === 1 ? '' : 's'} in Focus Mode. Each one adds a point to the score — the task keeps coming back.`}
    >
      Avoided &times;{count}
    </Fact>
  );
}
