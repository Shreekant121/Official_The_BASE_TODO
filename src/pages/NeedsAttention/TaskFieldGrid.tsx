/**
 * Score — the body: what moves the number, and what doesn't (UI-30).
 *
 * RECONCILED against `screens/scoring.html:1029`, whose two columns are the
 * screen's whole argument and which UI-9 did not have. It was a 12-column card
 * grid of five equal panes — Essentials, Priority score, Organize, Advanced,
 * Subtasks — with no statement anywhere about which of them the score is made
 * of. The source is emphatic: **one heavy pane on the left holding the five
 * inputs that decide the number, and everything else folded into collapsible
 * sections on the right.**
 *
 * **THE DATES AND THE ESTIMATE MOVED.** They were in "Essentials", filed as
 * facts about the task. The source puts them in the score pane with a comment
 * saying why — *"Dates live HERE, not under Essentials: they are what the
 * Deadline factor is computed from"* — and the same is true of the estimate
 * and the duration factor. Each now carries the points it is currently worth
 * beside its label and a sentence under it saying what it did to the number,
 * both derived, never typed. That is `TaskSheet.prompt.md`'s rule reaching
 * this screen: *"Never add an input for a number the product can work out."*
 *
 * **The pane heading is the source's copy, and item 16 stopped it counting.**
 * The source reads *"What decides the score. Five inputs. Nothing else
 * counts."*; ours said four after item 7 merged the Eisenhower quadrant and
 * the personal score onto one dial. The engine now has **seven** variables and
 * only ONE of them is an input at all — Importance. The rest are derived from
 * the deadline, the estimate, the dependency graph and what you have done, so
 * a count of "inputs" beside a pane holding one control was going to be wrong
 * at every number. It says what the pane *holds* instead — the judgement, and
 * the fields the other six are computed from — and the `Instrument` beside it
 * does the counting. It deliberately does not say "everything else is
 * derived": the Importance hint four lines below says exactly that, and the
 * two sit close enough together to read as one sentence stuttering.
 *
 * **Avoided is a reading, not a switch.** The source gives it a `Switch` and
 * calls it Quasi-need. In this app `avoidedCount` is never typed — Focus
 * Mode's defer accumulates it — so an input for it would be asking for a
 * number the product works out, which is the rule two paragraphs up. UI-26
 * settled exactly this for the task sheet. It states the running count and
 * where it came from.
 *
 * **Item 17 gave the field one name and a ceiling.** The settled decisions
 * table has always called it *Avoided*, the factor bar calls it Avoided, and
 * this pane was the last place still saying "Quasi-need" — one field with two
 * names on two screens showing the same score. The counter also saturates now
 * at `AVOIDED_MAX`, which is what lets this well and the `+5 /5` beside it in
 * the bar be the same number rather than two readings of one deferral count.
 *
 * **FIX-4 PUT THE EMERGENCY DIAL ON THIS SCREEN, AND IT MOVED TWO SENTENCES.**
 * The pane held one control and offered no way to set the field that most
 * moves the number: `EmergencyPicker` existed and was wired into the task
 * sheet alone, so the one screen whose entire job is scoring a task could not
 * declare an emergency on it. It is the sheet's control, imported — not a
 * second one built here, and deliberately not `emergencyMenu`, whose own
 * header explains why a menu cannot hold a trough.
 *
 * The two sentences: the pane's caption said *"the one judgement, and the
 * fields the other six come from"* and the Importance hint said *"the only
 * subjective input. Everything else is derived."* Both were true of a pane
 * with one control and neither survives a second one — Emergency is set, not
 * derived, and it is one of the seven. The caption counts what is actually
 * there now and the hint names the single exception, which keeps the division
 * of labour this header already describes: the caption says what the pane
 * holds, the hint carries "everything else is derived", and the `Instrument`
 * beside them does the counting.
 *
 * **`Section` is `task-fields/CollapsibleSection.tsx` since OPT-5**, moved
 * out so the task sheet's Optional section is the same pane. Its header says
 * what came across from the source and why a closed body stays mounted.
 *
 * **OPT-5 added an Optional section at the end (2026-10-06, his call)** —
 * Start date, Reminder, Status, Links and Share, closed every time a task
 * comes up (Links left Organize for it in a follow-up, his call).
 * It is the task sheet's own (`task-fields/OptionalSection.tsx`). Start date
 * left the score pane for it, Status left Essentials and Reminder left
 * Advanced. **Share is on this screen for the first time**: it was kept off
 * because it publishes at once while every other field here waits for Save,
 * and he asked for it anyway; its hint says so.
 *
 * **`StatusPills` stays; the source's `SegmentedControl` does not.**
 * `readme.md`'s component-selection rules put `SegmentedControl` on *modes*
 * ("Daily / Weekly / Monthly"), and UI-29 leaned on exactly that line when it
 * ported the control for Board / List. A task's status is a value on the
 * object, not a mode of the screen, and `StatusPills` is built out of
 * `StatusPill` so the three states read the same here as everywhere else the
 * app shows them. The documented rule wins over the prototype.
 *
 * **Subtasks is a fourth section, and the source has no equivalent.** Its
 * `Section` list is Essentials / Organize / Advanced, because its own subtask
 * editor lives on the task sheet. This screen is a merge of the task card and
 * has to carry them.
 */
