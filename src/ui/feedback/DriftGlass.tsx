/**
 * Colours moving inside the glass (29-1P15d, idea 77, from his "Loading"
 * video): once Atlas has been working for a while, soft violet light drifts
 * behind its working pill and a seconds count appears beside the words. When
 * the work ends the pill goes, and with it the light.
 *
 *   const job = useLongJob(turn.startedAt);   // ./useLongJob.ts
 *   <Pill style={{ isolation: 'isolate' }}>
 *     <DriftGlass on={job.long} />
 *     …words… {job.long && `${job.seconds}s`}
 *   </Pill>
 *
 * **Only for the longer jobs, his call (2026-10-20).** A reply that comes back
 * in a couple of seconds looks as it always did; the colours start at
 * `LONG_JOB_MS`, which is about when a person waiting starts to wonder whether
 * anything is happening. **Violet shades only**, his call: the card drifted
 * four colours, and Atlas's working lights are Atlas's one colour (as P15a's
 * edge light). The card counted a percentage; Atlas cannot know how far
 * through a turn it is, so the number here is the seconds it has run.
 *
 * The parent must be positioned and isolated (`position: relative;
 * isolation: isolate`): the layer sits at `z-index: -1` so it paints over the
 * pill's own glass and under its words, without every child needing a
 * position of its own. How it moves cheaply is in `atlasAtWork.css`.
 */

export function DriftGlass({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className="ag-drift-glass" data-on={on ? '' : undefined} data-drift-glass="">
      <i />
      <i />
      <i />
    </span>
  );
}

/**
 * How long a long job has run (29-1P15d), at the end of the pill. Only the
 * seconds: Atlas cannot know how far through a turn it is, so the card's
 * percentage would be made up. Past a minute it reads "1:05".
 */
export function LongJobSeconds({ seconds }: { seconds: number }) {
  const words = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <span
      aria-label={`${seconds} seconds`}
      style={{
        font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', fontVariantNumeric: 'tabular-nums',
        color: 'var(--job-violet-text)',
        borderLeft: '1px solid var(--line-faint)', paddingLeft: 'var(--sp-4)',
        animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
      }}
    >
      {words}
    </span>
  );
}
