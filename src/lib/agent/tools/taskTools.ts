import { SUBTASK_PROXY_FIELDS, HUMAN_OVERRIDE_MAX, EMERGENCY_MAX, getBlockingTasks } from '../../../store/useStore';
import type { Project, Subtask, Task, TaskLink, TaskList, TaskStatus } from '../../../store/useStore';
import type { TaskLocation } from '../../../store/useSnapshotStore';
import { describeRecurrenceRule, formatRRule, parseRRule } from '../../recurrence';
import { describeDate, isOverdue, resolveDateInput, DEFAULT_DEADLINE_HOUR } from '../dates';
import {
  defineTool,
  optionalBoolean,
  optionalEnum,
  optionalNumber,
  optionalObjectArray,
  optionalString,
  optionalStringArray,
  requiredRecordArray,
  requiredString,
  requiredStringArray,
  ToolArgError,
} from '../toolKit';
import { batchResult, missingIdReason, runBatch, titleList } from './batch';
import { useEventStore } from '../../../store/useEventStore';
import { linkedDeadline } from '../../events/eventLinks';
import { buildProjectTree, flattenProjectTree } from '../../projectTree';
import { ignoredWorkOf } from '../../ignoredWork';
import type { AgentStoreState, JsonSchema, ToolArgs, ToolContext, ToolDef, ToolResult } from '../types';

/**
 * Wave 1 — the five tools the orchestrator keeps inline because they are ~90%
 * of usage and have to answer in about two seconds (decision D4).
 *
 * Two things every one of them obeys:
 * - `search_tasks` returns compact rows only. Full task objects carry
 *   descriptions, links and whole subtask trees; twenty of those would
 *   cost more context than the rest of the turn put together (D5).
 * - Anything that writes captures a snapshot of what it is about to touch
 *   first, so one click undoes the turn (D6).
 *
 * There is no `delete_task` here and there never will be — decision D3.
 */

/** Decision D5 accepts a search round trip; it does not accept an unbounded result set. */
export const SEARCH_RESULT_CAP = 20;

/**
 * ITEM 13D — HOW MANY THINGS ONE CALL MAY ACT ON.
 *
 * Shared by every batching tool in every file here, because a surface where
 * `complete_task` takes fifty and `delete_task` takes twenty is one more thing
 * the model has to remember correctly.
 *
 * Fifty is well past anything Shreekant would say in one sentence — his whole
 * board is 48 tasks — so in practice it is not a limit he meets; it is the
 * ceiling that stops a model looping a generated list into a single
 * catastrophic call. Exceeding it is an error rather than a silent truncation:
 * acting on the first fifty of eighty and reporting success is the failure
 * this layer is written against.
 */
export const BATCH_CAP = 50;

/** `DEFAULT_LISTS[0]` in `useStore`. Where a task goes when no list was named. */
const DEFAULT_LIST_ID = 'action';
const DEFAULT_LIST_TITLE = 'Action Steps';

export interface CompactTaskRow {
  id: string;
  title: string;
  status: TaskStatus;
  deadline?: string;
  listName: string;
  /**
   * ITEM 13C — THE ROW SAYS WHICH PROJECT, NOT ONLY WHICH LIST
   *
   * Shreekant's results read *"Self Care"* and *"Marketing"* — list names —
   * so the project a task belongs to never reached him at all. He asked for
   * title, status, deadline and project; the list stays too, because his
   * lists are what he actually named. Absent when the list is in no project.
   */
  projectName?: string;
  /**
   * BIG-3 — present, and only ever `true`, on work he has set aside from the
   * score: the task, its list or a project above it is ignored. Absent on
   * everything else, so the ordinary row costs no extra tokens.
   */
  ignored?: true;
  /** 29-2d1: the event it is due before, by name. Absent on everything else. */
  dueBefore?: string;
}

export interface LocatedTask {
  location: TaskLocation;
  task: Task | Subtask;
  /** The top-level task owning it, when `location` is `'subtask'`. */
  rootTask?: Task;
}

// ─── Lookup helpers (shared with queueTools) ────────────────────────────────

export function listTitleFor(state: AgentStoreState, listId?: string, fallback?: string): string {
  if (!listId) return fallback ?? '';
  return state.taskLists.find((l) => l.id === listId)?.title ?? fallback ?? '';
}

/** Resolves a list by id first, then by case-insensitive title — the model sees names, not ids. */
export function resolveList(state: AgentStoreState, ref: string): TaskList | undefined {
  const needle = ref.trim().toLowerCase();
  return (
    state.taskLists.find((l) => l.id === ref) ??
    state.taskLists.find((l) => l.title.toLowerCase() === needle) ??
    state.taskLists.find((l) => l.title.toLowerCase().includes(needle))
  );
}

export function resolveProject(state: AgentStoreState, ref: string): Project | undefined {
  const needle = ref.trim().toLowerCase();
  return (
    state.projects.find((p) => p.id === ref) ??
    state.projects.find((p) => p.name.toLowerCase() === needle) ??
    state.projects.find((p) => p.name.toLowerCase().includes(needle))
  );
}

function findSubtask(tasks: Task[], id: string): { subtask: Subtask; rootTask: Task } | undefined {
  const walk = (subs: Subtask[]): Subtask | undefined => {
    for (const sub of subs) {
      if (sub.id === id) return sub;
      const nested = sub.subtasks && sub.subtasks.length > 0 ? walk(sub.subtasks) : undefined;
      if (nested) return nested;
    }
    return undefined;
  };
  for (const rootTask of tasks) {
    const subtask = walk(rootTask.subtasks ?? []);
    if (subtask) return { subtask, rootTask };
  }
  return undefined;
}

/**
 * Same search order as `useSnapshotStore.locateTask`, so a tool and its
 * snapshot always agree on which of the three places an id names.
 */
export function findTaskAnywhere(state: AgentStoreState, id: string): LocatedTask | undefined {
  const backlog = state.backlogTasks.find((t) => t.id === id);
  if (backlog) return { location: 'backlog', task: backlog };
  const nested = findSubtask(state.backlogTasks, id);
  if (nested) return { location: 'subtask', task: nested.subtask, rootTask: nested.rootTask };
  const queued = state.tasks.find((t) => t.id === id);
  if (queued) return { location: 'focusQueue', task: queued };
  return undefined;
}

/** The project owning a list, by list id. `undefined` for a list filed under none. */
export function projectNameFor(state: AgentStoreState, listId?: string): string | undefined {
  if (!listId) return undefined;
  const list = state.taskLists.find((l) => l.id === listId);
  if (!list?.projectId) return undefined;
  return state.projects.find((p) => p.id === list.projectId)?.name;
}

export function compactRow(state: AgentStoreState, task: Task | Subtask, listId?: string, listName?: string): CompactTaskRow {
  const asTask = task as Task;
  const resolvedListId = listId ?? asTask.listId;
  const ignored = ignoredWorkOf(state.backlogTasks, state.taskLists, state.projects)
    .has({ id: task.id, listId: resolvedListId });
  return {
    id: task.id,
    title: task.title,
    status: task.status ?? 'needsAction',
    deadline: task.deadline,
    listName: listTitleFor(state, resolvedListId, listName ?? asTask.listName),
    projectName: projectNameFor(state, resolvedListId),
    ...(ignored ? { ignored: true as const } : {}),
    ...(asTask.eventId ? { dueBefore: eventTitle(asTask.eventId) } : {}),
  };
}

/** 29-2d1: an event's name for a task row; `undefined` when it has gone. */
function eventTitle(eventId: string): string | undefined {
  return useEventStore.getState().events.find((e) => e.id === eventId)?.title;
}

/**
 * ITEM 13C — THE ID MOVED OUT OF THE SENTENCE AND INTO THE DATA
 *
 * A failed call renders its `summary` straight onto the transcript as the
 * chip's detail line (`ChatPage.tsx`'s `ToolChipRow`), so an id quoted here
 * was an id on Shreekant's screen. It is still in `data`, which is sent to the
 * model with the summary — the model needs to know which id it got wrong, and
 * he does not.
 */
export function notFound(id: string): ToolResult {
  return {
    ok: false,
    summary:
      'No task with that id. Ids come from search_tasks, list_all_tasks, or a task you just created — do not guess ' +
      'one, and do not repeat it back to the user.',
    data: { taskId: id },
  };
}

// ─── Fuzzy matching ─────────────────────────────────────────────────

/**
 * Below this, a match is noise rather than a weak hit, and `search_tasks`
 * drops it. 35 is not a taste: it is exactly `hits / tokens === 0.5` in the
 * partial tier below, so the rule it encodes is **at least half the words you
 * typed have to actually appear**. One word out of three (31.67) does not.
 *
 * The cut lives in the caller and not in `fuzzyScore`, so a future caller that
 * wants everything ranked can still have it.
 */
export const SEARCH_SCORE_FLOOR = 35;

