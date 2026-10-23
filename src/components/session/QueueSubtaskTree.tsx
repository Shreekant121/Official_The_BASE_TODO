/**
 * New Session — the recursive subtask tree inside a task row (UI-14).
 *
 * Lifted out of `TaskSelection.tsx` unchanged in behaviour and rebuilt on
 * Aurora Glass. Every prop, every callback and the recursion itself are what
 * they were; only the surface changed.
 *
 * NOT the same component as `task-fields/SubtaskTree.tsx`, and the two are
 * deliberately separate. That one is an EDITOR — it renames, reprioritises,
 * completes and deletes, and it stages its writes in a draft. This one is a
 * READOUT with two verbs: add a child, and pick one up. Folding them together
 * would drag the draft machinery into a screen that has no draft.
 *
 * **THE DRAG HERE IS NATIVE HTML5, ON PURPOSE.** It is the one native drag
 * left in the app (`CLAUDE.md`, the dragging section, and IMPROVEMENTS.md
 * flags it on UI-14 itself): dropping a subtask onto "Selected for Today" is a
 * COPY onto a single target, not a reorder, which is not a shape
 * `SortableList` serves. It is also why the `[draggable='true']` half of the
 * touch CSS in `src/index.css` is still load-bearing — dnd-kit never sets that
 * attribute, so converting this gesture would silently drop these rows out of
 * that selector and hand the long press back to the browser's share sheet.
 * Do not convert it to dnd-kit.
 */
import { motion, AnimatePresence } from 'framer-motion';
import { Icon, IconButton } from '../../ui';
import type { Subtask } from '../../store/useStore';

/**
 * The inline add field. A bottom-ruled line rather than a full `Input` well —
 * the same call `task-fields/SubtaskTree.tsx` makes, because a carved pill
 * inside a row that is already inside a card is three levels of surface for
 * one line of text.
 *
 * It stays a real `<input>` and that is load-bearing twice over: `index.css`
 * exempts `[data-drag-row] input` back to `user-select: text` so the words can
 * be selected to correct them on a tablet, and `SortableList`'s sensors let a
 * press on an `input` through instead of starting a drag.
 */
const INLINE_FIELD = {
  flex: 1,
  minWidth: 0,
  padding: '0 0 2px',
  border: 0,
  borderBottom: '1px solid var(--job-lime-line)',
  borderRadius: 0,
  outline: 'none',
  background: 'transparent',
  font: 'var(--type-body)',
  fontSize: 'var(--text-sm)',
  letterSpacing: 'var(--tracking-ui)',
  color: 'var(--fg-1)',
} as const;

export interface QueueSubtaskTreeProps {
  subtasks: Subtask[];
  rootTaskId: string;
  listId: string;
  depth: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
  /**
   * The **+** that adds a child, and the inline field it opens. Optional: the
   * Today column leaves it out and draws no **+** (FIX-12, audit A1 — adding a
   * subtask happens on the Available side, one place for one thing).
   */
  adding?: {
    context: { rootTaskId: string; parentId: string; isNested: boolean } | null;
    title: string;
    onAddClick: (subtaskId: string, rootTaskId: string, listId: string) => void;
    onTitleChange: (val: string) => void;
    onConfirm: () => void;
    onCancel: () => void;
  };
  /** When set, subtask rows become draggable — dropping one onto "Selected for Today" queues just that subtask. */
  onDragStartSub?: (subtaskId: string) => void;
  onDragEndSub?: () => void;
  draggedSubtaskId?: string | null;
}