import {
  Chip, Input, Switch, Textarea, WarnLine, Well,
} from '../../ui';
import {
  countSubtasksRecursive, emergencyBoostOf, useStore, AVOIDED_MAX, type Task,
} from '../../store/useStore';
import { usePriorityScores } from '../../store/usePriorityScores';
import { hasEmergencyLapsed } from '../../lib/priority';
import { describeRecurrenceRule, resolveRule } from '../../lib/recurrence';
import AssigneeField from '../../components/task-fields/AssigneeField';
import CoverImageField from '../../components/task-fields/CoverImageField';
import DependencyPicker from '../../components/task-fields/DependencyPicker';
import EmergencyPicker from '../../components/task-fields/EmergencyPicker';
import { emergencyCrowdNote } from '../../components/task-fields/emergencyMenu';
import EstimateField from '../../components/task-fields/EstimateField';
import ListLocationPicker from '../../components/task-fields/ListLocationPicker';
import HumanOverridePicker from '../../components/task-fields/HumanOverridePicker';
import RecurrencePicker from '../../components/task-fields/RecurrencePicker';
import SubtaskTree from '../../components/task-fields/SubtaskTree';
import { Labelled, Points } from '../../components/task-fields/Labelled';
import { CollapsibleSection as Section } from '../../components/task-fields/CollapsibleSection';
import { OptionalSection } from '../../components/task-fields/OptionalSection';
import { StepPercent } from '../../components/task-fields/StepPercent';
import { deadlineReading, durationReading, type ScoreReading } from '../../components/task-fields/scoreReadings';
import { HUMAN_OVERRIDE_WORDS } from '../../components/task-fields/scoreDisplay';
import type { NeedId } from '../../components/task-fields/needs';
import type { TaskDraftController } from '../../components/task-fields/useTaskDraft';

/** The source's own quick picks, in minutes. */
const QUICK_ESTIMATES = [15, 30, 60, 90, 120];

export type SectionId = 'essentials' | 'organize' | 'advanced' | 'subtasks' | 'optional';

// ── The body ───────────────────────────────────────────────────────────────

interface TaskFieldGridProps {
  task: Task;
  controller: TaskDraftController;
  reading: ScoreReading;
  wide: boolean;
  /** Pinned at mount by the page, so the deadline phrase cannot drift mid-session. */
  now: number;
  open: Record<SectionId, boolean>;
  onToggleSection: (id: SectionId) => void;
  /** `flash` + `needId` for the field a Needs chip points at. */
  need: (id: NeedId) => { flash: boolean; needId: NeedId };
  /**
   * Item 19 — why this task cannot be marked Done, or absent. Straight through
   * to `StatusPills`, which is where the refusal is expressed; this screen and
   * the task sheet render the same control and so refuse in the same words.
   */
  lockReason?: string;
}