/**
 * ITEM 14 — THE DISAMBIGUATION THE TOOL CAN DO FOR ITSELF.
 *
 * Four tasks are called exactly "Solve Question Bank", one per subject, and
 * telling the model they are identical is what stopped it completing all four
 * (`t2`). But *"mark the question bank **for maths** as done"* is not
 * ambiguous — Shreekant said which one — and the note sent `gemma4:e4b` to
 * `ask_choice` anyway, three runs of three, asking him a question he had
 * already answered. Telling it in prose to "pick using whatever else he said"
 * did not help: the model had `APPLIED ENGINEERING MATHEMATICS – II` on the
 * screen in front of it and still asked.
 *
 * So the tool does the matching rather than describing it. A word of his query
 * that is not part of the shared title, and that points at exactly one of the
 * twins' containers, IS the answer, and the result says so by name.
 *
 * **The comparison is a four-character common prefix, and that is not laziness
 * — it is the case this exists for.** "maths" is not a prefix of "mathematics"
 * and "mathematics" is not a prefix of "maths"; they share "math". Nothing
 * softer than that matches the way he actually types, and four is enough to
 * keep it honest: "logic" finds LOGIC DEVELOPMENT, "elec" finds ELECTRICAL,
 * and nothing three letters long is allowed to decide anything.
 *
 * It reports **only when exactly one twin matches**. Two matches is a real
 * ambiguity and falls back to asking; zero is the `t2` case, which is what the
 * note was written for in the first place.
 */
export function singleOutTwin(twins: CompactTaskRow[], query: string): { row: CompactTaskRow; word: string } | null {
  const words = (value: string): string[] =>
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((word) => word.length >= 4);

  /* The shared title's own words cannot distinguish anything — every twin has
     them — so they are removed before anything is compared. */
  const titleWords = new Set(words(twins[0].title));
  const asked = words(query).filter((word) => !titleWords.has(word));

  const shares = (a: string, b: string): boolean => {
    const span = Math.min(a.length, b.length, 8);
    return span >= 4 && a.slice(0, span) === b.slice(0, span) ? true : a.slice(0, 4) === b.slice(0, 4);
  };

  for (const word of asked) {
    const hits = twins.filter((row) =>
      words(`${row.listName ?? ''} ${row.projectName ?? ''}`).some((candidate) => shares(word, candidate)),
    );
    if (hits.length === 1) return { row: hits[0], word };
  }
  return null;
}

/**
 * What a match on the containing list or project is worth, against a match on
 * the task's own title.
 *
 * 0.6 is chosen so the tiers stay ordered rather than to feel about right: an
 * exact project name lands at 60, which is **below** a title that contains the
 * query outright (70) and above a title that only shares half its words (35).
 * So "Mutineer" surfaces the Mutineer project's tasks, and a task actually
 * called "Mutineer costume" still comes first.
 */
const CONTEXT_MATCH_WEIGHT = 0.6;

/**
 * Words that carry no search intent on their own. Dropped from a multi-word
 * query so *"the CA thing"* is judged on `ca` and `thing` rather than credited
 * for the `the` that half his titles contain. Never dropped when they are all
 * the query has — someone who typed only "the" gets to try.
 */
const NOISE_TOKENS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'for', 'from', 'in', 'is', 'it',
  'me', 'my', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'with',
]);

/** Letters and digits are inside a word; everything else is a gap between two. */
const WORD_CHAR = /[a-z0-9]/;

/**
 * Does `token` begin a word inside `haystack`?
 *
 * THIS PREDICATE IS THE WHOLE OF FAULT 1 (item 13C)
 * --------------------------------------------------
 * Every tier used to ask `haystack.includes(token)`, which matches anywhere at
 * all. Measured against Shreekant's real board on 2026-09-05, the query
 * *"Level Ai"* returned five tasks and **every one matched on the `ai` buried
 * inside another word** — *Oil H·ai·r*, *Remove Body h·ai·r*, *Get w·ai·tlist*
 * and *Send 30 em·ai·ls* twice. Five results, zero real matches — while the
 * shorter *"Level"* returned nothing at all. Adding a word made the search
 * worse.
 *
 * A word *start* rather than a whole word is the right boundary, so a prefix
 * still hits the way anyone typing into a search box expects: `web` finds
 * "Maintain the website", and `ai` does not find "hair".
 */
function startsAWord(haystack: string, token: string): boolean {
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(token, from);
    if (at === -1) return false;
    if (at === 0 || !WORD_CHAR.test(haystack[at - 1])) return true;
    from = at + 1;
  }
}

/** Lowercased with runs of whitespace collapsed, so a pasted title still matches. */
function normalizeForMatch(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function meaningfulTokens(needle: string): string[] {
  const tokens = needle.split(' ').filter(Boolean);
  const carrying = tokens.filter((token) => !NOISE_TOKENS.has(token));
  return carrying.length > 0 ? carrying : tokens;
}

/**
 * Higher is a better match; `null` means no match at all. Tiered rather than
 * edit-distance based because the failure mode that matters is a *missed*
 * task ("the CA thing"), not a slightly mis-ranked one.
 *
 * WHAT ITEM 13C CHANGED, AND WHAT IT DELETED OUTRIGHT
 * ----------------------------------------------------
 * - The three `includes` tiers now ask `startsAWord`. Its note carries the
 *   measurement.
 * - **The subsequence tier is deleted, not softened.** It was a second,
 *   independent noise source of the same character: *"CA"* correctly hit
 *   *"Email the CA"* at 70 and then dragged in *"Repair the chair"* and
 *   *"After Effects practice"* at 15, on a `c`…`a` scattered across the whole
 *   string. It is what made **one-word** queries noisy, so deleting the
 *   partial-hit tier on its own would have fixed nothing for them. Nothing
 *   replaces it, because it was never typo tolerance: `"wesbite"` is not a
 *   subsequence of "website" either. It was coincidence dressed as recall.
 * - The partial-hit tier **stays**. On word starts it is no longer a noise
 *   source but the recall that finds "the CA thing", and the caller's floor
 *   requires half the words rather than any one of them. As before it is
 *   unreachable for a single-token query — one token either hits, and an
 *   earlier tier already returned, or it does not.
 */
export function fuzzyScore(title: string, query: string): number | null {
  const haystack = normalizeForMatch(title);
  const needle = normalizeForMatch(query);
  if (needle === '') return 0;
  if (haystack === needle) return 100;
  if (haystack.startsWith(needle)) return 85;
  if (startsAWord(haystack, needle)) return 70;

  const tokens = meaningfulTokens(needle);
  if (tokens.length < 2) return null;

  const hits = tokens.filter((token) => startsAWord(haystack, token)).length;
  if (hits === tokens.length) return 55;
  if (hits > 0) return 25 + (hits / tokens.length) * 20;
  return null;
}

/**
 * FAULT 2 — WHAT A TASK IS *IN*, NOT ONLY WHAT IT IS CALLED
 *
 * `search_tasks` scored `task.title` and nothing else, so
 * `{query: "Mutineer"}` returned 0 against a whole project called **Mutineer
 * Work**, and the same for **Level Ai** and **Skills**. A bare proper noun
 * reads like a search term to anybody, the `query` parameter is listed first,
 * and its own description invites a multi-word phrase — so the container names
 * belong in the score rather than behind a filter the model has to think of.
 *
 * Weighted down by `CONTEXT_MATCH_WEIGHT` so a real title always wins.
 */
function contextScore(row: CompactTaskRow, query: string): number | null {
  const names = [row.projectName, row.listName].filter((name): name is string => !!name && name.trim() !== '');
  let best: number | null = null;
  for (const name of names) {
    const score = fuzzyScore(name, query);
    if (score !== null && (best === null || score > best)) best = score;
  }
  return best === null ? null : best * CONTEXT_MATCH_WEIGHT;
}

// ─── Shared field parsing for create/update ─────────────────────────────────

/*
 * FIX-12 (audit B1): urgency in his words is the **Emergency** setting, the
 * one the score reads. The old Low / Medium / High / Urgent field was saved and
 * then read by nothing, so it is gone from both tools; a task's stored value
 * stays where it is. Shared with `update_subtask`, since a step has the field.
 */
export const EMERGENCY_SCHEMA: JsonSchema = {
  type: 'integer',
  description:
    `Emergency, 0 to ${EMERGENCY_MAX}: "drop everything for this". This is what urgency means in this app — when the ` +
    'user calls it urgent, an emergency or ASAP, set it (3 if they gave no degree). It lifts the task above the ' +
    'rest until its deadline passes. 0 takes it off. Never set it unless the user expressed urgency in words.',
};

/** Reads `emergencyBoost`, storing 0 as absent as `setEmergencyBoost` does, and says what it set. */
export function readEmergency(args: ToolArgs, notes: string[]): number | undefined | null {
  const level = optionalNumber(args, 'emergencyBoost', { min: 0, max: EMERGENCY_MAX, integer: true });
  if (level === undefined) return null;
  notes.push(level > 0 ? `Emergency set to ${level} of ${EMERGENCY_MAX}` : 'Emergency taken off');
  return level > 0 ? level : undefined;
}

const TASK_FIELD_SCHEMAS: Record<string, JsonSchema> = {
  description: { type: 'string', description: 'What the task involves, and any detail or context worth keeping.' },
  deadline: {
    type: 'string',
    description:
      `When it is due. "YYYY-MM-DDTHH:mm", "YYYY-MM-DD" (assumed ${DEFAULT_DEADLINE_HOUR}:00), or today / tomorrow. ` +
      'Resolved in the user\'s timezone, which is given to you every turn — do not compute a date yourself from a guess about today.',
  },
  startDate: { type: 'string', description: 'When work should begin. Same formats as deadline. Only set it if the user said so.' },
  emergencyBoost: EMERGENCY_SCHEMA,
  estimatedTime: { type: 'integer', description: 'Expected effort in MINUTES (not hours, not seconds).' },
  humanOverride: {
    type: 'integer',
    description:
      'How much this matters to the user, 0 (not at all) to 9 (critical). The one manual importance dial. Set only when the user has actually said how much it matters — leaving it out means "not judged yet", which is not the same as 0.',
  },
  valueINR: { type: 'number', description: 'Money this task is worth, in rupees. Only for work with a stated value.' },

  /*
   * ITEM 9 — THE REST OF THE TASK DETAIL CARD
   * ------------------------------------------
   * Everything above was the eight-tool surface. Everything below is the rest
   * of what the card in the app actually shows, so that "read and write every
   * field" is true rather than nearly true. The field list was taken from
   * `components/TaskDetailPanel.tsx` rather than from the queue item's prose,
   * which lists `allocatedTime` as a card field — it is a real `Task` field
   * and is written here, but the detail card does not render it (Set Deadlines
   * and Task Selection do).
   *
   * Two card fields are deliberately absent:
   * - `imageUrl` needs an upload, not a value. There is nothing a model can
   *   put here that is not a URL it invented.
   * - `shareAllowContributions` opens a public page to writes from anyone
   *   holding the link (`firestore.rules`, `publicShares/{id}/submissions`).
   *   That is the §5.2 front door, so it stays readable and unwritable until
   *   item 13 builds the approval. `hiddenFromShare` is the opposite motion —
   *   it only ever narrows what a stranger can see — so it is here.
   */
  assignee: { type: 'string', description: 'Who is doing it, as a name. Free text; the app does not resolve it to a person.' },
  allocatedTime: { type: 'integer', description: 'Time set aside for it in MINUTES. This is the plan; estimatedTime is the guess.' },
  reminderMinutes: {
    type: 'integer',
    description:
      'Fire an alert this many minutes BEFORE the deadline. 0 means a calendar block with no alert. Needs a deadline to mean anything.',
  },
  recurrenceRule: {
    type: 'string',
    description:
      'An iCalendar RRULE, e.g. "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TH" or "FREQ=MONTHLY;BYDAY=-1FR" for the last Friday. ' +
      'Set it only when the user described a repeat. The repeat is anchored to the deadline (or start date), so set one of those too.',
  },
  dependsOn: {
    type: 'array',
    items: { type: 'string' },
    description:
      'Ids of tasks that must finish first. Replaces the existing list wholesale. Every id must be a real task — get them from search_tasks, never invent one.',
  },
  links: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'What the link is, in a few words.' },
        url: { type: 'string', description: 'An http:// or https:// address.' },
      },
      required: ['url'],
    },
    description: 'Reference links on the task. Replaces the existing links wholesale — send the ones to keep as well as the new one.',
  },
  hiddenFromShare: {
    type: 'boolean',
    description: 'True hides this task from the public share link its list or project is published under. It never publishes anything.',
  },
  /* 29-2d1: the link names the event by the id every event tool calls it. */
  eventId: {
    type: 'string',
    description:
      'The event it is due before ("buy shoes before the marathon"): an eventId from list_events, in the events drawer. ' +
      'It sets the deadline itself (the event\'s start, or 6pm the day before an all-day one) and the task follows ' +
      'the event when its date moves. Do not send a deadline with it. A task he names may already exist: ' +
      'search_tasks first, and if it is there use update_task with this eventId, never create_task again.',
  },
};

