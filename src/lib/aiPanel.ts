/**
 * The AI panel's words and its reading of a turn (BUILD-4).
 *
 * Pure: no store, no clock, no fetch — `now`, the timezone and the store's
 * arrays are arguments, so everything here is pinned in `aiPanel.test.ts`.
 * `lib/aiPanelRun.ts` is the half that talks to a model, and
 * `ui/overlay/AIPanel.tsx` is the half that draws.
 *
 * THE SUBJECT TRAVELS IN THE MESSAGE, AND THAT IS DELIBERATE
 * -----------------------------------------------------------
 * Atlas has no field for "this turn is about task t-42", and adding one is an
 * Atlas change while another session has `routes/chat.ts` open. So every
 * message the panel sends starts with one bracketed line naming the object,
 * its id and where it lives (`subjectPreface`). It is repeated on every turn
 * rather than only the first, because Atlas compacts long conversations and a
 * 4B model that has lost the first line has lost the whole point of the
 * panel. The line is honest about what it is: open one of these chats on the
 * full chat screen and the line is there, in his own message.
 *
 * WHAT THE PANEL SHOWS OF A TURN
 * ------------------------------
 * Writes, as `did` items — the chat screen's tool-result pattern, compacted.
 * Reads are not items: they are the name on the working pill while they run
 * (`AIPanel.prompt.md`: *"never a log and never a list of steps"*).
 *
 * THE SCORE SCREEN'S PANEL NEVER WRITES
 * -------------------------------------
 * Shreekant's call, 2026-09-16: an answer fills the field on screen and he
 * presses Save, exactly as if he had typed it. The model still reaches for
 * `update_task` — that is the tool it knows — and the call is **held** rather
 * than run (Atlas's Ask-first mode; a wrapped tool on the in-browser path).
 * `fillsFromHeldCall` turns the held arguments into a draft patch. Nothing
 * reaches the store until the screen's own Save.
 */
import type { Project, Task, TaskList } from '../store/useStore';
import { HUMAN_OVERRIDE_MAX } from '../store/useStore';
import { HUMAN_OVERRIDE_WORDS } from '../components/task-fields/scoreDisplay';
import { describeDate, parseStoredDate, resolveDateInput } from './agent/dates';
import { CHIP_ICON_NAMES, describeToolCall } from './agent/toolChip';
import { getTool } from './agent/tools';
import type { AgentToolCall, ToolArgs } from './agent/types';
import type { IconName } from '../ui/core/Icon';

// ─── The subject ────────────────────────────────────────────────────────────

export type PanelSubjectKind = 'task' | 'list' | 'project' | 'score';

/** What the panel is about. `score` is a task, asked about on `/scoring`. */
export interface PanelSubjectRef {
  kind: PanelSubjectKind;
  id: string;
}

export interface PanelSubject {
  ref: PanelSubjectRef;
  /** Uppercase mono line: the object's address. */
  kicker: string;
  title: string;
  /** One measured fact, mono. */
  meta?: string;
  icon: IconName;
  placeholder: string;
  /** Openers for the empty state. Three at most — this is not a menu. */
  prompts: string[];
  /** The empty state's one sentence: what this panel can do to this object. */
  scope: string;
  /** The bracketed line every message starts with. */
  preface: string;
  /** What the chat list calls this conversation on the laptop. */
  chatTitle: string;
}

/** One key per subject, so a panel reopened on the same object finds its exchange. */
export function subjectKey(ref: PanelSubjectRef): string {
  return `${ref.kind}:${ref.id}`;
}

export interface SubjectState {
  projects: Project[];
  taskLists: TaskList[];
  backlogTasks: Task[];
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** `90 min` — the board's own spelling (`project/derive.ts`'s `minutesLabel`). */
export function minutesText(minutes: number): string {
  return `${minutes} min`;
}

/** Straight quotes inside the preface would end the quoted name early. */
function quoted(name: string): string {
  return `"${name.replace(/"/g, "'")}"`;
}

function taskWhere(task: Task, state: SubjectState): { list?: TaskList; project?: Project } {
  const list = state.taskLists.find((l) => l.id === task.listId);
  const project = list?.projectId ? state.projects.find((p) => p.id === list.projectId) : undefined;
  return { list, project };
}

