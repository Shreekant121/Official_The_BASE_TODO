/**
 * Score — the whole session in one horizontal strip (UI-30).
 *
 * RECONCILED against `screens/scoring.html:961`, whose own note is the reason
 * this strip earns its space: *"One row, scores visible, so the order of the
 * session is legible before you touch anything."*
 *
 * **Every row carries a `ScoreDial size="sm"` now**, and that is what let the
 * header give its progress bar back. UI-9 paired this strip with `SparkBars`
 * — one anonymous 3px bar per task, height = its score — on the argument that
 * a spark bar is far under `--hit-min` so the thing you *click* has to be
 * something else. The argument was right and the source answers it better:
 * put the number **on** the thing you click. The profile is now legible rather
 * than merely visible, and it is attached to the task it describes.
 *
 * **A row states one of three things**, in the source's order of precedence: a
 * `check` in `--accent` once it needs nothing (`--status-done` is a task that
 * is finished; this task is *scored*, which is the session's own live state),
 * an amber dot with a glow while it is still short, or a blank 7px gutter so
 * nothing shifts sideways between the two.
 *
 * The deadline badge went with them. It was UI-9's, and at 46px beside a title
 * and a score chip there is no room for a fourth reading — the deadline is one
 * click away on the field that owns it, and the strip's job is *which task*,
 * not *when*.
 *
 * The current row is raised, not tinted: `--glass-fill-3` and `--glass-rim-2`,
 * which is the source's and also the app's — a hue here would be a fourth
 * colour competing with the amber dot for meaning.
 *
 * Rows stay 46px and titles stay visible text, which is also what the
 * screenshot harness waits for (`scripts/screenshots.ts` opens `/scoring` on
 * `text=Quarterly compliance review`).
 *
 * `ag-scroll` hides the horizontal track. That helper is documented for sheets
 * rather than pages and this is the same case, not an exception to it: a
 * scrollbar inside a pane of glass reads as browser chrome resting on the
 * surface. The page's own vertical scrollbar is untouched.
 */
import { useEffect, useRef } from 'react';
import { Icon, ScoreDial } from '../../ui';
import { taskNeedsAttention, type Task } from '../../store/useStore';
import { countNeeds } from '../../components/task-fields/needs';
import type { PriorityScores } from '../../store/usePriorityScores';

interface QueueStripProps {
  sessionIds: string[];
  tasksById: Map<string, Task>;
  cursor: number;
  onJump: (index: number) => void;
  /** The page's one scoring pass, so the strip and the Instrument agree. */
  scores: PriorityScores;
  /**
   * Item 19 — the tasks in this session that are waiting on unfinished work.
   * Computed once by the page rather than per row: the answer is a property of
   * the whole backlog, and thirty rows each walking the dependency graph to
   * ask the same question is the kind of thing that only shows up on a long
   * session.
   */
  lockedIds: ReadonlySet<string>;
}

/** What the strip's amber dot counts, from the stored task rather than a draft. */
function shortfall(task: Task): number {
  return countNeeds({
    score: task.humanOverride === undefined,
    deadline: !task.deadline,
    estimate: !task.estimatedTime,
    description: !task.description || task.description.trim() === '',
  });
}

export default function QueueStrip({ sessionIds, tasksById, cursor, onJump, scores, lockedIds }: QueueStripProps) {
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [cursor]);

  if (sessionIds.length <= 1) return null;

  return (
    <div
      className="ag-scroll"
      style={{
        display: 'flex', gap: 'var(--sp-3)', overflowX: 'auto',
        /* Bled out and back so a row's glow and rim are not clipped by the
           scroller's own edge. */
        margin: '0 calc(var(--sp-3) * -1)',
        padding: '0 var(--sp-3) 2px',
      }}
    >
      {sessionIds.map((id, index) => {
        const task = tasksById.get(id);
        if (!task) return null;
        const isCurrent = index === cursor;
        const handled = !taskNeedsAttention(task);
        const short = shortfall(task);
        /* Greyed like every other surface, with ONE exception: never the row
           you are standing on. The current row is the page's subject — it is
           raised rather than tinted precisely so you can read it — and dimming
           the task you are being asked to fill in would be the screen arguing
           with its own job. `Subject` states the lock in full a few pixels
           below instead, which is the better place for it anyway: there is
           room there to name the blocker. */
        const locked = lockedIds.has(id) && !isCurrent;

        return (
          <button
            key={id}
            ref={isCurrent ? activeRef : undefined}
            type="button"
            onClick={() => onJump(index)}
            title={task.title}
            aria-current={isCurrent ? 'true' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flex: '0 0 auto',
              maxWidth: 300, height: 46, padding: '0 var(--sp-5)', border: 0,
              borderRadius: 'var(--r-pill)',
              cursor: 'pointer',
              opacity: locked ? 0.62 : 1,
              color: isCurrent ? 'var(--fg-1)' : 'var(--fg-3)',
              backgroundImage: isCurrent ? 'var(--glass-fill-3)' : 'var(--glass-fill-1)',
              backdropFilter: 'var(--glass-bd-sm)',
              WebkitBackdropFilter: 'var(--glass-bd-sm)',
              boxShadow: isCurrent
                ? 'var(--glass-rim-2), var(--glass-cast-2)'
                : 'var(--glass-rim-1)',
              transition: 'var(--t-hover)',
            }}
          >
            {handled ? (
              <Icon name="check" size={15} style={{ color: 'var(--accent)', flex: '0 0 auto' }} />
            ) : short > 0 ? (
              <span
                aria-label={`${short} fields needed`}
                style={{
                  width: 7, height: 7, flex: '0 0 auto', borderRadius: '50%',
                  background: 'var(--hue-amber)', boxShadow: '0 0 8px var(--hue-amber)',
                }}
              />
            ) : (
              <span style={{ width: 7, flex: '0 0 auto' }} />
            )}

            <span
              style={{
                font: 'var(--type-label)', minWidth: 0,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {task.title}
            </span>

            <ScoreDial
              value={scores.scoreOf(task)}
              max={scores.peak}
              alert={scores.read(task).redAlert}
              size="sm"
            />
          </button>
        );
      })}
    </div>
  );
}