interface ParsedFields {
  updates: Partial<Task>;
  /** Anything the summary has to disclose, e.g. how a bare date was interpreted. */
  notes: string[];
}

function readTaskFields(args: ToolArgs, ctx: ToolContext): ParsedFields {
  const updates: Partial<Task> = {};
  const notes: string[] = [];

  const description = optionalString(args, 'description');
  if (description !== undefined) updates.description = description;

  for (const key of ['deadline', 'startDate'] as const) {
    const raw = optionalString(args, key);
    if (raw === undefined) continue;
    const resolved = resolveDateInput(raw, ctx.now, ctx.timezone);
    if (!resolved.ok) throw new ToolArgError(`"${key}": ${resolved.error}`);
    updates[key] = resolved.value;
    if (!/\d{2}:\d{2}/.test(raw)) {
      notes.push(`${key} set to ${describeDate(resolved.value, ctx.timezone)}`);
    }
  }

  const emergencyBoost = readEmergency(args, notes);
  if (emergencyBoost !== null) updates.emergencyBoost = emergencyBoost;

  const estimatedTime = optionalNumber(args, 'estimatedTime', { min: 1, max: 10_080 });
  if (estimatedTime !== undefined) updates.estimatedTime = estimatedTime;

  const humanOverride = optionalNumber(args, 'humanOverride', { min: 0, max: HUMAN_OVERRIDE_MAX, integer: true });
  if (humanOverride !== undefined) updates.humanOverride = humanOverride;

  const valueINR = optionalNumber(args, 'valueINR', { min: 0 });
  if (valueINR !== undefined) updates.valueINR = valueINR;

  // ─── Item 9: the rest of the card ─────────────────────────────────────────

  const assignee = optionalString(args, 'assignee');
  if (assignee !== undefined) updates.assignee = assignee.trim();

  const allocatedTime = optionalNumber(args, 'allocatedTime', { min: 1, max: 10_080, integer: true });
  if (allocatedTime !== undefined) updates.allocatedTime = allocatedTime;

  // 0 is meaningful and is not "unset": `deadlineReminder.ts` reads it as
  // "draw the calendar block, fire no popup". So the range starts at 0 and the
  // absence of the key is the only way to leave it alone.
  const reminderMinutes = optionalNumber(args, 'reminderMinutes', { min: 0, max: 40_320, integer: true });
  if (reminderMinutes !== undefined) updates.reminderMinutes = reminderMinutes;

  const hiddenFromShare = optionalBoolean(args, 'hiddenFromShare');
  if (hiddenFromShare !== undefined) updates.hiddenFromShare = hiddenFromShare;

  /*
   * Parsed and re-formatted rather than stored as sent. `recurrence.ts` is the
   * only thing in the app that looks inside the string, and it expects the
   * spelling `formatRRule` produces — so a model's "FREQ=WEEKLY;BYDAY=mon"
   * either becomes the canonical form here or becomes a repeat that silently
   * never fires. A rule that will not parse is a tool error, not a stored
   * value.
   */
  const recurrenceRule = optionalString(args, 'recurrenceRule');
  if (recurrenceRule !== undefined) {
    const parsed = parseRRule(recurrenceRule);
    if (parsed === null) {
      throw new ToolArgError(
        `"recurrenceRule" is not a usable RRULE: "${recurrenceRule}". Use e.g. FREQ=DAILY;INTERVAL=1 or FREQ=WEEKLY;BYDAY=MO,TH.`,
      );
    }
    updates.recurrenceRule = formatRRule(parsed);
    updates.recurrence = 'custom';
    notes.push(`repeats ${describeRecurrenceRule(parsed)}`);
  }

  /* 29-2d1: due before an event. The deadline is the event's, by the rule the
     sheet uses (`linkedDeadline`), never a date the model worked out. */
  const eventId = optionalString(args, 'eventId');
  if (eventId !== undefined) {
    if ('deadline' in updates) throw new ToolArgError('Send "eventId" or "deadline", not both: a task due before an event takes the event\'s date.');
    /* The id, or a name only one event answers to: measured on gemma4:e4b
       (29-2d1), it sent "Mumbai Marathon" and "the marathon" where the id
       goes, two runs in nine. The exact name first, then the words of the
       name ("the"/"my" dropped) found in exactly one title — "Goa" with two
       Goa trips is refused, never guessed. The summary names the event. */
    const events = useEventStore.getState().events;
    const ref = eventId.trim();
    const lower = ref.toLowerCase();
    const words = lower.replace(/^(the|my|a|an)\s+/, '').trim();
    let named = events.filter((e) => e.title.toLowerCase() === lower);
    if (named.length === 0 && words.length >= 3) named = events.filter((e) => e.title.toLowerCase().includes(words));
    const event = events.find((e) => e.id === ref) ?? (named.length === 1 ? named[0] : undefined);
    if (!event) {
      throw new ToolArgError(named.length > 1
        ? `"eventId": ${named.length} events are called "${ref}". Get the id from list_events, in the events drawer.`
        : '"eventId" names no event. Get ids from list_events, in the events drawer.');
    }
    const deadline = linkedDeadline(event, ctx.now, ctx.timezone);
    if (!deadline) throw new ToolArgError(`"${event.title}" has a date that cannot be read.`);
    updates.eventId = event.id;
    updates.deadline = deadline;
    notes.push(`due before ${event.title}, ${describeDate(deadline, ctx.timezone)}`);
  }

  const links = optionalObjectArray(args, 'links', (item, index) => {
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    if (url === '') throw new ToolArgError(`"links"[${index}] needs a "url".`);
    if (!/^https?:\/\//i.test(url)) {
      throw new ToolArgError(`"links"[${index}].url must start with http:// or https:// (got "${url}").`);
    }
    const title = typeof item.title === 'string' && item.title.trim() !== '' ? item.title.trim() : url;
    return { id: crypto.randomUUID(), title, url } satisfies TaskLink;
  });
  if (links !== undefined) updates.links = links;

  return { updates, notes };
}

/**
 * `dependsOn` is read apart from the rest because it is the only field whose
 * validity depends on the *store* rather than on the argument alone: every id
 * has to name a real task, a task cannot wait on itself, and a cycle would
 * hang `smartStart`'s prerequisite walk — it admits a blocked task only
 * together with the whole chain it waits on, and a chain that loops has no
 * end. Rejecting all three here means the store never holds one.
 */
