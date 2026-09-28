/**
 * Project view — the board, its masthead and its chrome.
 * RECONCILED (UI-29) against `design-system/screens/project.html`.
 *
 * UI-16 built the board and UI-17 the chrome, both with **no mockup** —
 * `DesignSync list_projects` returned an empty array for fourteen sessions
 * running, so the screen was composed from the tokens, from `Button` /
 * `IconButton` / `MorphMenu` and their `.prompt.md`s, and from the anatomy of
 * the screens that DID have one. UI-21 landed the handoff bundle. This is the
 * diff, and it is the largest one in the track: the mockup has four surfaces
 * this screen did not.
 *
 * EVERY STORE CALL, HOOK AND PROP IS WHAT IT WAS. The board is still one
 * `SortableBoard` with the same five callbacks, the ghost is still portalled
 * to `<body>`, list ids are still bare and row ids still scoped, both bulk
 * adds still take one title per line, and deleting still goes through
 * `deleteTaskList` / `deleteBacklogTask` — i.e. through `applyDeletion` — and
 * cleans up nothing itself.
 *
 * WHAT THE MOCKUP HAD AND THIS SCREEN DID NOT
 * -------------------------------------------
 * - **A breadcrumb bar above the masthead.** Back, the mark, `Projects /
 *   <name>`, and the project's own ⋯ menu. Ours folded all of it into one
 *   header pane and offered only an edit pencil — so sharing a project or
 *   deleting one could be done from Home's card and nowhere else, including
 *   from inside the project itself.
 * - **A masthead, rather than a header strip.** A `--pad-card-lg` pane on
 *   `--glass-bd-lg-refract`: a 116px cover with the project's 56px glyph tile
 *   hung over its bottom edge (the mockup's "Change cover" in the corner went
 *   to the edit sheet at FIX-9), the name at
 *   `--type-metric`, and — the part that carries the screen — a stats strip
 *   (beside the name since 2026-09-23, under a hairline before), with a
 *   **`ProgressRing`** and three readings: how much
 *   is done, how much work is left, and what it is worth. Ours had the same
 *   four facts crushed into one uppercase mono line, and no ring.
 * - **A toolbar.** Board / List on a `SegmentedControl`, a "Show done"
 *   `Switch`, then Select and New task. Ours had no view switch and no way to
 *   hide finished work, so a project you had actually worked on was mostly
 *   struck-through rows.
 * - **A selection bar that floats.** A `--glass-fill-3` pill fixed to the
 *   bottom of the window, morphing up out of nothing, reading out how many
 *   rows are picked and how much work that is. Ours was an inline `--glass-well`
 *   strip that pushed the board down the moment you picked a row.
 *
 * WHAT CHANGED IN THE THINGS THAT WERE ALREADY HERE
 * -------------------------------------------------
 * - **The whole column scrolls, not just the board.** The masthead is content,
 *   and the mockup scrolls it. dnd-kit still auto-scrolls correctly: it walks
 *   up from the dragged row and takes whichever ancestor actually scrolls,
 *   which is now this one.
 * - **`--gap-section` between the masthead and the board**, `--sp-7` inside
 *   the board section, `--gap-card` between columns. All three were `--sp-6`.
 * - **The board's columns are `minmax(408px, 1fr)` auto-fit**, not
 *   `md:grid-cols-2`. On a 1440 window that is the same two columns; on a
 *   wider one it is three, which is what the mockup does and what the
 *   1180px cap was quietly preventing. They are also **each their own
 *   height** now (`align-items: start`): the old grid stretched every column
 *   in a row to the tallest one, so a list with a single task carried a
 *   200px void above its footer. `h-full` had to come off `SortableRow` for
 *   that — `height: 100%` resolves against the grid AREA, which is definite,
 *   so it stretched the card straight back out again.
 * - **"Add list" is dashed** (`.ag-addrow`), for the reason written at the top
 *   of `ListColumn.tsx`: UI-16's "Aurora Glass has no dashed anything" was an
 *   inference with no mockup behind it, and the bundle contradicts it in seven
 *   places.
 *
 * SHOW DONE CANNOT SIMPLY FILTER THE BOARD'S ROWS
 * -----------------------------------------------
 * `reorderBacklogTasks` rebuilds a list from the id array it is handed and
 * **drops every task in that list which is not in it** (`useStore.ts` — it
 * filters `t.listId !== listId` out and re-adds only what it was given). So
 * hiding the done rows and then dragging one row would have deleted every
 * hidden task in that column, silently, with no Trash entry. `handleReorderItems`
 * merges the visible order back into the full one before the store sees it —
 * `lib/boardDrop.ts`'s `mergeVisibleOrder`, tested there — and `tasksByListAll`
 * is kept alongside `tasksByList` for exactly that.
 *
 * UI-16 left `CustomDropdown` in the bulk bar alone on purpose — it was the
 * old-design select and it was UI-18's, so pointing this screen at a new one
 * would have put a second design system back on the screen that item existed
 * to finish. **UI-18 rebuilt it**, so the bar and the control inside it are
 * now one material.
 *
 * V3 (V3-3, step 7) — THE BOARD IS ON V3. Design: `design-system/Project.dc.html`,
 * the file the bundle's README says he had open when he exported. The whole
 * screen sits in one `<V3Scope>`, so its glass, type, colour, icons and motion
 * are V3, and so is everything it opens — the task sheet, the share dialogs,
 * the edit dialog and every menu carry the scope into their portals.
 *
 * V3 CHANGES NO FEATURES, so the design's four new things are NOT built here:
 * the "Filter tasks" box, the status chips (All / To do / In progress / Review /
 * Done), a Table view in place of List, and a header with no cover picture.
 * The first three are features; the fourth would undo the masthead he shaped
 * himself on 2026-09-23 (the 216px cover, the facts beside the name). What the
 * design changed here is the look of what was already on the screen:
 *   - the BASE mark moves to the head of the rail, as on Home (V3-2), and
 *     stays in the breadcrumb only when there is no rail to carry it;
 *   - back and ⋯ are the design's round glass buttons rather than ghosts;
 *   - "New task" is a gel button — the design's "Add task", V3's one primary —
 *     and so is "Add first task" on an empty project;
 *   - the page sits on the full V3 field instead of `--calm`: the design draws
 *     the emerald mass over this board, and V3's glass is clear enough that it
 *     needs something behind it to bend.
 * The card itself took the rest — see "V3" at the top of `project/TaskRow.tsx`.
 */
