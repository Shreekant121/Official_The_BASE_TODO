/**
 * The infinitely nestable subtask editor, rebuilt on Aurora Glass (UI-13).
 *
 * WHAT IS UNCHANGED. Every tree transform. `addSubtaskToParent`,
 * `toggleSubtaskInTree`, `deleteSubtaskFromTree`, `renameSubtaskInTree` and
 * `updateSubtaskDetailsInTree` are byte for byte what they were, `onChange`
 * still receives a TRANSFORM rather than the next array (two edits batched
 * into one render each have to build on the other's result), and the
 * resync against the last-seen `sub.id` is still a render-time adjustment
 * rather than an effect, so switching subtasks never flashes the previous
 * one's fields for a frame.
 *
 * WHAT CHANGED, AND WHY
 * ---------------------
 * - **THE SCORE BADGE IS GONE (item 16).** UI-12 and UI-13 spent two sessions
 *   getting this row to read the app's one band table instead of its own hex;
 *   the answer turned out to be that a subtask has no score at all. It can
 *   never be a prerequisite — `DependencyPicker` offers only top-level tasks —
 *   so it has no position in the dependency graph, and two of the seven
 *   variables the engine is built on are graph variables. The settled decision
 *   drops it from every subtask surface at once. The importance dial below
 *   still writes `humanOverride`; nothing reads it yet.
 * - **Priority is two hues instead of four.** Blue / amber / orange / red ran
 *   up the scale as decoration, which `colors.css` forbids for the status
 *   hues. Colour now appears only where it means something: `high` is amber —
 *   "needs a decision" — and `urgent` is rose, the hue this system spends on a
 *   live problem. Low and medium are steps on the neutral foreground ladder,
 *   which still tells them apart without claiming either is a problem.
 * - **The row's own personal-score picker is gone**, replaced by the shared
 *   one. It was a hand-rolled 1–5 row in a fifth colour (`#facc15`) doing
 *   exactly what the extracted component already did — the same duplication
 *   that extraction existed to end. (Item 7 merged that picker and the
 *   Eisenhower grid into a single `HumanOverridePicker`, which is what this
 *   row now shows; the argument for sharing one control is unchanged.)
 * - **The row actions are `.ag-card-actions`, not `group-hover`.** They were
 *   `opacity-0 group-hover:opacity-100`, which has no hover on a touch screen
 *   and no `:focus-within` — so on the tablet, half of what this app runs on,
 *   add / details / delete were invisible on every row, and by keyboard the
 *   focus ring landed on controls that could not be seen. The rule in
 *   `screens.css` covers both cases and exists for this.
 *
 * *One thing worth not re-learning:* the inline rename and the inline "add a
 * child" fields are deliberately NOT `Input`. A tree row is 28px of content
 * and `Input`'s smallest well is 38, so every double-click to rename would
 * shove the rest of the tree down and back again. They are chromeless fields
 * on an accent hairline instead — the design system has no dense inline
 * editor, and this is the one place in the app that needs one. The standalone
 * "Add subtask" field at the foot of the tree IS a real `Input`, because that
 * one is a field rather than a row.
 */
import { useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  countSubtasksRecursive,
  type Subtask, type TaskPriority,
} from '../../store/useStore';
import { Button, Icon, IconButton, Input, Textarea } from '../../ui';
import HumanOverridePicker from './HumanOverridePicker';

// ── Recursive tree helpers ─────────────────────────────────────────────────

function addSubtaskToParent(tree: Subtask[], parentId: string | null, newSub: Subtask): Subtask[] {
  if (parentId === null) return [...tree, newSub];
  return tree.map((s) => ({
    ...s,
    subtasks: s.id === parentId
      ? [...(s.subtasks ?? []), newSub]
      : addSubtaskToParent(s.subtasks ?? [], parentId, newSub),
  }));
}

function toggleSubtaskInTree(tree: Subtask[], id: string): Subtask[] {
  return tree.map((s) => ({
    ...s,
    status: s.id === id ? (s.status === 'completed' ? 'needsAction' : 'completed') : s.status,
    subtasks: toggleSubtaskInTree(s.subtasks ?? [], id),
  }));
}

function deleteSubtaskFromTree(tree: Subtask[], id: string): Subtask[] {
  return tree
    .filter((s) => s.id !== id)
    .map((s) => ({ ...s, subtasks: deleteSubtaskFromTree(s.subtasks ?? [], id) }));
}

function renameSubtaskInTree(tree: Subtask[], id: string, title: string): Subtask[] {
  return tree.map((s) => ({
    ...s,
    title: s.id === id ? title : s.title,
    subtasks: renameSubtaskInTree(s.subtasks ?? [], id, title),
  }));
}

