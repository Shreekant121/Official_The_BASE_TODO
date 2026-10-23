/**
 * The task sheet — rebuilt on Aurora Glass (UI-12), RECONCILED at UI-26.
 *
 * UI-12 built this screen without the mockup: the design project was
 * unreachable for the eleventh straight session, so it was composed from the
 * tokens and the already-ported components. UI-21 mirrored the handoff bundle
 * and UI-26 finally diffed it.
 *
 * **`screens/task-detail.html` turned out to be 191 lines of stand-in board
 * with `<TaskSheet task={TASK} … />` on top of it** — the screen IS the
 * component, so the thing this file was really diffed against is the 1102-line
 * `components/overlay/TaskSheet.jsx` and its `.prompt.md`.
 *
 * WHAT THE SOURCE CORRECTED
 * -------------------------
 * - **The three columns were the wrong three.** `prompt.md` names them:
 *   *"three columns — what decides the score · the work · timing and
 *   context"*, and the source builds exactly that. Ours were
 *   what-it-is-and-when / what-it-is-worth / where-it-lives, which put the
 *   description beside the deadline and the subtasks beside the importance
 *   controls. See the comment above the columns for what the old arrangement was
 *   optimising and how the source answers it.
 * - **The header was missing its bottom two rows.** The source states the
 *   task in four: breadcrumb and status, title beside the score, then the five
 *   measured facts as one mono line, then the Needs chips. We had the first
 *   two. All five facts are DERIVED — `prompt.md` is explicit that nothing
 *   derivable ever becomes an input.
 * - **Needs chips jump.** *"Every missing required field appears as an amber
 *   chip in the header; pressing one focuses that field and rings it amber for
 *   a beat. The footer restates the count, never a red banner."* All three
 *   halves are now here; the row itself is shared with the Needs Attention
 *   screen (`task-fields/NeedsPills.tsx`) so the two cannot drift.
 * - **The pane headings and the title.** See `Group` and the title input
 *   below — a tinted disc and a trough that the source does not have.
 * - **The score chip is `lg showMax`.** UI-24 shipped `md` and wrote that the
 *   size was UI-26's call; `ScoreDial.prompt.md` names this screen by name.
 *
 * WHAT DIVERGES, DELIBERATELY
 * ---------------------------
 * - **Deleting is still one press with no confirmation.** `prompt.md` asks for
 *   a rose confirm strip in the footer's own slot. It is describing a real
 *   delete; ours is a soft delete into the 30-day Trash —
 *   `deleteBacklogTask` → `planTaskDeletion` → `applyDeletion` — so there is
 *   nothing destroyed to confirm, and the button's own tooltip says so. This
 *   was already the file's settled call before UI-26 and the source did not
 *   change the facts behind it.
 * - **No quasi-need switch.** The source has one, worth a point. In this app
 *   `avoidedCount` is not typed at all — Focus Mode's quasi-need defer
 *   accumulates it — so an input for it would be asking for a number the
 *   product works out, which is the rule the same `prompt.md` sets.
 * - **The columns come out uneven**, and more so than before: the score column
 *   holds three controls while timing-and-context holds twelve. The source has
 *   the same shape and does not mind, because its fields are all one-line
 *   troughs; several of ours are whole components. Notes and Tags are gone
 *   (OPT-3, his call: "description is enough"), and Description is six rows
 *   tall because it holds what Notes used to.
 *
 * **OPT-5 SLIMMED IT (2026-10-06, his call).** The first column lost its
 * heading, the added total and the factor bar — "What decides the score" is
 * the Score screen's alone now — and keeps only Importance and Emergency.
 * Start date, Reminder, Status, Value and Share moved into a closed Optional
 * section under all three columns (`task-fields/OptionalSection.tsx`, which
 * the Score screen shares), and the share handlers moved with them, unchanged.
 *
 * WHAT IS UNCHANGED. Everything that writes. `useTaskDraft` still stages every
 * field and nothing reaches the store until `commit()`; `handleSave` still
 * commits and closes and still does NOT fire a per-task notification sync (the
 * comment below says why, and it cost a double Google Calendar write to learn);
 * `useCoverUpload` still picks, compresses and stores a cover the same way; and
 * the five share-related handlers — `handleShare`, `handleShareKeywordChange`,
 * `handleShareSettingsChange`, `handleToggleHidden` and the `ShareModal` they
 * open, in `OptionalSection.tsx`'s `ShareField` since OPT-5 — are what they
 * were, including the fact that they write
 * to the store IMMEDIATELY rather than through the draft, so the public page
 * exists the moment you ask for it. `useOverlayDismiss` still owns Escape, the
 * props are the four they were, and all three call sites (Focus Mode, New
 * Session and the project board) are untouched.
 *
 * **Deleting is still one press with no confirmation, on purpose.** It is a
 * soft delete into the 30-day Trash — `deleteBacklogTask` → `planTaskDeletion`
 * → `applyDeletion` — so the design system's "destructive actions confirm
 * inside a MorphMenu" rule is not in play here: nothing is destroyed to confirm.
 *
 * THE PRESENCE BRIDGE — the one piece of machinery worth reading before editing
 * ---------------------------------------------------------------------------
 * All three call sites mount this panel conditionally inside an
 * `<AnimatePresence>`, and the old panel was a `motion.div`, so closing it
 * animated. `TaskSheet` is a `Dialog`, which portals to `<body>` and runs its
 * own CSS dissolve off the `open` prop — a portalled child is not something
 * AnimatePresence can animate, so a naive port would make every close snap.
 * `usePresence()` is the join: it reports when the parent has removed us and
 * hands back a `safeToRemove` that holds the node in the tree until we call it.
 * So `open` is simply "am I still present", and `safeToRemove` is handed
 * straight to the sheet's `onExited`. Outside an `AnimatePresence` the hook
 * reports `[true, null]` and this costs nothing.
 *
 * This used to be a `setTimeout` on `SHEET_EXIT_MS`, a second copy of Dialog's
 * exit duration kept in step by hand. UI-22 replaced both with the sheet
 * reporting when its dissolve has genuinely ended, so there is now exactly one
 * thing that knows how long a dialog takes to leave — the CSS transition.
 *
 * WHAT SHREEKANT WILL SEE CHANGE
 * ------------------------------
 * - **The task is one picture instead of a scrolling strip.** The fields are
 *   laid across three columns — what decides the score, the work, then timing
 *   and context — so a deadline and its estimate are side by side rather than
 *   a scroll apart. The columns fold to two and then to one as the sheet
 *   narrows.
 * - **The title and the actions never leave.** The identity row is pinned at
 *   the top and Save/Delete at the bottom; only the columns move.
 * - **The cover became the header's background** rather than a band above it.
 *   A cover and an identity row stacked cost a third of a laptop screen before
 *   the first field, which is exactly what the three columns were meant to buy
 *   back. Add / change / remove all live in the header now.
 * - **The score reads at full size, with its denominator**, the same chip the
 *   Needs Attention screen shows — the two screens where the score is the
 *   subject rather than a fact about something else.
 * - **The header now says what the task is without you scrolling**: when it is
 *   due, how long it should take, how many subtasks are done, what it is
 *   worth, and whether it repeats. None of those are things you type.
 * - **Anything still missing is a chip you can press.** "Needs Score /
 *   Deadline / Estimate / Description" sits at the right of that same line;
 *   pressing one scrolls to the field, outlines it amber for a second and puts
 *   the cursor in it. The foot of the sheet keeps the tally.
 * - **Save is emerald only while there is something to save.** That is
 *   `tint`/`accent`, which the design system reserves for an affirmative
 *   primary action — the call UI-8 made for Send, UI-9 for Save & Next and
 *   UI-10 for Start Protocol — instead of a white pill that looked equally
 *   urgent on a sheet you had not touched.
 *
 * **The editors in `components/task-fields/` came across at UI-13**, which is
 * why every one of them now supplies only a control and lets the `Field` and
 * `Group` above it draw the label and the pane. `fieldStyles.ts` is gone with
 * them: its inputs were `Input`, its textareas `Textarea` and its labels
 * `FieldLabel` all along.
 *
 * *One thing worth not re-learning:* the title is a single-line `<input>` here,
 * not the two-row `<textarea>` it used to be — the same call the Score screen's
 * header made. A stored title that already contains a newline still shows and
 * still saves; you just cannot type a new one, which was never a thing a task
 * title wanted.
 */