function readDependsOn(args: ToolArgs, state: AgentStoreState, taskId: string): string[] | undefined {
  const dependsOn = optionalStringArray(args, 'dependsOn');
  if (dependsOn === undefined) return undefined;

  const unique = [...new Set(dependsOn)];
  if (unique.includes(taskId)) throw new ToolArgError('A task cannot depend on itself.');

  const missing = unique.filter((id) => !findTaskAnywhere(state, id));
  if (missing.length > 0) {
    throw new ToolArgError(
      missing.length === 1
        ? `"dependsOn" names a task that does not exist: ${missing[0]}. Get ids from search_tasks.`
        : `"dependsOn" names tasks that do not exist: ${missing.join(', ')}. Get ids from search_tasks.`,
    );
  }

  // Walk forward from each prerequisite as if the edit had landed; reaching
  // this task again is the loop.
  const edgesOf = (id: string): string[] => (id === taskId ? unique : (findTaskAnywhere(state, id)?.task as Task | undefined)?.dependsOn ?? []);
  const seen = new Set<string>();
  const stack = [...unique];
  while (stack.length > 0) {
    const next = stack.pop() as string;
    if (next === taskId) throw new ToolArgError('That would make a loop — the task would end up waiting on itself through another task.');
    if (seen.has(next)) continue;
    seen.add(next);
    stack.push(...edgesOf(next));
  }

  return unique;
}

// ─── search_tasks ───────────────────────────────────────────────────────────

const STATUS_FILTERS = ['open', 'needsAction', 'in-progress', 'completed', 'any'] as const;

export const searchTasks: ToolDef = defineTool({
  name: 'search_tasks',
  mutates: false,
  description:
    'Find tasks by a fuzzy match on their title, the list they are in, or the project that list belongs to, with ' +
    'optional filters. This is the only way to turn a task the user named in conversation ("the CA thing") into an ' +
    'id, so call it before get_task, update_task, complete_task or add_to_today whenever you do not already hold ' +
    'that id. A bare project or list name works as a query and returns what is in it. Call it with no query but a ' +
    'filter to list a whole list, or everything overdue; call list_all_tasks instead when the question is about the ' +
    'whole board. Returns at most ' + SEARCH_RESULT_CAP + ' compact rows — id, title, status, deadline, list, project — ' +
    'and never descriptions or subtasks; use get_task for those. Searches top-level tasks only, not subtasks. ' +
    'The ids are for your own tool calls: never print one in your reply, and name a task by its title instead. ' +
    'Do not repeat a search with the same arguments; if it returned nothing, change the query or drop a filter.',
  parametersSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Words from the title, or the name of the list or project the task sits in. Out-of-order words match and a ' +
          'word may be given as a prefix ("web" finds "website"), but a fragment from the middle of a word does not. ' +
          'Omit to match every task passing the filters.',
      },
      list: { type: 'string', description: 'Restrict to one list, by the list name shown in your orientation block (or its id).' },
      project: { type: 'string', description: 'Restrict to one project, by name (or id). Matches every list in that project.' },
      status: {
        type: 'string',
        enum: [...STATUS_FILTERS],
        description: 'Defaults to "open" (everything not completed). Use "completed" or "any" only when the user asks about finished work.',
      },
      overdue: { type: 'boolean', description: 'True returns only tasks whose deadline has already passed.' },
      hasDeadline: { type: 'boolean', description: 'True returns only tasks that have a deadline; false only those with none.' },
    },
    required: [],
  },
  execute: async (args, ctx) => {
    const state = ctx.store.getState();
    const query = optionalString(args, 'query')?.trim() ?? '';
    const listRef = optionalString(args, 'list');
    const projectRef = optionalString(args, 'project');
    const status = optionalEnum(args, 'status', STATUS_FILTERS) ?? 'open';
    const overdue = optionalBoolean(args, 'overdue');
    const hasDeadline = optionalBoolean(args, 'hasDeadline');

    const describedFilters: string[] = [];

    let listIds: Set<string> | undefined;
    if (listRef !== undefined) {
      const list = resolveList(state, listRef);
      if (!list) {
        return {
          ok: false,
          summary: `No list called "${listRef}". Existing lists: ${state.taskLists.map((l) => l.title).join(', ')}.`,
        };
      }
      listIds = new Set([list.id]);
      describedFilters.push(`in ${list.title}`);
    }
    if (projectRef !== undefined) {
      const project = resolveProject(state, projectRef);
      if (!project) {
        return {
          ok: false,
          summary: `No project called "${projectRef}". Existing projects: ${state.projects.map((p) => p.name).join(', ') || 'none'}.`,
        };
      }
      const inProject = state.taskLists.filter((l) => l.projectId === project.id).map((l) => l.id);
      const alreadyScoped = listIds;
      listIds = new Set(alreadyScoped ? inProject.filter((id) => alreadyScoped.has(id)) : inProject);
      describedFilters.push(`in project ${project.name}`);
    }

    const scopedListIds = listIds;
    const scored: Array<{ row: CompactTaskRow; score: number; deadlineAt: number; viaContext: boolean }> = [];
    let contextMatches = 0;
    for (const task of state.backlogTasks) {
      if (task.parent) continue;
      if (scopedListIds) {
        const inScope =
          (task.listId !== undefined && scopedListIds.has(task.listId)) ||
          (task.sharedListIds?.some((id) => scopedListIds.has(id)) ?? false);
        if (!inScope) continue;
      }

      if (status === 'open' && task.status === 'completed') continue;
      if (status !== 'open' && status !== 'any' && task.status !== status) continue;

      if (hasDeadline === true && !task.deadline) continue;
      if (hasDeadline === false && task.deadline) continue;
      if (overdue !== undefined && isOverdue(task.deadline, ctx.now, ctx.timezone) !== overdue) continue;

      /*
       * Title first, then what the task is *in* (fault 2). The container's
       * score is weighted below the title's, so a project name surfaces its
       * tasks without ever outranking a task actually called that.
       */
      const row = compactRow(state, task);
      const titleScore = fuzzyScore(task.title, query);
      const viaContainer = query === '' ? null : contextScore(row, query);
      const best = Math.max(titleScore ?? Number.NEGATIVE_INFINITY, viaContainer ?? Number.NEGATIVE_INFINITY);
      if (!Number.isFinite(best)) continue;

      // An empty query scores everything 0 on purpose — it means "list them
      // all" — so the floor only applies once there is something to be below it.
      if (query !== '' && best < SEARCH_SCORE_FLOOR) continue;

      const viaContext = viaContainer !== null && best === viaContainer && best > (titleScore ?? Number.NEGATIVE_INFINITY);
      if (viaContext) contextMatches += 1;

      scored.push({
        row,
        score: best,
        deadlineAt: task.deadline ? new Date(task.deadline).getTime() || Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER,
        viaContext,
      });
    }

    scored.sort((a, b) => b.score - a.score || a.deadlineAt - b.deadlineAt || a.row.title.localeCompare(b.row.title));

    const truncated = scored.length > SEARCH_RESULT_CAP;
    const results = scored.slice(0, SEARCH_RESULT_CAP).map((entry) => entry.row);

    if (status === 'open') describedFilters.unshift('not completed');
    if (overdue === true) describedFilters.push('overdue');
    if (overdue === false) describedFilters.push('not overdue');
    if (hasDeadline === true) describedFilters.push('with a deadline');
    if (hasDeadline === false) describedFilters.push('without a deadline');
    const filterText = describedFilters.length > 0 ? ` (${describedFilters.join(', ')})` : '';
    const queryText = query === '' ? '' : ` matching "${query}"`;

    if (results.length === 0) {
      return {
        ok: true,
        summary:
          `No tasks${queryText}${filterText}. Try fewer words or drop a filter before telling the user it does not ` +
          'exist, and list_all_tasks if you want to see everything there is.',
        data: { results: [], totalMatches: 0, truncated: false },
      };
    }

    /*
     * Said out loud because a row that matched on its project reads like a
     * false positive otherwise — nothing in its title resembles the query.
     *
     * ITEM 14, TRAP `t6` — AND THE SECOND SENTENCE IS THE ONE THAT MATTERS.
     * *"Delete everything in Personal Tasks"* names a **project**, not a list.
     * One run in three searched `{query: "Personal Tasks"}`, got eleven rows
     * that had all matched on the name of the thing containing them, and
     * proposed deleting all eleven. Every row was a real task and the tool was
     * working exactly as 13C designed it — but "eleven tasks that live
     * somewhere whose name resembles what you typed" is a very different
     * result from "eleven tasks called that", and only the first sentence said
     * so. When *nothing* matched on its own title the result is a guess about
     * which container was meant, and a guess is not something to delete from.
     */
    const contextNote =
      contextMatches === 0
        ? ''
        : contextMatches === results.length && query !== ''
          ? ` None of them has "${query}" in its own title — every one matched on the name of the list or project it ` +
            'sits in, so this is what is inside something whose name resembles that. Fine to answer a question from: ' +
            'say which list or project they came from. NOT fine to write from without checking: never delete or ' +
            'complete a whole set found this way, and use list_projects to confirm the place exists first.'
          : ` ${contextMatches} of them matched on their list or project rather than their own title.`;

    /*
     * ITEM 14 — THE TWINS, SAID WHERE THE MODEL IS ACTUALLY LOOKING.
     *
     * Shreekant has four tasks called exactly "Solve Question Bank", one per
     * subject. `prompt.ts` has told the model since item 9 that several
     * plausible matches for a *write* means asking which one, item 14 rewrote
     * that paragraph to name those four tasks outright — and `gemma4:e4b`
     * completed all four anyway, three runs out of three. A rule sitting six
     * hundred tokens up the prompt loses to the search result under the
     * model's nose, which said "4 tasks" and nothing about them being the same
     * task four times over.
     *
     * So the fact goes in the sentence the model reads immediately before it
     * decides. It is a fact rather than an instruction with one exception —
     * the last clauses — because a 4B model handed a fact still has to be told
     * what the fact means for what it is about to do.
     *
     * **IT SAYS "PICK USING WHAT ELSE HE SAID" BEFORE IT SAYS "ASK", AND THE
     * ORDER IS A MEASURED CORRECTION.** The first wording went straight to
     * *"nothing here tells you which — ask him with ask_choice, and do not
     * write to any of them until he answers"*, which is right for `t2` (*"mark
     * Solve Question Bank as done"*, no other information anywhere) and flatly
     * wrong for `h5` (*"mark the question bank for maths as done"*, where the
     * subject is right there in what he typed). `h5` went from passing to 0/3
     * on that wording: the model read four rows it could easily have told
     * apart, asked anyway, and rendered the four options as invented
     * `https://example.com/task/<uuid>` links — putting ids on his screen to
     * ask a question it had the answer to. This tool cannot see how he phrased
     * the request, so the sentence has to hand the judgement back rather than
     * make it.
     *
     * It costs nothing on an ordinary search: almost no two tasks share a
     * title, so this is an empty string on essentially every call.
     */
    const byTitle = new Map<string, CompactTaskRow[]>();
    for (const row of results) {
      const key = row.title.trim().toLowerCase();
      const seen = byTitle.get(key);
      if (seen) seen.push(row);
      else byTitle.set(key, [row]);
    }
    const twins = [...byTitle.values()].filter((rows) => rows.length > 1).sort((a, b) => b.length - a.length)[0];
    const singledOut = twins === undefined ? null : singleOutTwin(twins, query);
    const twinNote =
      twins === undefined
        ? ''
        : ` CAREFUL: ${twins.length} of them have the IDENTICAL title "${twins[0].title}" and differ only by where they are ` +
          `filed (${twins.map((row) => row.listName || 'no list').join(', ')}). ` +
          (singledOut === null
            ? 'Before writing to any of them, pick using whatever else he said — a subject, a list, a project — since ' +
              'that is the only thing that tells them apart. If he said nothing that does, ask him with ask_questions and ' +
              'write to none of them until he answers. Completing or deleting all of them is never the answer.'
            : `Your word "${singledOut.word}" points at "${singledOut.row.listName ?? ''}" and at none of the others, so ` +
              'if that is what he meant, act on THAT ONE and do not ask — he already told you which. Otherwise ask him ' +
              'with ask_questions. Completing or deleting all of them is never the answer.');

    return {
      ok: true,
      summary:
        (truncated
          ? `${scored.length} tasks${queryText}${filterText}; showing the ${SEARCH_RESULT_CAP} best matches. Narrow the query or add a filter to see the rest.`
          : `${results.length} task${results.length === 1 ? '' : 's'}${queryText}${filterText}.`) +
        contextNote +
        twinNote,
      data: { results, totalMatches: scored.length, truncated, identicalTitles: twins?.map((row) => row.id) ?? [] },
    };
  },
});