function updateSubtaskDetailsInTree(tree: Subtask[], id: string, updates: Partial<Subtask>): Subtask[] {
  return tree.map((s) => ({
    ...s,
    ...(s.id === id ? updates : {}),
    subtasks: updateSubtaskDetailsInTree(s.subtasks ?? [], id, updates),
  }));
}

// ── Priority ───────────────────────────────────────────────────────────────

/**
 * Two hues, not four. See the note at the top of this file: `high` needs a
 * decision, `urgent` is a live problem, and the two below them are steps on
 * the neutral ladder rather than colours that claim anything.
 */
const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; fill: string }> = {
  low:    { label: 'Low',    color: 'var(--fg-4)',           fill: 'var(--glass-fill-1)'     },
  medium: { label: 'Medium', color: 'var(--fg-2)',           fill: 'var(--glass-fill-2)'     },
  high:   { label: 'High',   color: 'var(--status-review)',  fill: 'var(--glass-tint-amber)' },
  urgent: { label: 'Urgent', color: 'var(--status-overrun)', fill: 'var(--glass-tint-rose)'  },
};

/** The chromeless field a tree row is renamed in — see the note at the top. */
const INLINE_FIELD = {
  flex: 1,
  minWidth: 0,
  padding: '0 0 2px',
  border: 0,
  borderBottom: '1px solid var(--accent-hairline)',
  borderRadius: 0,
  outline: 'none',
  background: 'transparent',
  font: 'var(--type-body)',
  fontSize: 'var(--text-sm)',
  letterSpacing: 'var(--tracking-ui)',
  color: 'var(--fg-1)',
} as const;

const DETAIL_LABEL = {
  font: 'var(--type-kicker)',
  letterSpacing: 'var(--tracking-kicker)',
  textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'],
  color: 'var(--fg-3)',
} as const;

// ── Single row (recursive) ─────────────────────────────────────────────────

interface SubtaskItemProps {
  sub: Subtask;
  depth: number;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onAddChild: (parentId: string, title: string) => void;
  onRename: (id: string, title: string) => void;
  onUpdateDetails: (id: string, updates: Partial<Subtask>) => void;
}