import { useCallback, useState, type ReactNode } from 'react';
import { usePresence } from 'framer-motion';
import {
  Button, Chip, Icon, IconButton, Input, Kicker,
  ScoreDial, SoftButton, SoftIconButton, SoftToggle, StatusPill, Switch, TaskSheet, Textarea,
  WarnLine, WhiteButton, type IconName, type StatusName,
} from '../ui';
import {
  useStore, countSubtasksRecursive, emergencyBoostOf,
  formatINR, taskLockReason, type Task, type TaskStatus,
} from '../store/useStore';
import { usePriorityScores } from '../store/usePriorityScores';
import { ignoreSentence, isOwnSwitch } from '../lib/ignoredWork';
import { IgnoredMark } from './task-fields/TaskMarks';
import { hasEmergencyLapsed } from '../lib/priority';
import AssigneeField from './task-fields/AssigneeField';
import DependencyPicker from './task-fields/DependencyPicker';
import EstimateField from './task-fields/EstimateField';
import ListLocationPicker from './task-fields/ListLocationPicker';
import HumanOverridePicker from './task-fields/HumanOverridePicker';
import EmergencyPicker from './task-fields/EmergencyPicker';
import { emergencyCrowdNote } from './task-fields/emergencyMenu';
import RecurrencePicker from './task-fields/RecurrencePicker';
import { Labelled } from './task-fields/Labelled';
import { OptionalSection } from './task-fields/OptionalSection';
import { StepPercent } from './task-fields/StepPercent';
import { StorySection } from './task-fields/StorySection';
import { deadlineReading } from './task-fields/scoreReadings';
import { useNeedsJump } from './task-fields/useNeedsJump';
import { STATUS_OPTIONS } from './task-fields/taskStatusOptions';
import SubtaskTree from './task-fields/SubtaskTree';
import NeedsPills from './task-fields/NeedsPills';
import { countNeeds } from './task-fields/needs';
import { HUMAN_OVERRIDE_WORDS } from './task-fields/scoreDisplay';
import { RedAlertBadge } from './task-fields/RedAlertBadge';
import { DueDate } from './task-fields/DueDate';
import { EventLinkField } from './task-fields/EventLinkField';
import { useEventStore } from '../store/useEventStore';
import { useCoverUpload } from './task-fields/useCoverUpload';
import { useTaskDraft } from './task-fields/useTaskDraft';
import { describeRecurrenceRule, resolveRule } from '../lib/recurrence';
import { useOverlayDismiss } from '../lib/useOverlayDismiss';
import { archiveTask } from '../lib/archive';
import { Z } from '../lib/zLayers';
import { cue } from '../lib/sound';
import { dustSelector } from '../lib/dust';