// ─── list_all_tasks ─────────────────────────────────────────────

/**
 * A board of any size still has to fit in a reply. 48 tasks is ~1,250 tokens;
 * 500 is the point past which this tool has stopped being the cheap read it
 * exists to be, and the model is told to go back to searching.
 */
export const BOARD_READ_CAP = 500;

/**
 * ITEM 13C — THE READ-EVERYTHING COMPANION
 * -----------------------------------------
 * Shreekant's opening request was never a search: *"read all the tasks and
 * connect them with a timeline"*, *"adjust the overdue tasks against the time
 * I have"*. Before this tool that was impossible — `search_tasks` caps at 20
 * and wants a query, so the whole board could not be got at any price.
 *
 * The measurement that settles the cost: **48 tasks as title, status,
 * deadline, list and project is roughly 1,250 tokens, about 2% of the 65,536
 * window.** There is nothing to drown in. The wrong fix, considered and
 * rejected, was raising `SEARCH_RESULT_CAP` — that floods the model with full
 * rows for questions that wanted one task, and makes those answers worse to
 * fix a question search was not asked.
 */
export const listAllTasks: ToolDef = defineTool({
  name: 'list_all_tasks',
  mutates: false,
  description:
    'Read the whole board in one call: every task as a compact row — id, title, status, deadline, list, project. ' +
    'This is the right first call whenever the question is about the board as a whole rather than about one task — ' +
    'planning a week, connecting work into a timeline, weighing what is overdue against the time available, ' +
    'deciding what to drop, or anything phrased as "all my tasks". Prefer it over guessing at several searches: ' +
    'the whole board is small and one call answers more than five searches would. Use search_tasks instead when ' +
    'the user named a particular thing. Top-level tasks only, not subtasks, and no descriptions — ' +
    'get_task reads those. The ids are for your own tool calls: never print one in your reply. ' +
    'A row marked ignored: true is work he has set aside from his score and queue — never suggest it for today or ' +
    'as what to do next unless he asks about it by name.',
  parametersSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: [...STATUS_FILTERS],
        description: 'Defaults to "open" (everything not completed). Use "any" or "completed" when the user asks about finished work.',
      },
      /*
       * ITEM 14, `e1` — THE FILTER THE MODEL INVENTED BECAUSE IT SHOULD HAVE
       * BEEN HERE.
       *
       * *"what's overdue?"* is the most-typed question on this board, and
       * `gemma4:e4b` answered it correctly on all three measured runs — after
       * calling `list_all_tasks({overdue: true})` first and being told the
       * parameter does not exist. It was not hallucinating a capability: its
       * sibling `search_tasks` takes exactly that flag, so the model had every
       * reason to think this one did, and the round trip it burns learning
       * otherwise is the tool surface being inconsistent rather than the model
       * being wrong. Item 14 called it "a one-line fix in the app repo".
       *
       * `hasDeadline`, `search_tasks`'s other date filter, is deliberately NOT
       * copied across: nothing was measured reaching for it here, and every
       * parameter on a tool is a choice a 4B model has to make on every call.
       * The rule this follows is "close the gap that was measured", not "make
       * the two schemas identical".
       */
      overdue: { type: 'boolean', description: 'True returns only tasks whose deadline has already passed.' },
    },
    required: [],
  },
  execute: async (args, ctx) => {
    const state = ctx.store.getState();
    const status = optionalEnum(args, 'status', STATUS_FILTERS) ?? 'open';
    const overdueOnly = optionalBoolean(args, 'overdue');

    const rows: CompactTaskRow[] = [];
    let overdueCount = 0;
    let undated = 0;
    for (const task of state.backlogTasks) {
      if (task.parent) continue;
      if (status === 'open' && task.status === 'completed') continue;
      if (status !== 'open' && status !== 'any' && task.status !== status) continue;

      const late = task.deadline !== undefined && isOverdue(task.deadline, ctx.now, ctx.timezone);
      if (overdueOnly === true && !late) continue;
      if (overdueOnly === false && late) continue;

      rows.push(compactRow(state, task));
      if (!task.deadline) undated += 1;
      else if (late) overdueCount += 1;
    }

    // Soonest first, undated last, because every question this tool exists for
    // is a question about time.
    const at = (row: CompactTaskRow) =>
      row.deadline ? new Date(row.deadline).getTime() || Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
    rows.sort((a, b) => at(a) - at(b) || a.title.localeCompare(b.title));

    const truncated = rows.length > BOARD_READ_CAP;
    const shown = truncated ? rows.slice(0, BOARD_READ_CAP) : rows;

    /* A filtered read is not "the whole board", and saying it is would be the
       kind of small lie that makes the rest of a summary untrustworthy. */
    const filtered = overdueOnly !== undefined;

    if (shown.length === 0) {
      return {
        ok: true,
        summary: filtered
          ? `Nothing is ${overdueOnly === true ? 'overdue' : 'un-overdue'}${status === 'open' ? '' : ` with status "${status}"`}. Say so; do not search for more.`
          : status === 'open'
            ? 'The board is empty — there are no open tasks at all. Say so; do not search for them.'
            : `No tasks with status "${status}".`,
        data: { tasks: [], totalTasks: 0, truncated: false },
      };
    }

    const projects = new Set(shown.map((row) => row.projectName ?? '—'));
    const lists = new Set(shown.map((row) => row.listName || '—'));
    const scope = status === 'open' ? 'open task' : `"${status}" task`;

    return {
      ok: true,
      summary: truncated
        ? `${rows.length} ${scope}s in all; this is the ${BOARD_READ_CAP} due soonest. The board is too big to read whole — use search_tasks with a list or project filter for the rest.`
        : filtered
          ? `Every ${overdueOnly === true ? 'overdue' : 'not-yet-overdue'} ${scope}: ${shown.length} of them, across ${projects.size} project${projects.size === 1 ? '' : 's'}. That is all of them — do not search for more.`
          : `The whole board: ${shown.length} ${scope}${shown.length === 1 ? '' : 's'} across ${projects.size} project${projects.size === 1 ? '' : 's'} and ${lists.size} list${lists.size === 1 ? '' : 's'}, ${overdueCount} overdue and ${undated} with no deadline. That is all of them — do not search for more.`,
      data: { tasks: shown, totalTasks: rows.length, overdue: overdueCount, undated, truncated },
    };
  },
});

// ─── list_projects ──────────────────────────────────────────────────────────

