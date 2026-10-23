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
 * now one material. **29-1P6a replaced it** with one Move ▾ menu, when the
 * bar became one pill that splits into Move, Done and Delete
 * (`project/SelectionBar.tsx`, idea 76).
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
 *
 * OPT-6 (his BASE list, 2026-10-06) — THE PAGE'S HEADER IS ONE FROZEN ISLAND.
 * Much of the above is history now; his words were *"Remove the cover Image
 * view… keep the island… make it freeze so it stays when we scroll including
 * the back button the directory"*, and he picked the breadcrumb going INTO the
 * island over freezing the breadcrumb alone. So, on the page only (a pane keeps
 * its slim header and its toolbar exactly as they were):
 *   - no cover strip — Home's card is where the picture is seen — and the glyph
 *     tile sits beside the name instead of hanging off the cover;
 *   - Back, `Projects / … / name`, Select and ⋯ are the island's top row, and
 *     the whole island is `position: sticky`. The page's scroller has no top
 *     padding for that reason (a sticky box sticks inside the padding, and rows
 *     showed through the gap — PaneHeader's lesson); the island's margin is it;
 *   - the ring is glowing "40% done" text in done's lime, the lists stat and
 *     the description are gone ("that is for to be seen on home");
 *   - Select is a round icon on the island, and the toolbar's New task is gone
 *     ("useless and I don't use it") — `n` and each list's own + still add.
 *
 * 29-1P9b (his picks, 2026-10-14) — "40% done" IS A BUTTON. Beside it the day
 * the project lands at the last two weeks' pace, against its Finish by; a
 * press folds the milestones and the chart down inside the island
 * (`project/ProjectForecast.tsx`, built on the first open, open or shut per
 * project on this device). A pane's ring became "40%" in the same lime.
 *
 * BUILD-18 (audit D1, 2026-10-15) — THE FILTER V3 LEFT OUT IS BUILT. A Filter
 * tasks box and All / To do / In progress / Done chips on the toolbar (a
 * pane's line below it), narrowing the board, the table and the Backburner at
 * once; a list with nothing matching steps off while a filter is on. The rule
 * is `lib/boardFilter.ts`. Still no Table view and no "Review" chip.
 */
import { Activity, Fragment, useState, useEffect, useMemo, useRef, useCallback, type ReactNode, type RefObject } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useRememberedState } from '../lib/useRememberedState';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore, projectValueINR, formatINR, isTaskLocked, type Project, type Task, type TaskList } from '../store/useStore';
import { withoutUndo } from '../store/undoGate';
import { useAuth } from '../contexts/AuthContext';
import { builtInShortcut, useShortcuts } from '../contexts/ShortcutsContext';
import { makeShareId, shareList, shareProject, shareUrl, type ShareSettings } from '../lib/publicShare';
import { archiveProject } from '../lib/archive';
import TaskDetailPanel from '../components/TaskDetailPanel';
import ShareModal from '../components/ShareModal';
import OutsourcedWorkPanel from '../components/OutsourcedWorkPanel';
import CreateProjectModal from '../components/CreateProjectModal';
import ProjectGrid from '../components/ProjectGrid';
import OpenBesideDialog from '../components/OpenBesideDialog';
import { OpenProjectContext, useOpenProject } from '../components/project/openProject';
import { BESIDE_PARAM, closePanePath, replacePanePath, resolveSplit } from '../lib/splitView';
import { buildProjectTree, goesWith, subtreeTasks } from '../lib/projectTree';
import { ignoreSentence } from '../lib/ignoredWork';
import { usePriorityScores } from '../store/usePriorityScores';
import { IgnoredMark } from '../components/task-fields/TaskMarks';
import { useIgnoreItems } from '../components/task-fields/ignoreMenu';
import { useWorkedItems } from '../components/task-fields/workedMenu';
import { isOverlayOpen } from '../lib/useOverlayDismiss';
import { SelectionBar } from '../components/project/SelectionBar';
import { cheerTick } from '../lib/tickCheer';
import { dustSelector } from '../lib/dust';
import ProjectIcon from '../components/ProjectIcon';
import BulkAddInput from '../components/BulkAddInput';
import ListColumn from '../components/project/ListColumn';
import ListTable from '../components/project/ListTable';
import { TaskDragGhost } from '../components/project/TaskRow';
import { foldFinishedRepeats, minutesLabel, workLeftMinutes } from '../components/project/derive';
import { SortableBoard, SortableBoardHost, SortableRow, type SortableRowState } from '../components/SortableList';
import { usePullForBackburner } from '../components/project/usePullForBackburner';
import { useJumpBackRecorder } from '../components/project/jumpBack';
import { useJumpBackStore } from '../store/useJumpBackStore';
import { BACKBURNER_TITLE, splitParked } from '../lib/backburner';
import { BlockWires } from '../components/project/BlockWires';
import { DENSITIES, DensityContext, type Density } from '../components/project/density';
import { asGroupBy, type GroupBy } from '../lib/regroup';
import { rememberRows } from '../components/project/regroupGlide';
import { mergeVisibleOrder } from '../lib/boardDrop';
import { boardFilter, isFiltering, noMatchSentence, passesBoardFilter, showsFinished, STATUS_CHIPS, type StatusChip } from '../lib/boardFilter';
import { ForecastButton, ForecastPanel } from '../components/project/ProjectForecast';
import { useForecast } from '../components/project/useForecast';
import { parseBulkLines } from '../lib/bulkAdd';
import { useNavModel } from '../components/navModel';
import { BrandMark, RailMark } from '../components/BrandMark';
import { Z } from '../lib/zLayers';
import { cue } from '../lib/sound';
import AIPanelHost from '../components/AIPanelHost';
import QuickCaptureFab from '../components/QuickCaptureFab';
import { AIPanelDock, AI_SUBJECT_RIM } from '../ui/overlay/AIPanel';
import { AskAtlasBar } from '../ui/overlay/AskAtlasBar';
import type { PanelSubjectRef } from '../lib/aiPanel';
import { devPanelFixture } from '../lib/devPanelFixture';
import {
  BlurAcross, Button, EmptyDrawing, GelButton, Icon, Input, Lit, LitLine, MetaKicker, MiniNav, MorphMenu, SegmentedControl, SoftButton,
  SoftIconButton, SoftToggle, Switch, useMedia, useMotion, V3Scope, WhiteButton, WIDE, type IconName,
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

/** 29-1P9a (idea 158): the list view's three groupings, as the Group menu lists them. */
const GROUP_CHOICES: readonly (readonly [GroupBy, string, IconName])[] = [
  ['list', 'By list', 'list'],
  ['due', 'By due date', 'calendar'],
  ['score', 'By Score', 'flame'],
];
/** What the Group button says it is showing ("Group: Due date"). */
const GROUP_SHORT: Record<GroupBy, string> = { list: 'List', due: 'Due date', score: 'Score' };
const GROUP_NAME: Record<GroupBy, string> = { list: 'list', due: 'due date', score: 'Score' };

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
        {/* The form's confirm: solid white since 29-1P2. */}
        <WhiteButton
          size="sm"
          disabled={!value.trim()}
          onClick={() => onSubmitLines(parseBulkLines(value))}
          icon={<Icon name="plus" size={14} />}
        >
          {commit}
        </WhiteButton>
      </div>
    </div>
  );
}

/** One reading in the island's stats strip: a number and what it counts. */
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

// ─── ProjectBoard — one project's board, as the page or as one of two ─────────

interface ProjectBoardProps {
  projectId: string;
  /**
   * `page` is the board as it has always been: one frozen island holding the
   * breadcrumb and the masthead (OPT-6), and a selection bar fixed to the window. `pane` is one of
   * two boards side by side (BIG-5): a slim one-line header in their place —
   * his call — and a selection bar held inside the pane.
   */
  layout: 'page' | 'pane';
  /** The AI panel's subject, when it is about something on this board. */
  ask: PanelSubjectRef | null;
  onToggleAsk: (projectId: string, ref: PanelSubjectRef) => void;
  /** Whether `n` and `l` add to this board — only one of two can own them. */
  shortcutsActive: boolean;
  /** Pane only: the ✕ that closes this board and leaves the other. */
  onClose?: () => void;
  /** Pane only: where the ⋯ menu's archive and delete leave to. */
  onGone?: () => void;
  /** The left-hand pane only, on a wide window: the button that hides the side nav. */
  navToggle?: NavToggle;
}