export default function QueueSubtaskTree({
  subtasks,
  rootTaskId,
  listId,
  depth,
  expandedIds,
  onToggle,
  adding,
  onDragStartSub,
  onDragEndSub,
  draggedSubtaskId,
}: QueueSubtaskTreeProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {subtasks.map((sub) => {
        const isExpanded = expandedIds.has(sub.id);
        const hasChildren = (sub.subtasks ?? []).length > 0;
        const isAddingHere =
          adding?.context?.rootTaskId === rootTaskId && adding.context.parentId === sub.id;
        const indentPx = depth * 12;

        const isBeingDragged = draggedSubtaskId === sub.id;
        const done = sub.status === 'completed';

        return (
          <div key={sub.id}>
            <div
              className="ag-card"
              draggable={!!onDragStartSub}
              onDragStart={(e) => {
                if (!onDragStartSub) return;
                e.dataTransfer.effectAllowed = 'copy';
                e.dataTransfer.setData('text/plain', sub.id);
                onDragStartSub(sub.id);
              }}
              onDragEnd={() => onDragEndSub?.()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-3)',
                padding: 'var(--sp-2) var(--sp-3)',
                paddingLeft: indentPx + 8,
                borderRadius: 'var(--r-xs)',
                /* Dimming while it is in flight is the whole drag feedback on
                   this side; the drop target lights up on the other. */
                opacity: isBeingDragged ? 0.4 : 1,
                cursor: onDragStartSub ? 'grab' : undefined,
                transition: 'opacity var(--dur-fast) var(--ease-glass)',
              }}
            >
              <Icon
                name="corner-down-right"
                size={12}
                style={{ flex: '0 0 auto', color: 'var(--fg-4)' }}
              />

              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  font: 'var(--type-body)',
                  fontSize: 'var(--text-sm)',
                  color: done ? 'var(--fg-4)' : 'var(--fg-2)',
                  textDecoration: done ? 'line-through' : undefined,
                }}
              >
                {sub.title}
              </span>

              {hasChildren && (
                <span
                  style={{
                    flex: '0 0 auto',
                    font: 'var(--type-kicker)',
                    color: 'var(--fg-4)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {sub.subtasks!.length}
                </span>
              )}

              {/* `.ag-card-actions`, not a hover class: there is no hover on
                  the tablet, and `screens.css` writes the touch and focus-within
                  cases this needs. Same fix UI-13 made to the editor tree. */}
              <span className="ag-card-actions" style={{ display: 'flex', flex: '0 0 auto', gap: 2 }}>
                {adding && (
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={`Add a subtask under ${sub.title}`}
                    title="Add sub-subtask"
                    onClick={() => adding.onAddClick(sub.id, rootTaskId, listId)}
                  >
                    <Icon name="plus" size={13} />
                  </IconButton>
                )}
                {hasChildren && (
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={isExpanded ? `Collapse ${sub.title}` : `Expand ${sub.title}`}
                    aria-expanded={isExpanded}
                    onClick={() => onToggle(sub.id)}
                  >
                    <Icon
                      name="chevron-down"
                      size={13}
                      style={{
                        transform: isExpanded ? 'rotate(180deg)' : undefined,
                        transition: 'transform var(--dur-fast) var(--ease-glass)',
                      }}
                    />
                  </IconButton>
                )}
              </span>
            </div>

            {/* Inline add input for this subtask */}
            <AnimatePresence>
              {isAddingHere && adding && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--sp-3)',
                      margin: '2px 0',
                      marginLeft: indentPx + 16,
                      padding: 'var(--sp-3) var(--sp-5)',
                      borderRadius: 'var(--r-sm)',
                      background: 'var(--glass-well)',
                      boxShadow: 'var(--glass-well-shadow)',
                    }}
                  >
                    <Icon
                      name="corner-down-right"
                      size={12}
                      style={{ flex: '0 0 auto', color: 'var(--fg-4)' }}
                    />
                    <input
                      autoFocus
                      type="text"
                      data-ag-field=""
                      className="ag-field"
                      value={adding.title}
                      onChange={(e) => adding.onTitleChange(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') adding.onConfirm();
                        if (e.key === 'Escape') adding.onCancel();
                      }}
                      onBlur={() => { if (!adding.title.trim()) adding.onCancel(); }}
                      placeholder="Add a sub-subtask…"
                      style={INLINE_FIELD}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Recursive children */}
            <AnimatePresence>
              {isExpanded && hasChildren && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: 'hidden' }}
                >
                  <div style={{ marginLeft: indentPx + 8 }}>
                    <QueueSubtaskTree
                      subtasks={sub.subtasks!}
                      rootTaskId={rootTaskId}
                      listId={listId}
                      depth={depth + 1}
                      expandedIds={expandedIds}
                      onToggle={onToggle}
                      adding={adding}
                      onDragStartSub={onDragStartSub}
                      onDragEndSub={onDragEndSub}
                      draggedSubtaskId={draggedSubtaskId}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