/**
 * ITEM 14 — THE ONLY IDS ON THE BOARD A MODEL COULD NOT GET AT.
 *
 * Every read here hands back **task** ids. Nothing handed back a list id or a
 * project id, and `publish_share_link` takes *"exact ids of the tasks, lists
 * or projects"* — so *"publish a public share link for Level Ai"* was an
 * instruction Atlas could not carry out at any price. The benchmark's `t4`
 * caught it three runs out of three: the model searched, found the project's
 * eight tasks, guessed `{entity: "Level Ai"}`, was told that parameter does
 * not exist, then sent the eight **task** ids with `type: "project"` and got
 * *"none of those ids is a task, list or project"* back. It never reached the
 * front door, so it never had the one true sentence to report — that the act
 * is sitting in his tray waiting for a tap — and answered by asking him for a
 * uuid instead.
 *
 * **A read tool, rather than teaching `publish_share_link` to take names.**
 * That was the other option and it is the wrong one: resolving a name inside
 * the one act that cannot be undone would put the guess *behind* the door,
 * where the preview sentence he taps is written from it. Here the guess is in
 * front of the door, in a read the model can be wrong about for free, and what
 * reaches the approval card is an id that was looked up.
 *
 * **No tasks in it, deliberately.** `list_all_tasks` reads the board and this
 * reads its *shape* — six projects, fourteen lists, a count each. That keeps
 * it small enough to be a cheap first call when a name he used is ambiguous
 * ("Level Ai" is a project, not a list, which is the everyday tier's `e4`),
 * and stops it becoming a second way to ask the question `list_all_tasks`
 * already answers.
 *
 * **THE COUNT IS A DISTRACTOR AND THE DESCRIPTION HAS TO SAY SO.** Measured
 * the run this tool first existed for: *"which of my projects is furthest
 * behind?"* went from 3/3 to 0/3, and all three runs answered **"Skills, with
 * 26 open tasks"** — the biggest project, which is not the same question. It
 * had never had a per-project count to reach for before and had to count
 * overdue rows off the board; handed a cheaper number that looks like an
 * answer, it took it. The count earns its place (it is what makes a share
 * preview and a "does this list exist" check meaningful), so the fix is the
 * sentence in the description that says what it is not.
 */
export const listProjects: ToolDef = defineTool({
  name: 'list_projects',
  mutates: false,
  description:
    'The shape of the board: every project, and the lists inside it, with their ids and how many open tasks each ' +
    'holds, and which project each sits inside. No tasks — list_all_tasks and search_tasks read those. Call this when you need a project or a list ' +
    'ITSELF rather than the tasks in it: publishing a share link for one, renaming or deleting one (Projects drawer), ' +
    'or working out whether a name the user ' +
    'said is a project, a list, or neither. A project id and a list id are the only ids no other tool gives you. ' +
    'The counts are of open tasks and say NOTHING about deadlines — a project with the most open tasks is not the ' +
    'one furthest behind. Anything about overdue, late or behind is list_all_tasks, which carries the dates.',
  parametersSchema: { type: 'object', properties: {}, required: [] },
  execute: async (_args, ctx) => {
    const state = ctx.store.getState();

    const openIn = (listIds: Set<string>): number =>
      state.backlogTasks.filter(
        (task) =>
          !task.parent &&
          task.status !== 'completed' &&
          (listIds.has(task.listId ?? '') || (task.sharedListIds ?? []).some((listId) => listIds.has(listId))),
      ).length;

    // BIG-2: a project inside another names it. Each count stays the project's
    // OWN lists, so adding them up never counts a task twice.
    const tree = buildProjectTree(state.projects);
    const nameOf = new Map(state.projects.map((project) => [project.id, project.name]));
    const projects = flattenProjectTree(tree).map(({ project }) => {
      const lists = state.taskLists.filter((list) => list.projectId === project.id);
      const parentId = tree.parentOf(project.id);
      return {
        type: 'project' as const,
        id: project.id,
        name: project.name,
        ...(parentId ? { insideId: parentId, inside: nameOf.get(parentId) } : {}),
        published: project.shareId !== undefined,
        openTasks: openIn(new Set(lists.map((list) => list.id))),
        lists: lists.map((list) => ({
          type: 'list' as const,
          id: list.id,
          name: list.title,
          published: list.shareId !== undefined,
          openTasks: openIn(new Set([list.id])),
        })),
      };
    });

    const loose = state.taskLists
      .filter((list) => !list.projectId)
      .map((list) => ({
        type: 'list' as const,
        id: list.id,
        name: list.title,
        published: list.shareId !== undefined,
        openTasks: openIn(new Set([list.id])),
      }));

    const listCount = projects.reduce((total, project) => total + project.lists.length, 0) + loose.length;

    if (projects.length === 0 && loose.length === 0) {
      return { ok: true, summary: 'There are no projects and no lists at all.', data: { projects: [], lists: [] } };
    }

    return {
      ok: true,
      summary:
        `${projects.length} project${projects.length === 1 ? '' : 's'} and ${listCount} list${listCount === 1 ? '' : 's'}` +
        (projects.length === 0 ? '' : `: ${projects.map((project) => `${project.name} (${project.inside ? `inside ${project.inside}, ` : ''}${project.openTasks} open)`).join(', ')}`) +
        '. The ids here name the project or the list itself, which is what a share link needs; task ids still come ' +
        'from search_tasks.',
      data: { projects, lists: loose },
    };
  },
});

// ─── get_task ───────────────────────────────────────────────────────────────

/**
 * ITEM 13D — THE ONE BATCH WITH A SMALL CAP, AND IT IS NOT ARBITRARY.
 *
 * Every other tool here takes fifty ids because acting on fifty tasks costs
 * fifty store writes and one sentence. This one returns whole tasks —
 * descriptions, links, entire subtask trees — which is exactly what
 * decision D5 says must not arrive twenty at a time. Ten is a person asking
 * about a handful of things at once; past that the right tool is
 * `list_all_tasks`, whose whole point is that compact rows for the entire board
 * cost less than ten full ones.
 */
export const GET_TASK_CAP = 10;

export const getTask: ToolDef = defineTool({
  name: 'get_task',
  mutates: false,
  description:
    'Read tasks in full: description, subtasks, links, scores, dates. Takes a list, so ask for every task ' +
    'you need in one call rather than one call each. Use it only when the compact rows from search_tasks cannot answer ' +
    'the question — for example when the user asks what the subtasks are, or what the description says. Do not call it on ' +
    'every search result, and never call it to check an id you have already been given.',
  parametersSchema: {
    type: 'object',
    properties: {
      taskIds: {
        type: 'array',
        items: { type: 'string' },
        description: `Exact ids from search_tasks, list_today, or tasks you just created. Up to ${GET_TASK_CAP} at once.`,
      },
    },
    required: ['taskIds'],
  },
  execute: async (args, ctx) => {
    const state = ctx.store.getState();
    const taskIds = requiredStringArray(args, 'taskIds', { max: GET_TASK_CAP, what: 'tasks' });

    const outcome = await runBatch(taskIds, async (taskId) => {
      const found = findTaskAnywhere(state, taskId);
      if (!found) return { ok: false as const, reason: missingIdReason('task') };

      const owner = (found.rootTask ?? found.task) as Task;
      const list = owner.listId ? state.taskLists.find((l) => l.id === owner.listId) : undefined;
      const project = list?.projectId ? state.projects.find((p) => p.id === list.projectId) : undefined;

      return {
        ok: true as const,
        title: found.task.title,
        value: {
          ...found.task,
          ...((found.task as Task).eventId ? { dueBefore: eventTitle((found.task as Task).eventId as string) } : {}),
          location: found.location,
          listName: listTitleFor(state, owner.listId, owner.listName),
          projectName: project?.name,
          parentTaskId: found.rootTask?.id,
          parentTaskTitle: found.rootTask?.title,
          inTodayQueue: state.tasks.some((t) => t.id === taskId),
          subtaskCount: found.task.subtasks?.length ?? 0,
          parentTitle: found.rootTask?.title,
        },
      };
    });

    return batchResult(
      outcome,
      (done) => {
        // One task keeps the sentence it always had — that is the overwhelming
        // case and the chip reads it. Several become a roll-call, because the
        // per-task detail is in `data` where the model reads it anyway.
        if (done.length === 1) {
          const only = done[0].value;
          const where = only.location === 'subtask' ? ` (a subtask of "${only.parentTitle}")` : '';
          return (
            `"${only.title}"${where} — ${only.status ?? 'needsAction'}, ` +
            `due ${describeDate(only.deadline, ctx.timezone)}, ${only.subtaskCount} subtask${only.subtaskCount === 1 ? '' : 's'}.`
          );
        }
        return `Read ${done.length} tasks in full: ${titleList(done.map((entry) => entry.title))}.`;
      },
      { tasks: outcome.done.map((entry) => entry.value) },
    );
  },
});

// ─── create_task ────────────────────────────────────────────────────────────

/**
 * ITEM 13D — A CREATOR'S LIST IS THE THINGS IT MAKES, NOT IDS.
 *
 * Every other tool here batches by id, because that is what it acts on. This
 * one has no ids to take — so the list is `tasks`, one entry per task, each
 * carrying the same fields the single call used to take at the top level.
 * *"Add milk, bread and eggs"* is one call.
 *
 * **A bare string in the list is read as a title** (`requiredRecordArray`),
 * which is the shape most of these calls actually have and three fewer chances
 * for a 4B model to mis-nest an object.
 *
 * **Fields sent beside the list rather than inside an entry** (FIX-13) are the
 * one entry's when there is one, and a refusal when there are several —
 * `liftEntryFields` in `toolKit.ts`, opted into by `entryList` below.
 */
