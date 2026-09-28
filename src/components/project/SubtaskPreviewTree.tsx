/**
 * Project board — the subtask tree under a task row (UI-16).
 *
 * A READOUT with exactly one verb: open a branch. It is deliberately NOT
 * merged with `task-fields/SubtaskTree.tsx`, which is the editor behind the
 * task sheet — that one carries a draft, five recursive transforms and a
 * details panel per row, and none of it belongs on a board row you are only
 * glancing at. Same call UI-14 made when it left `session/QueueSubtaskTree.tsx`
 * un-merged with the editor for the same reason.
 *
 * WHAT CHANGED BEYOND THE PAINT
 *
 * - **THE SCORE IS GONE FROM SUBTASK ROWS (item 16).** A subtask can never be
 *   a prerequisite — `DependencyPicker` offers only top-level tasks — so it
 *   has no position in the dependency graph, and two of the seven variables
 *   the new engine is built on are graph variables. Scoring one meant showing
 *   a number that was structurally incapable of saying the thing the score now
 *   exists to say. The settled decision drops it from `SubtaskSidePanel`,
 *   `SubtaskTree`, `TaskSelection`'s subtask rows, `ProjectView`'s subtask
 *   rows and `publicShare` together, and `ScoreChip` — which existed for
 *   exactly this job — is deleted with them. The importance dial still writes
 *   `humanOverride` on a subtask; nothing reads it yet.
 * - **A finished subtask reads `--status-done`, not emerald.** `colors.css`
 *   rations emerald to mean LIVE and nothing else, and a subtask that is
 *   finished is the opposite of live. Same reasoning as UI-14's cyan tick on
 *   the queued row.
 * - **The disclosure control is a real button with `aria-expanded`.** It was a
 *   bare `<button>` holding a rotating chevron and no state for anything but a
 *   sighted user; it is also what stops a press on it starting a drag, since
 *   `SortableList`'s sensors let a `button` own the pointer.
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon, IconButton } from '../../ui';
import type { Subtask } from '../../store/useStore';

/** One indent step, in px. Matches the 16px the old preview used. */
const INDENT = 16;

export interface SubtaskPreviewTreeProps {
  subtasks: Subtask[];
  /** Nesting level. The caller passes nothing; the tree recurses on itself. */
  depth?: number;
}

export default function SubtaskPreviewTree({ subtasks, depth = 0 }: SubtaskPreviewTreeProps) {
  return (
    <>
      {subtasks.map((sub) => (
        <PreviewRow key={sub.id} sub={sub} depth={depth} />
      ))}
    </>
  );
}

function PreviewRow({ sub, depth }: { sub: Subtask; depth: number }) {
  const [expanded, setExpanded] = useState(false);
  const children = sub.subtasks ?? [];
  const done = sub.status === 'completed';

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-3)',
          minHeight: 24,
          paddingLeft: depth * INDENT,
        }}
      >
        {children.length > 0 ? (
          <IconButton
            size="sm"
            variant="ghost"
            aria-expanded={expanded}
            label={expanded ? `Collapse ${sub.title}` : `Expand ${sub.title}`}
            onClick={() => setExpanded((v) => !v)}
            style={{ width: 20, height: 20, flex: '0 0 auto' }}
          >
            <Icon
              name="chevron-down"
              size={12}
              style={{
                transform: expanded ? undefined : 'rotate(-90deg)',
                transition: 'transform var(--dur-fast) var(--ease-glass)',
              }}
            />
          </IconButton>
        ) : (
          <span aria-hidden="true" style={{ width: 20, flex: '0 0 auto' }} />
        )}

        <Icon
          name={done ? 'check-circle-2' : 'circle'}
          size={13}
          style={{ flex: '0 0 auto', color: done ? 'var(--status-done)' : 'var(--fg-4)' }}
        />

        <span
          title={sub.title}
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            font: 'var(--type-caption)',
            color: done ? 'var(--fg-4)' : 'var(--fg-2)',
            textDecoration: done ? 'line-through' : undefined,
          }}
        >
          {sub.title}
        </span>

        {sub.deadline && (
          <span
            className="ag-kicker ag-tnum"
            style={{ flex: '0 0 auto', color: 'var(--fg-4)' }}
          >
            {new Date(sub.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>

      <AnimatePresence>
        {expanded && children.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <SubtaskPreviewTree subtasks={children} depth={depth + 1} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