function ProjectBoard({ projectId, layout, ask, onToggleAsk, shortcutsActive, onClose, onGone, navToggle }: ProjectBoardProps) {
  const navigate = useNavigate();
  const wide = useMedia(WIDE);
  /* Where the capture + rises over the nav (`QuickCaptureFab`), so the Ask
     Atlas bar stops short of it. */
  const underTheBar = useMedia('(max-width: 559px)');
  const pane = layout === 'pane';

  const { user } = useAuth();
  const {
    projects, addProject, updateProject, deleteProject,
    taskLists, backlogTasks,
    addTaskList, renameTaskList, deleteTaskList, reorderTaskLists, updateTaskList,
    addBacklogTask,
    updateBacklogTask, deleteBacklogTask,
    reorderBacklogTasks, moveTaskToList,
  } = useStore();

  const project = projects.find((p) => p.id === projectId);

  /* BIG-2 — where this project sits and what it holds. The path back runs
     through its parents, and the way out of it is up one level, not Home. */
  const tree = useMemo(() => buildProjectTree(projects), [projects]);
  const ancestors = useMemo(() => tree.ancestorsOf(projectId), [tree, projectId]);
  const parent = ancestors.length > 0 ? ancestors[ancestors.length - 1] : undefined;
  const insideCount = tree.childrenOf(projectId).length;
  const subtreeCount = tree.subtreeIds(projectId).length - 1;
  const goUp = () => navigate(parent ? `/project/${parent.id}` : '/');
  /* After archiving or deleting it: up one level as the page, or this board
     closes and the other stays as a pane. */
  const leave = onGone ?? goUp;
  /* BIG-3 — ignored by its own switch, or by a mega project it sits in. The
     masthead says which; the menu offers the switch only when it is this one. */
  const ignoreReason = usePriorityScores().ignored.projectReason(projectId);
  const ignoreItems = useIgnoreItems({ kind: 'project', id: projectId }, project?.name ?? '');
  const workedItems = useWorkedItems({ kind: 'project', id: projectId });
  const [creatingInside, setCreatingInside] = useState(false);
  const [editingInsideId, setEditingInsideId] = useState<string | null>(null);
  const [openingBeside, setOpeningBeside] = useState(false);
  const editingInside = projects.find((p) => p.id === editingInsideId);
  const projectLists = useMemo(
    () => taskLists.filter((l) => l.projectId === projectId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [taskLists, projectId]
  );
  /*
   * 29-1P6c, idea 91 — THE PROJECT'S OWN BACKBURNER (his call, 2026-10-12).
   * A list of this project named "Backburner" (`lib/backburner.ts`) is not on
   * the board: it waits behind a pull from the top (a finger), or "Show
   * Backburner" in the project's menu (a mouse), and then sits above the
   * board as a board of its own in the same drag host, so a task drags in
   * and out of it. Asking for it when there is none makes one, empty. Every
   * count and roll-up still reads `projectLists`: a parked task is still
   * this project's. Opens closed on every visit, as Telegram's archive does.
   */
  const { board: boardLists, parked: parkedLists } = useMemo(() => splitParked(projectLists), [projectLists]);
  const [parkedOpen, setParkedOpen] = useState(false);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const toggleParked = useCallback(() => {
    if (!parkedOpen && parkedLists.length === 0) addTaskList(BACKBURNER_TITLE, projectId);
    setParkedOpen(!parkedOpen);
  }, [parkedOpen, parkedLists.length, addTaskList, projectId]);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const { pill: pullPill } = usePullForBackburner(scrollerRef, pageRef, {
    enabled: true, open: parkedOpen, onPulled: toggleParked,
  });
  /* 29-1P8c, idea 154: where he is here, for Home's Jump back in — and the
     landing when he comes back by it. */
  useJumpBackRecorder(projectId, scrollerRef);
  const motionTokens = useMotion();

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
  /* A task opened is where he is (Jump back in). */
  const openedId = selectedTask?.id;
  const openedList = selectedTask?.listId;
  useEffect(() => {
    if (openedId) useJumpBackStore.getState().taskTouched(projectId, { id: openedId, listId: openedList });
  }, [openedId, openedList, projectId]);
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
    `base.project.view.${projectId}`, 'board',
  );
  const [showDone, setShowDone] = useRememberedState(
    `base.project.showDone.${projectId}`, false,
  );
  /* BUILD-18 (audit D1): the Filter tasks box and the status chips. Never
     remembered (`lib/boardFilter.ts` says why), and dropped when a pane is
     handed another project rather than carried into it. */
  const [filterState, setFilterState] = useState<{ projectId: string; text: string; status: StatusChip }>(
    { projectId, text: '', status: 'all' },
  );
  const filterText = filterState.projectId === projectId ? filterState.text : '';
  const filterStatus = filterState.projectId === projectId ? filterState.status : 'all';
  const setFilterText = (text: string) => setFilterState({ projectId, text, status: filterStatus });
  const setFilterStatus = (status: StatusChip) => setFilterState({ projectId, text: filterText, status });
  const clearFilter = () => setFilterState({ projectId, text: '', status: 'all' });
  const filter = useMemo(() => boardFilter(filterText, filterStatus), [filterText, filterStatus]);
  const filtering = isFiltering(filter);
  /* 29-1P7c (idea 159): how much each card shows, per project like the
     view, on this device only. */
  const [density, setDensity] = useRememberedState<Density>(
    `base.project.density.${projectId}`, 'comfortable',
  );
  /* 29-1P9a (idea 158): the list view By list, By due date or By Score, and
     (157) the lists folded into spines on the board — per project, on this
     device, like the two above (his call, 2026-10-14). */
  const [groupByRaw, setGroupBy] = useRememberedState<GroupBy>(
    `base.project.groupBy.${projectId}`, 'list',
  );
  const groupBy = asGroupBy(groupByRaw);
  const [foldedIds, setFoldedIds] = useRememberedState<string[]>(
    `base.project.folded.${projectId}`, [],
  );
  /* 29-1P9b (his pick C): the milestones and the chart folded down behind
     "40% done", open or shut per project on this device. Built on the first
     open and kept (`forecastBuiltFor`), never at page load. */
  const [forecastOpen, setForecastOpen] = useRememberedState(
    `base.project.forecastOpen.${projectId}`, false,
  );
  const [forecastBuiltFor, setForecastBuiltFor] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const regroup = (next: GroupBy) => {
    if (next === groupBy) return;
    rememberRows(tableRef.current);
    setGroupBy(next);
  };
  const toggleFold = (listId: string) => setFoldedIds((ids) => (
    Array.isArray(ids) && ids.includes(listId) ? ids.filter((id) => id !== listId) : [...(Array.isArray(ids) ? ids : []), listId]
  ));
  const [addingList, setAddingList] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [quickTaskActive, setQuickTaskActive] = useState(false);
  const quickTaskRef = useRef<HTMLTextAreaElement>(null);
  const newListRef = useRef<HTMLTextAreaElement>(null);

  /*
   * BUILD-4 — WHAT THE AI PANEL IS ABOUT, IF IT IS OPEN. The page holds it
   * (BIG-5: with two boards, it decides which pane the panel takes), and hands
   * each board the subject only when it is one of that board's own.
   */
  const toggleAsk = useCallback(
    (ref: PanelSubjectRef) => onToggleAsk(projectId, ref),
    [onToggleAsk, projectId],
  );
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
  const projectListIds = useMemo(() => boardLists.map((l) => l.id), [boardLists]);
  /* 29-1P9a (157): only lists still on this board count; a list deleted or
     moved away leaves its id behind in the remembered value, harmlessly. */
  const folded = useMemo(
    () => new Set((Array.isArray(foldedIds) ? foldedIds : []).filter((id) => projectListIds.includes(id))),
    [foldedIds, projectListIds],
  );
  const anyFolded = folded.size > 0;
  const parkedListIds = useMemo(() => parkedLists.map((l) => l.id), [parkedLists]);
  /* `reorderTaskLists` keeps only the lists it is handed, like
     `reorderBacklogTasks` keeps only the rows (see the note at the top). The
     board hands it the lists it drew — never the project's own Backburner, and
     while filtering (BUILD-18) not the lists with nothing matching — so the
     order on screen is merged back into all of the project's lists first.
     Before BUILD-18 a list dragged on a project with a Backburner dropped that
     list out of the store. */
  const allListIds = useMemo(() => projectLists.map((l) => l.id), [projectLists]);
  const reorderLists = useCallback((orderedIds: string[]) => {
    reorderTaskLists(projectId, mergeVisibleOrder(allListIds, orderedIds));
  }, [projectId, allListIds, reorderTaskLists]);

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
    const titles = new Map(projectLists.map((l) => [l.id, l.title]));
    for (const [listId, everyRow] of Object.entries(tasksByListAll)) {
      /* BUILD-18: the filter and the chips hide rows exactly as Show done
         does — `mergeVisibleOrder` keeps the hidden ones' places on a drag. */
      const title = titles.get(listId) ?? '';
      const listTasks = everyRow.filter((t) => passesBoardFilter(t, title, filter, showDone));
      if (!showsFinished(filter, showDone)) { byList[listId] = listTasks; continue; }
      /* 29-1P4b, idea 55 "Lists make room" (his call, 2026-10-07): finished
         rows sink below the open ones, in their own order, so a tick glides
         its card to the bottom and the rest slide up — the card's `layout`
         spring does the gliding. Only the DRAWING moves: the stored `order`
         is untouched, so an untick glides it back to where it was. (A drag in
         this column writes the visible order through `mergeVisibleOrder`,
         which then keeps finished rows at the bottom — the order he saw.) */
      const folded = foldFinishedRepeats(listTasks).sort(
        (a, b) => Number(a.task.status === 'completed') - Number(b.task.status === 'completed'),
      );
      byList[listId] = folded.map((r) => r.task);
      for (const r of folded) if (r.count > 1) counts[r.task.id] = r.count;
    }
    return { tasksByList: byList, repeatCounts: counts };
  }, [tasksByListAll, projectLists, filter, showDone]);

  /* BUILD-18: while a filter is on, a list with nothing matching steps off the
     board, so "only those tasks remain". Without one, every list is drawn as
     before, empty or not. */
  const { shownBoardLists, shownParkedLists } = useMemo(() => {
    const keep = (lists: TaskList[]) => (filtering ? lists.filter((l) => (tasksByList[l.id]?.length ?? 0) > 0) : lists);
    return { shownBoardLists: keep(boardLists), shownParkedLists: keep(parkedLists) };
  }, [filtering, tasksByList, boardLists, parkedLists]);
  const shownListIds = useMemo(() => shownBoardLists.map((l) => l.id), [shownBoardLists]);
  const shownParkedIds = useMemo(() => shownParkedLists.map((l) => l.id), [shownParkedLists]);
  /** How many tasks the box left, each once (a task shared into two lists is one). */
  const matchCount = useMemo(() => {
    const ids = new Set<string>();
    for (const list of [...shownBoardLists, ...(parkedOpen ? shownParkedLists : [])]) {
      for (const t of tasksByList[list.id] ?? []) ids.add(t.id);
    }
    return ids.size;
  }, [shownBoardLists, shownParkedLists, parkedOpen, tasksByList]);

  const taskIdsByList = useMemo(() => {
    const byList: Record<string, string[]> = {};
    for (const [listId, listTasks] of Object.entries(tasksByList)) {
      byList[listId] = listTasks.map((t) => t.id);
    }
    return byList;
  }, [tasksByList]);
  /* Each of the two boards (the Backburner's and the main one) hands the
     drag host only its own lists' rows. */
  const { boardItems, parkedItems } = useMemo(() => {
    const parkedSet = new Set(parkedListIds);
    const boardItems: Record<string, string[]> = {};
    const parkedItems: Record<string, string[]> = {};
    for (const [listId, ids] of Object.entries(taskIdsByList)) (parkedSet.has(listId) ? parkedItems : boardItems)[listId] = ids;
    return { boardItems, parkedItems };
  }, [taskIdsByList, parkedListIds]);
  const keepParkedOrder = useCallback(() => {}, []);

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
    /* 29-1P3, 118: ticking a list's last open task lands the run of ticks on a
       chord. The tick itself sounded in `Tick`. */
    if (!done && backlogTasks.every((t) => t.id === task.id || t.listId !== task.listId || t.status === 'completed')) {
      cue('cleared');
    }
    /* A task ticked is where he is (Jump back in); un-ticking is not. */
    if (!done) useJumpBackStore.getState().taskTouched(projectId, { id: task.id, listId: task.listId });
    updateBacklogTask(task.id, done
      ? { status: 'needsAction', completedAt: undefined }
      : { status: 'completed', completedAt: Date.now() });
  }, [backlogTasks, updateBacklogTask, projectId]);

  const handleBulkMove = (listId: string) => {
    const targetList = taskLists.find((l) => l.id === listId);
    selectedIds.forEach((id) => {
      updateBacklogTask(id, {
        listId,
        listName: targetList?.title ?? '',
      });
    });
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  /* 29-1P6a, his call: the bar's Done ticks every picked task, each through
     the one status path a row's own tick uses, so repeats still spawn. A
     locked task is left as it is, as its own tick would leave it; each one
     ticked floats its +1 from its own box, as a pressed box does. */
  const handleBulkDone = () => {
    const now = Date.now();
    const ticking = backlogTasks.filter((t) => selectedIds.has(t.id) && t.status !== 'completed' && !isTaskLocked(backlogTasks, t));
    if (ticking.length > 0) cue('done');
    for (const t of ticking) {
      const row = document.querySelector(dustSelector('task', t.id));
      cheerTick(row?.querySelector('.ag-check__box') ?? row ?? null);
      updateBacklogTask(t.id, { status: 'completed', completedAt: now });
    }
    setSelectedIds(new Set());
    setSelectMode(false);
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
    lines.forEach((title) => addTaskList(title, projectId));
    setNewListTitle('');
    setAddingList(false);
  };

  /** Bulk-capable: one title per line creates one task each, in order. */
  const handleQuickAddTaskLines = (lines: string[]) => {
    if (lines.length === 0) { setQuickTaskActive(false); setQuickTaskTitle(''); return; }

    let targetListId: string;
    if (boardLists.length > 0) {
      targetListId = boardLists[0].id;
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

  useShortcuts('project-view', shortcutsActive ? [
    { ...builtInShortcut('new-task'), handler: openQuickAdd },
    { ...builtInShortcut('new-list'), handler: openAddList },
  ] : []);

  // The tasks on this board, cross-links included — what Select picks from.
  const projectTasks = useMemo(() => {
    const listIdSet = new Set(projectLists.map((l) => l.id));
    return backlogTasks.filter(
      (t) => !t.parent && (listIdSet.has(t.listId ?? '') || (t.sharedListIds ?? []).some((id) => listIdSet.has(id)))
    );
  }, [projectLists, backlogTasks]);
  // What the masthead's stats strip reads out: the whole tree's, derived
  // exactly the way `ProjectCard` derives it on Home (BIG-2), so the two agree
  // about how big a project is. For a project with nothing inside it this is
  // `projectTasks` again.
  const treeTasks = useMemo(
    () => subtreeTasks(tree, taskLists, backlogTasks, projectId),
    [tree, taskLists, backlogTasks, projectId],
  );
  const completedCount = treeTasks.filter((t) => t.status === 'completed').length;
  const progress = treeTasks.length > 0 ? Math.round((completedCount / treeTasks.length) * 100) : 0;
  const projectINR = tree.subtreeIds(projectId).reduce((sum, id) => sum + projectValueINR(taskLists, backlogTasks, id), 0);
  const minutesLeft = workLeftMinutes(treeTasks);
  const forecast = useForecast(project?.finishBy, treeTasks);

  const picked = useMemo(
    () => projectTasks.filter((t) => selectedIds.has(t.id)),
    [projectTasks, selectedIds]
  );

  if (!project) return null;

  /* The project's own menu, which this screen never had — sharing
     and deleting a project could only be reached from Home's card.
     Delete arms in place, as everywhere else in the app. */
  const projectMenu = (
    <MorphMenu
      align="end"
      width={256}
      portal
      zIndex={Z.dropdown}
      trigger={
        <SoftIconButton label={`Actions for ${project.name}`}>
          <Icon name="ellipsis" size={18} />
        </SoftIconButton>
      }
      header={{
        title: project.name,
        meta: [
          ...(subtreeCount > 0 ? [`${subtreeCount} project${subtreeCount === 1 ? '' : 's'}`] : []),
          `${projectLists.length} list${projectLists.length === 1 ? '' : 's'}`,
          `${treeTasks.length} task${treeTasks.length === 1 ? '' : 's'}`,
          projectINR > 0 ? formatINR(projectINR) : 'no value',
        ].join('  ·  '),
      }}
      items={[
        /* BIG-5 — the masthead's Ask button, which a pane has no room for. */
        ...(pane ? [{
          value: 'ask',
          label: askingProject ? 'Close the AI panel' : 'Ask AI about this project',
          icon: <Icon name="sparkles" size={18} />,
          onSelect: () => toggleAsk({ kind: 'project', id: project.id }),
        }] : []),
        {
          value: 'share',
          label: 'Share project',
          icon: <Icon name="share-2" size={18} />,
          meta: project.shortUrlKeyword ? <Icon name="link" size={14} /> : undefined,
          onSelect: () => { void handleShareProject(); },
        },
        /* 29-1P6c, idea 91: the pull-down's laptop door. */
        {
          value: 'backburner',
          label: parkedOpen ? 'Hide Backburner' : 'Show Backburner',
          icon: <Icon name={parkedOpen ? 'chevron-up' : 'archive-restore'} size={18} />,
          onSelect: toggleParked,
        },
        /* 29-1P7c (idea 159): a pane's densities, which its toolbar has no
           room for (the page's are the switch beside Board / List). */
        ...(pane ? [
          { section: 'Cards show' },
          ...([
            ['comfortable', 'Everything', 'rows-2'],
            ['compact', 'One line', 'align-justify'],
            ['minimal', 'Titles only', 'equal'],
          ] as const).map(([value, label, icon]) => ({
            value: `density-${value}`,
            label,
            icon: <Icon name={icon} size={18} />,
            meta: density === value ? <Icon name="check" size={14} /> : undefined,
            onSelect: () => setDensity(value),
          })),
          /* 29-1P9a (158): the same reason, the list view's grouping. */
          ...(view === 'list' ? [
            { section: 'Group' },
            ...GROUP_CHOICES.map(([value, label, icon]) => ({
              value: `group-${value}`,
              label,
              icon: <Icon name={icon} size={18} />,
              meta: groupBy === value ? <Icon name="check" size={14} /> : undefined,
              onSelect: () => regroup(value),
            })),
          ] : []),
          { divider: true as const },
        ] : []),
        /* No Edit project, New project inside or Move into… here (his BASE
           list, 2026-10-06). Home's card menu still edits; nesting is a drag
           on Home, and a mega project's row of cards keeps its dashed tile. */
        /* BIG-5 — another board beside this one. A pane is already one
           of two; closing its partner is how to pick another. */
        ...(pane ? [] : [{
          value: 'beside',
          label: 'Open beside…',
          icon: <Icon name="panel-right-open" size={18} />,
          onSelect: () => setOpeningBeside(true),
        }]),
        ...ignoreItems,
        ...workedItems,
        { divider: true },
        /* BUILD-11 — the card menu's pair, as `Archive.dc.html` asks. */
        {
          value: 'archive',
          label: 'Archive project',
          icon: <Icon name="archive" size={18} />,
          confirm: {
            label: `Archive ${project.name}?`,
            hint: treeTasks.length === 0 && subtreeCount === 0
              ? 'It leaves every board, count, queue, search and Atlas. Nothing ever purges it.'
              : `It leaves every board, count, queue, search and Atlas. ${goesWith(subtreeCount, treeTasks.length)} go with it. Nothing ever purges it.`,
            action: 'Archive',
            onConfirm: () => { if (archiveProject(project.id)) leave(); },
          },
        },
        {
          value: 'delete',
          label: 'Delete project',
          icon: <Icon name="trash-2" size={18} />,
          tone: 'danger',
          confirm: {
            label: `Delete ${project.name}?`,
            hint: subtreeCount > 0
              ? `${goesWith(subtreeCount, treeTasks.length)} go with it. Recoverable from Trash for 30 days.`
              : projectLists.length === 0
                ? 'Nothing in it yet.'
                : `${projectLists.length} list${projectLists.length === 1 ? '' : 's'} and ${projectTasks.length} task${projectTasks.length === 1 ? '' : 's'} go with it. Recoverable from Trash for 30 days.`,
            onConfirm: () => { deleteProject(project.id); leave(); },
            /* A whole project and its tree: held, never tapped (29-1P2, his queue). */
            hold: true,
          },
        },
      ]}
    />
  );

  /* BUILD-18 (audit D1) — the Filter tasks box and the status chips. The
     design's Table view is not here (the list view is one) and nor is its
     "Review", which is not a status BASE has. Escape in the box empties it. */
  const filterBar = (
    <>
      <div style={{ flex: '1 1 200px', minWidth: 180, maxWidth: 300 }}>
        <Input
          size="sm"
          block
          type="search"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && filterText !== '') { e.stopPropagation(); setFilterText(''); }
          }}
          placeholder="Filter tasks"
          aria-label={`Filter ${project.name}'s tasks`}
          iconLeft={<Icon name="search" size={16} />}
          suffix={filterText.trim() ? <MetaKicker tone="var(--fg-4)">{matchCount} match</MetaKicker> : undefined}
        />
      </div>
      <SegmentedControl
        size="sm"
        look="soft"
        aria-label="Show tasks by status"
        value={filterStatus}
        onChange={(v) => { const chip = STATUS_CHIPS.find(([value]) => value === v); if (chip) setFilterStatus(chip[0]); }}
        options={STATUS_CHIPS.map(([value, label]) => ({ value, label }))}
      />
    </>
  );

  /** One list's card on a board — the main one, or the Backburner's (`onTuck`), folded or open (157). */
  const column = (list: TaskList, { isAnyDragging, isReceivingItem, handleProps }: SortableRowState, onTuck?: () => void, isFolded = false) => (
    <ListColumn
      listId={list.id}
      listTitle={list.title}
      taskLists={taskLists}
      tasks={tasksByList[list.id] ?? []}
      repeatCounts={repeatCounts}
      selectedIds={selectedIds}
      selectMode={selectMode}
      onSelectTask={handleSelectTask}
      onOpenTask={setSelectedTask}
      onDeleteTask={handleDeleteTask}
      onToggleTaskDone={handleToggleTaskDone}
      onAddTask={(lid, titles, beforeTaskId) => titles.forEach((title) => {
        const id = addBacklogTask(title, lid);
        /* 29-1c1: dropped there by the floating +, so it lands there — in the
           note's order, each in front of the same row. Placing a task he just
           made is part of making it, not a move to undo. */
        if (beforeTaskId) withoutUndo(() => moveTaskToList(id, lid, beforeTaskId));
      })}
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
      onTuck={onTuck}
      folded={isFolded}
      onToggleFold={onTuck ? undefined : toggleFold}
    />
  );

  return (
    <DensityContext.Provider value={density}>
      <div
        ref={scrollerRef}
        /* Two boards side by side hide their scrollbars (his ask, 2026-09-30):
           two tracks down the middle of the screen read as a third column. */
        className={pane ? 'ag-scroll' : undefined}
        style={{
          minWidth: 0,
          minHeight: 0,
          overflowY: 'auto',
          boxSizing: 'border-box',
          /* 112px on a narrow window is the floating nav bar's lane; the extra
             on both is the selection bar's. The nav steps aside while the AI
             panel is docked at the bottom, so the lane goes with it. */
          padding: pane
            /* No top padding on a pane: a sticky header sticks inside the
               padding, and the rows scrolling under it showed through the gap
               above it. The header carries that space as a margin instead. */
            ? `0 var(--sp-6) ${wide ? 'var(--sp-13)' : '112px'}`
            /* Nor on the page since OPT-6, for the same reason: its island is
               sticky too, and carries the top space as a margin. */
            /* 29-1P15c: the page's last row also clears the Ask Atlas bar —
               bottom-right on the laptop (24px up, 48px tall), and on a
               narrow window in the lane over the nav, 48px more. */
            : wide
              ? '0 var(--gutter-page) calc(var(--sp-7) + 48px + var(--sp-7))'
              : `0 var(--gutter-page-sm) ${ask ? 'var(--sp-8)' : 'calc(112px + 48px + var(--sp-5))'}`,
          /* What the frozen island covers (140px on a tablet, measured), so a
             card scrolled into view — the AI panel's subject, a row reached by
             Tab — stops below it rather than under it. */
          scrollPaddingTop: pane ? undefined : 156,
        }}
      >
        {pullPill}
        <div ref={pageRef} style={{ width: '100%', maxWidth: 1320, margin: '0 auto' }}>
          {pane ? (
            <PaneHeader
              project={project}
              progress={progress}
              parent={parent}
              asking={askingProject}
              ignoreNote={ignoreReason ? ignoreSentence(ignoreReason, { kind: 'project', id: project.id }) : null}
              menu={projectMenu}
              onClose={onClose}
              navToggle={navToggle}
            />
          ) : (
          /* ── The island (OPT-6) ──────────────────────────────────────── */
          /* The breadcrumb and the masthead in one pane, frozen at the top of
             the page's scroller — see OPT-6 at the top of this file. */
          <header
            data-ai-subject={askingProject ? 'true' : undefined}
            style={{
              position: 'sticky', top: 0, zIndex: 5,
              display: 'grid', gap: 'var(--sp-5)', minWidth: 0,
              margin: `${wide ? 'var(--sp-9)' : 'var(--sp-8)'} 0 var(--gap-section)`,
              padding: 'var(--sp-5) var(--sp-7) var(--sp-6) var(--sp-5)',
              borderRadius: 'var(--r-lg)',
              backgroundImage: 'var(--glass-fill-2)',
              backdropFilter: 'var(--glass-bd-lg-refract)',
              WebkitBackdropFilter: 'var(--glass-bd-lg)',
              boxShadow: askingProject
                ? `${AI_SUBJECT_RIM}, var(--glass-inner-1)`
                : 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-2)',
              animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
            }}
          >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', minWidth: 0 }}>
            {/* The way out of a project, in the header rather than floating
                over the page in the old design system. Home is where projects
                live, and it is the rail's lit entry for the same reason. A
                round glass button since V3-3 — the design's phone header
                draws its Back exactly so, and Home's header buttons are the
                same object. A round soft button since 29-1P2, as Home's. */}
            <SoftIconButton label={parent ? `Back to ${parent.name}` : 'Back to projects'} onClick={goUp} style={{ flex: '0 0 auto' }}>
              <Icon name="arrow-left" size={18} />
            </SoftIconButton>
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
            {/* BIG-2 — every project above this one, each a way back to it. */}
            {ancestors.map((a) => (
              <Fragment key={a.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/project/${a.id}`)}
                  style={{
                    border: 0, background: 'transparent', padding: 0, cursor: 'pointer',
                    font: 'var(--type-label)', color: 'var(--fg-3)',
                    minWidth: 0, maxWidth: '16ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {a.name}
                </button>
                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>/</span>
              </Fragment>
            ))}
            <span
              style={{
                font: 'var(--type-label)', color: 'var(--fg-1)',
                minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
            >
              {project.name}
            </span>

            <span style={{ flex: 1 }} />

            {/* His ask: Select as an icon, up here on the island, rather than
                a labelled button over the board. Pressed in while selecting. */}
            <SoftToggle
              round
              aria-label="Select"
              title={selectMode ? 'Stop selecting' : 'Select tasks'}
              pressed={selectMode}
              onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
              style={{ flex: '0 0 auto' }}
            >
              <Icon name={selectMode ? 'check-check' : 'list-checks'} size={18} />
            </SoftToggle>
            {projectMenu}
          </div>

          {/* The name, and the facts beside it. They wrap under the name when
              there is not room beside it. */}
          <div
            style={{
              display: 'flex', flexWrap: 'wrap', alignItems: 'center',
              columnGap: 'var(--sp-8)', rowGap: 'var(--sp-5)', minWidth: 0,
              paddingLeft: 'var(--sp-2)',
            }}
          >
            <div style={{ flex: '1 1 200px', display: 'grid', gap: 'var(--sp-3)', minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', minWidth: 0 }}>
                {/* The project's own icon, as on its card: white on frosted
                    glass, the cover's colour behind (29-1P8a2, idea 150). It
                    hung off the cover's bottom edge until OPT-6 took the
                    cover away. */}
                <ProjectIcon project={project} size={44} />
                {/* May shorten on an upright tablet: the path above it always
                    carries the whole name. */}
                <h1
                  title={project.name}
                  style={{
                    minWidth: 0,
                    font: 'var(--type-metric)', letterSpacing: 'var(--tracking-display)',
                    color: 'var(--fg-1)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {project.name}
                </h1>
                {/* The ✦ that sat here (BUILD-4) is the Ask Atlas bar at the
                    foot of the board since 29-1P15c, his call. The island's
                    rim still says when the panel is about the project. */}
              </div>
              {ignoreReason && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap', minWidth: 0 }}>
                  <IgnoredMark title="Nothing on this board is scored, offered by Smart Start or Needs Attention, or has its deadline pushed." />
                  <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-4)' }}>
                    {ignoreSentence(ignoreReason, { kind: 'project', id: project.id })}
                  </span>
                </span>
              )}
            </div>

            <div
              style={{
                /* May be narrower than its readings, so on a phone they wrap
                   inside it rather than run off the island's edge. */
                flex: '0 1 auto', minWidth: 0, display: 'flex', alignItems: 'center',
                gap: 'var(--sp-6)', flexWrap: 'wrap',
              }}
            >
              {/* The ring, as words (his ask): "simply saying glowing text".
                  Lime, done's colour job. Since 29-1P9b a button, his pick C:
                  the day it lands beside it, the milestones and the chart
                  folded down behind it. */}
              <ForecastButton
                progress={progress}
                model={forecast}
                open={forecastOpen}
                onToggle={() => { setForecastBuiltFor(projectId); setForecastOpen((v) => !v); }}
              />
              <StatRule />
              <Stat value={`${completedCount} of ${treeTasks.length}`} label="tasks done" />
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
          {(forecastOpen || forecastBuiltFor === projectId) && (
            <ForecastPanel
              finishBy={project.finishBy}
              onFinishBy={(finishBy) => updateProject(project.id, { finishBy })}
              model={forecast}
              open={forecastOpen}
              onOpenTask={setSelectedTask}
            />
          )}
          </header>
          )}

          <div style={{ display: 'grid', gap: 'var(--gap-section)' }}>
            {/* ── Projects inside (BIG-2) ─────────────────────────────── */}
            {/* Home's grid, one level down: the same cards, the same drag —
                reorder, or drop one onto another to nest it deeper. */}
            {insideCount > 0 && (
              <section style={{ display: 'grid', gap: 'var(--sp-6)' }}>
                <h2 style={{ font: 'var(--type-title)', fontSize: 'var(--text-lg)', color: 'var(--fg-1)' }}>
                  Projects inside
                </h2>
                <ProjectGrid
                  parentId={project.id}
                  onEdit={setEditingInsideId}
                  onNewProject={() => setCreatingInside(true)}
                />
              </section>
            )}

            <section style={{ display: 'grid', gap: 'var(--sp-7)' }}>
              {/* ── Toolbar ────────────────────────────────────────────── */}
              {/* How the tasks are shaped, not what they are. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
                <SegmentedControl
                  size="sm"
                  look="soft"
                  value={view}
                  onChange={(v) => setView(v as 'board' | 'list')}
                  options={[
                    { value: 'board', label: 'Board', icon: <Icon name="columns-3" size={16} /> },
                    { value: 'list', label: 'List', icon: <Icon name="list" size={16} /> },
                  ]}
                />
                {/* 29-1P7c (idea 159): how much each card shows. Icons, with
                    their names as tooltips, so the toolbar stays one line. Not
                    in a pane: its toolbar has ~40px to spare, and the switch
                    pushed New task onto a line of its own (measured, the split
                    shot) — a pane's ⋯ carries the three instead. */}
                {!pane && (
                <SegmentedControl
                  size="sm"
                  look="soft"
                  aria-label="Card density"
                  value={density}
                  onChange={(v) => { if ((DENSITIES as readonly string[]).includes(v)) setDensity(v as Density); }}
                  options={[
                    { value: 'comfortable', label: null, ariaLabel: 'Comfortable: everything on each card', icon: <Icon name="rows-2" size={16} /> },
                    { value: 'compact', label: null, ariaLabel: 'Compact: one line with badges', icon: <Icon name="align-justify" size={16} /> },
                    { value: 'minimal', label: null, ariaLabel: 'Minimal: titles only', icon: <Icon name="equal" size={16} /> },
                  ]}
                />
                )}
                {/* 29-1P9a (idea 158): one soft "Group: List" button with a
                    small menu, his pick (E) — it says what the table is
                    showing, and the toolbar stays short. The list view only;
                    a pane's is in its ⋯, like the densities. */}
                {!pane && view === 'list' && boardLists.length > 0 && (
                  <MorphMenu
                    align="start"
                    width={220}
                    open={groupMenuOpen}
                    onOpenChange={setGroupMenuOpen}
                    portal
                    zIndex={Z.dropdown}
                    trigger={
                      <SoftButton
                        size="sm"
                        aria-label={`Group tasks: by ${GROUP_NAME[groupBy]}`}
                        icon={<Icon name={GROUP_CHOICES.find(([v]) => v === groupBy)?.[2] ?? 'list'} size={15} />}
                      >
                        <span style={{ color: 'var(--fg-3)' }}>Group:</span>
                        {GROUP_SHORT[groupBy]}
                        <Icon name="chevron-down" size={14} style={{ color: 'var(--fg-3)' }} />
                      </SoftButton>
                    }
                    items={GROUP_CHOICES.map(([value, label, icon]) => ({
                      value,
                      label,
                      icon: <Icon name={icon} size={18} />,
                      meta: groupBy === value ? <Icon name="check" size={14} /> : undefined,
                      onSelect: () => regroup(value),
                    }))}
                  />
                )}
                {/* Greyed while a chip is on (BUILD-18): a chip asks for one
                    status outright, so the switch has nothing to decide. */}
                <Switch checked={showDone} onChange={setShowDone} size="sm" label="Show done" disabled={filterStatus !== 'all'} />
                {/* BUILD-18 (audit D1): on the page's toolbar line, wrapping
                    when the window is narrow; a pane's toolbar has no room, so
                    there it is the next line. */}
                {!pane && filterBar}

                {/* A pane only since OPT-6: the page's Select is a round icon
                    on its island, and its New task is gone (his BASE list). A
                    pane is unchanged. */}
                {pane && (<>
                <span style={{ flex: 1 }} />

                {/* Soft raised, pressed in while selecting (29-1P2): an
                    everyday second action. Never emerald: nothing about
                    picking rows is live. */}
                <SoftToggle
                  size="sm"
                  pressed={selectMode}
                  onClick={() => { setSelectMode((v) => !v); setSelectedIds(new Set()); }}
                  icon={<Icon name={selectMode ? 'check-check' : 'list-checks'} size={15} />}
                >
                  {selectMode ? 'Selecting' : 'Select'}
                </SoftToggle>
                {/* The design's "Add task": a plain gel (29-1P2), the board's
                    one lit button, as adding work is this screen's primary
                    act. Emerald, the brand's own, as it was. The name is ours
                    and stays — the `n` shortcut is listed as "New task". */}
                <GelButton colour="emerald" tile={false} size="md" onClick={openQuickAdd} icon={<Icon name="plus" size={15} />} style={{ height: 36 }}>
                  New task
                </GelButton>
                </>)}
              </div>
              {pane && <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>{filterBar}</div>}

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
                      {boardLists.length === 0 && (
                        <p className="ag-kicker" style={{ marginTop: 'var(--sp-4)' }}>
                          A default “Tasks” list will be created automatically
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {outsourceShareIds.length > 0 && <OutsourcedWorkPanel shareIds={outsourceShareIds} />}

              {/* ── The Backburner, pulled down (29-1P6c, idea 91) ─────── */}
              <AnimatePresence initial={false}>
                {parkedOpen && shownParkedLists.length > 0 && (
                  <motion.div
                    key="parked"
                    aria-label={`${project.name}'s Backburner`}
                    role="region"
                    initial={{ opacity: 0, height: 0, y: -14 }}
                    animate={{ opacity: 1, height: 'auto', y: 0, transitionEnd: { overflow: 'visible' } }}
                    exit={{ opacity: 0, height: 0, y: -14, overflow: 'hidden' }}
                    transition={{ duration: motionTokens.dur.slow * 1.4, ease: motionTokens.ease.glide }}
                    style={{ overflow: 'hidden', minWidth: 0 }}
                  >
                    {view === 'list' ? (
                      <ListTable
                        lists={shownParkedLists}
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
                        onTuck={toggleParked}
                      />
                    ) : (
                      <SortableBoard
                        containerIds={shownParkedIds}
                        itemsByContainer={parkedItems}
                        onReorderContainers={keepParkedOrder}
                        onReorderItems={handleReorderItems}
                        onMoveItem={moveTaskToList}
                        renderItemOverlay={renderTaskGhost}
                        className={pane ? 'ag-board-grid ag-board-grid--pane' : 'ag-board-grid'}
                      >
                        {shownParkedLists.map((list) => (
                          <SortableRow key={list.id} id={list.id} handle>
                            {(state) => column(list, state, toggleParked)}
                          </SortableRow>
                        ))}
                      </SortableBoard>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── The board, or the table ────────────────────────────── */}
              {/* 29-1P5c, idea 60: Board ⇄ List blurs across, sliding the way you went. */}
              <BlurAcross value={view} index={view === 'board' ? 0 : 1} style={{ minWidth: 0 }}>
              {boardLists.length === 0 ? (
                /* An empty project gets a sentence and one door, not a grid of
                   dashed placeholders. Since 29-1P14c the calm empty (idea 113):
                   the paper plane, and his approved lit sentence. */
                <motion.div
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  style={{
                    display: 'grid', justifyItems: 'center', textAlign: 'center',
                    gap: 'var(--sp-5)', padding: 'var(--sp-13) 0',
                  }}
                >
                  <EmptyDrawing art="plane" />
                  <h2 style={{ font: 'var(--type-title)', fontSize: 'var(--text-xl)', color: 'var(--fg-1)' }}>
                    A clean board.
                  </h2>
                  <LitLine
                    as="p"
                    style={{
                      maxWidth: '42ch',
                      font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)',
                    }}
                  >
                    <Lit>Add the first task</Lit>, or make <Lit>a list</Lit> to sort tasks into sections.
                  </LitLine>

                  {!addingList ? (
                    <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {/* The screen's one primary while it is empty — gel since
                          V3-3. The toolbar's New task went at OPT-6; this stayed. */}
                      <GelButton colour="emerald" tile={false} size="md" onClick={openQuickAdd} icon={<Icon name="plus" size={16} />}>
                        Add first task
                      </GelButton>
                      <SoftButton onClick={openAddList} icon={<Icon name="plus-circle" size={16} />}>
                        New list
                      </SoftButton>
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
              ) : filtering && shownBoardLists.length === 0 ? (
                /* BUILD-18: nothing on the board matches. One sentence and the
                   way back, rather than a board with every list gone. */
                <div
                  role="status"
                  style={{
                    display: 'grid', justifyItems: 'center', textAlign: 'center',
                    gap: 'var(--sp-5)', padding: 'var(--sp-11) 0',
                  }}
                >
                  <EmptyDrawing art="search" />
                  <LitLine
                    as="p"
                    text={noMatchSentence(filterText, filterStatus)}
                    style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)', maxWidth: '42ch' }}
                  />
                  <SoftButton size="sm" onClick={clearFilter} icon={<Icon name="x" size={14} />}>
                    Clear filter
                  </SoftButton>
                </div>
              ) : view === 'list' ? (
                <ListTable
                  lists={shownBoardLists}
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
                  groupBy={groupBy}
                  rootRef={tableRef}
                />
              ) : (
                <SortableBoard
                  containerIds={shownListIds}
                  itemsByContainer={boardItems}
                  onReorderContainers={reorderLists}
                  onReorderItems={handleReorderItems}
                  onMoveItem={moveTaskToList}
                  renderItemOverlay={renderTaskGhost}
                  /* 29-1P9a (157): a board with a list folded lays out as a
                     wrapping row, so a spine can be thin and the lists
                     beside it widen (`screens.css`). */
                  className={[
                    'ag-board-grid', pane && 'ag-board-grid--pane', anyFolded && 'ag-board-grid--folds',
                  ].filter(Boolean).join(' ')}
                >
                  <AnimatePresence>
                    {shownBoardLists.map((list) => (
                      <SortableRow key={list.id} id={list.id} handle>
                        {(state) => column(list, state, undefined, folded.has(list.id))}
                      </SortableRow>
                    ))}
                  </AnimatePresence>

                  {/* Add-list cell. Dashed, because that is how this system
                      draws an empty slot — see `ListColumn`'s header note. */}
                  {/* Not while filtering (BUILD-18): a new list matches
                      nothing, so it would step off the board as it landed. */}
                  {filtering ? null : addingList ? (
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
                  {/* 29-1P9a: four empty cells end a folded board's row, so
                      the last line's lists keep the width of those above
                      instead of stretching to fill it (a grid did that by
                      itself). They take no height. */}
                  {anyFolded && [0, 1, 2, 3].map((i) => <span key={`fill-${i}`} className="ag-board-fill" aria-hidden />)}
                </SortableBoard>
              )}
              </BlurAcross>
            </section>
          </div>
        </div>
      </div>

      {/* ── The Ask Atlas bar (29-1P15c, idea 74) ──────────────────────── */}
      {/* In place of the ✦ beside the project's name, his call; it grows into
          the AI panel and the panel shrinks back into it, whichever ✦ opened
          it. The single board only: a pair's panes keep the ⋯ menu's Ask, and
          which of two projects a bar would ask about is not a question worth
          a bar. Bottom-right on the laptop, where the panel docks, so it grows
          up into its own column. On a narrow window it takes the lane over the
          nav, and below 560px, where the capture + rises into that lane, it
          stops short of the + and shares its row. Out of the way while
          selecting: the selection bar has that lane. */}
      {!pane && (
        <AskAtlasBar
          open={ask !== null}
          onOpen={() => toggleAsk({ kind: 'project', id: project.id })}
          label={`Ask Atlas about ${project.name}`}
          hidden={selectMode}
          reserve={!wide}
          style={{
            position: 'fixed', zIndex: Z.nav,
            ...(wide
              ? { right: 'calc(var(--sp-7) + var(--safe-r))', bottom: 'calc(var(--sp-7) + var(--safe-b))', width: 320 }
              : underTheBar
                ? {
                    left: 'calc(var(--gutter-page-sm) + var(--safe-l))',
                    /* The + is 60px, 28px in from the edge, its foot 104px up
                       (measured at 390 wide): 12px between them, centred on it. */
                    right: 'calc(var(--sp-8) + 60px + var(--sp-4) + var(--safe-r))',
                    bottom: 'calc(var(--sp-6) + 90px + var(--safe-b))',
                  }
                : { left: 0, right: 0, margin: '0 auto', bottom: 'calc(112px + var(--safe-b))', width: 320 }),
          }}
        />
      )}

      {/* ── Selection bar ──────────────────────────────────────────────── */}
      {/* The bridge out of this view. A pill fixed to the bottom of the window
          rather than a strip that shoves the board down the instant you pick a
          row — the mockup's, with the app's real actions in it. It keeps its
          space at all times and only its opacity and offset animate, so
          nothing behind it reflows. */}
      <div
        style={{
          /* Centred over the board, not the window, while the AI panel holds
             the right-hand column. A pane holds its own, at its own foot
             (BIG-5) — two boards each have a selection. */
          position: pane ? 'absolute' : 'fixed', left: 0, right: !pane && ask && wide ? 404 : 0,
          bottom: wide
            ? (pane ? 'var(--sp-7)' : 'calc(var(--sp-9) + var(--safe-b))')
            : 'calc(96px + var(--safe-b))',
          display: 'grid', placeItems: 'center', zIndex: Z.nav, pointerEvents: 'none',
          padding: '0 var(--gutter-page-sm)',
        }}
      >
        <SelectionBar
          picked={picked}
          lists={taskLists}
          projects={projects}
          onMove={handleBulkMove}
          onDone={handleBulkDone}
          onDelete={handleBulkDelete}
          onClear={() => setSelectedIds(new Set())}
        />
      </div>

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

      {/* BIG-2 — a new project made here is made inside this one. */}
      <CreateProjectModal
        isOpen={creatingInside}
        onClose={() => setCreatingInside(false)}
        onSave={(data) => addProject({ ...data, parentId: project.id })}
        insideName={project.name}
      />
      {editingInside && (
        <CreateProjectModal
          isOpen
          onClose={() => setEditingInsideId(null)}
          onSave={(data) => updateProject(editingInside.id, data)}
          project={editingInside}
        />
      )}
      {openingBeside && <OpenBesideDialog projectId={project.id} onClose={() => setOpeningBeside(false)} />}

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
    </DensityContext.Provider>
  );
}

// ─── PaneHeader — a board's name when it shares the screen ───────────────────

/**
 * One line, his call (BIG-5): the project's glyph and name, how much is done
 * (a ring until 29-1P9b; "40%" in glowing lime since, his pick A),
 * its ⋯ menu and a ✕. It stands in for the breadcrumb and the masthead, whose
 * cover alone would take half a landscape tablet's height, and it is sticky,
 * so the board it names is never in doubt while its lists scroll under it.
 * A project opened from inside a mega project has a way back up, in its pane.
 */
/** Hides and shows the side nav while two boards share the screen. */
interface NavToggle {
  hidden: boolean;
  onToggle: () => void;
}

function PaneHeader({ project, progress, parent, asking, ignoreNote, menu, onClose, navToggle }: {
  project: Project;
  progress: number;
  parent: Project | undefined;
  asking: boolean;
  ignoreNote: string | null;
  menu: ReactNode;
  onClose?: () => void;
  navToggle?: NavToggle;
}) {
  const openProject = useOpenProject();
  return (
    <header
      data-ai-subject={asking ? 'true' : undefined}
      style={{
        position: 'sticky', top: 0, zIndex: 5,
        display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
        minHeight: 56, margin: 'var(--sp-5) 0 var(--sp-7)',
        padding: 'var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-4)',
        /* A top bar is a rounded rectangle, never a pill (his call on Focus
           and Deadlines). */
        borderRadius: 'var(--r-md)',
        backgroundImage: 'var(--glass-fill-3)',
        backdropFilter: 'var(--glass-bd-md)',
        WebkitBackdropFilter: 'var(--glass-bd-md)',
        boxShadow: asking
          ? `${AI_SUBJECT_RIM}, var(--glass-inner-1)`
          : 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-2)',
      }}
    >
      {/* His ask (2026-09-30): on the left-hand board, the switch for the
          side nav, so two boards can have the whole width. */}
      {navToggle && (
        <SoftToggle
          round
          aria-label={navToggle.hidden ? 'Show the side nav' : 'Hide the side nav'}
          title={navToggle.hidden ? 'Show the side nav' : 'Hide the side nav'}
          pressed={navToggle.hidden}
          onClick={navToggle.onToggle}
        >
          <Icon name="panel-left" size={18} />
        </SoftToggle>
      )}
      {parent && (
        <SoftIconButton label={`Back to ${parent.name}`} onClick={() => openProject(parent.id)}>
          <Icon name="arrow-left" size={16} />
        </SoftIconButton>
      )}
      <ProjectIcon project={project} size={34} />
      <h2
        title={project.name}
        style={{
          flex: '1 1 auto', minWidth: 0,
          font: 'var(--type-title)', fontSize: 'var(--text-lg)', color: 'var(--fg-1)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {project.name}
      </h2>
      {ignoreNote && <IgnoredMark title={ignoreNote} />}
      {/* 29-1P9b, his pick A: the page's glowing words, shortened to fit. */}
      <span
        aria-label={`${progress}% done`}
        style={{
          flex: '0 0 auto', font: 'var(--type-numeric)', fontVariantNumeric: 'tabular-nums',
          fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--job-lime)', textShadow: 'var(--text-glow-lime)',
        }}
      >
        {progress}%
      </span>
      {menu}
      {onClose && (
        <SoftIconButton label={`Close ${project.name}`} title="Close this board" onClick={onClose}>
          <Icon name="x" size={18} />
        </SoftIconButton>
      )}
    </header>
  );
}

// ─── ProjectView — the page: one board, or two side by side ──────────────────

/** The pair's three tracks — a board, the divider, a board — at `ratio` for the first. */
function splitTracks(ratio: number): string {
  return `minmax(0, ${ratio}fr) auto minmax(0, ${1 - ratio}fr)`;
}

/** No board narrower (or shorter) than this while the divider is dragged (px). */
const MIN_PANE_PX = 300;

/**
 * THE LINE BETWEEN TWO BOARDS, which drags (his ask, 2026-09-30).
 *
 * While it is held, the new split is written straight onto the grid, once a
 * frame, and React hears of it only on release: a state update per pointer
 * move would re-render both boards sixty times a second for nothing. A double
 * click puts it back to half and half; the arrow keys move it when focused.
 * No board is made narrower than `MIN_PANE_PX`, and never past a quarter.
 */
function SplitDivider({ axis, ratio, containerRef, onChange }: {
  axis: 'x' | 'y';
  ratio: number;
  containerRef: RefObject<HTMLDivElement | null>;
  onChange: (ratio: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const live = useRef(ratio);
  const frame = useRef(0);

  const clampFor = (box: DOMRect, r: number) => {
    const size = axis === 'x' ? box.width : box.height;
    const least = Math.min(0.5, Math.max(0.25, MIN_PANE_PX / Math.max(size, 1)));
    return Math.min(1 - least, Math.max(least, r));
  };
  const paint = (r: number) => {
    const grid = containerRef.current;
    if (!grid) return;
    if (axis === 'x') grid.style.gridTemplateColumns = splitTracks(r);
    else grid.style.gridTemplateRows = splitTracks(r);
  };

  return (
    <div
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label="Resize the two boards"
      aria-valuemin={25}
      aria-valuemax={75}
      aria-valuenow={Math.round(ratio * 100)}
      tabIndex={0}
      className="ag-split-divider"
      data-axis={axis}
      data-dragging={dragging ? '' : undefined}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        live.current = ratio;
        setDragging(true);
      }}
      onPointerMove={(e) => {
        if (!dragging) return;
        const grid = containerRef.current;
        if (!grid) return;
        const box = grid.getBoundingClientRect();
        live.current = clampFor(box, axis === 'x'
          ? (e.clientX - box.left) / box.width
          : (e.clientY - box.top) / box.height);
        if (!frame.current) {
          frame.current = window.requestAnimationFrame(() => {
            frame.current = 0;
            paint(live.current);
          });
        }
      }}
      onPointerUp={() => {
        if (!dragging) return;
        setDragging(false);
        window.cancelAnimationFrame(frame.current);
        frame.current = 0;
        onChange(live.current);
      }}
      onPointerCancel={() => {
        setDragging(false);
        window.cancelAnimationFrame(frame.current);
        frame.current = 0;
        paint(ratio);
      }}
      onDoubleClick={() => onChange(0.5)}
      onKeyDown={(e) => {
        const step = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -0.05
          : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 0.05 : 0;
        if (!step) return;
        e.preventDefault();
        const grid = containerRef.current;
        onChange(grid ? clampFor(grid.getBoundingClientRect(), ratio + step) : ratio);
      }}
    />
  );
}

/**
 * Two boards sit side by side from this width, and stack one above the other
 * below it (BIG-5 — his call for a tablet turned upright). The landscape
 * tablet is 1180 wide and a laptop window wider; upright, the tablet is 820.
 */
const SIDE_BY_SIDE = '(min-width: 1024px)';

/** The AI panel's subject, held with the project it was opened in. */
type AskState = { projectId: string; ref: PanelSubjectRef };

/**
 * `/project/:projectId`, and since BIG-5 `?beside=` a second one.
 *
 * The page owns what the boards share: the rail and the floating nav, the AI
 * panel (one at a time, whichever board asked), which board `n` and `l` add
 * to, and — for a pair — the one drag both boards sit in, so a task dragged
 * onto the other board's list moves to that project (his call).
 */
export default function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const wide = useMedia(WIDE);
  const sideBySide = useMedia(SIDE_BY_SIDE);
  const nav = useNavModel();
  const projects = useStore((s) => s.projects);

  const beside = params.get(BESIDE_PARAM);
  const { left, right } = useMemo(() => {
    const ids = new Set(projects.map((p) => p.id));
    return resolveSplit((id) => ids.has(id), projectId, beside);
  }, [projects, projectId, beside]);

  /*
   * BUILD-4 — WHAT THE AI PANEL IS ABOUT, IF IT IS OPEN.
   *
   * Held with the project it was opened in, because this page stays mounted
   * when he moves from one project to another: a panel about a list in the
   * last project must not follow him into this one. Tapping the same
   * subject's button again closes it — the button is a toggle, and "Ask" on
   * the thing already being asked about has no other sensible meaning.
   */
  const [askState, setAskState] = useState<AskState | null>(() => {
    /* The harness's way in — `lib/devPanelFixture.ts`. */
    if (import.meta.env.DEV && projectId) {
      const fixture = devPanelFixture();
      if (fixture && fixture.ref.kind !== 'score') return { projectId, ref: fixture.ref };
    }
    return null;
  });
  const ask = askState && (askState.projectId === left || askState.projectId === right) ? askState : null;
  const closeAsk = useCallback(() => setAskState(null), []);
  const toggleAsk = useCallback((onProject: string, ref: PanelSubjectRef) => {
    setAskState((prev) =>
      prev && prev.projectId === onProject && prev.ref.kind === ref.kind && prev.ref.id === ref.id
        ? null
        : { projectId: onProject, ref },
    );
  }, []);

  /* Of two boards, the one last touched owns `n` and `l`. */
  const [activePane, setActivePane] = useState<0 | 1>(0);
  /* How the pair shares the screen, and whether the side nav is hidden — both
     remembered on this device only (his ask, 2026-09-30), like a list/board
     choice: a split that suits the laptop is wrong for the tablet. One ratio
     per direction, because side by side and stacked are different shapes. */
  const [colRatio, setColRatio] = useRememberedState('base.split.ratio.cols', 0.5);
  const [rowRatio, setRowRatio] = useRememberedState('base.split.ratio.rows', 0.5);
  const [navHidden, setNavHidden] = useRememberedState('base.split.navHidden', false);
  const splitRef = useRef<HTMLDivElement>(null);

  /* A project opened from inside a pane (a mega project's cards, the way back
     up) replaces that pane and keeps the other. */
  const openIn = useMemo(() => {
    if (!left || !right) return null;
    const pair = { left, right };
    return [
      (id: string) => navigate(replacePanePath(pair, 0, id)),
      (id: string) => navigate(replacePanePath(pair, 1, id)),
    ] as const;
  }, [navigate, left, right]);

  if (!left) {
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
          <SoftButton onClick={() => navigate('/')} icon={<Icon name="arrow-left" size={16} />}>
            Go home
          </SoftButton>
        </div>
      </div>
      </V3Scope>
    );
  }

  const rail = wide && (
    <div style={{ flex: '0 0 auto', padding: 'var(--sp-9) 0 var(--sp-9) var(--sp-7)' }}>
      <MiniNav
        orientation="vertical"
        items={nav.items}
        value={nav.current}
        onChange={nav.go} screenLit
        lead={<RailMark />}
      />
    </div>
  );

  /* The floating bar, on a narrow window only — the rail above replaces it
     on a wide one. `Z.nav` is the rung the global `FloatingNav` this screen
     now hides from was on. Stepped aside while the AI panel is open: on a
     narrow window it holds the bottom of the screen, and the bar would sit on
     its message box; the panel's own ✕ and handle are the way back. The
     floating + for quick capture goes with it (29-1P2, his call). */
  const floatingNav = !wide && !ask && (
    <>
      <div
        style={{
          position: 'fixed', left: '50%', bottom: 'calc(var(--sp-7) + var(--safe-b))',
          transform: 'translateX(-50%)', zIndex: Z.nav,
        }}
      >
        <MiniNav items={nav.items} value={nav.current} onChange={nav.go} screenLit />
      </div>
      <QuickCaptureFab />
    </>
  );

  if (!right || !openIn) {
    return (
      <V3Scope>
      {/* 29-1P7c (idea 164): the wires between blocked tasks. */}
      <BlockWires />
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
        {rail}

        {/* BUILD-4: the AI panel docks, it never covers. The board column is the
            grid's first track and shrinks — to the top 44% on a narrow window,
            to everything left of a 404px column on a wide one. */}
        <AIPanelDock
          dock={wide ? 'right' : 'bottom'}
          panel={ask && (
            <AIPanelHost subject={ask.ref} dock={wide ? 'right' : 'bottom'} onClose={closeAsk} />
          )}
        >
          {/* One drag for the board and its Backburner above it (29-1P6c),
              as a pair of boards shares one below. */}
          <SortableBoardHost>
            <ProjectBoard
              key={left}
              projectId={left}
              layout="page"
              ask={ask?.ref ?? null}
              onToggleAsk={toggleAsk}
              shortcutsActive
            />
          </SortableBoardHost>
        </AIPanelDock>

        {floatingNav}
      </div>
      </V3Scope>
    );
  }

  const pair = { left, right };
  const askPane = ask ? (ask.projectId === left ? 0 : 1) : null;
  const ratio = sideBySide ? colRatio : rowRatio;
  const setRatio = sideBySide ? setColRatio : setRowRatio;
  const navToggle = wide ? { hidden: navHidden, onToggle: () => setNavHidden((h) => !h) } : undefined;

  return (
    <V3Scope>
    {/* One wire layer for both boards, so a wire crosses from one to the other. */}
    <BlockWires />
    <div className="ag-page" style={{ height: '100dvh', display: 'flex', overflow: 'hidden' }}>
      {!navHidden && rail}

      {/* BIG-5 — two boards, and ONE drag around both of them, so a row can
          land on a list of the other board (`SortableBoardHost`). */}
      <SortableBoardHost>
        <div
          ref={splitRef}
          style={{
            flex: 1, minWidth: 0, minHeight: 0, display: 'grid',
            gridTemplateColumns: sideBySide ? splitTracks(ratio) : 'minmax(0,1fr)',
            gridTemplateRows: sideBySide ? 'minmax(0,1fr)' : splitTracks(ratio),
          }}
        >
          {([left, right] as const).map((id, i) => {
            const index = i as 0 | 1;
            const project = projects.find((p) => p.id === id);
            /* His call: the AI panel takes the OTHER board's place, so what it
               is about stays in view; closing it brings that board back. */
            const coveredByPanel = ask !== null && askPane !== index;
            const close = () => navigate(closePanePath(pair, index));
            return (
              <Fragment key={id}>
              {index === 1 && (
                <SplitDivider
                  axis={sideBySide ? 'x' : 'y'}
                  ratio={ratio}
                  containerRef={splitRef}
                  onChange={setRatio}
                />
              )}
              <section
                aria-label={`${project?.name ?? 'Project'} board`}
                data-split-pane={index}
                onPointerDownCapture={() => setActivePane(index)}
                onFocusCapture={() => setActivePane(index)}
                style={{
                  position: 'relative', minWidth: 0, minHeight: 0,
                  display: 'grid', gridTemplateRows: 'minmax(0,1fr)',
                }}
              >
                {coveredByPanel && (
                  <div style={{ minWidth: 0, minHeight: 0, display: 'grid', padding: 'var(--sp-5)' }}>
                    <AIPanelHost
                      subject={ask.ref}
                      dock="right"
                      onClose={closeAsk}
                      style={{ width: '100%', borderRadius: 'var(--r-card-lg)' }}
                    />
                  </div>
                )}
                {/* Hidden, not unmounted, while the panel stands in for it: its
                    scroll, its selection and its open forms are there when the
                    panel closes. A hidden board also leaves the drag. */}
                <Activity mode={coveredByPanel ? 'hidden' : 'visible'}>
                  <OpenProjectContext.Provider value={openIn[index]}>
                    <ProjectBoard
                      projectId={id}
                      layout="pane"
                      ask={askPane === index ? ask?.ref ?? null : null}
                      onToggleAsk={toggleAsk}
                      shortcutsActive={activePane === index}
                      onClose={close}
                      onGone={close}
                      navToggle={index === 0 ? navToggle : undefined}
                    />
                  </OpenProjectContext.Provider>
                </Activity>
              </section>
              </Fragment>
            );
          })}
        </div>
      </SortableBoardHost>

      {floatingNav}
    </div>
    </V3Scope>
  );
}