// ── Sheet furniture ────────────────────────────────────────────────────────

interface GroupProps {
  /** Absent, the pane has no heading at all — the sheet's first pane since OPT-5. */
  title?: string;
  icon?: IconName;
  /** Right-aligned reading — a score, a ring. Never a control. */
  headerRight?: ReactNode;
  children: ReactNode;
}

/**
 * One labelled block of fields — the source's `Pane`.
 *
 * LEVEL 1, not a `Card`. `screens/home.html` builds every group inside its
 * three dialogs out of `--glass-fill-1` + `--glass-rim-1`, and the real
 * `TaskSheet.jsx` agrees — *"Level 1 glass on level 3 glass: enough to group,
 * not enough to compete with the sheet's own edge."* The reason is the
 * material: a sheet already IS the pane that came out of the page, so a
 * level-2 Card on top of it is glass stacked on glass and the whole surface
 * goes flat. The Score screen uses real Cards because there the grid sits on
 * the page itself, with nothing under it.
 *
 * **UI-26 took the rest of the source's `Pane`**: `--pad-card` rather than
 * `--sp-6`, `--glass-inner-1` alongside the rim so the pane reads as hollow
 * rather than printed on, and `--sp-7` between the header and the fields and
 * between the fields themselves.
 *
 * **The heading stopped being a kicker in a disc.** Ours set every pane title
 * in uppercase mono behind a 30px tinted `--glass-fill-2` puck; the source's
 * is a plain title-case `<h3>` at `--text-md` with a bare 16px glyph beside
 * it. Same correction UI-25 made to `NotificationCard` — a tint spent on
 * furniture is a tint that cannot mean anything when it is spent on data —
 * and it matters more here, where a column is three of these stacked. The
 * kicker case did not disappear: it moved down a level, to the field labels,
 * where the source also puts it.
 *
 * **The collapse is gone with it.** Only Notes ever used it (Notes itself is
 * gone since OPT-3), and the source filed Notes as the last field of "The work" rather than as a pane of its
 * own — a collapsing pane is a shape the design system has nowhere else.
 */
function Group({ title, icon, headerRight, children }: GroupProps) {
  return (
    <section
      style={{
        display: 'grid',
        /* `minmax(0, 1fr)`, so a field is laid out at the pane's width
           instead of widening the pane to fit it — see `TaskSheet`'s columns,
           which have the same rule for the same reason. */
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: 'var(--sp-7)',
        alignContent: 'start',
        borderRadius: 'var(--r-card)',
        padding: 'var(--pad-card)',
        backgroundImage: 'var(--glass-fill-1)',
        boxShadow: 'var(--glass-rim-1), var(--glass-inner-1)',
      }}
    >
      {title && (
        <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
          {icon && (
            <span aria-hidden="true" style={{ display: 'flex', flex: '0 0 auto', color: 'var(--fg-3)' }}>
              <Icon name={icon} size={16} />
            </span>
          )}
          <h3
            style={{
              margin: 0, flex: 1, minWidth: 0,
              font: 'var(--type-title)', fontSize: 'var(--text-md)',
              letterSpacing: 'var(--tracking-ui)', color: 'var(--fg-1)',
            }}
          >
            {title}
          </h3>
          {headerRight}
        </header>
      )}
      {children}
    </section>
  );
}

// ── The five derived readings in the header ────────────────────────────────

/*
 * `TaskSheet.prompt.md`: *"Nothing derivable is asked for … Never add an input
 * for a number the product can work out."* These four helpers are that rule's
 * other half — the facts the header states without ever asking for them.
 */

/** `StatusPills`' own table, keyed — the header pill and the control agree by construction. */
const STATUS_PILL = Object.fromEntries(
  STATUS_OPTIONS.map(({ value, label, status }) => [value, { label, status }]),
) as Record<TaskStatus, { label: string; status: StatusName }>;

/** `150` → `2h 30m`. `SmartStartModal` keeps its own copy; consolidating the two is not this screen's business. */
function formatMinutes(minutes?: number): string {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** One measured fact. Mono, because every one of them is a reading. */
function Fact({ icon, tone, iconTone, children }: { icon: IconName; tone?: string; iconTone?: string; children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)',
        font: 'var(--type-numeric)', fontSize: 'var(--text-xs)',
        color: tone ?? 'var(--fg-3)', whiteSpace: 'nowrap',
      }}
    >
      <Icon name={icon} size={14} style={iconTone ? { color: iconTone } : undefined} />
      {children}
    </span>
  );
}

// ── The sheet ──────────────────────────────────────────────────────────────

