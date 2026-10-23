/**
 * Focus Mode's right-hand column in landscape — FIX-10.
 *
 * Shreekant, 2026-09-22: Focus scrolled on the tablet held sideways, and he
 * does not want it to. Of the three answers he was offered he chose **two
 * columns in landscape** — the task on the left, its subtasks and details on the
 * right — and, for when even that overflows, **show less**: the description
 * collapses and **the subtasks stay visible**, because they are what he
 * touches mid-session while the description is read once at the start. On
 * 2026-09-22 he extended it to the laptop too: any landscape window wide
 * enough for the rail gets this column, which is also what stopped the laptop
 * scrolling 57px at 1440×900.
 *
 * WHY A COLUMN AND NOT THE DOCK. `FocusDockPanel` opens one panel at a time,
 * out of a pill on the stage, and is still what portrait uses. Here both are
 * simply there — so the pills on the stage are gone in landscape, and the two
 * bodies (`FocusSubtasksBody`, `FocusDetailsBody`) are drawn in two panes of
 * the same material the dock uses. Nothing opens, so nothing registers with
 * `useOverlayDismiss`: Escape has nothing to close.
 *
 * WHAT "SHOW LESS" MEASURES. The column is a fixed height — whatever the stage
 * row was given — and each pane's body scrolls inside its own pane rather than
 * pushing the page. Whether the details start folded is decided by one sum:
 * both panes at their natural height against the column's height. The sum is
 * the same whether the details are open or folded — a folded body keeps its
 * content and is clipped to zero, so `scrollHeight` still reports it — which
 * is what stops the decision flipping every time it is acted on.
 * **His own tap wins over the measurement** and holds for the task; the
 * column is keyed on the task in `FocusMode`, so the next task measures
 * afresh.
 *
 * The subtasks pane never folds. When the checklist alone is taller than the
 * column it scrolls inside its pane, and the folded details keep one line.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Subtask, Task } from '../store/useStore';
import { Icon } from '../ui';
import { FocusDetailsBody, FocusDetailsEdit } from './FocusDetailsPanel';
import { FocusSubtasksBody } from './FocusSubtasksPanel';

/** The dock's pane width (`FocusDockPanel`'s `PANE_WIDTH`), so both arrangements read alike. */
export const SIDE_COLUMN_WIDTH = 380;

/** Between the two panes. Part of the natural-height sum, so named once. */
const PANE_GAP = 16;

export interface FocusSideColumnProps {
  /** The live backlog record — the checklist reads and writes it. */
  task: Task;
  /** What the details pane reads: the live record, or a proxy with its root's description. */
  detailsTask: Task;
  parentTask?: Task | null;
  onToggle: (sub: Subtask, done: boolean) => void;
  editable: boolean;
  onEdit?: () => void;
  /** Tighter insets on a short window. */
  compact: boolean;
  /** Pure focus's toggles (`FocusMode`): either pane can be hidden on its own. */
  showSubtasks: boolean;
  showDetails: boolean;
}

function paneStyle(compact: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    gap: compact ? 'var(--sp-4)' : 'var(--sp-5)',
    minHeight: 0,
    padding: compact ? 'var(--sp-5) var(--sp-6)' : 'var(--pad-card)',
    // A rounded rectangle like the top bar, not a big curve — his call, 2026-09-30.
    borderRadius: 'var(--r-md)',
    backgroundImage: 'var(--glass-fill-2)',
    backdropFilter: 'var(--glass-bd-md)',
    WebkitBackdropFilter: 'var(--glass-bd-md)',
    boxShadow: 'var(--glass-shadow-pane)',
  };
}

function PaneTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      style={{
        font: 'var(--type-title)', fontSize: 'var(--text-lg)',
        letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)',
      }}
    >
      {children}
    </h2>
  );
}

/** One line saying what the folded details hold, so folding hides the text and not the fact. */
function detailsSummary(task: Task, parent?: Task | null): string {
  const parts: string[] = [];
  if (task.description?.trim() || parent?.description?.trim()) parts.push('description');
  const links = (task.links?.length ?? 0) + (parent?.links?.length ?? 0);
  if (links > 0) parts.push(links === 1 ? '1 link' : `${links} links`);
  if (task.imageUrl || parent?.imageUrl) parts.push('cover');
  if (parts.length === 0) return 'Nothing added yet';
  const text = parts.join(', ');
  return text[0].toUpperCase() + text.slice(1);
}