export default function TaskFieldGrid({
  task, controller, reading, wide, now, open, onToggleSection, need, lockReason,
}: TaskFieldGridProps) {
  const { draft, setField, patch, scoreInput } = controller;
  const subtaskCounts = countSubtasksRecursive(draft.subtasks);

  /* The Emergency flag — the second manual input, and the only control on this
     screen that does not wait for Save. See `EmergencyPicker`'s header.

     The level is read live off the store rather than off the `task` prop, which
     is that header's own instruction to its callers. Here the prop happens to
     be live already (the page resolves it out of `backlogTasks` every render),
     so this is belt and braces rather than a fix — but the sheet's copy of this
     field reads it this way, the two have to agree, and a future caller holding
     a snapshot would otherwise see the control ignore its own press.

     `usePriorityScores()` is called again here rather than threaded down from
     the page: it is module-memoised and hands every caller the same object, and
     its own header says so. The count is therefore the same one the task sheet
     and the row menu print. */
  const setEmergencyBoost = useStore((s) => s.setEmergencyBoost);
  const emergencyLevel = useStore((s) => emergencyBoostOf(s.backlogTasks, task.id));
  const scores = usePriorityScores();
  /* Measured against the DRAFT's deadline, like the sheet's: the date field is
     four inches up this same pane, so moving it has to say straight away
     whether the flag comes back to life. */
  const emergencyLapsed =
    emergencyLevel > 0
    && hasEmergencyLapsed({ deadline: draft.deadline || undefined, originalDeadline: task.originalDeadline }, now);
  const emergencyNote = emergencyCrowdNote(scores.emergencyCount, emergencyLapsed);
  const emergencyPoints = reading.factors.find((f) => f.key === 'emergency')?.value ?? 0;

  const deadline = deadlineReading(draft.deadline, now);
  const deadlinePoints = reading.factors.find((f) => f.key === 'deadline')?.value ?? 0;
  /* No penalty branch any more — item 16's Duration variable runs 0…1 and
     never subtracts, so the factor is simply the factor. */
  const durationFactor = reading.factors.find((f) => f.key === 'duration')?.value ?? 0;
  const quasi = task.avoidedCount ?? 0;

  const repeat = resolveRule({ recurrence: draft.recurrence, recurrenceRule: draft.recurrenceRule });

  return (
    <div
      style={{
        display: 'grid', gap: 'var(--gap-card)', alignItems: 'start',
        gridTemplateColumns: wide ? 'minmax(0, 1.35fr) minmax(0, 1fr)' : '1fr',
      }}
    >
      {/* ══ What decides the score ══════════════════════════════════════ */}
      <div
        style={{
          display: 'grid', gap: 'var(--sp-9)',
          padding: 'var(--pad-card-lg)', borderRadius: 'var(--r-card-lg)',
          backgroundImage: 'var(--glass-fill-2)',
          backdropFilter: 'var(--glass-bd-md)',
          WebkitBackdropFilter: 'var(--glass-bd-md)',
          boxShadow: 'var(--glass-shadow-pane)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
          <h2
            style={{
              font: 'var(--type-title)', fontSize: 'var(--text-xl)',
              letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)',
            }}
          >
            What decides the score
          </h2>
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
            The two you set, and the fields the other five come from.
          </span>
        </div>

        <Labelled
          icon="star"
          label="Importance"
          hint="The one judgement. Everything but the flag below is derived from a field."
          right={(
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
                {draft.humanOverride !== undefined
                  ? HUMAN_OVERRIDE_WORDS[draft.humanOverride]
                  : 'Not set'}
              </span>
              <Points value={draft.humanOverride ?? 0} />
            </span>
          )}
          {...need('score')}
        >
          <HumanOverridePicker
            value={draft.humanOverride}
            onChange={(v) => setField('humanOverride', v)}
          />
        </Labelled>

        {/* The second manual input, and the last one — the same control the task
            sheet carries, not a second expression of it. It sits directly under
            Importance because the two are one question asked twice ("how much
            does this matter" / "is this on fire") and `EmergencyPicker` is built
            to `HumanOverridePicker`'s geometry for exactly that reason; a screen
            that put them apart would be saying they were different kinds of
            control. Uncompacted here, where Importance is too.

            It writes straight through while every other field on this page is
            staged — which is the decision `EmergencyPicker`'s header makes and
            not a leak in this page's "nothing saved until you say so" promise:
            `isDirty` never sees it, so Save is not armed by pressing it. */}
        <Labelled
          icon="zap"
          label="Emergency (0–5)"
          right={emergencyLevel > 0 ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
              <span style={{ color: emergencyLapsed ? 'var(--fg-4)' : 'var(--job-coral-tag-fg)' }}>
                {emergencyLapsed ? 'lapsed' : 'live'}
              </span>
              <Points value={emergencyPoints} />
            </span>
          ) : undefined}
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
          />
        </Labelled>

        {/* The deadline lives HERE, not under Essentials: it is what the
            Deadline factor is computed from. The start date sat beside it
            until OPT-5 filed it under Optional, at his word. */}
        <Labelled
          icon="calendar-clock"
          label="Deadline"
          right={<Points value={deadlinePoints} tone={deadline.urgent ? 'var(--job-coral-tag-fg)' : undefined} />}
          hint={`${deadline.phrase} — the Deadline factor is derived from this.`}
          {...need('deadline')}
        >
          <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
            <Input
              type="datetime-local"
              value={draft.deadline}
              onChange={(e) => setField('deadline', e.target.value)}
              aria-label="Deadline"
            />
            {/* Item 18's opt-out, in the same place it sits on the task
                sheet: inside the deadline field, because it is a property
                of this date rather than a separate question. This screen
                exists to fill in what is missing, and a task whose date
                must not move is a fact about it that is just as missing. */}
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
          </div>
        </Labelled>

        <div
          style={{
            display: 'grid', gap: 'var(--gap-stack)',
            gridTemplateColumns: wide ? '1fr 1fr' : '1fr',
          }}
        >
          <Labelled
            icon="clock"
            label="Estimate"
            right={durationFactor !== 0 ? <Points value={durationFactor} tone="var(--fg-3)" /> : undefined}
            hint={durationReading(scoreInput)}
            {...need('estimate')}
          >
            <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
              <EstimateField
                value={draft.estimatedTime}
                onChange={(v) => setField('estimatedTime', v)}
                subtitle={draft.title || task.title}
              />
              <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
                {QUICK_ESTIMATES.map((m) => (
                  <Chip
                    key={m}
                    onClick={() => setField('estimatedTime', String(m))}
                    active={Number(draft.estimatedTime) === m}
                  >
                    {m}m
                  </Chip>
                ))}
              </div>
            </div>
          </Labelled>

          <div style={{ display: 'grid', gap: 'var(--gap-stack)', alignContent: 'start' }}>
            <Labelled
              icon="indian-rupee"
              label="Value"
              hint="Rolls up into this task’s list and project totals."
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

            {/* The fifth input, which is not an input. See the file header. */}
            <Well
              pad="var(--sp-4) var(--sp-6)"
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minHeight: 60 }}
            >
              <div style={{ display: 'grid', gap: 2, flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
                    font: 'var(--type-label)', color: 'var(--fg-1)',
                  }}
                >
                  Avoided
                  <Points value={quasi} tone={quasi ? 'var(--fg-1)' : 'var(--fg-4)'} />
                </span>
                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
                  {quasi >= AVOIDED_MAX
                    ? `Deferred ${quasi} times in Focus Mode — the counter stops here.`
                    : quasi > 0
                      ? `Deferred ${quasi} time${quasi === 1 ? '' : 's'} in Focus Mode.`
                      : 'Counts up each time you defer this in Focus Mode.'}
                </span>
              </div>
            </Well>
          </div>
        </div>
      </div>

      {/* ══ Everything else ═════════════════════════════════════════════ */}
      <div style={{ display: 'grid', gap: 'var(--sp-5)', alignContent: 'start' }}>
        <Section
          icon="align-left"
          title="Essentials"
          hint="Description"
          need={controller.missing.description ? 1 : 0}
          open={open.essentials}
          onToggle={() => onToggleSection('essentials')}
        >
          <Labelled
            icon="text"
            label="Description"
            hint="What actually needs doing, and why."
            {...need('description')}
          >
            <Textarea
              value={draft.description}
              onChange={(e) => setField('description', e.target.value)}
              rows={3}
              aria-label="Description"
              placeholder="One or two lines. What has to be true when it’s done."
            />
          </Labelled>
        </Section>

        <Section
          icon="share-2"
          title="Organize"
          hint={`Where it lives, who owns it${draft.dependsOn.length > 0 ? ' · blocked' : ''}`}
          open={open.organize}
          onToggle={() => onToggleSection('organize')}
        >
          <ListLocationPicker
            listId={draft.listId}
            sharedListIds={draft.sharedListIds}
            onListIdChange={(v) => setField('listId', v)}
            onSharedListIdsChange={(v) => setField('sharedListIds', v)}
          />

          <Labelled icon="git-branch" label="Depends on">
            <DependencyPicker
              taskId={task.id}
              value={draft.dependsOn}
              onChange={(v) => setField('dependsOn', v)}
            />
          </Labelled>

          <Labelled icon="user-circle" label="Assignee">
            <AssigneeField value={draft.assignee} onChange={(v) => setField('assignee', v)} />
          </Labelled>
        </Section>

        <Section
          icon="sliders-horizontal"
          title="Advanced"
          hint={repeat ? describeRecurrenceRule(repeat) : 'No repeat'}
          open={open.advanced}
          onToggle={() => onToggleSection('advanced')}
        >
          <Labelled icon="repeat" label="Repeat">
            <RecurrencePicker
              value={draft.recurrence}
              customRule={draft.recurrenceRule}
              onChange={(recurrence, customRule) => patch({ recurrence, recurrenceRule: customRule })}
              task={task}
            />
          </Labelled>

          <Labelled icon="image" label="Cover">
            <CoverImageField value={draft.imageUrl} onChange={(v) => setField('imageUrl', v)} />
          </Labelled>

        </Section>

        <Section
          icon="corner-down-right"
          title="Subtasks"
          hint={subtaskCounts.total > 0
            ? `${subtaskCounts.done} of ${subtaskCounts.total} done`
            : 'Break it down as far as you need'}
          open={open.subtasks}
          onToggle={() => onToggleSection('subtasks')}
          /* UI-9 put a `ProgressRing` here so the section reads its own state
             without being opened; 29-1P9c made it the number, "40%" in
             white, as on the task sheet (his call). */
          right={subtaskCounts.total > 0 ? (
            <StepPercent done={subtaskCounts.done} total={subtaskCounts.total} />
          ) : undefined}
        >
          <SubtaskTree value={draft.subtasks} onChange={(v) => setField('subtasks', v)} />
        </Section>

        <OptionalSection
          task={task}
          controller={controller}
          lockReason={lockReason}
          open={open.optional}
          onToggle={() => onToggleSection('optional')}
          shareHint={(
            <>
              A live, read-only page anyone with the link can watch. Unlike the rest of this
              page, it publishes the moment you press it, not on Save.
            </>
          )}
        />
      </div>
    </div>
  );
}