interface TaskDetailPanelProps {
  task: Task;
  onClose: () => void;
  onSave: (updates: Partial<Task>) => void;
  onDelete: () => void;
  /**
   * BUILD-11 — runs just before the footer's Archive, for a host with
   * something to settle first. Focus Mode pauses its timer, as it does
   * before a delete. Archiving itself needs no help from the host.
   */
  onBeforeArchive?: () => void;
}

export default function TaskDetailPanel({ task, onClose, onSave, onDelete, onBeforeArchive }: TaskDetailPanelProps) {
  const setEmergencyBoost = useStore((s) => s.setEmergencyBoost);
  /* Read live rather than off the `task` prop — three of the four call sites
     hold that prop as a snapshot in local state, and this control writes
     without waiting for Save. See `emergencyBoostOf`. */
  const emergencyLevel = useStore((s) => emergencyBoostOf(s.backlogTasks, task.id));
  const taskLists = useStore((s) => s.taskLists);
  const projects = useStore((s) => s.projects);
  const backlogTasks = useStore((s) => s.backlogTasks);
  const isBacklogTask = backlogTasks.some((t) => t.id === task.id);
  /* BIG-3. Written at once, like Archive beside it — the switch is not part of
     the draft, and the save below never writes it back. */
  const setIgnored = useStore((s) => s.setIgnored);
  const scores = usePriorityScores();

  // Every editable field is staged here; the same hook (and therefore the same
  // save mapping) backs the unified needs-attention page.
  const {
    draft, setField, patch, isDirty, missing, estimatedMinutes, scoreInput, toUpdates, commit,
  } = useTaskDraft(task);
  /* 29-2d1: due before an event that still exists — the date box gives way to it. */
  const linkedHere = useEventStore((s) => !!draft.eventId && s.events.some((e) => e.id === draft.eventId));
  const { inputRef: coverInputRef, isUploading, openPicker, handleFileChange } =
    useCoverUpload((url) => setField('imageUrl', url));

  const [titleFocus, setTitleFocus] = useState(false);

  /* Pinned at mount, like `TrashPage`'s and the notifications timeline's.
     `Date.now()` read during render is impure and `react-hooks/purity` says
     so; the deadline phrase does not need to tick, and one that re-read the
     clock every keystroke would be a shot that never settles. The source pins
     it too, for its own version of the second reason — `TaskSheet.prompt.md`:
     *"Pass `now` a fixed ISO string in mocks and specimen cards, or the
     deadline copy drifts every day."* */
  const [now] = useState(() => Date.now());

  /* A pressed Needs chip scrolls its field up, rings it (grey, 29-1P2c2) for a beat and
     puts the caret in it. All three are `TaskSheet.prompt.md`'s, and the whole
     mechanism moved to `task-fields/useNeedsJump.ts` at UI-30 — the scoring
     screen asks for exactly the same thing. */
  const { jump, need } = useNeedsJump();

  // See "THE PRESENCE BRIDGE" at the top of this file.
  const [isPresent, safeToRemove] = usePresence();

  /* OPT-5 — the Optional section at the foot. Closed every time the sheet
     opens and remembered nowhere, his call. */
  const [optionalOpen, setOptionalOpen] = useState(false);

  const handleClose = useCallback(() => onClose(), [onClose]);

  // Closes on Escape, and hides the floating bottom nav while this
  // full-screen panel is open so its footer buttons never visually collide
  // with the fixed nav pill.
  useOverlayDismiss(true, handleClose);

  const handleSave = () => {
    // Notification sync is intentionally NOT fired here. Saving mutates the
    // store, which the debounced Firestore push already routes through the
    // single `scheduleReconcile` path (see firestoreSync.ts →
    // notificationSync.ts). Firing an immediate per-task sync too used to
    // double every Google Calendar write.
    commit(onSave);
    onClose();
  };

  const subtaskCounts = countSubtasksRecursive(draft.subtasks);
  /* Two halves: the graph half from the saved pass, everything an edit can
     change recomputed from the draft. See `readDraft`.

     `emergencyBoost` is spliced over the draft's copy of it because it is the
     one field on this sheet that is already written by the time you see it —
     `useTaskDraft` correctly takes it from the saved task, and the saved task
     the sheet was handed is a snapshot. Without this the ring would not move
     when the flag is pressed, which is the one thing item 17 asks it to do. */
  const breakdown = scores.readDraft({ ...scoreInput, emergencyBoost: emergencyLevel });
  const totalScore = breakdown.score;
  const outstanding = countNeeds(missing);
  /* Measured against the draft's deadline, so moving the date in the field
     above tells you straight away whether the flag comes back to life. */
  const emergencyLapsed =
    emergencyLevel > 0
    && hasEmergencyLapsed({ deadline: draft.deadline || undefined, originalDeadline: task.originalDeadline }, now);
  const emergencyNote = emergencyCrowdNote(scores.emergencyCount, emergencyLapsed);
  const ignoreReason = scores.ignored.reasonOf(task);
  const ignoredHere = ignoreReason !== undefined && isOwnSwitch(ignoreReason, { kind: 'task', id: task.id });

  const list = draft.listId ? taskLists.find((l) => l.id === draft.listId) : undefined;
  const project = list?.projectId ? projects.find((p) => p.id === list.projectId) : undefined;

  const deadline = deadlineReading(draft.deadline, now);
  const repeat = resolveRule({ recurrence: draft.recurrence, recurrenceRule: draft.recurrenceRule });

  /*
   * THE HEADER — what this task IS.
   *
   * The source's anatomy, in its order: breadcrumb and status, then the title
   * beside the score, then the measured facts as one mono line with the Needs
   * chips closing it. Ours had the first two rows and neither of the last two.
   */
  const header = (
    <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
      {/* Breadcrumb + status + cover controls + close */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
        {/* A neutral `Chip`; projects carry no colour since OPT-4. */}
        {project && (
          <Chip icon="folder">{project.name}</Chip>
        )}
        {list && (
          <>
            {project && (
              <span style={{ display: 'flex', color: 'var(--fg-4)' }}>
                <Icon name="chevron-right" size={14} />
              </span>
            )}
            <Chip icon="list">{list.title}</Chip>
          </>
        )}

        {/* The source's header states the status too, and it is the one thing
            in this row that changes while the sheet is open — the pill and the
            Status control in the Optional section are two readings of one draft field,
            so they cannot disagree. */}
        <StatusPill status={STATUS_PILL[draft.status].status} size="sm">
          {STATUS_PILL[draft.status].label}
        </StatusPill>

        <span style={{ flex: 1 }} />

        <Button
          variant="ghost"
          size="sm"
          onClick={openPicker}
          loading={isUploading}
          /* Measured 2026-09-23: a task cover shows at 2.6 : 1 on a laptop
             board, 3.2–5.1 : 1 on the tablet's, and 4–6 : 1 in this sheet's
             header. 3 : 1 is the middle; anything else still shows whole,
             with blurred sides (FIX-9). */
          title="Best at 1200×400 (3 : 1). The whole picture always shows."
          iconLeft={<Icon name={draft.imageUrl ? 'image-up' : 'image'} size={16} />}
        >
          {isUploading ? 'Uploading…' : draft.imageUrl ? 'Change cover' : 'Add cover'}
        </Button>
        {draft.imageUrl && (
          <IconButton
            label="Remove cover"
            variant="ghost"
            size="sm"
            onClick={() => setField('imageUrl', '')}
          >
            <Icon name="eraser" size={16} />
          </IconButton>
        )}
        <IconButton label="Close" variant="ghost" size="sm" onClick={handleClose}>
          <Icon name="x" size={18} />
        </IconButton>
      </div>

      {/* Title + score */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-6)', flexWrap: 'wrap' }}>
        {/*
          The title is the SUBJECT, not a field — the source sets it as bare
          `--type-display` text on the header itself, with no trough under it,
          and that is the difference between a sheet that states what a task is
          and a form whose first row happens to be a name. We had it seated in
          a well like every other input.

          The well is not gone, it is now the focus state: touch the title and
          it becomes the field it always was. That is the one thing the source
          does not answer for — `.ag-field:focus { outline: none }` leaves its
          own title with no focus indication at all, which is not something to
          mirror. Hand-composed rather than `<Input>` for the reason the Score
          screen's header writes down: Input's inner element hardcodes
          `--type-body`, and this one carries a heading.
        */}
        <div
          style={{
            flex: '1 1 340px', minWidth: 0, display: 'flex', alignItems: 'center',
            padding: 'var(--sp-3) var(--sp-5)',
            margin: '0 calc(var(--sp-5) * -1)',
            borderRadius: 'var(--r-control)',
            backgroundImage: titleFocus ? 'var(--glass-well)' : 'none',
            boxShadow: titleFocus
              ? 'var(--glass-well-shadow), var(--job-lime-focus)'
              : 'none',
            transition: 'box-shadow var(--dur-base) var(--ease-glass)',
          }}
        >
          <input
            type="text"
            data-ag-field=""
            className="ag-field"
            value={draft.title}
            onChange={(e) => setField('title', e.target.value)}
            onFocus={() => setTitleFocus(true)}
            onBlur={() => setTitleFocus(false)}
            placeholder="Task title…"
            aria-label="Task title"
            style={{
              flex: 1, minWidth: 0,
              border: 0, outline: 'none', boxShadow: 'none', background: 'transparent',
              font: 'var(--type-display)',
              fontSize: 'var(--text-3xl)',
              letterSpacing: 'var(--tracking-display)',
              color: 'var(--fg-1)',
            }}
          />
        </div>

        {/* `lg showMax`, which is what `ScoreDial.prompt.md` names for exactly
            two screens: *"the task detail page and Needs Attention, where the
            score is the subject rather than a fact about something else."*
            UI-24 left this open — it had shipped `md` reasoning from "beside a
            task title in a header" and wrote that the size "is UI-26's call,
            against `screens/task-detail.html`". The source's own header settles
            it: `<ScoreDial value={score.total} max={MAX} size="lg" showMax />`,
            with the kicker beside it rather than inside it. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flex: '0 0 auto' }}>
          <Kicker>Priority</Kicker>
          {/* Ignored work has no score to show (BIG-3): a 0 would read as a
              verdict on the task, and it is not one. */}
          {ignoreReason ? (
            <IgnoredMark title={ignoreSentence(ignoreReason, { kind: 'task', id: task.id })} />
          ) : (
            <>
              <RedAlertBadge redAlert={breakdown.redAlert} size="md" />
              <ScoreDial value={totalScore} max={scores.peak} alert={breakdown.redAlert} size="lg" showMax />
            </>
          )}
        </div>
      </div>

      {/*
        The facts a stacked sheet made you scroll for, as one mono line. All
        five are derived — nothing here is an input, and `TaskSheet.prompt.md`
        is explicit that nothing derivable ever becomes one.
      */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-6)', flexWrap: 'wrap' }}>
        {/* 29-1P7a (ideas 165, 66): the date as a tiny calendar page, warming
            sky to coral as the day nears, flipping as the Deadline field below
            is changed. With no date, the plain fact says so. */}
        {draft.deadline
          ? <DueDate deadline={draft.deadline} size="md" />
          : <Fact icon="calendar-clock">{deadline.phrase}</Fact>}
        <Fact icon="timer">{formatMinutes(estimatedMinutes)}</Fact>
        {subtaskCounts.total > 0 && (
          <Fact icon="list-checks">{subtaskCounts.done} / {subtaskCounts.total}</Fact>
        )}
        <Fact icon="indian-rupee">{formatINR(Number(draft.valueINR) || 0)}</Fact>
        {/* `describeRecurrenceRule` through `resolveRule` is what the Repeat
            field one column over says, character for character. A local
            "Every month"/"Custom repeat" table looked fine until the fixture
            task turned out to be a CUSTOM rule that describes a month — the
            header said "Custom repeat" and the field said "Every month, 3x",
            about the same task, in the same sheet. The occurrence is
            deliberately not repeated here: the field already carries
            `describeSeriesStatus`'s "Last one (3 of 3)" under it. */}
        {repeat && <Fact icon="repeat">{describeRecurrenceRule(repeat)}</Fact>}

        <span style={{ flex: 1 }} />

        <NeedsPills missing={missing} onJump={jump} allSetLabel="Fully scored" />
      </div>
    </div>
  );

  const footer = (
    <>
      {/* The footer's three icons are round soft buttons since 29-1P2. Delete
          stays a tap, not a hold: the Trash brings it back for 30 days. */}
      <SoftIconButton
        label="Delete task"
        onClick={() => { cue('delete'); onDelete(); onClose(); }}
        title="Move this task to the Trash — recoverable for 30 days"
        style={{ color: 'var(--status-overrun)' }}
      >
        <Icon name="trash-2" size={18} />
      </SoftIconButton>

      {/* BUILD-11 — the row menu's pair, in the footer as `Archive.dc.html`
          asks. One tap, like Delete beside it: nothing is lost, and the
          toast that follows names where it went. Only for a task on the
          board — a subtask archives with its parent. */}
      {isBacklogTask && (
        <SoftIconButton
          label="Archive task"
          onClick={() => { onBeforeArchive?.(); if (archiveTask(task.id)) onClose(); }}
          title="Archive this task — out of every queue and Atlas, kept for good"
        >
          <Icon name="archive" size={18} />
        </SoftIconButton>
      )}

      {/* BIG-3 — the row menu's switch, here too. Held by a list or a project
          above it, it names that one and does nothing: nothing inside ignored
          work can opt back in (his call). */}
      {isBacklogTask && (
        <SoftToggle
          round
          aria-label={ignoredHere ? 'Stop ignoring' : ignoreReason ? 'Ignored with its list or project' : 'Ignore score & deadline'}
          pressed={ignoreReason !== undefined}
          disabled={ignoreReason !== undefined && !ignoredHere}
          onClick={() => setIgnored({ kind: 'task', id: task.id }, !ignoredHere)}
          title={
            ignoreReason && !ignoredHere
              ? ignoreSentence(ignoreReason, { kind: 'task', id: task.id })
              : ignoredHere
                ? 'Stop ignoring — scored and offered again'
                : 'Ignore score & deadline — never scored or offered, deadline never pushed, and out of today’s queue'
          }
        >
          <Icon name="moon" size={18} />
        </SoftToggle>
      )}

      <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
        {isDirty ? 'Unsaved changes' : 'Everything is saved'}
      </span>

      <span style={{ flex: 1 }} />

      {/* The footer restates the count and never turns into a banner —
          `TaskSheet.prompt.md`'s own words. The chips above are where you act
          on it; this is only the tally. */}
      {outstanding > 0 && (
        <WarnLine as="span" style={{ font: 'var(--type-label)', fontSize: 'var(--text-xs)', alignItems: 'center' }}>
          {outstanding === 1 ? '1 field still needed' : `${outstanding} fields still needed`}
        </WarnLine>
      )}

      {/* The sheet's confirm (29-1P2): solid white once there is something to
          save, soft while everything is — the same "lights up when dirty"
          the tint/glass pair used to say. */}
      {isDirty ? (
        <WhiteButton onClick={handleSave} icon={<Icon name="check" size={16} />}>
          Save changes
        </WhiteButton>
      ) : (
        <SoftButton onClick={handleSave} icon={<Icon name="check" size={16} />}>
          Save changes
        </SoftButton>
      )}
    </>
  );

  /*
   * THE THREE COLUMNS — and this is the part UI-26 re-cut.
   *
   * `TaskSheet.prompt.md` names them, in order: *"three columns — what decides
   * the score · the work · timing and context"*, and the real `TaskSheet.jsx`
   * builds exactly that. Ours were what-it-is-and-when / what-it-is-worth /
   * where-it-lives, which put the description beside the deadline and the
   * subtasks beside the importance controls.
   *
   * The old arrangement was chosen to make the three columns come out roughly
   * the same height, and that argument is answered rather than abandoned: the
   * source's third column is TWO panes, Timing and Context, which is what
   * balances it against the score column's quadrant grid and the work column's
   * subtask tree. It also weights the tracks 1.05 / 1 / 0.95 rather than
   * evenly — see the container block at the foot of `screens.css`.
   */

  /*
   * ── Column 1: the two judgements ────────────────────────────────────────
   *
   * This was "What decides the score": a heading, the added total against its
   * ceiling, the factor bar and three controls. OPT-5 took the pane out — his
   * words, *"Remove the What decides the score from the task details card
   * entirely, keep it in the score page"* — and, asked where the controls go
   * (2026-10-06): *"Hide value too, put importance and emergency on top of
   * where they are, just remove the what decides the score part."* So the two
   * judgements stay first, in a pane with no heading, the breakdown lives on
   * the Score screen alone, and Value is in the Optional section at the foot.
   */
  const theTwoJudgements = (
    <Group>
      {/* One control where there were two. `compact`, because a sheet column
          is 45px per step at five stops and this has ten — the stops keep
          their words in the `aria-label` and in the reading beside the label,
          so nothing is lost by making them narrow. */}
      <Labelled
        label="Importance (0–9)"
        icon="star"
        hint={(
          <>
            {draft.humanOverride !== undefined
              ? `${HUMAN_OVERRIDE_WORDS[draft.humanOverride]} — the only subjective input. `
              : 'Not set yet. '}
            Everything else is derived.
          </>
        )}
        {...need('score')}
      >
        <HumanOverridePicker
          value={draft.humanOverride}
          onChange={(v) => setField('humanOverride', v)}
          compact
        />
      </Labelled>

      {/* The second manual input, and the last one. It is the only control on
          this sheet that does not wait for Save — see `EmergencyPicker`'s
          header for why an emergency is an act rather than an edit. The
          reading beside the label is the *live* level, which is also how you
          can tell the press landed without watching the ring. */}
      <Labelled
        label="Emergency (0–5)"
        icon="zap"
        right={
          emergencyLevel > 0
            ? (
              <span style={{ color: emergencyLapsed ? 'var(--fg-4)' : 'var(--job-coral-tag-fg)' }}>
                {emergencyLapsed ? 'lapsed' : 'live'}
              </span>
            )
            : undefined
        }
        hint={(
          emergencyNote.warn
            /* Too many flagged: a warning, grey with its icon (29-1P2c2). */
            ? <WarnLine as="span" style={{ font: 'inherit' }}>{emergencyNote.text}</WarnLine>
            : <span>{emergencyNote.text}</span>
        )}
      >
        <EmergencyPicker
          value={emergencyLevel}
          onChange={(level) => setEmergencyBoost(task.id, level)}
          compact
        />
      </Labelled>
    </Group>
  );

  // ── Column 2: the work ──────────────────────────────────────────────────
  const theWork = (
    <>
      <Group title="The work" icon="align-left">
        <Labelled
          label="Description"
          icon="align-left"
          hint={<>What has to be true when it&rsquo;s done.</>}
          {...need('description')}
        >
          <Textarea
            value={draft.description}
            onChange={(e) => setField('description', e.target.value)}
            rows={6}
            placeholder="What it is, and any context…"
          />
        </Labelled>

        <Labelled
          label="Subtasks"
          icon="list-checks"
          right={subtaskCounts.total > 0 ? (
            <StepPercent done={subtaskCounts.done} total={subtaskCounts.total} />
          ) : undefined}
        >
          <SubtaskTree value={draft.subtasks} onChange={(v) => setField('subtasks', v)} />
        </Labelled>
      </Group>
    </>
  );

  // ── Column 3: timing ────────────────────────────────────────────────────
  const timing = (
    <>
      <Group title="Timing" icon="calendar-clock">
        {/* The switch is INSIDE the deadline field, not a field of its own.
            It is not a second date question — it is a property of this date,
            and the one thing that decides whether the app is allowed to touch
            it, so it belongs where the date is or nobody looking at a date
            they care about will ever see it. It reads as a plain sentence
            rather than a label because that is the whole promise being made.
            See `lib/deadlineMath.ts` for what it opts out of. */}
        {/* 29-2d1: due before an event, the date then the event's — which
            takes the date box's place, and the Fixed switch's, since a linked
            date is fixed already (`EventLinkField`). */}
        <Labelled label="Deadline" icon="calendar-clock" {...need('deadline')}>
          <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
            {!linkedHere && (
              <Input
                type="datetime-local"
                value={draft.deadline}
                onChange={(e) => setField('deadline', e.target.value)}
              />
            )}
            <EventLinkField
              eventId={draft.eventId}
              deadline={draft.deadline}
              onChange={(link) => patch(link ? { eventId: link.eventId, deadline: link.deadline } : { eventId: '' })}
            />
            {!linkedHere && (
              <Switch
                size="sm"
                checked={draft.deadlineIsFixed}
                onChange={(v) => setField('deadlineIsFixed', v)}
                label={(
                  <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
                    Fixed date (never auto-reschedule)
                  </span>
                )}
              />
            )}
          </div>
        </Labelled>

        <Labelled label="Est. time" icon="clock" {...need('estimate')}>
          <EstimateField
            value={draft.estimatedTime}
            onChange={(v) => setField('estimatedTime', v)}
            subtitle={draft.title || task.title}
          />
        </Labelled>

        <Labelled label="Repeat" icon="repeat">
          <RecurrencePicker
            value={draft.recurrence}
            customRule={draft.recurrenceRule}
            onChange={(recurrence, customRule) => patch({ recurrence, recurrenceRule: customRule })}
            task={task}
          />
        </Labelled>
      </Group>

    </>
  );

  /*
   * ── Context: one wide pane under the columns ──────────────────────────────
   *
   * It was the bottom half of column 3, a tall stack of five fields beside two
   * short columns. His call (2026-10-06): *"make it horizontal as right now
   * it looks bad so lets use the space fully"* — so it spans the sheet, its
   * four fields side by side where there is room (List & project and Also
   * shown in are two cells: `ListLocationPicker`'s root is `display:
   * contents`), wrapping to two and one as the sheet narrows. Links went to
   * Optional and the three captions under these fields are gone, his call.
   */
  const context = (
    <Group title="Context" icon="share-2">
      <div
        style={{
          display: 'grid', gap: 'var(--gap-stack) var(--gap-card)', alignItems: 'start',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))',
        }}
      >
        <ListLocationPicker
          listId={draft.listId}
          sharedListIds={draft.sharedListIds}
          onListIdChange={(v) => setField('listId', v)}
          onSharedListIdsChange={(v) => setField('sharedListIds', v)}
        />

        {/* Dependencies (D2) — soft, warning-only prerequisites. */}
        <Labelled label="Depends on" icon="git-branch">
          <DependencyPicker
            taskId={task.id}
            value={draft.dependsOn}
            onChange={(v) => setField('dependsOn', v)}
          />
        </Labelled>

        <Labelled label="Assignee" icon="user-circle">
          <AssigneeField value={draft.assignee} onChange={(v) => setField('assignee', v)} />
        </Labelled>
      </div>
    </Group>
  );

  /* OPT-5 — under Context, closed. Value rides in it on this screen only (his
     call: "hide value too"); the Score screen keeps Value in its score pane.
     Links joined it on both screens. See `task-fields/OptionalSection.tsx`. */
  const optional = (
    <OptionalSection
      task={task}
      controller={{ draft, setField, toUpdates }}
      /* Read off the `task` prop and not the draft: the lock is a fact about
         the stored task and its prerequisites. The prop is a queue copy on
         the two call sites that open this from a session, so a task put into
         today with "Schedule anyway" carries its unlock in and is not
         refused — `taskLockReason` reads the flag straight off it. */
      lockReason={taskLockReason(backlogTasks, task)}
      open={optionalOpen}
      onToggle={() => setOptionalOpen((o) => !o)}
      blur={false}
      shareHint={(
        <>
          A live, read-only page anyone with the link can watch, plus an optional
          branded short link + QR.
        </>
      )}
      after={(
        <>
          {/* 29-1P9b (idea 155): a milestone sits on the project's line, behind
              its "40% done". What it waits on is its Depends on field. */}
          <Labelled
            label="Milestone"
            icon="flag-triangle-right"
            hint={<>Shows on the project&rsquo;s milestone line. It waits on what is under Depends on.</>}
          >
            <Switch
              size="sm"
              checked={draft.milestone}
              onChange={(v) => setField('milestone', v)}
              label={(
                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
                  A big step in this project
                </span>
              )}
            />
          </Labelled>
        </>
      )}
    >
      <Labelled
        label="Value (₹)"
        icon="indian-rupee"
        hint={<>Rolls up into this task&rsquo;s list and project totals.</>}
      >
        <Input
          type="number"
          inputMode="decimal"
          value={draft.valueINR}
          onChange={(e) => setField('valueINR', e.target.value)}
          placeholder="0"
          min={0}
          aria-label="Value in rupees"
          iconLeft={<span style={{ font: 'var(--type-numeric)' }}>₹</span>}
        />
      </Labelled>
    </OptionalSection>
  );

  return (
    <>
      <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

      <TaskSheet
        open={isPresent}
        onClose={handleClose}
        coverUrl={draft.imageUrl || undefined}
        header={header}
        columns={[theTwoJudgements, theWork, timing]}
        after={(
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--gap-card)' }}>
            {context}
            {optional}
            {/* 29-1P9c (idea 166): the task's story, closed under Optional (his pick B). */}
            <StorySection task={task} blur={false} />
          </div>
        )}
        footer={footer}
        label={draft.title || 'Task details'}
        zIndex={Z.modal}
        /* Idea 54 (29-1P6a): the sheet grows out of the task's row and goes
           back into it. Every task row already wears this marker for dust. */
        growFrom={dustSelector('task', task.id)}
        /* The other half of the presence bridge: hold this node in the tree
           until the sheet reports its dissolve has actually finished. This
           used to be a `setTimeout` on a duplicated copy of Dialog's exit
           duration — see UI-22. */
        onExited={safeToRemove ?? undefined}
        /* Escape belongs to `useOverlayDismiss` above, which answers only for
           the topmost overlay. See Dialog's port note 2. */
        closeOnEscape={false}
      />
    </>
  );
}