function SubtaskItem({ sub, depth, onToggle, onDelete, onAddChild, onRename, onUpdateDetails }: SubtaskItemProps) {
  const [expanded, setExpanded] = useState(true);
  const [addingChild, setAddingChild] = useState(false);
  const [childTitle, setChildTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(sub.title);
  const [showDetails, setShowDetails] = useState(false);
  const [detailDesc, setDetailDesc] = useState(sub.description ?? '');
  const [detailDeadline, setDetailDeadline] = useState(sub.deadline ?? '');
  const [detailPriority, setDetailPriority] = useState<TaskPriority | undefined>(sub.priority);
  const [detailOverride, setDetailOverride] = useState<number | undefined>(sub.humanOverride);
  const children = sub.subtasks ?? [];
  const indentPx = depth * 22;

  // Sync local detail state when the `sub` prop changes — render-time
  // adjustment (comparing against the last-seen `sub.id`) instead of an
  // effect, so switching subtasks never flashes the previous subtask's fields
  // for a frame before an effect catches up.
  const [prevSubId, setPrevSubId] = useState(sub.id);
  if (sub.id !== prevSubId) {
    setPrevSubId(sub.id);
    setDetailDesc(sub.description ?? '');
    setDetailDeadline(sub.deadline ?? '');
    setDetailPriority(sub.priority);
    setDetailOverride(sub.humanOverride);
    setTitleValue(sub.title);
  }

  const commitChild = () => {
    if (!childTitle.trim()) { setAddingChild(false); return; }
    onAddChild(sub.id, childTitle.trim());
    setChildTitle('');
    setAddingChild(false);
  };

  const commitTitle = () => {
    const trimmed = titleValue.trim();
    if (trimmed && trimmed !== sub.title) onRename(sub.id, trimmed);
    else setTitleValue(sub.title);
    setEditingTitle(false);
  };

  const saveDetails = () => {
    onUpdateDetails(sub.id, {
      description: detailDesc.trim() || undefined,
      deadline: detailDeadline || undefined,
      priority: detailPriority,
      humanOverride: detailOverride,
    });
    setShowDetails(false);
  };

  const childCounts = countSubtasksRecursive(children);
  const done = sub.status === 'completed';

  return (
    <div>
      <motion.div
        layout
        initial={{ opacity: 0, x: -8 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -8 }}
        className="ag-card flex items-center"
        style={{ gap: 'var(--sp-3)', padding: 'var(--sp-2) 0', paddingLeft: indentPx }}
      >
        <button
          type="button"
          aria-label={expanded ? 'Collapse' : 'Expand'}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: 'grid', placeItems: 'center', flex: '0 0 auto',
            width: 14, height: 14, padding: 0, border: 0, background: 'transparent',
            color: 'var(--fg-4)',
            cursor: children.length > 0 ? 'pointer' : 'default',
            opacity: children.length > 0 ? 1 : 0,
            pointerEvents: children.length > 0 ? undefined : 'none',
            transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform var(--dur-fast) var(--ease-glass)',
          }}
        >
          <Icon name="chevron-right" size={12} />
        </button>

        <button
          type="button"
          aria-label={done ? 'Mark not done' : 'Mark done'}
          aria-pressed={done}
          onClick={() => onToggle(sub.id)}
          style={{
            display: 'grid', placeItems: 'center', flex: '0 0 auto',
            padding: 0, border: 0, background: 'transparent', cursor: 'pointer',
            color: done ? 'var(--status-done)' : 'var(--fg-4)',
            transition: 'color var(--dur-fast) var(--ease-glass)',
          }}
        >
          <Icon name={done ? 'check-circle-2' : 'circle'} size={16} />
        </button>

        {sub.priority && (
          <span
            aria-hidden="true"
            title={`${PRIORITY_CONFIG[sub.priority].label} priority`}
            style={{
              width: 6, height: 6, flex: '0 0 auto',
              borderRadius: 'var(--r-circle)',
              background: PRIORITY_CONFIG[sub.priority].color,
            }}
          />
        )}

        {editingTitle ? (
          <input
            autoFocus
            type="text"
            data-ag-field=""
            className="ag-field"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitTitle();
              if (e.key === 'Escape') { setTitleValue(sub.title); setEditingTitle(false); }
            }}
            onBlur={commitTitle}
            style={INLINE_FIELD}
          />
        ) : (
          <span
            className="flex-1 min-w-0 select-none"
            onDoubleClick={() => { setEditingTitle(true); setTitleValue(sub.title); }}
            title="Double-click to rename"
            style={{
              font: 'var(--type-body)',
              fontSize: 'var(--text-sm)',
              lineHeight: 'var(--leading-snug)',
              color: done ? 'var(--fg-4)' : 'var(--fg-2)',
              textDecoration: done ? 'line-through' : undefined,
              cursor: 'pointer',
            }}
          >
            {sub.title}
          </span>
        )}

        {childCounts.total > 0 && !editingTitle && (
          <span
            style={{
              flex: '0 0 auto', font: 'var(--type-kicker)',
              color: 'var(--fg-4)', fontVariantNumeric: 'tabular-nums',
            }}
          >
            {childCounts.done}/{childCounts.total}
          </span>
        )}

        {sub.deadline && !editingTitle && (
          <span
            className="hidden sm:flex items-center"
            style={{ flex: '0 0 auto', gap: 2, font: 'var(--type-kicker)', color: 'var(--fg-4)' }}
          >
            <Icon name="calendar" size={11} />
            {new Date(sub.deadline).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        )}

        <span className="ag-card-actions flex items-center" style={{ flex: '0 0 auto', gap: 2 }}>
          <IconButton
            size="sm"
            variant="ghost"
            label="Add sub-subtask"
            onClick={() => { setAddingChild(true); setExpanded(true); }}
          >
            <Icon name="plus" size={14} />
          </IconButton>
          <IconButton
            size="sm"
            variant="ghost"
            active={showDetails}
            label="Edit details"
            onClick={() => setShowDetails((v) => !v)}
          >
            <Icon name="more-horizontal" size={14} />
          </IconButton>
          <IconButton
            size="sm"
            variant="ghost"
            label={`Delete ${sub.title}`}
            onClick={() => onDelete(sub.id)}
          >
            <Icon name="x" size={14} />
          </IconButton>
        </span>
      </motion.div>

      {/* Inline details panel */}
      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div
              style={{
                display: 'grid', gap: 'var(--sp-4)',
                padding: 'var(--sp-3) var(--sp-3) var(--sp-5)',
                paddingLeft: indentPx + 36,
              }}
            >
              <Textarea
                value={detailDesc}
                onChange={(e) => setDetailDesc(e.target.value)}
                placeholder="Description…"
                rows={2}
              />

              <div className="flex flex-wrap items-center" style={{ gap: 'var(--sp-4)' }}>
                <Input
                  type="datetime-local"
                  size="sm"
                  block={false}
                  value={detailDeadline}
                  onChange={(e) => setDetailDeadline(e.target.value)}
                />

                <div className="flex flex-wrap" style={{ gap: 'var(--sp-2)' }}>
                  {(Object.entries(PRIORITY_CONFIG) as [TaskPriority, typeof PRIORITY_CONFIG[TaskPriority]][]).map(([p, cfg]) => {
                    const on = detailPriority === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setDetailPriority(on ? undefined : p)}
                        style={{
                          height: 24,
                          padding: '0 var(--sp-4)',
                          border: 0,
                          borderRadius: 'var(--r-pill)',
                          backgroundImage: on ? cfg.fill : 'none',
                          boxShadow: on ? 'var(--glass-rim-1)' : 'inset 0 0 0 1px var(--line-faint)',
                          font: 'var(--type-kicker)',
                          letterSpacing: 'var(--tracking-kicker)',
                          textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'],
                          color: on ? cfg.color : 'var(--fg-4)',
                          cursor: 'pointer',
                          transition:
                            'background-image var(--dur-fast) var(--ease-glass), color var(--dur-fast) var(--ease-glass)',
                        }}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>

                <span style={{ flex: 1 }} />
                <Button size="sm" variant="tint" tone="accent" onClick={saveDetails}>
                  Save
                </Button>
              </div>

              {/* Same importance dial as top-level tasks, available at every depth */}
              <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
                <span style={DETAIL_LABEL}>Importance</span>
                <HumanOverridePicker value={detailOverride} onChange={setDetailOverride} compact />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Children */}
      <AnimatePresence>
        {expanded && (children.length > 0 || addingChild) && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <AnimatePresence>
              {children.map((child) => (
                <SubtaskItem
                  key={child.id}
                  sub={child}
                  depth={depth + 1}
                  onToggle={onToggle}
                  onDelete={onDelete}
                  onAddChild={onAddChild}
                  onRename={onRename}
                  onUpdateDetails={onUpdateDetails}
                />
              ))}
            </AnimatePresence>

            {addingChild && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center"
                style={{ gap: 'var(--sp-3)', padding: 'var(--sp-2) 0', paddingLeft: (depth + 1) * 22 + 16 }}
              >
                <span style={{ display: 'flex', flex: '0 0 auto', color: 'var(--fg-4)' }}>
                  <Icon name="circle" size={16} />
                </span>
                <input
                  autoFocus
                  type="text"
                  data-ag-field=""
                  className="ag-field"
                  value={childTitle}
                  onChange={(e) => setChildTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitChild();
                    if (e.key === 'Escape') { setAddingChild(false); setChildTitle(''); }
                  }}
                  onBlur={() => { if (!childTitle.trim()) setAddingChild(false); }}
                  placeholder="Add subtask…"
                  style={INLINE_FIELD}
                />
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Tree ───────────────────────────────────────────────────────────────────

interface SubtaskTreeProps {
  value: Subtask[];
  /**
   * Receives a transform rather than the next array. Two edits can be batched
   * into one render — a rename committed on blur, then a delete click — and
   * each has to build on the other's result, not on the tree as it looked when
   * their handlers were created.
   */
  onChange: (transform: (previous: Subtask[]) => Subtask[]) => void;
}

/**
 * Infinitely nestable subtask editor. Owns the recursive tree transforms, so
 * callers never touch the tree shape themselves.
 */
export default function SubtaskTree({ value, onChange }: SubtaskTreeProps) {
  const [newTitle, setNewTitle] = useState('');

  const addTopLevel = () => {
    if (!newTitle.trim()) return;
    onChange((prev) => addSubtaskToParent(prev, null, {
      id: crypto.randomUUID(), title: newTitle.trim(), status: 'needsAction', subtasks: [],
    }));
    setNewTitle('');
  };

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
      {/* A Well only once there is a tree in it — an empty trough on a field
          with no subtasks yet is a hole in the group for nothing. */}
      <div
        style={
          value.length > 0
            ? {
                padding: 'var(--sp-3) var(--sp-5)',
                borderRadius: 'var(--r-card)',
                background: 'var(--glass-well)',
                boxShadow: 'var(--glass-well-shadow)',
              }
            : undefined
        }
      >
        <AnimatePresence>
          {value.map((sub) => (
            <SubtaskItem
              key={sub.id}
              sub={sub}
              depth={0}
              onToggle={(id) => onChange((prev) => toggleSubtaskInTree(prev, id))}
              onDelete={(id) => onChange((prev) => deleteSubtaskFromTree(prev, id))}
              onAddChild={(parentId, title) => onChange((prev) => addSubtaskToParent(prev, parentId, {
                id: crypto.randomUUID(), title, status: 'needsAction', subtasks: [],
              }))}
              onRename={(id, title) => onChange((prev) => renameSubtaskInTree(prev, id, title))}
              onUpdateDetails={(id, updates) => onChange((prev) => updateSubtaskDetailsInTree(prev, id, updates))}
            />
          ))}
        </AnimatePresence>
      </div>

      <div className="flex items-center" style={{ gap: 'var(--sp-4)' }}>
        <Input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addTopLevel(); }}
          placeholder="Add subtask…"
          size="sm"
          style={{ flex: 1, minWidth: 0 }}
        />
        <IconButton size="sm" label="Add subtask" onClick={addTopLevel}>
          <Icon name="plus" size={16} />
        </IconButton>
      </div>
    </div>
  );
}