const CREATE_TASK_CAP = 50;

export const createTask: ToolDef = defineTool({
  name: 'create_task',
  mutates: true,
  description:
    'Create tasks in the backlog. Takes a list — create everything the user named in ONE call, not one call each. ' +
    'Each entry needs a title; send any other field only when the user actually stated it — never invent a deadline, ' +
    'emergency or estimate. ' +
    /* BUILD-16. Measured on gemma4:e4b: with the rule only in the system
       prompt, one run in three went straight here with a bare title. This is
       the sentence it reads at the moment it chooses to create. */
    'If he gave little more than a title — no deadline, no estimate, no importance — do NOT call this yet: call ' +
    'ask_questions first for the ones he did not say, and create the task from his answers. ' +
    /* 29-2d1, measured on gemma4:e4b: "due before my Goa trip" was asked "when should it be due?". */
    '"Before the marathon" (an event) IS a deadline: send its eventId and never ask when. ' +
    'Omitting "list" files that task in ' + DEFAULT_LIST_TITLE + '. ' +
    'This does NOT put anything into today\'s focus queue; call add_to_today separately if the user wants to work on ' +
    'them today. Search before you create: a speculative or placeholder task is still a task the user has to deal ' +
    'with, even though delete_task can now remove one.',
  parametersSchema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        description: 'Every task to create. One entry per task; a plain string is read as a title.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'The task itself, phrased as the user would recognise it. Keep it short.' },
            list: { type: 'string', description: `List name (or id) to file it under. Defaults to ${DEFAULT_LIST_TITLE}.` },
            ...TASK_FIELD_SCHEMAS,
          },
          required: ['title'],
        },
      },
    },
    required: ['tasks'],
  },
  execute: async (args, ctx) => {
    const wanted = requiredRecordArray(args, 'tasks', 'title', (item) => item, {
      max: CREATE_TASK_CAP,
      what: 'tasks',
    });

    /*
     * The key is the title, not an id — nothing exists yet to have one. So
     * `data.failed` reads `{ id: "Call the CA", reason: … }`, which is the only
     * handle either the model or a person has on a task that was never made.
     */
    const outcome = await runBatch(
      wanted.map((item, index) => (typeof item.title === 'string' && item.title.trim() !== '' ? item.title.trim() : `entry ${index + 1}`)),
      async (_key, index) => {
        // Re-read per entry: `order` counts what is already in the list, and
        // four tasks created into one list in one call must not all be 0.
        const state = ctx.store.getState();
        const item = wanted[index] as ToolArgs;

        let title: string;
        try {
          title = requiredString(item, 'title');
        } catch (err) {
          return { ok: false as const, reason: err instanceof Error ? err.message : String(err) };
        }

        const listRef = optionalString(item, 'list');
        let list = listRef !== undefined ? resolveList(state, listRef) : undefined;
        if (listRef !== undefined && !list) {
          return {
            ok: false as const,
            title,
            reason: `there is no list called "${listRef}" — the lists are ${state.taskLists.map((l) => l.title).join(', ')}.`,
          };
        }

        const defaulted = list === undefined;
        if (!list) {
          list =
            state.taskLists.find((l) => l.id === DEFAULT_LIST_ID) ??
            state.taskLists.find((l) => l.title === DEFAULT_LIST_TITLE) ??
            state.taskLists[0];
        }
        if (!list) return { ok: false as const, title, reason: 'there are no lists to file a task in.' };
        const targetList = list;

        let parsed: ParsedFields;
        let dependsOn: string[] | undefined;
        // The id is minted here, before anything is written, so the snapshot can
        // record "this did not exist" and a revert reports it rather than silently
        // treating the new task as pre-existing state (D6). It is also what
        // `readDependsOn` needs to answer "does this wait on itself?", which is
        // why it is minted before the prerequisites are read rather than in the
        // object literal below.
        const id = crypto.randomUUID();
        try {
          parsed = readTaskFields(item, ctx);
          dependsOn = readDependsOn(item, state, id);
        } catch (err) {
          // One malformed entry is one failed entry, not a failed call — that
          // is rule 2, and `defineTool`'s catch would have turned this into
          // the second thing.
          return { ok: false as const, title, reason: err instanceof Error ? err.message : String(err) };
        }
        const { updates, notes } = parsed;

        /* 29-2d1, measured on gemma4:e4b: "Buy running shoes has to be done
           before the marathon" made a second "Buy running shoes" six runs in
           six, through a sentence telling it to search first. So a new task
           due before an event, named exactly as an open task he already has,
           IS that task: it is tied to the event, never made again. */
        const same = updates.eventId
          ? state.backlogTasks.find((t) => !t.parent && t.status !== 'completed' && t.title.trim().toLowerCase() === title.trim().toLowerCase())
          : undefined;
        if (same) {
          ctx.snapshots.captureTask(ctx.snapshotHandle, same.id);
          ctx.store.updateBacklogTask(same.id, { eventId: updates.eventId, deadline: updates.deadline });
          const tied = ctx.store.getState().backlogTasks.find((t) => t.id === same.id) as Task;
          const sameList = listTitleFor(state, same.listId, same.listName);
          return {
            ok: true as const,
            title,
            value: {
              task: compactRow(ctx.store.getState(), tied, same.listId, sameList),
              listTitle: sameList,
              disclosures: [`it already existed, so that task was tied to the event instead of made again`, ...notes],
            },
          };
        }

        if (dependsOn !== undefined) updates.dependsOn = dependsOn;
        // An Emergency of 0 is "none", which on a new task is no key at all.
        if (updates.emergencyBoost === undefined) delete updates.emergencyBoost;

        const task: Task = {
          id,
          title,
          status: 'needsAction',
          listId: targetList.id,
          listName: targetList.title,
          subtasks: [],
          createdAt: ctx.now.getTime(),
          order: state.backlogTasks.filter((t) => t.listId === targetList.id && !t.parent).length,
          ...updates,
        };

        ctx.snapshots.captureTask(ctx.snapshotHandle, id);
        ctx.store.addBacklogTask(task);

        const disclosures = [...notes];
        if (defaulted) disclosures.unshift(`no list was given, so it went to ${targetList.title}`);

        return {
          ok: true as const,
          title,
          value: {
            task: compactRow(state, task, targetList.id, targetList.title),
            listTitle: targetList.title,
            disclosures,
          },
        };
      },
    );

    return batchResult(
      outcome,
      (done) => {
        if (done.length === 1) {
          const { listTitle, disclosures } = done[0].value;
          return `Created "${done[0].title}" in ${listTitle}${disclosures.length > 0 ? ` — ${disclosures.join('; ')}` : ''}.`;
        }
        // Anything that had to be disclosed is still disclosed, gathered up so
        // one defaulted list does not repeat itself four times.
        const disclosures = [...new Set(done.flatMap((entry) => entry.value.disclosures))];
        const lists = [...new Set(done.map((entry) => entry.value.listTitle))];
        return (
          `Created ${done.length} tasks in ${lists.join(' and ')}: ${titleList(done.map((entry) => entry.title))}` +
          `${disclosures.length > 0 ? ` — ${disclosures.join('; ')}` : ''}.`
        );
      },
      { tasks: outcome.done.map((entry) => entry.value.task) },
    );
  },
}, { entryList: 'tasks' });

// ─── update_task ────────────────────────────────────────────────────────────

const CLEARABLE_FIELDS = [
  'deadline', 'startDate', 'description', 'emergencyBoost', 'estimatedTime',
  // Item 9. `hiddenFromShare` is absent on purpose: it is a boolean, so
  // `false` already says what clearing it would say, and offering two spellings
  // of one intent is how a model ends up sending both.
  'assignee', 'allocatedTime', 'reminderMinutes', 'recurrenceRule', 'links', 'dependsOn',
  // 29-2d1: no longer due before its event; the date stays.
  'eventId',
] as const;
const OPEN_STATUSES = ['needsAction', 'in-progress'] as const;