import { useState, useEffect, useMemo, useRef, useCallback, type ReactNode, type RefObject } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useRememberedState } from '../lib/useRememberedState';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore, projectValueINR, formatINR, isTaskLocked, type Task } from '../store/useStore';
import { useAuth } from '../contexts/AuthContext';
import { builtInShortcut, useShortcuts } from '../contexts/ShortcutsContext';
import { makeShareId, shareList, shareProject, shareUrl, type ShareSettings } from '../lib/publicShare';
import { archiveProject } from '../lib/archive';
import TaskDetailPanel from '../components/TaskDetailPanel';
import ShareModal from '../components/ShareModal';
import OutsourcedWorkPanel from '../components/OutsourcedWorkPanel';
import CreateProjectModal from '../components/CreateProjectModal';
import { isOverlayOpen } from '../lib/useOverlayDismiss';
import CustomDropdown from '../components/CustomDropdown';
import AppIcon from '../components/AppIcon';
import BulkAddInput from '../components/BulkAddInput';
import ListColumn from '../components/project/ListColumn';
import ListTable from '../components/project/ListTable';
import { TaskDragGhost } from '../components/project/TaskRow';
import { foldFinishedRepeats, minutesLabel, workLeftMinutes } from '../components/project/derive';
import { SortableBoard, SortableRow } from '../components/SortableList';
import { mergeVisibleOrder } from '../lib/boardDrop';
import { parseBulkLines } from '../lib/bulkAdd';
import { useNavModel } from '../components/navModel';
import { BrandMark, RailMark } from '../components/BrandMark';
import { Z } from '../lib/zLayers';
import AIPanelHost from '../components/AIPanelHost';
import { AIPanelDock, AI_SUBJECT_RIM } from '../ui/overlay/AIPanel';
import type { PanelSubjectRef } from '../lib/aiPanel';
import { devPanelFixture } from '../lib/devPanelFixture';
import {
  Button, CoverImage, Icon, IconButton, MiniNav, MorphMenu, ProgressRing, SegmentedControl, Switch,
  useMedia, V3Scope, WIDE,
} from '../ui';

/** Shared by every inline add field on this screen — a line of glass, never a
 *  boxed input inside a pane that is already one. `ListColumn` writes the same
 *  rule down for the field in its own inline add. */
const INLINE_FIELD = {
  flex: 1,
  minWidth: 0,
  padding: 0,
  border: 0,
  outline: 'none',
  boxShadow: 'none',
  background: 'transparent',
  font: 'var(--type-body)',
  fontSize: 'var(--text-sm)',
  fontWeight: 'var(--weight-medium)',
  letterSpacing: 'var(--tracking-ui)',
  color: 'var(--fg-1)',
} as const;

/** The pane the quick-add strip and both new-list forms sit in. */
const FORM_PANE = {
  borderRadius: 'var(--r-card)',
  padding: 'var(--sp-5) var(--sp-6)',
  backgroundImage: 'var(--glass-fill-2)',
  backdropFilter: 'var(--glass-bd-md)',
  WebkitBackdropFilter: 'var(--glass-bd-md)',
  boxShadow: 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-1)',
} as const;

/** The mockup's `Mono` — a measured number, never uppercased. */
const MONO = {
  font: 'var(--type-numeric)',
  fontVariantNumeric: 'tabular-nums',
  whiteSpace: 'nowrap',
} as const;

interface InlineFormProps {
  icon: 'circle' | 'plus-circle';
  fieldRef?: RefObject<HTMLTextAreaElement | null>;
  autoFocus?: boolean;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  onSubmitLines: (lines: string[]) => void;
  onCancel: () => void;
  placeholder: string;
  /** Copy on the commit button. */
  commit: string;
}

/**
 * One field and one pair of buttons. The three inline adds on this screen and
 * the two on New Session (UI-15) are deliberately the same object, so "adding
 * something" looks and behaves identically everywhere in the app.
 */
function InlineForm({
  icon, fieldRef, autoFocus, ariaLabel, value, onChange, onSubmitLines, onCancel, placeholder, commit,
}: InlineFormProps) {
  return (
    <div
      style={{ display: 'grid', gap: 'var(--sp-4)' }}
      /* The self-dismiss guard rides the wrapper rather than the field, so
         pressing the commit button — which blurs the textarea — cannot throw
         the form away before the click lands. `ListColumn` says the same. */
      tabIndex={-1}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget) && !value.trim()) onCancel();
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
        <Icon name={icon} size={16} style={{ flex: '0 0 auto', color: 'var(--fg-4)' }} />
        <BulkAddInput
          ref={fieldRef}
          autoFocus={autoFocus}
          ariaLabel={ariaLabel}
          value={value}
          onChange={onChange}
          onSubmitLines={onSubmitLines}
          onCancel={onCancel}
          placeholder={placeholder}
          className="ag-field"
          style={INLINE_FIELD}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--sp-3)' }}>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button
          size="sm"
          variant="tint"
          tone="accent"
          disabled={!value.trim()}
          onClick={() => onSubmitLines(parseBulkLines(value))}
          iconLeft={<Icon name="plus" size={14} />}
        >
          {commit}
        </Button>
      </div>
    </div>
  );
}

/** One reading in the masthead's stats strip: a number and what it counts. */
function Stat({ value, label }: { value: string; label: ReactNode }) {
  return (
    <span style={{ display: 'grid', gap: 2 }}>
      <span style={{ ...MONO, fontSize: 'var(--text-sm)', color: 'var(--fg-1)' }}>{value}</span>
      <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>{label}</span>
    </span>
  );
}

function StatRule() {
  return <span aria-hidden="true" style={{ width: 1, height: 34, background: 'var(--line-faint)', flex: '0 0 auto' }} />;
}

// ─── ProjectView (main page) ──────────────────────────────────────────────────

