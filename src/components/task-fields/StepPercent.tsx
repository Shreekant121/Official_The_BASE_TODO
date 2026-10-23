/**
 * How far a task's steps are, as "40%" (29-1P9c) — the task sheet's last
 * `ProgressRing`, beside "Subtasks", replaced by its number. His pick was the
 * side-by-side pane's "40%" (P9b) **but in white with a white glow**, not
 * lime; the Score screen's Subtasks section had the same ring and wears the
 * same number, so the two screens say it one way.
 *
 * Counts are the whole tree's, as the ring's "2/5" was. Nothing moves: the
 * number changes when a step is ticked, and that is all.
 */
export function StepPercent({ done, total }: { done: number; total: number }) {
  if (total <= 0) return null;
  const pct = Math.round((done / total) * 100);
  return (
    <span
      role="img"
      aria-label={`${done} of ${total} steps done`}
      title={`${done} of ${total} steps done`}
      style={{
        font: 'var(--type-title)', fontSize: 'var(--text-md)', fontWeight: 600,
        fontVariantNumeric: 'tabular-nums', color: 'var(--fg-1)',
        textShadow: 'var(--text-glow-white-bright)', flex: '0 0 auto',
      }}
    >
      {pct}%
    </span>
  );
}