export const updateTask: ToolDef = defineTool({
  name: 'update_task',
  mutates: true,
  description:
    'Change fields on existing tasks. Takes a list of ids and applies THE SAME change to every one of them, so ' +
    '"push all of these to Friday" is one call. When different tasks need different changes, call it once per ' +
    'distinct change — not once per task. Send only the fields that are actually changing; everything you omit is ' +
    'left alone. Use "clear" to remove a value the user wants gone (an unwanted deadline, a stale estimate). To mark ' +
    'a task finished use complete_task instead — "status" here only reopens or starts a task. To remove a task use ' +
    'delete_task. Fields that take a list — links, dependsOn — are REPLACED wholesale, so read the task first ' +
    'and send the existing entries alongside the new one unless the user is replacing them. To move a task ' +
    'to another list or project, or reorder it, use move_task.',
  parametersSchema: {
    type: 'object',
    properties: {
      taskIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Exact ids from search_tasks, list_today, or tasks you just created. Every task getting this same change.',
      },
      title: { type: 'string', description: 'Rewrite the title. Only when the user asked for a rename — and never across several tasks at once.' },
      status: {
        type: 'string',
        enum: [...OPEN_STATUSES],
        description: '"in-progress" when work has started, "needsAction" to reopen something completed. Never use this to complete a task.',
      },
      clear: {
        type: 'array',
        items: { type: 'string', enum: [...CLEARABLE_FIELDS] },
        description: 'Names of fields to erase. Do not also pass a new value for the same field.',
      },
      ...TASK_FIELD_SCHEMAS,
    },
    required: ['taskIds'],
  },
  execute: async (args, ctx) => {
    const taskIds = requiredStringArray(args, 'taskIds', { max: BATCH_CAP, what: 'tasks' });

    /*
     * ITEM 13D — THE PATCH IS READ ONCE, OUTSIDE THE LOOP.
     *
     * Which is what makes this tool's shape honest: it is *one* change applied
     * to a list, not a list of changes. Reading it per task would let a
     * malformed date fail on task three having already written tasks one and
     * two — the arguments are the same for every id, so an argument that is
     * wrong is wrong before anything is touched, and throwing here lets
     * `defineTool` return it as one clean refusal that wrote nothing.
     *
     * The two things that genuinely differ per task are read inside: `status`
     * has to know whether *this* task was completed, and `dependsOn` has to
     * know whether *this* task is in its own prerequisite chain.
     */
    const { updates: shared, notes } = readTaskFields(args, ctx);

    const title = optionalString(args, 'title');
    if (title !== undefined) {
      if (title.trim() === '') throw new ToolArgError('"title" cannot be blank.');
      if (taskIds.length > 1) {
        throw new ToolArgError(
          `"title" renames a task, and ${taskIds.length} ids were given — that would give them all the same name. Rename them one call each.`,
        );
      }
      shared.title = title.trim();
    }

    const status = optionalEnum(args, 'status', OPEN_STATUSES);
    if (status !== undefined) shared.status = status;

    const clear = optionalStringArray(args, 'clear') ?? [];
    for (const field of clear) {
      if (!(CLEARABLE_FIELDS as readonly string[]).includes(field)) {
        throw new ToolArgError(`"clear" cannot include "${field}". Clearable fields: ${CLEARABLE_FIELDS.join(', ')}.`);
      }
      if (field in shared) throw new ToolArgError(`"${field}" was both set and cleared. Do one or the other.`);
      (shared as Record<string, unknown>)[field] = undefined;
      // `recurrence` is the preset half of the same fact (`resolveRule` reads
      // both), so clearing only the rule would leave a task still labelled as
      // repeating with nothing to repeat by.
      if (field === 'recurrenceRule') shared.recurrence = 'none';
    }

    if (Object.keys(shared).length === 0 && !('dependsOn' in args)) {
      return {
        ok: false,
        summary: `Nothing to change — pass at least one field, or "clear".`,
      };
    }

    const outcome = await runBatch(taskIds, async (taskId) => {
      const state = ctx.store.getState();
      const found = findTaskAnywhere(state, taskId);
      if (!found) return { ok: false as const, reason: missingIdReason('task') };

      const updates: Partial<Task> = { ...shared };
      // Reopening something completed clears the completion stamp — but only
      // for the tasks that actually were completed.
      if (status !== undefined && found.task.status === 'completed') updates.completedAt = undefined;

      let dependsOn: string[] | undefined;
      try {
        dependsOn = readDependsOn(args, state, taskId);
      } catch (err) {
        // A prerequisite loop is a fact about *this* task, so it fails this
        // task and leaves the rest of the batch alone.
        return { ok: false as const, title: found.task.title, reason: err instanceof Error ? err.message : String(err) };
      }
      if (dependsOn !== undefined) updates.dependsOn = dependsOn;

      const changed = [...Object.keys(updates)];
      if (changed.length === 0) {
        return { ok: false as const, title: found.task.title, reason: 'nothing was left to change on it.' };
      }

      ctx.snapshots.captureTask(ctx.snapshotHandle, taskId);
      if (found.location === 'focusQueue') {
        ctx.store.updateFocusTask(taskId, updates);
      } else {
        ctx.store.updateBacklogTask(taskId, updates);
      }

      // A subtask carries only a subset of a task's fields; anything else in the
      // patch is silently dropped by the store, so say so rather than reporting
      // a change that did not happen.
      const unwritable =
        found.location === 'subtask'
          ? changed.filter((key) => !(SUBTASK_PROXY_FIELDS as readonly string[]).includes(key))
          : [];
      const written = changed.filter((key) => !unwritable.includes(key));

      if (written.length === 0) {
        return {
          ok: false as const,
          title: found.task.title,
          reason: `it is a step, and a step does not store ${unwritable.join(', ')}.`,
        };
      }

      return { ok: true as const, title: found.task.title, value: { taskId, changed: written, unwritable } };
    });

    return batchResult(
      outcome,
      (done) => {
        const fields = [...new Set(done.flatMap((entry) => entry.value.changed))];
        const unwritable = [...new Set(done.flatMap((entry) => entry.value.unwritable))];
        const parts = [
          done.length === 1
            ? `Updated "${done[0].title}": ${fields.join(', ')}`
            : `Updated ${done.length} tasks — ${fields.join(', ')} on ${titleList(done.map((entry) => entry.title))}`,
        ];
        if (notes.length > 0) parts.push(notes.join('; '));
        if (unwritable.length > 0) parts.push(`could not set ${unwritable.join(', ')} on a step, which does not store those`);
        return `${parts.join(' — ')}.`;
      },
      { tasks: outcome.done.map((entry) => entry.value) },
    );
  },
});

// ─── complete_task ──────────────────────────────────────────────────────────

export const completeTask: ToolDef = defineTool({
  name: 'complete_task',
  mutates: true,
  description:
    'Mark tasks finished. Takes a list — "I finished these five things" is ONE call with five ids, never five calls. ' +
    'Use this and not update_task whenever the user says something is done, finished, sorted or handled. A completed ' +
    'task stays in the backlog and can be reopened with update_task; completing is not deleting.',
  parametersSchema: {
    type: 'object',
    properties: {
      taskIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Exact ids from search_tasks, list_today, or tasks you just created. Every task the user said was done, in one list.',
      },
    },
    required: ['taskIds'],
  },
  execute: async (args, ctx) => {
    const taskIds = requiredStringArray(args, 'taskIds', { max: BATCH_CAP, what: 'tasks' });

    const outcome = await runBatch(taskIds, async (taskId) => {
      const state = ctx.store.getState();
      const found = findTaskAnywhere(state, taskId);
      if (!found) return { ok: false as const, reason: missingIdReason('task') };

      if (found.task.status === 'completed') {
        return { ok: true as const, title: found.task.title, value: { taskId, alreadyCompleted: true, completedAt: undefined } };
      }

      /*
       * ITEM 19'S LOCK, AND ATLAS IS INSIDE IT.
       *
       * A blocked task cannot be completed on any of the five screens, and a
       * rule that stops being true the moment you ask the chat instead is not
       * a rule — it is a rule with a door in it. So this refuses too, per task
       * and not per call: the other ids in the same batch still go through,
       * which is `runBatch`'s whole contract and the reason "I finished these
       * five things" does not have to be retried as five calls.
       *
       * **Nothing above this line changed.** The refusal lives in the body,
       * not in the tool's description or its schema, so the text the local
       * model reads is byte-for-byte what it was and no tier of the benchmark
       * has moved. The model finds out the way it finds out about a missing
       * id: from the result, in a sentence naming what to do instead.
       *
       * Only a real `Task` can be blocked. A subtask has no `dependsOn` — the
       * picker offers top-level tasks only, and `SUBTASK_PROXY_FIELDS` does not
       * carry the field — so `location === 'subtask'` is never locked, and
       * `isTaskLocked`'s reading of the queue copy's `scheduledAnyway` is what
       * lets the agent finish a task you overrode into today.
       */
      if (found.location !== 'subtask') {
        const blockers = getBlockingTasks(state.backlogTasks, found.task as Task);
        if (blockers.length > 0 && !(found.task as Task).scheduledAnyway) {
          return {
            ok: false as const,
            reason: `it is waiting on ${titleList(blockers.map((b) => b.title))}, which ${blockers.length === 1 ? 'is' : 'are'} not finished — complete that first, or tell the user it is blocked.`,
          };
        }
      }

      // `completedAt` is not one of the fields a subtask stores, so writing it
      // there would be a lie in the summary.
      const updates: Partial<Task> =
        found.location === 'subtask' ? { status: 'completed' } : { status: 'completed', completedAt: ctx.now.getTime() };

      ctx.snapshots.captureTask(ctx.snapshotHandle, taskId);
      if (found.location === 'focusQueue') {
        ctx.store.updateFocusTask(taskId, updates);
      } else {
        ctx.store.updateBacklogTask(taskId, updates);
      }

      return { ok: true as const, title: found.task.title, value: { taskId, alreadyCompleted: false, completedAt: updates.completedAt } };
    });

    return batchResult(
      outcome,
      (done) => {
        /*
         * "Already completed" is a success — it always was — but it is not a
         * change, and a sentence that says "Completed X" about a task that was
         * already ticked is the kind of small lie that makes a transcript
         * untrustworthy. So the two are counted apart.
         */
        const changed = done.filter((entry) => !entry.value.alreadyCompleted);
        const already = done.filter((entry) => entry.value.alreadyCompleted);
        const parts: string[] = [];
        if (changed.length > 0) parts.push(`Completed ${titleList(changed.map((entry) => entry.title))}`);
        if (already.length > 0) {
          parts.push(
            changed.length > 0
              ? `${already.length} ${already.length === 1 ? 'was' : 'were'} already done`
              : `${titleList(already.map((entry) => entry.title))} ${already.length === 1 ? 'was' : 'were'} already completed, so nothing changed`,
          );
        }
        return `${parts.join('; ')}.`;
      },
      { tasks: outcome.done.map((entry) => entry.value) },
    );
  },
});

export const taskTools: ToolDef[] = [searchTasks, listAllTasks, getTask, createTask, updateTask, completeTask];
