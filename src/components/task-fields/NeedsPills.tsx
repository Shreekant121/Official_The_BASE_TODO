/**
 * The "Needs …" row — one pill per thing a task is still missing (UI-26).
 *
 * WHY THIS IS A SHARED FILE. `TaskSheet.prompt.md` asks for the same row on
 * the task sheet — *"Every missing required field appears as an amber chip in
 * the header; pressing one focuses that field and rings it amber for a beat.
 * The footer restates the count, never a red banner."* — and UI-9 had already
 * built exactly that row on the Needs Attention screen. Two copies of one
 * vocabulary is how two screens start disagreeing about what a task is
 * missing, so the row moved here and both read it. The four things it can name
 * are in `needs.ts`.
 *
 * The pills are `StatusPill status="review"`, not a hand-rolled chip: UI-25
 * settled that the `--status-*` set is this app's tone vocabulary, and
 * "needs a look" is what `review` is — grey with its triangle since 29-1P2c2
 * (the mockup's amber is gold's hue, and gold is rewards). `All set` is `done`.
 *
 * `onJump` is the sheet's half. With it, each pill becomes a button that
 * scrolls its field into view and rings it; without it the markup is exactly
 * the spans Needs Attention has always rendered, which is why that screen's
 * baselines did not move when this was extracted.
 */
import type { CSSProperties, ReactNode } from 'react';
import { StatusPill } from '../../ui';
import { NEED_LABELS, type NeedId } from './needs';
import type { TaskDraftMissing } from './useTaskDraft';

/** Kicker-cased pill for one thing this task is still missing. */
function NeedsPill({ children }: { children: ReactNode }) {
  return (
    <StatusPill status="review" size="sm" dot={false}>
      {children}
    </StatusPill>
  );
}

export interface NeedsPillsProps {
  missing: TaskDraftMissing;
  /**
   * Makes each pill pressable. The caller decides what "go to this field"
   * means — the sheet scrolls the field into view, rings it and focuses it.
   */
  onJump?: (id: NeedId) => void;
  /** Shown when nothing is missing. Pass `''` to render nothing at all. */
  allSetLabel?: string;
}

export default function NeedsPills({ missing, onJump, allSetLabel = 'All set' }: NeedsPillsProps) {
  const outstanding = NEED_LABELS.filter(([id]) => missing[id]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
      {/* Only while something is outstanding. "Needs — All set" is a sentence
          that argues with itself, and the source's own answer to the finished
          state is one kicker on its own: *"Fully scored"*. */}
      {outstanding.length > 0 && (
        <span
          style={{
            font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
            textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'], color: 'var(--fg-4)',
          }}
        >
          Needs
        </span>
      )}
      {outstanding.map(([id, label]) =>
        onJump ? (
          <button
            key={id}
            type="button"
            onClick={() => onJump(id)}
            aria-label={`Go to ${label}`}
            style={{
              display: 'inline-flex', padding: 0, border: 0, borderRadius: 'var(--r-pill)',
              background: 'transparent', cursor: 'pointer',
            }}
          >
            <NeedsPill>{label}</NeedsPill>
          </button>
        ) : (
          <NeedsPill key={id}>{label}</NeedsPill>
        ),
      )}
      {outstanding.length === 0 && allSetLabel !== '' && (
        <StatusPill status="done" size="sm">{allSetLabel}</StatusPill>
      )}
    </div>
  );
}