export default function FocusSideColumn({
  task, detailsTask, parentTask, onToggle, editable, onEdit, compact, showSubtasks, showDetails,
}: FocusSideColumnProps) {
  const columnRef = useRef<HTMLElement>(null);
  const subsPaneRef = useRef<HTMLElement>(null);
  const subsScrollRef = useRef<HTMLDivElement>(null);
  const detailsPaneRef = useRef<HTMLElement>(null);
  const detailsScrollRef = useRef<HTMLDivElement>(null);

  /** His tap, if he has made one for this task. `null` defers to the measurement. */
  const [chosen, setChosen] = useState<boolean | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  const detailsOpen = chosen ?? !overflowing;

  useLayoutEffect(() => {
    const column = columnRef.current;
    const panes = [
      [subsPaneRef.current, subsScrollRef.current],
      [detailsPaneRef.current, detailsScrollRef.current],
    ] as const;
    if (!column) return;

    const measure = () => {
      /* A pane's natural height is its box with the body's clipped height
         swapped for the body's full one. A folded body also gives back the
         gap above it (see its negative margin), so that is added back too —
         without it, folding would shrink the sum by one gap and a column
         within 16px of fitting would fold and unfold for ever. A pane pure
         focus has hidden is not in the sum, and neither is the gap it had. */
      let need = showSubtasks && showDetails ? PANE_GAP : 0;
      for (const [pane, scroll] of panes) {
        if (!pane || !scroll) continue;
        const folded = scroll.clientHeight === 0 && scroll.scrollHeight > 0;
        const gap = folded ? parseFloat(getComputedStyle(pane).rowGap) || 0 : 0;
        need += pane.offsetHeight - scroll.clientHeight + scroll.scrollHeight + gap;
      }
      setOverflowing(need > column.clientHeight + 1);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(column);
    for (const [, scroll] of panes) {
      const content = scroll?.firstElementChild;
      if (content) observer.observe(content);
    }
    return () => observer.disconnect();
  }, [showSubtasks, showDetails]);

  const scrollStyle: CSSProperties = {
    minHeight: 0,
    overflowY: 'auto',
    /* Room for the rows' rims, which the scroller would otherwise shave. */
    margin: '0 calc(-1 * var(--sp-2))',
    padding: '0 var(--sp-2)',
    overscrollBehavior: 'contain',
  };

  return (
    <aside
      ref={columnRef}
      aria-label="Subtasks and details"
      style={{
        flex: `0 0 ${SIDE_COLUMN_WIDTH}px`,
        width: SIDE_COLUMN_WIDTH,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: PANE_GAP,
        animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
      }}
    >
      {/* Subtasks: natural height, and the one that keeps its room. */}
      {showSubtasks && (
      <section
        ref={subsPaneRef}
        aria-labelledby="focus-side-subtasks"
        style={{ ...paneStyle(compact), flex: '0 1 auto' }}
      >
        <PaneTitle id="focus-side-subtasks">Subtasks</PaneTitle>
        <div ref={subsScrollRef} className="ag-scroll ag-fade" style={scrollStyle}>
          <div style={{ display: 'grid', gap: compact ? 'var(--sp-4)' : 'var(--sp-6)' }}>
            <FocusSubtasksBody task={task} onToggle={onToggle} editable={editable} />
          </div>
        </div>
      </section>
      )}

      {/* Details: gives way first — it shrinks four times as fast, and folds
          to one line when the two will not fit together. */}
      {showDetails && (
      <section
        ref={detailsPaneRef}
        aria-labelledby="focus-side-details"
        style={{ ...paneStyle(compact), flex: detailsOpen ? '0 4 auto' : '0 0 auto' }}
      >
        <button
          type="button"
          onClick={() => setChosen(!detailsOpen)}
          aria-expanded={detailsOpen}
          title={detailsOpen ? 'Fold the details away' : 'Show the description and links'}
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
            width: '100%', padding: 0, border: 0, background: 'transparent',
            cursor: 'pointer', textAlign: 'left', color: 'var(--fg-3)',
          }}
        >
          <span style={{ display: 'grid', gap: 2, flex: 1, minWidth: 0 }}>
            <PaneTitle id="focus-side-details">Task details</PaneTitle>
            {!detailsOpen && (
              <span className="truncate" style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
                {detailsSummary(detailsTask, parentTask)}
              </span>
            )}
          </span>
          <Icon name={detailsOpen ? 'chevron-up' : 'chevron-down'} size={18} />
        </button>

        {/* Folded by clipping, not by unmounting: the measurement above needs
            the body's height either way, and `visibility` takes its links out
            of the tab order while it cannot be seen. */}
        <div
          ref={detailsScrollRef}
          aria-hidden={!detailsOpen}
          className="ag-scroll ag-fade"
          style={
            detailsOpen
              ? scrollStyle
              : {
                  /* `overflowY`, never the `overflow` shorthand: React clears
                     the shorthand on the way back open, and that took the
                     longhand with it — the body unfolded unclipped and pushed
                     the page into the scroll this column exists to remove. */
                  ...scrollStyle, maxHeight: 0, overflowY: 'hidden', visibility: 'hidden',
                  /* Cancels the pane's gap, so the folded pane ends at its title. */
                  margin: `calc(-1 * ${compact ? 'var(--sp-4)' : 'var(--sp-5)'}) 0 0`,
                }
          }
        >
          <div style={{ display: 'grid', gap: 'var(--sp-6)' }}>
            <FocusDetailsBody task={detailsTask} parentTask={parentTask} onEdit={onEdit} />
            {onEdit && (
              <span style={{ justifySelf: 'start' }}>
                <FocusDetailsEdit onEdit={onEdit} parentTask={parentTask} />
              </span>
            )}
          </div>
        </div>
      </section>
      )}
    </aside>
  );
}
