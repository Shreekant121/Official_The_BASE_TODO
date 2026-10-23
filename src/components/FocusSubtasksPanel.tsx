/**
 * Focus Mode's subtask checklist — RECONCILED against
 * `design-system/screens/focus.html`'s `SubtasksBody` (UI-32).
 *
 * The rows were always here (`SubtaskRows.tsx`); what the mockup adds is
 * everything AROUND them, and each piece answers a question the bare list
 * could not:
 *
 * - **A `2 / 5` reading over a progress bar.** The pill that opens this panel
 *   already says the same fraction, and the source draws it again at the head
 *   of the panel because the pill is a control and this is the subject. The
 *   bar fills over `--dur-slow` on `--ease-spring` — a tick is one of the four
 *   things `motion.css` rations overshoot to, and closing a step is a tick.
 * - **An explicit empty state.** *"No breakdown. This one is a single block of
 *   work."* Focus Mode never opened this panel for a task with no subtasks, so
 *   it had nothing to say; the pill is now always present, because "this task
 *   has no steps" is a fact worth being able to check mid-session.
 * - **A closing banner.** Every step ticked puts up *"Every step is closed.
 *   Mark the task done."* on `--glass-tint-lime` (done is lime, 29-1P2c1),
 *   arriving by `ag-condense`.
 *   It is the one place on the screen that tells you what to do next, and it
 *   only appears when there genuinely is nothing else left in the task.
 *
 * THE TICKS NOW PERSIST, and that is a bug fix rather than a port. The old
 * drawer toggled a local `completedSubtasks: string[]` that was never written
 * anywhere, while the pill beside it counted `status === 'completed'` off the
 * stored record — so ticking every box moved the checkmarks and left the pill
 * reading `0 / 5`, and the whole lot was lost on unmount. The same class of
 * disagreement UI-27 found between a card and its drawer. The toggle goes
 * through `updateBacklogTask` now, which `SUBTASK_PROXY_FIELDS` already
 * carries `status` for, and every reading on the screen comes off the same
 * stored fact. That is the queue's own **Session 18** ("the focus checklist
 * writes through"), which this session met on its way past — including its
 * last clause, that *"a row must not offer a tick it cannot honour"*: a queue
 * snapshot whose backlog record has gone (deleted on another device) has
 * nothing for the write to land on, so those rows are `disabled` and say so
 * rather than accepting a press that vanishes.
 *
 * The write goes through `updateBacklogTask` rather than the tree helper that
 * item proposed lifting into the store. `CLAUDE.md` is why: completion goes
 * through one path, and that is the path — it already walks every tree for an
 * id it cannot find at the top level, and it mirrors into the focus queue on
 * the way.
 */
import { countSubtasksRecursive, type Subtask, type Task } from '../store/useStore';
import { Icon } from '../ui';
import { FocusDockPanel } from './FocusDockPanel';
import { FocusSubtaskRow } from './SubtaskRows';

export interface FocusSubtasksPanelProps {
  open: boolean;
  docked: boolean;
  onClose: () => void;
  /** The live backlog record, not the focus queue's snapshot of it. */
  task: Task;
  onToggle: (sub: Subtask, done: boolean) => void;
  /** False when no stored record stands behind the queue's snapshot. */
  editable: boolean;
}

export interface FocusSubtasksBodyProps {
  /** The live backlog record, not the focus queue's snapshot of it. */
  task: Task;
  onToggle: (sub: Subtask, done: boolean) => void;
  /** False when no stored record stands behind the queue's snapshot. */
  editable: boolean;
}

/**
 * Everything inside the panel, without the panel. FIX-10's landscape column
 * (`FocusSideColumn`) draws the same checklist in a pane that is always open,
 * so the body is the part both arrangements share.
 */
export function FocusSubtasksBody({ task, onToggle, editable }: FocusSubtasksBodyProps) {
  const subtasks = task.subtasks ?? [];
  const { total, done } = countSubtasksRecursive(subtasks);

  return (
    <>
      {total > 0 && (
        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-4)' }}>
            <span
              style={{
                font: 'var(--type-numeric)', fontSize: 'var(--text-lg)',
                color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums',
              }}
            >
              {done} / {total}
            </span>
            <span style={{ font: 'var(--type-kicker)', color: 'var(--fg-4)' }}>steps done</span>
          </div>
          <div
            style={{
              height: 6, padding: 1, borderRadius: 'var(--r-pill)',
              backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
            }}
          >
            <span
              style={{
                display: 'block', height: '100%', width: `${(done / total) * 100}%`,
                borderRadius: 'var(--r-pill)', background: 'var(--job-lime)',
                boxShadow: '0 0 12px -2px var(--job-lime)',
                transition: 'width var(--dur-slow) var(--ease-spring)',
              }}
            />
          </div>
        </div>
      )}

      {total > 0 && (
        <div style={{ display: 'grid', gap: 2 }}>
          {subtasks.map((sub) => (
            <FocusSubtaskRow key={sub.id} sub={sub} depth={0} onToggle={onToggle} disabled={!editable} />
          ))}
        </div>
      )}

      {total > 0 && !editable && (
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
          No stored task stands behind this queue entry, so these steps cannot be ticked.
        </span>
      )}

      {total === 0 && (
        <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
          No breakdown. This one is a single block of work.
        </span>
      )}

      {total > 0 && done === total && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
            padding: 'var(--sp-5)', borderRadius: 'var(--r-md)',
            backgroundImage: 'var(--glass-tint-lime)',
            boxShadow: 'var(--glass-rim-2), var(--job-lime-shine)',
            animation: 'var(--kf-condense) var(--dur-base) var(--ease-spring) both',
          }}
        >
          <span style={{ display: 'flex', color: 'var(--job-lime)', flex: '0 0 auto' }}>
            <Icon name="check" size={16} />
          </span>
          <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)' }}>
            Every step is closed. Mark the task done.
          </span>
        </div>
      )}
    </>
  );
}

export default function FocusSubtasksPanel({ open, docked, onClose, task, onToggle, editable }: FocusSubtasksPanelProps) {
  return (
    <FocusDockPanel open={open} docked={docked} title="Subtasks" subtitle={task.title} onClose={onClose}>
      <FocusSubtasksBody task={task} onToggle={onToggle} editable={editable} />
    </FocusDockPanel>
  );
}