export default function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const wide = useMedia(WIDE);
  const nav = useNavModel();

  const { user } = useAuth();
  const {
    projects, updateProject, deleteProject,
    taskLists, backlogTasks,
    addTaskList, renameTaskList, deleteTaskList, reorderTaskLists, updateTaskList,
    addBacklogTask,
    updateBacklogTask, deleteBacklogTask,
    reorderBacklogTasks, moveTaskToList,
  } = useStore();

  const project = projects.find((p) => p.id === projectId);
  const projectLists = useMemo(
    () => taskLists.filter((l) => l.projectId === projectId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [taskLists, projectId]
  );

  // Share ids of every *outsourcing* share this project exposes (project itself,
  // its lists, and any individually-shared task in it) — the owner's approval
  // panel watches these for incoming worker submissions.
  const outsourceShareIds = useMemo(() => {
    const ids: string[] = [];
    if (project?.shareId && project.shareAllowContributions) ids.push(project.shareId);
    for (const l of projectLists) {
      if (l.shareId && l.shareAllowContributions) ids.push(l.shareId);
    }
    const listIdSet = new Set(projectLists.map((l) => l.id));
    for (const t of backlogTasks) {
      if (t.shareId && t.shareAllowContributions && !t.parent && (listIdSet.has(t.listId ?? '') || (t.sharedListIds ?? []).some((id) => listIdSet.has(id)))) {
        ids.push(t.shareId);
      }
    }
    return ids;
  }, [project, projectLists, backlogTasks]);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [editingProject, setEditingProject] = useState(false);
  const [shareListId, setShareListId] = useState<string | null>(null);
  const [projectShareOpen, setProjectShareOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  /*
   * BOTH ARE REMEMBERED, AND BOTH ARE KEYED PER PROJECT.
   *
   * Shreekant, 2026-09-15: *"whatever I set is remembered, it doesn't
   * change to its default value"*. Per project rather than globally
   * because the choice genuinely differs by project - a reference list
   * of books wants List where a working project wants Board - and one
   * global 'last used' is wrong the first time he opens the other kind.
   *
   * `showDone` also has its DEFAULT FLIPPED to false, which is the half
   * of his complaint that is not a memory question: a board opening full
   * of finished work is the thing he asked to stop.
   */
  const [view, setView] = useRememberedState<'board' | 'list'>(
    `base.project.view.${projectId ?? 'none'}`, 'board',
  );
  const [showDone, setShowDone] = useRememberedState(
    `base.project.showDone.${projectId ?? 'none'}`, false,
  );
  const [bulkMoveListId, setBulkMoveListId] = useState('');
  const [addingList, setAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskActive, setQuickTaskActive] = useState(false);
  const quickTaskRef = useRef<HTMLTextAreaElement>(null);
  const newListRef = useRef<HTMLTextAreaElement>(null);

  /*
   * BUILD-4 — WHAT THE AI PANEL IS ABOUT, IF IT IS OPEN.
   *
   * Held with the project it was opened in, because this component stays
   * mounted when he moves from one project to another: a panel about a list
   * in the last project must not follow him into this one. Tapping the same
   * subject's button again closes it — the button is a toggle, and "Ask" on
   * the thing already being asked about has no other sensible meaning.
   */
  const [askState, setAskState] = useState<{ projectId: string | undefined; ref: PanelSubjectRef } | null>(() => {
    /* The harness's way in — `lib/devPanelFixture.ts`. */
    if (import.meta.env.DEV) {
      const fixture = devPanelFixture();
      if (fixture && fixture.ref.kind !== 'score') return { projectId, ref: fixture.ref };
    }
    return null;
  });
  const ask = askState && askState.projectId === projectId ? askState.ref : null;
  const closeAsk = useCallback(() => setAskState(null), []);
  const toggleAsk = useCallback((ref: PanelSubjectRef) => {
    setAskState((prev) =>
      prev && prev.projectId === projectId && prev.ref.kind === ref.kind && prev.ref.id === ref.id
        ? null
        : { projectId, ref },
    );
  }, [projectId]);
  const askTask = useCallback((task: Task) => toggleAsk({ kind: 'task', id: task.id }), [toggleAsk]);
  const askList = useCallback((listId: string) => toggleAsk({ kind: 'list', id: listId }), [toggleAsk]);
  const boardAsk = ask && (ask.kind === 'task' || ask.kind === 'list') ? { kind: ask.kind, id: ask.id } : null;
  const askingProject = ask?.kind === 'project';

  /* The panel takes half a narrow window, and the card it is about may be in
     that half. `AIPanel.prompt.md`: "A panel that hides the card it is
     discussing has failed" — so the subject is brought into what is left.
     A timeout rather than rAF: the grid has to have resized first, and rAF
     never fires while the window is hidden. */
  const askKey = ask ? `${ask.kind}:${ask.id}` : null;
  useEffect(() => {
    if (askKey === null) return;
    /* Instant, not smooth: a smooth scroll runs on the compositor's own clock,
       so the screenshot harness caught the board a few pixels apart on every
       run. It only ever moves far enough to uncover the card. */
    const reveal = () =>
      document.querySelector('[data-ai-subject="true"]')?.scrollIntoView({ block: 'nearest' });
    /* Twice: once straight away, and once after the board's rows have finished
       condensing in — on a fresh page the columns are still growing at the
       first call, and the card measured there is not where it ends up. */
    const first = window.setTimeout(reveal, 60);
    const settled = window.setTimeout(reveal, 700);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(settled);
    };
  }, [askKey, wide]);

  // Both of this page's drags run on one `SortableBoard` (see
  // `components/SortableList.tsx`): whole lists reorder in the grid, grabbed by
  // the small handle in each list's header, and tasks move within a list or
  // into another one. They *have* to share a context rather than sit in two —
  // a task dropped on a different list has to collide with droppables that
  // list registered, and two contexts cannot see each other's.
  const projectListIds = useMemo(() => projectLists.map((l) => l.id), [projectLists]);
  const reorderLists = useCallback((orderedIds: string[]) => {
    if (projectId) reorderTaskLists(projectId, orderedIds);
  }, [projectId, reorderTaskLists]);

  // Each list's rows, in the order they are on screen. Hoisted out of the
  // render loop because the board needs the *whole* map, not one list at a
  // time: a row dropped on another list is placed relative to that list's rows,
  // and the ids the board sorts against have to be the same array the rows were
  // rendered from or a drop lands a slot out.
  const tasksByListAll = useMemo(() => {
    const byList: Record<string, Task[]> = {};
    for (const list of projectLists) {
      byList[list.id] = backlogTasks
        .filter((t) => (t.listId === list.id || t.sharedListIds?.includes(list.id)) && !t.parent)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    return byList;
  }, [projectLists, backlogTasks]);

  /** What is on screen. `showDone` hides finished rows; it never removes them.
   *  FIX-9 folds a repeat's finished occurrences into one row the same way —
   *  hidden, not removed, so `mergeVisibleOrder` keeps their place on a drag —
   *  and `repeatCounts` carries how many each surviving row stands for. */
  const { tasksByList, repeatCounts } = useMemo(() => {
    const byList: Record<string, Task[]> = {};
    const counts: Record<string, number> = {};
    for (const [listId, listTasks] of Object.entries(tasksByListAll)) {
      if (!showDone) { byList[listId] = listTasks.filter((t) => t.status !== 'completed'); continue; }
      const folded = foldFinishedRepeats(listTasks);
      byList[listId] = folded.map((r) => r.task);
      for (const r of folded) if (r.count > 1) counts[r.task.id] = r.count;
    }
    return { tasksByList: byList, repeatCounts: counts };
  }, [tasksByListAll, showDone]);

  const taskIdsByList = useMemo(() => {
    const byList: Record<string, string[]> = {};
    for (const [listId, listTasks] of Object.entries(tasksByList)) {
      byList[listId] = listTasks.map((t) => t.id);
    }
    return byList;
  }, [tasksByList]);

  /**
   * A reorder of the rows you can SEE, written back as a reorder of all of
   * them. See the note at the top: handing `reorderBacklogTasks` a short list
   * deletes everything missing from it. The arithmetic is `mergeVisibleOrder`,
   * pure and pinned in `boardDrop.test.ts` beside the rest of this board's —
   * a drop is not a still picture, so the screenshot harness cannot reach it.
   */
  const handleReorderItems = useCallback((listId: string, visibleOrder: string[]) => {
    const all = tasksByListAll[listId];
    if (!all) return;
    reorderBacklogTasks(listId, mergeVisibleOrder(all.map((t) => t.id), visibleOrder));
  }, [tasksByListAll, reorderBacklogTasks]);

  // The preview that follows the pointer while a task is dragged, in place of
  // the browser's own drag image — which native drag rendered as a smeared
  // screenshot of the row, differently in every browser, and which a finger
  // never produced at all.
  const renderTaskGhost = useCallback((taskId: string) => {
    const task = backlogTasks.find((t) => t.id === taskId);
    if (!task) return null;
    return <TaskDragGhost title={task.title} />;
  }, [backlogTasks]);

  // keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') {
        // Leaving select mode is a *page*-level Escape, and this listener is
        // on `window` like every overlay's — so with a panel or dropdown open
        // one press would dismiss it and clear the selection underneath it in
        // the same beat. The overlay on top gets the key; this only answers
        // once nothing is stacked above the page.
        if (isOverlayOpen()) return;
        setSelectMode(false);
        setSelectedIds(new Set());
        setSelectedTask(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSelectTask = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  /** A row's ⋯ menu. Soft-deletes through the one path, like every other
   *  delete in the app — the menu is what confirms, not this. */
  const handleDeleteTask = useCallback((task: Task) => {
    deleteBacklogTask(task.id);
  }, [deleteBacklogTask]);

  /**
   * A row's `Tick`. Goes through `updateBacklogTask` and nothing else, which
   * is the app's one status path — that is where a repeating task spawns its
   * successor and where un-completing takes the successor back (CLAUDE.md,
   * "Completion goes through one path"). Writing `backlogTasks` here directly
   * would silently stop every repeat on the board.
   */
  const handleToggleTaskDone = useCallback((task: Task) => {
    const done = task.status === 'completed';
    /* Item 19's lock, restated where the write happens. Both rows already
       render a disabled `Tick` on a locked task, so this can only be reached
       by something that bypassed the control — and the row is the wrong place
       to put the app's last word on whether a task may be completed, because
       there are two rows. Un-ticking is never refused: `isTaskLocked` returns
       false for a completed task, and reopening one is how you undo a mistake. */
    if (!done && isTaskLocked(backlogTasks, task)) return;
    updateBacklogTask(task.id, done
      ? { status: 'needsAction', completedAt: undefined }
      : { status: 'completed', completedAt: Date.now() });
  }, [backlogTasks, updateBacklogTask]);

  const handleBulkMove = () => {
    if (!bulkMoveListId) return;
    const targetList = taskLists.find((l) => l.id === bulkMoveListId);
    selectedIds.forEach((id) => {
      updateBacklogTask(id, {
        listId: bulkMoveListId,
        listName: targetList?.title ?? '',
      });
    });
    setSelectedIds(new Set());
    setSelectMode(false);
    setBulkMoveListId('');
  };

  const handleBulkDelete = () => {
    selectedIds.forEach((id) => deleteBacklogTask(id));
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  const handleShareList = async (listId: string) => {
    if (!user) return;
    const list = taskLists.find((l) => l.id === listId);
    if (!list) return;
    let id = list.shareId;
    if (!id) {
      id = makeShareId();
      updateTaskList(listId, { shareId: id });
    }
    try {
      await shareList(id, user.uid, { ...list, shareId: id }, backlogTasks);
      setShareListId(listId);
    } catch (err) {
      console.error('Failed to share list', err);
      alert(`Couldn't create the share link. ${err instanceof Error ? err.message : 'Please try again.'}`);
    }
  };

  const handleListShareSettingsChange = async (listId: string, patch: ShareSettings) => {
    if (!user) return;
    const list = taskLists.find((l) => l.id === listId);
    if (!list?.shareId) return;
    updateTaskList(listId, patch);
    try {
      // Re-push the snapshot immediately so the public doc carries the new mode
      // (the submissions security rule keys off `allowContributions`).
      await shareList(list.shareId, user.uid, { ...list, ...patch }, backlogTasks);
    } catch (err) {
      console.error('Failed to update share settings', err);
    }
  };

  /** "Share project", from inside the project. `ProjectCard`'s flow verbatim. */
  const handleShareProject = async () => {
    if (!user || !project) return;
    let id = project.shareId;
    if (!id) {
      id = makeShareId();
      updateProject(project.id, { shareId: id });
    }
    try {
      await shareProject(id, user.uid, { ...project, shareId: id }, taskLists, backlogTasks);
      setProjectShareOpen(true);
    } catch (err) {
      console.error('Failed to share project', err);
      alert(`Couldn't create the share link. ${err instanceof Error ? err.message : 'Please try again.'}`);
    }
  };

  const handleProjectShareSettingsChange = async (patch: ShareSettings) => {
    if (!user || !project?.shareId) return;
    updateProject(project.id, patch);
    try {
      await shareProject(project.shareId, user.uid, { ...project, ...patch }, taskLists, backlogTasks);
    } catch (err) {
      console.error('Failed to update share settings', err);
    }
  };

  const shareList_ = taskLists.find((l) => l.id === shareListId);

  /** Bulk-capable: one title per line creates one list each, in order. */
  const handleAddListLines = (lines: string[]) => {
    if (!projectId) return;
    lines.forEach((title) => addTaskList(title, projectId));
    setNewListTitle('');
    setAddingList(false);
  };

  /** Bulk-capable: one title per line creates one task each, in order. */
  const handleQuickAddTaskLines = (lines: string[]) => {
    if (!projectId || lines.length === 0) { setQuickTaskActive(false); setQuickTaskTitle(''); return; }

    let targetListId: string;
    if (projectLists.length > 0) {
      targetListId = projectLists[0].id;
    } else {
      const newList = addTaskList('Tasks', projectId);
      targetListId = newList.id;
    }
    lines.forEach((title) => addBacklogTask(title, targetListId));
    setQuickTaskTitle('');
    setQuickTaskActive(false);
  };

  const openQuickAdd = () => {
    setQuickTaskActive(true);
    setTimeout(() => quickTaskRef.current?.focus(), 50);
  };

  const openAddList = () => {
    setAddingList(true);
    setTimeout(() => newListRef.current?.focus(), 50);
  };

  useShortcuts('project-view', [
    { ...builtInShortcut('new-task'), handler: openQuickAdd },
    { ...builtInShortcut('new-list'), handler: openAddList },
  ]);

  // What the masthead's stats strip reads out. Derived exactly the way
  // `ProjectCard` derives it on Home, cross-links included, so the two agree
  // about how big a project is.
  const projectTasks = useMemo(() => {
    const listIdSet = new Set(projectLists.map((l) => l.id));
    return backlogTasks.filter(
      (t) => !t.parent && (listIdSet.has(t.listId ?? '') || (t.sharedListIds ?? []).some((id) => listIdSet.has(id)))
    );
  }, [projectLists, backlogTasks]);
  const completedCount = projectTasks.filter((t) => t.status === 'completed').length;
  const progress = projectTasks.length > 0 ? Math.round((completedCount / projectTasks.length) * 100) : 0;
  const projectINR = project ? projectValueINR(taskLists, backlogTasks, project.id) : 0;
  const minutesLeft = workLeftMinutes(projectTasks);

  const picked = useMemo(
    () => projectTasks.filter((t) => selectedIds.has(t.id)),
    [projectTasks, selectedIds]
  );

  if (!project) {
    return (
      <V3Scope>
      <div
        className="ag-page"
        /* The gutter is on the inner block rather than here, because an inline
           `padding` on a `.ag-page` overrides the system-bar inset
           `screens.css` puts on every screen root (APP-2) and this was the one
           screen that carried one. */
        style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}
      >
        <div style={{ display: 'grid', gap: 'var(--sp-6)', justifyItems: 'center', textAlign: 'center', padding: 'var(--gutter-page-sm)' }}>
          <p style={{ font: 'var(--type-body)', color: 'var(--fg-3)' }}>Project not found.</p>
          <Button onClick={() => navigate('/')} iconLeft={<Icon name="arrow-left" size={16} />}>
            Go home
          </Button>
        </div>
      </div>
      </V3Scope>
    );
  }

  return (
    <V3Scope>
    {/* `ag-page` rather than the old opaque `#050505` wrapper, so the grid
       backdrop shows through and every pane above it has something to refract.

       It was `ag-page--calm` until V3-3 — `project.html`'s own body class,
       keeping `.ag-page`'s emerald pool off a dense board of columns (UI-29,
       made visible at UI-36/37). `Project.dc.html` draws that pool over this
       very board, and V3's glass needs something behind it to bend, so the
       screen takes the full field exactly as Home did at V3-2.

       The window itself never scrolls — the content column does, which is also
       the ancestor dnd-kit auto-scrolls while a row is dragged. */}
    <div className="ag-page" style={{ height: '100dvh', display: 'flex', overflow: 'hidden' }}>
      {wide && (
        <div style={{ flex: '0 0 auto', padding: 'var(--sp-9) 0 var(--sp-9) var(--sp-7)' }}>
          <MiniNav
            orientation="vertical"
            items={nav.items}
            value={nav.current}
            onChange={nav.go}
            lead={<RailMark />}
          />
        </div>
      )}

      {/* BUILD-4: the AI panel docks, it never covers. The board column is the
          grid's first track and shrinks — to the top 44% on a narrow window,
          to everything left of a 404px column on a wide one. */}
      <AIPanelDock
        dock={wide ? 'right' : 'bottom'}
        panel={ask && (
          <AIPanelHost subject={ask} dock={wide ? 'right' : 'bottom'} onClose={closeAsk} />
        )}
      >
      <div
        style={{
          minWidth: 0,
          minHeight: 0,
          overflowY: 'auto',
          boxSizing: 'border-box',
          /* 112px on a narrow window is the floating nav bar's lane; the extra
             on both is the selection bar's. The nav steps aside while the AI
             panel is docked at the bottom, so the lane goes with it. */
          padding: wide
            ? 'var(--sp-9) var(--gutter-page) var(--sp-13)'
            : `var(--sp-8) var(--gutter-page-sm) ${ask ? 'var(--sp-8)' : '112px'}`,
        }}
      >
        <div style={{ width: '100%', maxWidth: 1320, margin: '0 auto' }}>
          {/* ── Breadcrumb bar ─────────────────────────────────────────── */}
          <header
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap',
              marginBottom: 'var(--sp-9)',
            }}
          >
            {/* The way out of a project, in the header rather than floating
                over the page in the old design system. Home is where projects
                live, and it is the rail's lit entry for the same reason. A
                round glass button since V3-3 — the design's phone header
                draws its Back exactly so, and Home's header buttons are the
                same object. */}
            <IconButton label="Back to projects" onClick={() => navigate('/')}>
              <Icon name="arrow-left" size={18} />
            </IconButton>
            {/* The rail carries the mark on a wide window (V3-3, as Home). */}
            {!wide && <BrandMark />}
            <button
              type="button"
              onClick={() => navigate('/')}
              style={{
                border: 0, background: 'transparent', padding: 0, cursor: 'pointer',
                font: 'var(--type-label)', color: 'var(--fg-3)',
              }}
            >
              Projects
            </button>
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>/</span>
            <span
              style={{
                font: 'var(--type-label)', color: 'var(--fg-1)',
                minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {project.name}
            </span>

            <span style={{ flex: 1 }} />

            {/* The project's own menu, which this screen never had — sharing
                and deleting a project could only be reached from Home's card.
                Delete arms in place, as everywhere else in the app. */}
            <MorphMenu
              align="end"
              width={256}
              portal
              zIndex={Z.dropdown}
              trigger={
                <IconButton label={`Actions for ${project.name}`}>
                  <Icon name="ellipsis" size={18} />
                </IconButton>
              }
              header={{
                title: project.name,
                meta: [
                  `${projectLists.length} list${projectLists.length === 1 ? '' : 's'}`,
                  `${projectTasks.length} task${projectTasks.length === 1 ? '' : 's'}`,
                  projectINR > 0 ? formatINR(projectINR) : 'no value',
                ].join('  ·  '),
                badge: (
                  <span
                    style={{
                      width: 7, height: 7, borderRadius: '50%', flex: '0 0 auto',
                      background: project.color,
                    }}
                  />
                ),
              }}
              items={[
                {
                  value: 'edit',
                  label: 'Edit project',
                  icon: <Icon name="square-pen" size={18} />,
                  meta: <Icon name="chevron-right" size={16} />,
                  onSelect: () => setEditingProject(true),
                },
                {
                  value: 'share',
                  label: 'Share project',
                  icon: <Icon name="share-2" size={18} />,
                  meta: project.shortUrlKeyword ? <Icon name="link" size={14} /> : undefined,
                  onSelect: () => { void handleShareProject(); },
                },
                { divider: true },
                /* BUILD-11 — the card menu's pair, as `Archive.dc.html` asks. */
                {
                  value: 'archive',
                  label: 'Archive project',
                  icon: <Icon name="archive" size={18} />,
                  confirm: {
                    label: `Archive ${project.name}?`,
                    hint: projectTasks.length === 0
                      ? 'It leaves every board, count, queue, search and Atlas. Nothing ever purges it.'
                      : `It leaves every board, count, queue, search and Atlas. Its ${projectTasks.length} task${projectTasks.length === 1 ? '' : 's'} go with it. Nothing ever purges it.`,
                    action: 'Archive',
                    onConfirm: () => { if (archiveProject(project.id)) navigate('/'); },
                  },
                },
                {
                  value: 'delete',
                  label: 'Delete project',
                  icon: <Icon name="trash-2" size={18} />,
                  tone: 'danger',
                  confirm: {
                    label: `Delete ${project.name}?`,
                    hint: projectLists.length === 0
                      ? 'Nothing in it yet.'
                      : `${projectLists.length} list${projectLists.length === 1 ? '' : 's'} and ${projectTasks.length} task${projectTasks.length === 1 ? '' : 's'} go with it. Recoverable from Trash for 30 days.`,
                    onConfirm: () => { deleteProject(project.id); navigate('/'); },
                  },
                },
              ]}
            />
          </header>

          <div style={{ display: 'grid', gap: 'var(--gap-section)' }}>
            {/* ── Masthead ─────────────────────────────────────────────── */}
            <section
              data-ai-subject={askingProject ? 'true' : undefined}
              style={{
                display: 'grid', gap: 'var(--sp-8)', padding: 'var(--pad-card-lg)',
                borderRadius: 'var(--r-card-lg)',
                backgroundImage: 'var(--glass-fill-2)',
                backdropFilter: 'var(--glass-bd-lg-refract)',
                WebkitBackdropFilter: 'var(--glass-bd-lg)',
                boxShadow: askingProject
                  ? `${AI_SUBJECT_RIM}, var(--glass-inner-1)`
                  : 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-2)',
                animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
              }}
            >
              {/* The cover sits BEHIND the glass and renders at full colour.
                  `.ag-cover`'s hairlines are what shows when there is no image
                  — the same treatment `ProjectCard` gives an uncovered project,
                  and the masthead and the card must stay in step or one cover
                  looks like two different pictures. It was desaturated until
                  FIX-3; see `ProjectCard.tsx` for why it no longer is, and do
                  not reinstate the filter here alone. */}
              <div style={{ position: 'relative' }}>
                <div
                  className="ag-cover"
                  style={{
                    /* 216px with a picture, 116 without (Shreekant,
                       2026-09-23: "increase by 100"). It took Home's card shape
                       for one commit (`27e26fe`, 3:1 — ~376px on a laptop) and
                       he found that too big. The picture is cropped to fill
                       it. With no picture the hatching stays at the old strip:
                       a tall empty box only pushes the board down. */
                    position: 'relative', height: project.imageUrl ? 216 : 116,
                    overflow: 'hidden', borderRadius: 'var(--r-lg)',
                    boxShadow: 'var(--glass-well-shadow), inset 0 0 0 1px var(--line-faint)',
                  }}
                >
                  {/* Cropped to fill the strip, centred — his call over
                      showing it whole with blurred sides. Home's card is
                      where the whole picture is seen. */}
                  {project.imageUrl && <CoverImage src={project.imageUrl} fit="crop" />}
                </div>

                {/* The project's own glyph — the one place an emoji is allowed
                    to be an identity rather than a label. `ProjectCard`'s tile,
                    hung over the cover's bottom edge as the mockup hangs it. */}
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute', left: 'var(--sp-6)', bottom: -22,
                    display: 'grid', placeItems: 'center', width: 56, height: 56,
                    borderRadius: 'var(--r-md)',
                    backgroundImage: 'var(--glass-fill-3)',
                    backdropFilter: 'var(--glass-bd-md)',
                    WebkitBackdropFilter: 'var(--glass-bd-md)',
                    boxShadow: 'var(--glass-rim-2), var(--glass-cast-2)',
                  }}
                >
                  <AppIcon icon={project.icon} size={26} />
                </span>

                {/* No "Change cover" here since FIX-9: Shreekant moved it into
                    the edit sheet (⋯ → Edit project → Cover image), which
                    already held it. A button on the photograph sat over the
                    one picture he asked to see whole. */}
              </div>

              {/* The "PROJECT · 3 lists" row above the name is gone
                  (Shreekant, 2026-09-23): the list count is one of the stats
                  now, and Ask is a glass square beside the name. One row
                  fewer in the masthead. */}
              <div style={{ display: 'grid', gap: 'var(--sp-6)', minWidth: 0, paddingTop: 'var(--sp-5)' }}>
                {/* Name and description on the left, the stats strip beside
                    them on the right (Shreekant, 2026-09-23) — it used to be a
                    row of its own under a hairline, which made the masthead a
                    band taller for four numbers. It wraps under the name when
                    there is not room beside it. */}
                <div
                  style={{
                    display: 'flex', flexWrap: 'wrap', alignItems: 'center',
                    columnGap: 'var(--sp-9)', rowGap: 'var(--sp-6)', minWidth: 0,
                  }}
                >
                <div style={{ flex: '1 1 320px', display: 'grid', gap: 'var(--sp-4)', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', minWidth: 0 }}>
                  <h1
                    style={{
                      minWidth: 0,
                      font: 'var(--type-metric)', letterSpacing: 'var(--tracking-display)',
                      color: 'var(--fg-1)',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >
                    {project.name}
                  </h1>
                  {/* BUILD-4's masthead opener, as a glass square beside the
                      name (his call, 2026-09-23) rather than a labelled
                      button on a row of its own. Never tinted while open:
                      tint is emerald, and emerald means running. The
                      masthead's rim is what says "this". */}
                  <IconButton
                    size="md"
                    variant="glass"
                    label="Ask AI about this project"
                    title="Ask AI about this project"
                    aria-pressed={askingProject}
                    onClick={() => toggleAsk({ kind: 'project', id: project.id })}
                    style={{ flex: '0 0 auto', borderRadius: 'var(--r-sm)' }}
                  >
                    <Icon name="sparkles" size={18} />
                  </IconButton>
                  </div>
                  {project.description && (
                    <p style={{ font: 'var(--type-body)', color: 'var(--fg-3)', maxWidth: '48ch', textWrap: 'pretty' }}>
                      {project.description}
                    </p>
                  )}
                </div>

                <div
                  style={{
                    flex: '0 0 auto', display: 'flex', alignItems: 'center',
                    gap: 'var(--sp-7)', flexWrap: 'wrap',
                  }}
                >
                  <ProgressRing value={progress} size={54} thickness={5} showValue />
                  {/* What the kicker row above the name used to say, first
                      after the ring (Shreekant, 2026-09-23). The identity
                      hue, rationed to a 4px dot — never a glow, because
                      emerald has to stay the only colour that means anything.
                      Same dot every list header below carries. */}
                  <Stat
                    value={`${projectLists.length} ${projectLists.length === 1 ? 'list' : 'lists'}`}
                    label={(
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                        <span
                          aria-hidden="true"
                          style={{ width: 4, height: 4, borderRadius: '50%', background: project.color }}
                        />
                        project
                      </span>
                    )}
                  />
                  <StatRule />
                  <Stat value={`${completedCount} of ${projectTasks.length}`} label="tasks done" />
                  <StatRule />
                  <Stat value={minutesLabel(minutesLeft)} label="work left" />
                  {projectINR > 0 && (
                    <>
                      <StatRule />
                      <Stat value={formatINR(projectINR)} label="value" />
                    </>
                  )}
                </div>
                </div>
              </div>
            </section>

            <section style={{ display: 'grid', gap: 'var(--sp-7)' }}>
              {/* ── Toolbar ────────────────────────────────────────────── */}
              {/* How the tasks are shaped, not what they are. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
                <SegmentedControl
                  size="sm"
                  value={view}
                  onChange={(v) => setView(v as 'board' | 'list')}
                  options={[
                    { value: 'board', label: 'Board', icon: <Icon name="columns-3" size={16} /> },
                    { value: 'list', label: 'List', icon: <Icon name="list" size={16} /> },
                  ]}
                />
                <Switch checked={showDone} onChange={setShowDone} size="sm" label="Show done" />

                <span style={{ flex: 1 }} />

                {/* `frost` while it is on — the white pane the old pill had, and
                    the header's one primary. Never emerald: nothing about
                    picking rows is live. */}
                <Button
                  size="sm"
                  variant={selectMode ? 'frost' : 'glass'}
                  aria-pressed={selectMode}
                  onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
                  iconLeft={<Icon name={selectMode ? 'check-check' : 'list-checks'} size={15} />}
                >
                  {selectMode ? 'Selecting' : 'Select'}
                </Button>
                {/* The design's "Add task", a gel button: V3's one primary,
                    and adding work is this screen's primary act. The name is
                    ours and stays — the `n` shortcut is listed as "New task". */}
                <Button size="sm" variant="gel" onClick={openQuickAdd} iconLeft={<Icon name="plus" size={15} />}>
                  New task
                </Button>
              </div>

              {/* ── Quick-add ──────────────────────────────────────────── */}
              <AnimatePresence>
                {quickTaskActive && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={FORM_PANE}>
                      <InlineForm
                        icon="circle"
                        fieldRef={quickTaskRef}
                        ariaLabel={`New task in ${project.name}`}
                        value={quickTaskTitle}
                        onChange={setQuickTaskTitle}
                        onSubmitLines={handleQuickAddTaskLines}
                        onCancel={() => { setQuickTaskActive(false); setQuickTaskTitle(''); }}
                        placeholder="Task title… paste multiple lines to bulk-add"
                        commit="Add task"
                      />
                      {projectLists.length === 0 && (
                        <p className="ag-kicker" style={{ marginTop: 'var(--sp-4)' }}>
                          A default “Tasks” list will be created automatically
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {outsourceShareIds.length > 0 && <OutsourcedWorkPanel shareIds={outsourceShareIds} />}

              {/* ── The board, or the table ────────────────────────────── */}
              {projectLists.length === 0 ? (
                /* An empty project gets a sentence and one door, not a grid of
                   dashed placeholders. */
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{
                    display: 'grid', justifyItems: 'center', textAlign: 'center',
                    gap: 'var(--sp-5)', padding: 'var(--sp-13) 0',
                  }}
                >
                  <AppIcon icon={project.icon} size={44} />
                  <h2 style={{ font: 'var(--type-title)', fontSize: 'var(--text-xl)', color: 'var(--fg-1)' }}>
                    No tasks yet
                  </h2>
                  <p
                    style={{
                      maxWidth: '42ch',
                      font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)',
                    }}
                  >
                    Add your first task, or create a list to organise tasks into sections.
                  </p>

                  {!addingList ? (
                    <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {/* The screen's one primary while it is empty — gel since
                          V3-3, the same object as the toolbar's New task. */}
                      <Button variant="gel" onClick={openQuickAdd} iconLeft={<Icon name="plus" size={16} />}>
                        Add first task
                      </Button>
                      <Button onClick={openAddList} iconLeft={<Icon name="plus-circle" size={16} />}>
                        New list
                      </Button>
                    </div>
                  ) : (
                    <div style={{ ...FORM_PANE, width: '100%', maxWidth: 420, textAlign: 'left' }}>
                      <InlineForm
                        icon="plus-circle"
                        fieldRef={newListRef}
                        autoFocus
                        ariaLabel={`New list in ${project.name}`}
                        value={newListTitle}
                        onChange={setNewListTitle}
                        onSubmitLines={handleAddListLines}
                        onCancel={() => { setAddingList(false); setNewListTitle(''); }}
                        placeholder="List name… paste multiple lines to bulk-create"
                        commit="Create list"
                      />
                    </div>
                  )}
                </motion.div>
              ) : view === 'list' ? (
                <ListTable
                  lists={projectLists}
                  tasksByList={tasksByList}
                  repeatCounts={repeatCounts}
                  selectedIds={selectedIds}
                  selectMode={selectMode}
                  onSelectTask={handleSelectTask}
                  onOpenTask={setSelectedTask}
                  onDeleteTask={handleDeleteTask}
                  onToggleTaskDone={handleToggleTaskDone}
                  onAskTask={askTask}
                  onAskList={askList}
                  askSubject={boardAsk}
                />
              ) : (
                <SortableBoard
                  containerIds={projectListIds}
                  itemsByContainer={taskIdsByList}
                  onReorderContainers={reorderLists}
                  onReorderItems={handleReorderItems}
                  onMoveItem={moveTaskToList}
                  renderItemOverlay={renderTaskGhost}
                  className="ag-board-grid"
                >
                  <AnimatePresence>
                    {projectLists.map((list) => {
                      const listTasks = tasksByList[list.id] ?? [];

                      return (
                        <SortableRow key={list.id} id={list.id} handle>
                          {({ isAnyDragging, isReceivingItem, handleProps }) => (
                            <ListColumn
                              listId={list.id}
                              listTitle={list.title}
                              listColor={project.color}
                              taskLists={taskLists}
                              tasks={listTasks}
                              repeatCounts={repeatCounts}
                              selectedIds={selectedIds}
                              selectMode={selectMode}
                              onSelectTask={handleSelectTask}
                              onOpenTask={setSelectedTask}
                              onDeleteTask={handleDeleteTask}
                              onToggleTaskDone={handleToggleTaskDone}
                              onAddTask={(lid, titles) => titles.forEach((title) => addBacklogTask(title, lid))}
                              onDeleteList={(lid) => deleteTaskList(lid)}
                              onRenameList={(lid, title) => renameTaskList(lid, title)}
                              onShareList={(lid) => void handleShareList(lid)}
                              hasShortLink={!!list.shortUrlKeyword}
                              hidden={list.hiddenFromShare}
                              onToggleHidden={(lid) => updateTaskList(lid, { hiddenFromShare: !list.hiddenFromShare })}
                              listDragHandleProps={handleProps}
                              isListDragActive={isAnyDragging}
                              isReceivingDrop={isReceivingItem}
                              onAskTask={askTask}
                              onAskList={askList}
                              askSubject={boardAsk}
                            />
                          )}
                        </SortableRow>
                      );
                    })}
                  </AnimatePresence>

                  {/* Add-list cell. Dashed, because that is how this system
                      draws an empty slot — see `ListColumn`'s header note. */}
                  {addingList ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      style={{ ...FORM_PANE, alignSelf: 'start' }}
                    >
                      <InlineForm
                        icon="plus-circle"
                        fieldRef={newListRef}
                        autoFocus
                        ariaLabel={`New list in ${project.name}`}
                        value={newListTitle}
                        onChange={setNewListTitle}
                        onSubmitLines={handleAddListLines}
                        onCancel={() => { setAddingList(false); setNewListTitle(''); }}
                        placeholder="List name… paste multiple lines to bulk-create"
                        commit="Create list"
                      />
                    </motion.div>
                  ) : (
                    <button
                      type="button"
                      className="ag-addrow"
                      onClick={openAddList}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: 'var(--sp-4)', alignSelf: 'start',
                        minHeight: 152, width: '100%', padding: 'var(--pad-card)',
                        borderRadius: 'var(--r-card)', cursor: 'pointer', font: 'var(--type-label)',
                      }}
                    >
                      <span
                        style={{
                          display: 'grid', placeItems: 'center', width: 40, height: 40,
                          borderRadius: '50%',
                          backgroundImage: 'var(--glass-fill-2)', boxShadow: 'var(--glass-rim-2)',
                        }}
                      >
                        <Icon name="plus" size={18} />
                      </span>
                      Add list
                    </button>
                  )}
                </SortableBoard>
              )}
            </section>
          </div>
        </div>
      </div>
      </AIPanelDock>

      {/* ── Selection bar ──────────────────────────────────────────────── */}
      {/* The bridge out of this view. A pill fixed to the bottom of the window
          rather than a strip that shoves the board down the instant you pick a
          row — the mockup's, with the app's real actions in it. It keeps its
          space at all times and only its opacity and offset animate, so
          nothing behind it reflows. */}
      <div
        style={{
          /* Centred over the board, not the window, while the AI panel holds
             the right-hand column. */
          position: 'fixed', left: 0, right: ask && wide ? 404 : 0,
          bottom: wide ? 'calc(var(--sp-9) + var(--safe-b))' : 'calc(96px + var(--safe-b))',
          display: 'grid', placeItems: 'center', zIndex: Z.nav, pointerEvents: 'none',
          padding: '0 var(--gutter-page-sm)',
        }}
      >
        <div
          /* `inert`, not `aria-hidden`: the bar stays mounted so it can morph
             in and out, and a hidden container full of focusable buttons is
             exactly the a11y bug `aria-hidden` alone would leave behind — Tab
             would still land in it. React 19 passes this straight through. */
          inert={picked.length === 0}
          style={{
            pointerEvents: picked.length ? 'auto' : 'none',
            display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap',
            justifyContent: 'center',
            minHeight: 60, padding: 'var(--sp-3) var(--sp-4) var(--sp-3) var(--sp-8)',
            borderRadius: 'var(--r-pill)',
            backgroundImage: 'var(--glass-fill-3)',
            backdropFilter: 'var(--glass-bd-lg)',
            WebkitBackdropFilter: 'var(--glass-bd-lg)',
            boxShadow: 'var(--glass-shadow-pane)',
            opacity: picked.length ? 1 : 0,
            transform: picked.length ? 'translateY(0) scale(1)' : 'translateY(14px) scale(0.96)',
            transition: 'opacity var(--dur-base) var(--ease-glass), transform var(--dur-base) var(--ease-spring)',
          }}
        >
          <span style={{ display: 'grid', gap: 1 }}>
            <span style={{ ...MONO, fontSize: 'var(--text-sm)', color: 'var(--fg-1)' }}>
              {picked.length} selected
            </span>
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
              {minutesLabel(workLeftMinutes(picked))} of work
            </span>
          </span>

          {/* `size="sm"` so it matches the buttons beside it rather than the
              46px form height it defaults to. */}
          <CustomDropdown
            ariaLabel="Move selected tasks to list"
            value={bulkMoveListId}
            onChange={setBulkMoveListId}
            placeholder="Move to list… (any project)"
            size="sm"
            width={260}
            className="w-64"
            options={taskLists.map((l) => {
              const owningProject = projects.find((p) => p.id === l.projectId);
              return {
                value: l.id,
                label: owningProject ? `${owningProject.icon ?? '📋'} ${l.title} · ${owningProject.name}` : l.title,
              };
            })}
          />

          <Button
            size="sm"
            variant="tint"
            tone="accent"
            disabled={!bulkMoveListId}
            onClick={handleBulkMove}
            iconLeft={<Icon name="corner-down-right" size={14} />}
          >
            Move
          </Button>

          <Button
            size="sm"
            variant="tint"
            tone="rose"
            onClick={handleBulkDelete}
            title="Move the selected tasks to the Trash — recoverable for 30 days"
            iconLeft={<Icon name="trash-2" size={14} />}
          >
            Delete
          </Button>

          <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
        </div>
      </div>

      {/* The floating bar, on a narrow window only — the rail above replaces it
          on a wide one. `Z.nav` is the rung the global `FloatingNav` this
          screen now hides from was on. */}
      {/* Stepped aside while the AI panel holds the bottom of the window: the
          bar would sit on its message box, and the panel's own ✕ and handle
          are the way back. */}
      {!wide && !ask && (
        <div
          style={{
            position: 'fixed', left: '50%', bottom: 'calc(var(--sp-7) + var(--safe-b))',
            transform: 'translateX(-50%)', zIndex: Z.nav,
          }}
        >
          <MiniNav items={nav.items} value={nav.current} onChange={nav.go} />
        </div>
      )}

      {/* Task Detail Panel (floating) */}
      <AnimatePresence>
        {selectedTask && (
          <TaskDetailPanel
            task={selectedTask}
            onClose={() => setSelectedTask(null)}
            onSave={(updates) => {
              updateBacklogTask(selectedTask.id, updates);
              setSelectedTask(null);
            }}
            onDelete={() => {
              deleteBacklogTask(selectedTask.id);
              setSelectedTask(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* Edit project modal */}
      <CreateProjectModal
        isOpen={editingProject}
        onClose={() => setEditingProject(false)}
        onSave={(data) => updateProject(project.id, data)}
        project={project}
      />

      {/* Share list modal */}
      <AnimatePresence>
        {shareList_?.shareId && (
          <ShareModal
            publicUrl={shareUrl(shareList_.shareId)}
            entityType="list"
            currentKeyword={shareList_.shortUrlKeyword}
            currentDomain={shareList_.shortUrlDomain}
            onKeywordChange={(keyword, domain) => updateTaskList(shareList_.id, { shortUrlKeyword: keyword, shortUrlDomain: domain })}
            settings={shareList_}
            onSettingsChange={(patch) => void handleListShareSettingsChange(shareList_.id, patch)}
            onClose={() => setShareListId(null)}
          />
        )}
      </AnimatePresence>

      {/* Share project modal */}
      <AnimatePresence>
        {projectShareOpen && project.shareId && (
          <ShareModal
            publicUrl={shareUrl(project.shareId)}
            entityType="project"
            currentKeyword={project.shortUrlKeyword}
            currentDomain={project.shortUrlDomain}
            onKeywordChange={(keyword, domain) => updateProject(project.id, { shortUrlKeyword: keyword, shortUrlDomain: domain })}
            settings={project}
            onSettingsChange={(patch) => void handleProjectShareSettingsChange(patch)}
            onClose={() => setProjectShareOpen(false)}
          />
        )}
      </AnimatePresence>

    </div>
    </V3Scope>
  );
}
