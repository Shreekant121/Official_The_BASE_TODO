/**
 * The session budget's trough (UI-31).
 *
 * `screens/session.html:857` and `screens/deadlines.html` draw the same bar,
 * token for token: an 8px `--glass-well` trough with 2px of padding, a pill
 * fill that runs from a 55%-alpha accent to solid `--accent` under a 14px
 * glow, and the whole thing flipping to the coral pair the moment the plan
 * outruns the window (amber until 29-1P2c2; the fill is lime since P2c1). It fills over `--dur-slow`, which is the reward moment
 * — the same duration `Stepper`'s connector takes and for the same reason.
 *
 * Both drawings are of ONE number: `sessionDuration` in the store. UI-27 built
 * the Set Deadlines copy; UI-31's session screen is the second, and a second
 * hand-written copy of a gradient is how two readings of one field start
 * disagreeing about what "full" looks like. So it is one component, and each
 * screen still writes its own words above it — "Allocated … of a 4h window"
 * there, "Committed … of a 4h day" here — because the two are naming different
 * halves of the same commitment.
 *
 * It is a bar, not a `Meter`: `project/parts.tsx`'s meter is a 3px hairline
 * reporting subtask progress inside a card, and this is a page-level reading
 * with its own glow. Keeping them apart is deliberate.
 */
export interface BudgetTrackProps {
  /** What is spent, in the same unit as `budget`. */
  spent: number;
  /** The window. Guarded against zero, so an unset budget draws an empty bar rather than dividing by it. */
  budget: number;
  /** Spent is past the budget. The caller already knows — it colours its own label row from the same test. */
  over: boolean;
}

export function BudgetTrack({ spent, budget, over }: BudgetTrackProps) {
  return (
    <div
      style={{
        height: 8,
        padding: 2,
        borderRadius: 'var(--r-pill)',
        overflow: 'hidden',
        backgroundImage: 'var(--glass-well)',
        boxShadow: 'var(--glass-well-shadow)',
      }}
    >
      <span
        style={{
          display: 'block',
          height: '100%',
          borderRadius: 'var(--r-pill)',
          width: `${Math.min(100, (spent / Math.max(1, budget)) * 100)}%`,
          /* Over the day is coral (29-1P2c2: over time is coral's job). */
          background: over
            ? 'linear-gradient(90deg, oklch(0.7 0.19 28 / 0.6), var(--job-coral))'
            : 'linear-gradient(90deg, oklch(0.84 0.17 130 / 0.55), var(--job-lime))',
          boxShadow: over ? '0 0 14px -2px var(--job-coral)' : '0 0 14px -2px var(--job-lime)',
          transition: 'width var(--dur-slow) var(--ease-glass), background var(--dur-base) var(--ease-glass)',
        }}
      />
    </div>
  );
}
