/**
 * The two recursive subtask rows — one per screen that draws a breakdown.
 *
 * **This file was `SubtaskSidePanel.tsx`.** It held a floating right-edge
 * drawer plus these two rows; UI-27 took the drawer away from Set Deadlines
 * and UI-32 took it away from Focus Mode as well, replacing it with
 * `FocusDockPanel`. Nothing in the repo opens a subtask drawer any more, so
 * the file is named for what is actually left in it.
 *
 * `FocusSubtaskRow` — RECONCILED against `design-system/screens/focus.html`
 * (UI-32). `DeadlineSubtaskRow` is UI-27's and is untouched here.
 *
 * WHAT THE FOCUS ROW TOOK FROM THE MOCKUP
 * ---------------------------------------
 * - **A 44px row.** Ours was `--sp-2` of vertical padding around an 18px
 *   glyph — a ~26px hit target on the most-pressed control in the product,
 *   against `readme.md`'s flat rule that *"hit targets never below 44px"*.
 *   Both mockups that draw a breakdown set `minHeight: 44` with `0 var(--sp-4)`
 *   of padding, so it is not a focus-screen quirk.
 * - **`Checkbox`, instead of a hand-rolled `circle` / `circle-check` glyph.**
 *   The design system ships one and this screen is what it is for; it is
 *   ported at `src/ui/forms/Checkbox.tsx`, and its header carries the argument
 *   about the tick being emerald.
 * - **A done row sits on `--glass-fill-1`**, so a closed step reads as filled
 *   in rather than merely greyed, and the indent steps by 24px (`focus.html`)
 *   rather than the 18 this file used to assert the eye had learned.
 *   `DeadlineSubtaskRow` keeps 18: its own mockup says 26 and correcting it
 *   would move the deadlines baselines, which belongs to that screen's own
 *   session rather than to this one.
 * - **The number on the right is the step's TIME**, in `--job-lime` once it is
 *   done. It was the priority score, which is a reading nothing on this
 *   screen acts on — Focus asks how long, and every other surface that wants
 *   a subtask's score still shows one.
 *
 * WHAT IS UNCHANGED
 * -----------------
 * The recursion: the depth indent, the expand toggle defaulting open, and
 * `subtaskTotalSeconds` rolling a parent's time up out of its children. The
 * mockup hard-codes two levels and always draws both; the app's trees are
 * arbitrarily deep, so the twisty stays.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { type Subtask, subtaskTotalSeconds } from '../store/useStore';
import { formatSpan } from '../lib/timeSpan';
import { Checkbox, Icon } from '../ui';
import { TimeWell } from './TimeWell';

// ─── Shared row furniture ─────────────────────────────────────────────────

/** The expand caret, or the space it would have taken so titles stay aligned. */
function Twisty({ open, onToggle, hidden }: { open: boolean; onToggle: () => void; hidden: boolean }) {
  if (hidden) return <span className="shrink-0" style={{ width: 14 }} />;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? 'Collapse' : 'Expand'}
      aria-expanded={open}
      className="shrink-0"
      style={{
        display: 'flex', border: 0, padding: 0, background: 'transparent',
        color: 'var(--fg-4)', cursor: 'pointer',
      }}
    >
      <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }} style={{ display: 'flex' }}>
        <Icon name="chevron-right" size={14} />
      </motion.span>
    </button>
  );
}

/** One depth step. The old list used 18px and the eye had learned it. */
const INDENT = 18;

/** `focus.html`'s own step, on the screen whose rows have room for it. */
const FOCUS_INDENT = 24;

// ─── Focus Mode variant: recursive checklist ───────────────────────────────

interface FocusSubtaskRowProps {
  sub: Subtask;
  depth: number;
  /** Writes through to the real subtask — see `FocusSubtasksPanel`. */
  onToggle: (sub: Subtask, done: boolean) => void;
  /** No stored task behind this queue entry, so the tick cannot be honoured. */
  disabled?: boolean;
}