/**
 * `90 min · 14 Mar`. Short on purpose: it shares one line with the title in a
 * 404px column, and `AIPanel.prompt.md` says the title is the one thing that
 * must never be truncated away — a full `describeDate` cut it to six letters.
 */
function taskMeta(task: Task, timezone: string): string | undefined {
  const parts: string[] = [];
  if (task.estimatedTime) parts.push(minutesText(task.estimatedTime));
  const due = parseStoredDate(task.deadline, timezone);
  if (due) parts.push(new Intl.DateTimeFormat('en-GB', { timeZone: timezone, day: 'numeric', month: 'short' }).format(due));
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function taskPreface(task: Task, state: SubjectState): string {
  const { list, project } = taskWhere(task, state);
  const where = list
    ? project
      ? ` in the list ${quoted(list.title)} of the project ${quoted(project.name)}`
      : ` in the list ${quoted(list.title)}`
    : '';
  return `[About the task ${quoted(task.title)} — id ${task.id}${where}. "This task" means that one.]`;
}

/**
 * The subject, or `null` when the object is gone — deleted in another tab, or
 * by Atlas in the middle of the conversation. The host closes the panel then.
 */
export function buildSubject(ref: PanelSubjectRef, state: SubjectState, timezone: string): PanelSubject | null {
  if (ref.kind === 'task' || ref.kind === 'score') {
    const task = state.backlogTasks.find((t) => t.id === ref.id);
    if (!task) return null;
    const { list, project } = taskWhere(task, state);
    const address = [list?.title, project?.name].filter(Boolean).join(' · ');

    if (ref.kind === 'score') {
      return {
        ref,
        kicker: 'Scoring',
        title: task.title,
        meta: taskMeta(task, timezone),
        icon: 'award',
        placeholder: 'Answer, or type a number',
        prompts: [],
        scope:
          'Asks about what this task is still missing and fills the fields from your answers. Nothing is saved until you press Save.',
        preface: taskPreface(task, state),
        chatTitle: `Scoring · ${task.title}`,
      };
    }

    return {
      ref,
      kicker: address === '' ? 'Task' : `Task · ${address}`,
      title: task.title,
      meta: taskMeta(task, timezone),
      icon: 'circle-dot',
      placeholder: 'Ask about this task',
      prompts: [
        'Break this into steps',
        task.estimatedTime ? `Is ${minutesText(task.estimatedTime)} realistic?` : 'How long will this take?',
        'What is blocking it?',
      ],
      scope:
        'Asks about this one task. It can add steps, change the estimate or move the deadline, and every change has an Undo. Anything that cannot be undone waits for your tap.',
      preface: taskPreface(task, state),
      chatTitle: `Task · ${task.title}`,
    };
  }

  if (ref.kind === 'list') {
    const list = state.taskLists.find((l) => l.id === ref.id);
    if (!list) return null;
    const project = list.projectId ? state.projects.find((p) => p.id === list.projectId) : undefined;
    const open = state.backlogTasks.filter(
      (t) => !t.parent && t.status !== 'completed' && (t.listId === list.id || t.sharedListIds?.includes(list.id)),
    );
    const minutes = open.reduce((sum, t) => sum + (t.estimatedTime ?? 0), 0);
    return {
      ref,
      kicker: project ? `List · ${project.name}` : 'List',
      title: list.title,
      meta: [plural(open.length, 'open task'), minutes > 0 ? minutesText(minutes) : null].filter(Boolean).join(' · '),
      icon: 'list',
      placeholder: 'Ask about this list',
      prompts: ['What should I do first in here?', 'Which of these are overdue?', 'What is missing a deadline?'],
      scope:
        'Asks about this list and the tasks in it. Changes it makes have an Undo, and anything that cannot be undone waits for your tap.',
      preface:
        `[About the list ${quoted(list.title)} — id ${list.id}` +
        `${project ? `, in the project ${quoted(project.name)}` : ''}, with ${plural(open.length, 'open task')}. ` +
        '"This list" means that one.]',
      chatTitle: `List · ${list.title}`,
    };
  }

  const project = state.projects.find((p) => p.id === ref.id);
  if (!project) return null;
  const lists = state.taskLists.filter((l) => l.projectId === project.id);
  const listIds = new Set(lists.map((l) => l.id));
  const tasks = state.backlogTasks.filter(
    (t) => !t.parent && (listIds.has(t.listId ?? '') || (t.sharedListIds ?? []).some((id) => listIds.has(id))),
  );
  const open = tasks.filter((t) => t.status !== 'completed');
  return {
    ref,
    kicker: `Project · ${plural(lists.length, 'list')}`,
    title: project.name,
    meta: plural(open.length, 'open task'),
    icon: 'folder',
    placeholder: 'Ask about this project',
    prompts: ['What is left to do here?', 'What is most likely to slip?', 'Which tasks have no deadline?'],
    scope:
      'Asks about this project, its lists and their tasks. Changes it makes have an Undo, and anything that cannot be undone waits for your tap.',
    preface:
      `[About the project ${quoted(project.name)} — id ${project.id}` +
      `${lists.length > 0 ? `, with the lists ${lists.map((l) => quoted(l.title)).join(', ')}` : ''}. ` +
      '"This project" means that one.]',
    chatTitle: `Project · ${project.name}`,
  };
}

/** What actually goes to the model: the subject line, then what he typed. */
export function withPreface(subject: PanelSubject, text: string): string {
  return `${subject.preface}\n\n${text}`;
}

// ─── Scoring ────────────────────────────────────────────────────────────────

/** The four things the Score screen asks for, in the order it asks. */
export type ScoreField = 'score' | 'estimate' | 'deadline' | 'description';

const SCORE_FIELD_WORDS: Record<ScoreField, string> = {
  score: 'importance',
  estimate: 'estimate',
  deadline: 'deadline',
  description: 'description',
};

/** How each field is asked on the card (BUILD-16) — see `scoreKickoff`. */
const SCORE_FIELD_KINDS: Record<ScoreField, string> = {
  score: 'importance as kind scale',
  estimate: 'the estimate as kind one (15 min, 30 min, 1 h, 2 h or similar)',
  deadline: 'the deadline as kind one with four real dates',
  description: 'the description as kind text',
};

/** `missing` is `useTaskDraft`'s own shape, so the panel and the chips agree. */
export function missingScoreFields(missing: Record<ScoreField, boolean>): ScoreField[] {
  return (['score', 'estimate', 'deadline', 'description'] as const).filter((field) => missing[field]);
}

/**
 * The hidden first message on `/scoring`.
 *
 * The screen's mockup opens on a question, not on something he said, so this
 * is sent without being drawn. It names the four fields in the tool's own
 * argument names, because a 4B model mapping "importance" to `humanOverride`
 * on its own is the step it gets wrong.
 *
 * **BUILD-16: every missing field on one card**, his call (2026-09-24). It
 * used to ask one field at a time with four-option chips, and importance had
 * to be squeezed into "3 · Low … 9 · Critical" because the old card held four
 * buttons. Each field's kind is named so the model draws importance as the
 * 1–9 scale and the description as a typed answer.
 */
export function scoreKickoff(subject: PanelSubject, missing: ScoreField[]): string {
  const wanted = missing.length > 0 ? missing : (['score', 'estimate', 'deadline', 'description'] as ScoreField[]);
  return withPreface(
    subject,
    `Help me fill in this task by asking me questions. Still missing: ${wanted.map((f) => SCORE_FIELD_WORDS[f]).join(', ')}.\n` +
      `Ask about ALL of them at once, in one ask_questions call: ${wanted.map((f) => SCORE_FIELD_KINDS[f]).join('; ')}. ` +
      'Suggest an answer for each.\n' +
      `When I answer, record it with update_task on taskIds ["${subject.ref.id}"]: importance is humanOverride ` +
      `(a whole number, 0 = does not matter, ${HUMAN_OVERRIDE_MAX} = critical), the estimate is estimatedTime in minutes, ` +
      'the deadline is deadline, the description is description (one or two sentences). ' +
      // Measured: gemma wrote a catalog note about the task's location in
      // Ask-first mode, where Atlas's own `remember` is not held.
      'Change nothing else, touch no other task, and do not write notes about any of this.',
  );
}

/** The hidden nudge after a fill, while something is still missing. */
export function scoreContinue(subject: PanelSubject, missing: ScoreField[]): string {
  return withPreface(
    subject,
    `That is on my screen now; I will save it myself. Still missing: ${missing.map((f) => SCORE_FIELD_WORDS[f]).join(', ')}. ` +
      'Ask me about all of them, on one ask_questions card.',
  );
}

/** A subset of `TaskDraft`, spelled the way the draft holds it. */
export interface ScoreDraftPatch {
  humanOverride?: number;
  estimatedTime?: string;
  deadline?: string;
  description?: string;
}

export interface FilledRow {
  field: string;
  value: string;
}

function argInteger(args: ToolArgs, key: string, min: number, max: number): number | undefined {
  const raw = args[key];
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return undefined;
  const rounded = Math.round(n);
  return rounded >= min && rounded <= max ? rounded : undefined;
}

/**
 * A held `update_task`, read as fields on the Score screen.
 *
 * Validated as strictly as `readTaskFields` validates the same arguments —
 * a value the tool would have refused is not one the screen should show as
 * filled. A call about another task fills nothing: the panel is about this
 * one, and the draft on screen belongs to it.
 */
export function fillsFromHeldCall(
  call: { name: string; args: ToolArgs },
  taskId: string,
  now: Date,
  timezone: string,
): { patch: ScoreDraftPatch; filled: FilledRow[] } {
  const patch: ScoreDraftPatch = {};
  const filled: FilledRow[] = [];
  if (call.name !== 'update_task') return { patch, filled };

  const ids = call.args.taskIds;
  if (Array.isArray(ids) && ids.length > 0 && !ids.includes(taskId)) return { patch, filled };

  const importance = argInteger(call.args, 'humanOverride', 0, HUMAN_OVERRIDE_MAX);
  if (importance !== undefined) {
    patch.humanOverride = importance;
    filled.push({ field: 'Importance', value: `${importance} · ${HUMAN_OVERRIDE_WORDS[importance]}` });
  }

  const minutes = argInteger(call.args, 'estimatedTime', 1, 10_080);
  if (minutes !== undefined) {
    patch.estimatedTime = String(minutes);
    filled.push({ field: 'Estimate', value: minutesText(minutes) });
  }

  if (typeof call.args.deadline === 'string' && call.args.deadline.trim() !== '') {
    const resolved = resolveDateInput(call.args.deadline, now, timezone);
    if (resolved.ok) {
      patch.deadline = resolved.value;
      filled.push({ field: 'Deadline', value: describeDate(resolved.value, timezone) });
    }
  }

  if (typeof call.args.description === 'string' && call.args.description.trim() !== '') {
    patch.description = call.args.description.trim();
    filled.push({ field: 'Description', value: patch.description });
  }

  return { patch, filled };
}

/** Which of the four a patch settled. */
export function fieldsInPatch(patch: ScoreDraftPatch): ScoreField[] {
  const out: ScoreField[] = [];
  if (patch.humanOverride !== undefined) out.push('score');
  if (patch.estimatedTime !== undefined) out.push('estimate');
  if (patch.deadline !== undefined) out.push('deadline');
  if (patch.description !== undefined) out.push('description');
  return out;
}

// ─── A turn, as items ───────────────────────────────────────────────────────

export interface PanelRow {
  label: string;
  meta?: string;
}

/** A write, as the panel states it. `null` for a read, which is not an item. */
export interface DidSummary {
  tool: string;
  icon: IconName;
  count?: string;
  rows: PanelRow[];
  ok: boolean;
}

export function isWrite(name: string): boolean {
  return getTool(name)?.mutates ?? false;
}

export function didFromToolCall(call: AgentToolCall, timezone: string, now: Date): DidSummary | null {
  if (!isWrite(call.name)) return null;
  const chip = describeToolCall(call, timezone, now);
  if (!call.ok) {
    return { tool: call.name, icon: 'circle-alert', count: 'not done', rows: [{ label: call.summary }], ok: false };
  }
  return {
    tool: call.name,
    icon: CHIP_ICON_NAMES[chip.icon] as IconName,
    rows: [{ label: chip.subject ?? `${chip.verb}`, meta: chip.detail }],
    ok: true,
  };
}

/**
 * The panel draws plain text (`AIPanel.prompt.md`: *"No markdown"*), and a
 * model writes some anyway. The marks come off; the words stay.
 */
export function plainText(text: string): string {
  return text
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    // `[ \t]`, never `\s`: with `m` a `\s*` at the start of a line eats the
    // blank line above it, and the paragraphs run together.
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*[*+-][ \t]+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