export function FocusSubtaskRow({ sub, depth, onToggle, disabled = false }: FocusSubtaskRowProps) {
  const [expanded, setExpanded] = useState(true);
  const children = sub.subtasks ?? [];
  const isDone = sub.status === 'completed';
  const seconds = subtaskTotalSeconds(sub);

  return (
    <div>
      <div
        className="flex items-center"
        style={{
          gap: 'var(--sp-4)',
          marginLeft: depth * FOCUS_INDENT,
          minHeight: 44,
          padding: '0 var(--sp-4)',
          borderRadius: 'var(--r-sm)',
          backgroundImage: isDone ? 'var(--glass-fill-1)' : 'none',
          transition: 'var(--t-hover)',
        }}
      >
        <Twisty open={expanded} onToggle={() => setExpanded((v) => !v)} hidden={children.length === 0} />
        <Checkbox
          checked={isDone}
          onChange={(next) => onToggle(sub, next)}
          disabled={disabled}
          size={depth > 0 ? 'sm' : 'md'}
          label={sub.title}
          style={{ flex: 1, minWidth: 0 }}
        />
        {seconds > 0 && (
          <span
            style={{
              font: 'var(--type-numeric)',
              fontSize: 'var(--text-2xs)',
              color: isDone ? 'var(--job-lime)' : 'var(--fg-4)',
              fontVariantNumeric: 'tabular-nums',
              flex: '0 0 auto',
            }}
          >
            {formatSpan(seconds)}
          </span>
        )}
      </div>
      <AnimatePresence>
        {expanded && children.length > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            {children.map((child) => (
              <FocusSubtaskRow key={child.id} sub={child} depth={depth + 1} onToggle={onToggle} disabled={disabled} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Set Deadlines variant: recursive time allocation ──────────────────────

interface DeadlineSubtaskRowProps {
  sub: Subtask;
  depth: number;
  onChangeTime: (id: string, seconds: number) => void;
}

export function DeadlineSubtaskRow({ sub, depth, onChangeTime }: DeadlineSubtaskRowProps) {
  const [expanded, setExpanded] = useState(true);
  const children = sub.subtasks ?? [];
  const isLeaf = children.length === 0;

  // Leaves show editable h/m inputs; parents show a read-only rollup of
  // their children's total so time budgets are always visible at every depth.
  const totalSeconds = subtaskTotalSeconds(sub);

  return (
    <div>
      <div
        className="flex items-center justify-between"
        style={{ gap: 'var(--sp-3)', padding: 'var(--sp-2) 0', paddingLeft: depth * INDENT }}
      >
        <div className="flex items-center min-w-0 flex-1" style={{ gap: 'var(--sp-3)' }}>
          <Twisty open={expanded} onToggle={() => setExpanded((v) => !v)} hidden={children.length === 0} />
          <span style={{ display: 'flex', color: 'var(--fg-4)', flex: '0 0 auto' }}>
            <Icon name="corner-down-right" size={14} />
          </span>
          <span
            className="truncate"
            style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)' }}
          >
            {sub.title}
          </span>
        </div>

        {/* The same `TimeWell` the task rows use, at the small size the
            mockup's own `SubRow` gives it. A branch is `locked`: UI-27 moved
            the rolled-up reading into the control itself, so a parent shows
            the Σ pill rather than a hand-rolled "1h 30m" span, and the two
            depths finally read as the same kind of number. */}
        <TimeWell
          size="sm"
          seconds={totalSeconds}
          blankWhenZero={isLeaf}
          locked={!isLeaf}
          name={`allocated to "${sub.title}"`}
          onSeconds={(secs) => onChangeTime(sub.id, secs)}
          /* 29-1P10a: a leaf's time opens the same ruler as its task's. */
          ruler={isLeaf ? {} : undefined}
        />
      </div>
      <AnimatePresence>
        {expanded && children.length > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            {children.map((child) => (
              <DeadlineSubtaskRow key={child.id} sub={child} depth={depth + 1} onChangeTime={onChangeTime} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
