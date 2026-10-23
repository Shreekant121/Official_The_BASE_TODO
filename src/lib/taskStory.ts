/**
 * The task's story (29-1P9c, idea 166 of round 10): what has happened to a
 * task, shown in its sheet. The pure half — what one change to the backlog
 * says, how a stored story is trimmed, and how it reads. `taskStorySync.ts`
 * is the browser's half and `mcp/store.ts` the laptop's; both hand this
 * module the backlog before and after a write and append what it returns.
 *
 * His four calls (2026-10-14, `docs/design/task-story.html`):
 *   - **Every edit (1C).** The moments — done, pushed, a deadline moved and
 *     why, moved to another list, a step done, Emergency, Red Alert, handed to
 *     someone, a milestone — each get their own line, and so does every other
 *     edit. Plain field edits made in one go are ONE line ("Changed the
 *     description and estimate"): a Save on the sheet writes eight fields at
 *     once, and eight lines for one press would bury the moments under it.
 *   - **Synced (2A)**, one document per task, `users/{uid}/story/{taskId}` —
 *     never `data/main`.
 *   - **The last 30 per task (3A)**, and "Made" always stays.
 *   - **Anything Atlas did is violet**, whichever machine it ran on.
 *
 * WHAT IS STORED AND WHAT IS READ OFF THE TASK
 * --------------------------------------------
 * Nothing recorded history before this shipped, so three things are worked
 * out from what the app already keeps rather than stored: when the task was
 * made (`createdAt`), each day it was focused on (`focusLog`), and when it was
 * done (`completedAt`). An old task therefore has a story on day one. A stored
 * "made" or "done" wins over the worked-out one, which only fills a gap.
 *
 * Node-safe on purpose — `mcp/` imports it — so: types from the store, dates
 * from `agent/dates.ts`, nothing that knows about a browser or Firebase.
 */
import type { FocusLogEntry, Subtask, Task, TaskList } from '../store/useStore';
import { parseStoredDate, toZonedDayString, zonedParts } from './agent/dates';

/** His number: the last 30 moments per task. */
export const STORY_CAP = 30;

/** A task that turns up younger than this was made; older, it was put back (Trash, Archive, an undo). */
const FRESH_MS = 5 * 60_000;

/**
 * One moment, as stored. Short keys because thirty of these sit in a
 * document per task. A key that would be `undefined` is left out, never set
 * to it — Firestore refuses the write otherwise.
 */
export type StoryEvent = { at: number; by?: 'atlas' } & (
  | { k: 'made'; list?: string }
  | { k: 'back' }
  | { k: 'gone'; archived?: true }
  | { k: 'done' }
  | { k: 'reopened' }
  | { k: 'deadline'; to?: string; because?: string }
  | { k: 'start'; to?: string }
  | { k: 'moved'; to: string }
  | { k: 'avoided'; n: number }
  | { k: 'step'; t: string }
  | { k: 'emergency'; n: number }
  | { k: 'importance'; n: number }
  | { k: 'assigned'; to?: string }
  | { k: 'milestone'; on: boolean }
  | { k: 'title'; from: string }
  | { k: 'red'; score: number }
  | { k: 'edit'; f: string[] }
);

export type StoryKind = StoryEvent['k'];

/** A moment worked out from the task or the focus log, never stored. */
export type StoryFocus = { k: 'focus'; at: number; sec: number; n: number };

export type StoryItem = StoryEvent | StoryFocus;

// ── Reading a change ─────────────────────────────────────────────────────────

/**
 * Fields whose change is a plain edit, and the words for them. Several fields
 * that move together share one word (the estimate is two fields).
 */
const EDIT_WORDS: Record<string, string> = {
  description: 'description',
  estimatedTime: 'estimate',
  allocatedTime: 'estimate',
  recurrence: 'repeat',
  recurrenceRule: 'repeat',
  reminderMinutes: 'reminder',
  dependsOn: 'Depends on',
  deadlineIsFixed: 'fixed deadline',
  links: 'links',
  imageUrl: 'cover',
  valueINR: 'value',
  status: 'status',
  ignored: 'Ignore',
  notWorked: 'counts as worked',
  skillId: 'skill',
  shareId: 'sharing',
  shortUrlKeyword: 'sharing',
  shortUrlDomain: 'sharing',
  hiddenFromShare: 'sharing',
  shareAllowContributions: 'sharing',
  shareShowPeople: 'sharing',
  shareExpiresOn: 'sharing',
  sharedListIds: 'lists it is shared into',
  subtasks: 'steps',
};

/**
 * Fields that change without anyone editing them, or that a moment above
 * already says. `order` moves when a neighbour is dragged; `listName` rides
 * with `listId`; the series fields, `originalDeadline` and `assignedAt` are
 * stamped by the store; `priority` is a dead field.
 */
const QUIET = new Set([
  'id', 'order', 'listName', 'priority', 'originalDeadline', 'assignedAt', 'completedAt', 'createdAt',
  'googleEventId', 'seriesId', 'occurrence', 'seriesAnchor', 'customRecurrence', 'isSubtaskProxy',
  'scheduledAnyway', 'parent',
  // The evening's memory (29-1c2) rides with the deadline it moved.
  'beforeEvening',
  // Said by their own moments below.
  'title', 'deadline', 'startDate', 'listId', 'avoidedCount', 'emergencyBoost', 'humanOverride',
  'assignee', 'milestone',
]);

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

interface FlatStep { title: string; done: boolean }

function flatSteps(steps: readonly Subtask[] | undefined, out = new Map<string, FlatStep>()): Map<string, FlatStep> {
  for (const s of steps ?? []) {
    out.set(s.id, { title: s.title, done: s.status === 'completed' });
    flatSteps(s.subtasks, out);
  }
  return out;
}

/** Steps newly ticked, and whether anything else about the steps changed. */
function stepChanges(before: Task, after: Task): { ticked: string[]; edited: boolean } {
  if (same(before.subtasks, after.subtasks)) return { ticked: [], edited: false };
  const a = flatSteps(before.subtasks);
  const b = flatSteps(after.subtasks);
  const ticked: string[] = [];
  let unticked = false;
  for (const [id, step] of b) {
    const was = a.get(id);
    if (!was) continue;
    if (step.done && !was.done) ticked.push(step.title);
    if (!step.done && was.done) unticked = true;
  }
  /* Added, removed, renamed or moved steps, or an untick, are an edit. So is
     a change that is none of those and no tick either — a step's own
     deadline or score fields. */
  const shape = (m: Map<string, FlatStep>) => JSON.stringify([...m].map(([id, s]) => [id, s.title]));
  const edited = unticked || shape(a) !== shape(b) || ticked.length === 0;
  return { ticked, edited };
}

function listTitle(lists: readonly TaskList[], id: string | undefined, fallback?: string): string | undefined {
  if (!id) return fallback;
  return lists.find((l) => l.id === id)?.title ?? fallback;
}

/** "description", "description and estimate", "description, estimate and repeat". */
export function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

function changesOf(
  before: Task,
  after: Task,
  base: { at: number; by?: 'atlas' },
  ctx: { lists: readonly TaskList[]; titleOf: (id: string) => string | undefined; deadlineMoved: Set<string> },
): StoryEvent[] {
  const out: StoryEvent[] = [];
  const nowDone = after.status === 'completed';
  const wasDone = before.status === 'completed';

  if (nowDone && !wasDone) out.push({ ...base, k: 'done' });
  if (!nowDone && wasDone) out.push({ ...base, k: 'reopened' });

  if (before.title !== after.title) out.push({ ...base, k: 'title', from: clip(before.title) });

  if (before.deadline !== after.deadline) {
    const because = after.deadline && (after.dependsOn ?? []).find((id) => ctx.deadlineMoved.has(id));
    const name = because ? ctx.titleOf(because) : undefined;
    out.push({
      ...base,
      k: 'deadline',
      ...(after.deadline ? { to: after.deadline } : {}),
      ...(name ? { because: clip(name) } : {}),
    });
  }
  if (before.startDate !== after.startDate) {
    out.push({ ...base, k: 'start', ...(after.startDate ? { to: after.startDate } : {}) });
  }
  if (before.listId !== after.listId) {
    const to = listTitle(ctx.lists, after.listId, after.listName);
    if (to) out.push({ ...base, k: 'moved', to: clip(to) });
  }
  if ((after.avoidedCount ?? 0) > (before.avoidedCount ?? 0)) {
    out.push({ ...base, k: 'avoided', n: after.avoidedCount ?? 0 });
  }
  if ((before.emergencyBoost ?? 0) !== (after.emergencyBoost ?? 0)) {
    out.push({ ...base, k: 'emergency', n: after.emergencyBoost ?? 0 });
  }
  if ((before.humanOverride ?? null) !== (after.humanOverride ?? null) && after.humanOverride !== undefined) {
    out.push({ ...base, k: 'importance', n: after.humanOverride });
  }
  if ((before.assignee ?? '') !== (after.assignee ?? '')) {
    out.push({ ...base, k: 'assigned', ...(after.assignee ? { to: clip(after.assignee) } : {}) });
  }
  if (!!before.milestone !== !!after.milestone) out.push({ ...base, k: 'milestone', on: !!after.milestone });

  const steps = stepChanges(before, after);
  for (const t of steps.ticked) out.push({ ...base, k: 'step', t: clip(t) });

  const words: string[] = [];
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const key of keys) {
    if (QUIET.has(key)) continue;
    const a = (before as unknown as Record<string, unknown>)[key];
    const b = (after as unknown as Record<string, unknown>)[key];
    if (same(a, b)) continue;
    if (key === 'subtasks' && !steps.edited) continue;
    /* Done and reopened are said above; only a status that is neither
       (in progress) is an edit. */
    if (key === 'status' && (nowDone || wasDone)) continue;
    const word = EDIT_WORDS[key] ?? 'details';
    if (!words.includes(word)) words.push(word);
  }
  if (words.length > 0) out.push({ ...base, k: 'edit', f: words });
  return out;
}

/** A title or name, as a story line can hold it. */
function clip(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > 60 ? `${t.slice(0, 59)}…` : t;
}

export interface StoryDiffContext {
  now: number;
  /** Set while Atlas's tools are writing (`store/storyActor.ts`). */
  by?: 'atlas';
  lists: readonly TaskList[];
  /** Tasks that left the backlog for the Archive rather than the Trash. */
  archived?: ReadonlySet<string>;
}

/**
 * What one write said about each task it touched: the backlog before and
 * after it, in, a map of task id to the moments to append, out. A press that
 * changed nothing about a task says nothing about it.
 */
export function storyDiff(
  before: readonly Task[],
  after: readonly Task[],
  ctx: StoryDiffContext,
): Map<string, StoryEvent[]> {
  const out = new Map<string, StoryEvent[]>();
  if (before === after) return out;
  const base = { at: ctx.now, ...(ctx.by ? { by: ctx.by } : {}) };
  const was = new Map(before.map((t) => [t.id, t]));
  const now = new Map(after.map((t) => [t.id, t]));
  const titleOf = (id: string) => now.get(id)?.title ?? was.get(id)?.title;

  /* A deadline that moved in this same write is "because" for anything
     waiting on it whose date moved too: that is item 18's cascade. */
  const deadlineMoved = new Set<string>();
  for (const t of after) {
    const old = was.get(t.id);
    if (old && old !== t && old.deadline !== t.deadline) deadlineMoved.add(t.id);
  }

  const add = (id: string, events: StoryEvent[]) => {
    if (events.length > 0) out.set(id, [...(out.get(id) ?? []), ...events]);
  };

  for (const t of after) {
    if (t.isSubtaskProxy) continue;
    const old = was.get(t.id);
    if (old === t) continue;
    if (!old) {
      const fresh = typeof t.createdAt !== 'number' || ctx.now - t.createdAt < FRESH_MS;
      const list = listTitle(ctx.lists, t.listId, t.listName);
      add(t.id, [fresh ? { ...base, k: 'made', ...(list ? { list: clip(list) } : {}) } : { ...base, k: 'back' }]);
      continue;
    }
    add(t.id, changesOf(old, t, base, { lists: ctx.lists, titleOf, deadlineMoved }));
  }
  for (const t of before) {
    if (t.isSubtaskProxy || now.has(t.id)) continue;
    add(t.id, [{ ...base, k: 'gone', ...(ctx.archived?.has(t.id) ? { archived: true as const } : {}) }]);
  }
  return out;
}

/**
 * Tasks that became Red Alert between two scoring passes. The moment is the
 * pass's minute and the score is the pass's, so two devices watching the same
 * data write the same object — which `arrayUnion` and `appendToStory` both
 * keep once.
 */
export function newRedAlerts(
  wasRed: ReadonlySet<string>,
  isRed: ReadonlyMap<string, number>,
  at: number,
): Map<string, StoryEvent[]> {
  const out = new Map<string, StoryEvent[]>();
  for (const [id, score] of isRed) {
    if (!wasRed.has(id)) out.set(id, [{ at, k: 'red', score: Math.round(score * 10) / 10 }]);
  }
  return out;
}

// ── Keeping it short ─────────────────────────────────────────────────────────

/**
 * Appends to a stored story and trims it to the cap: the first "made" stays,
 * the rest is the newest. An event already there (the same object, as two
 * devices write for one Red Alert) is not added twice.
 */
export function appendToStory(stored: readonly StoryEvent[], add: readonly StoryEvent[], cap = STORY_CAP): StoryEvent[] {
  const seen = new Set(stored.map((e) => JSON.stringify(e)));
  const all = [...stored];
  for (const e of add) {
    const key = JSON.stringify(e);
    if (!seen.has(key)) { seen.add(key); all.push(e); }
  }
  return trimStory(all, cap);
}

export function trimStory<T extends { k: string; at: number }>(events: readonly T[], cap = STORY_CAP): T[] {
  const sorted = [...events].sort((a, b) => a.at - b.at);
  if (sorted.length <= cap) return sorted;
  const made = sorted.find((e) => e.k === 'made');
  const rest = sorted.filter((e) => e !== made);
  return made ? [made, ...rest.slice(rest.length - (cap - 1))] : rest.slice(rest.length - cap);
}

/** A stored value that is a list of moments, or nothing usable. */
export function readStoredStory(data: unknown): StoryEvent[] {
  const events = (data as { events?: unknown } | undefined)?.events;
  if (!Array.isArray(events)) return [];
  return events.filter((e): e is StoryEvent =>
    !!e && typeof e === 'object' && typeof (e as StoryEvent).at === 'number' && typeof (e as StoryEvent).k === 'string');
}

// ── The story as the sheet shows it ──────────────────────────────────────────

/**
 * The stored moments plus what is worked out from the task and the focus log,
 * newest first, at most `cap` with "made" kept. Focus is one line per day in
 * his zone ("Focused 1 h 35 m, 2 stretches"), so a task worked on daily does
 * not fill its story on focus alone.
 */
export function buildStory(
  stored: readonly StoryEvent[],
  task: Pick<Task, 'id' | 'createdAt' | 'status' | 'completedAt'>,
  focusLog: readonly FocusLogEntry[],
  timeZone: string,
  cap = STORY_CAP,
): StoryItem[] {
  const items: StoryItem[] = [...stored];

  if (!stored.some((e) => e.k === 'made') && typeof task.createdAt === 'number') {
    items.push({ at: task.createdAt, k: 'made' });
  }
  if (task.status === 'completed' && typeof task.completedAt === 'number') {
    const at = task.completedAt;
    const said = stored.some((e) => e.k === 'done' && Math.abs(e.at - at) < 2 * 60_000);
    if (!said) items.push({ at, k: 'done' });
  }

  const days = new Map<string, StoryFocus>();
  for (const f of focusLog) {
    if (f.taskId !== task.id || !(f.seconds > 0)) continue;
    const day = toZonedDayString(new Date(f.endedAt), timeZone);
    const had = days.get(day);
    days.set(day, had
      ? { ...had, at: Math.max(had.at, f.endedAt), sec: had.sec + f.seconds, n: had.n + 1 }
      : { k: 'focus', at: f.endedAt, sec: f.seconds, n: 1 });
  }
  items.push(...days.values());

  return trimStory(items, cap).reverse();
}

export type StoryTone = 'lime' | 'teal' | 'sky' | 'coral' | 'violet' | 'grey' | 'white';

export interface StoryLine {
  text: string;
  /** The day, then what else there is to say. */
  sub: string;
  tone: StoryTone;
}

/** "1 h 35 m", "40 m", "under a minute". */
export function focusWords(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 1) return 'under a minute';
  const h = Math.floor(m / 60);
  return h > 0 ? `${h} h${m % 60 ? ` ${m % 60} m` : ''}` : `${m} m`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today", "Yesterday", "3 Sep", "3 Sep 2025". */
export function storyDay(at: number, now: number, timeZone: string): string {
  const day = toZonedDayString(new Date(at), timeZone);
  if (day === toZonedDayString(new Date(now), timeZone)) return 'Today';
  if (day === toZonedDayString(new Date(now - 86_400_000), timeZone)) return 'Yesterday';
  const p = zonedParts(new Date(at), timeZone);
  const year = zonedParts(new Date(now), timeZone).year;
  return `${p.day} ${MONTHS[p.month - 1]}${p.year === year ? '' : ` ${p.year}`}`;
}

/** A stored date as "16 Mar" or "16 Mar 2027". */
function dateWords(value: string, now: number, timeZone: string): string {
  const instant = parseStoredDate(value, timeZone);
  if (!instant) return value;
  const p = zonedParts(instant, timeZone);
  const year = zonedParts(new Date(now), timeZone).year;
  return `${p.day} ${MONTHS[p.month - 1]}${p.year === year ? '' : ` ${p.year}`}`;
}

const TIMES = ['', 'once', 'twice'];

/** One moment in words and in its colour (one colour, one job). */
export function storyLine(item: StoryItem, now: number, timeZone: string): StoryLine {
  const day = storyDay(item.at, now, timeZone);
  const atlas = item.k !== 'focus' && item.by === 'atlas';
  const line = (text: string, tone: StoryTone, more?: string): StoryLine => ({
    text,
    sub: [day, more, atlas ? 'by Atlas' : undefined].filter(Boolean).join(' · '),
    tone: atlas ? 'violet' : tone,
  });

  switch (item.k) {
    case 'focus':
      return line(`Focused ${focusWords(item.sec)}`, 'teal', item.n > 1 ? `${item.n} stretches` : undefined);
    case 'made':
      return line(item.list ? `Made in ${item.list}` : 'Made', 'grey');
    case 'back':
      return line('Put back', 'grey');
    case 'gone':
      return line(item.archived ? 'Archived' : 'Deleted', 'grey');
    case 'done':
      return line('Done', 'lime');
    case 'reopened':
      return line('Opened again', 'grey');
    case 'deadline':
      return line(
        item.to ? `Due ${dateWords(item.to, now, timeZone)}` : 'Deadline removed',
        'sky',
        item.because ? `because “${item.because}” moved` : undefined,
      );
    case 'start': {
      if (!item.to) return line('Start date removed', 'sky');
      const startDay = item.to.slice(0, 10);
      const tomorrow = toZonedDayString(new Date(item.at + 86_400_000), timeZone);
      return line(startDay === tomorrow ? 'Pushed to tomorrow' : `Start set to ${dateWords(item.to, now, timeZone)}`, 'sky');
    }
    case 'moved':
      return line(`Moved to ${item.to}`, 'grey');
    case 'avoided':
      return line('Put off', 'sky', `avoided ${TIMES[item.n] ?? `${item.n} times`}`);
    case 'step':
      return line(`Step done: ${item.t}`, 'lime');
    case 'emergency':
      return item.n > 0 ? line(`Emergency ${item.n}`, 'coral') : line('Emergency cleared', 'grey');
    case 'importance':
      return line(`Importance set to ${item.n}`, 'white');
    case 'assigned':
      return line(item.to ? `Handed to ${item.to}` : 'Taken back', 'grey');
    case 'milestone':
      return line(item.on ? 'Made a milestone' : 'No longer a milestone', item.on ? 'lime' : 'grey');
    case 'title':
      return line('Renamed', 'grey', `was “${item.from}”`);
    case 'red':
      return line('Became Red alert', 'coral', `score ${item.score}`);
    case 'edit':
      return line(`Changed the ${joinWords(item.f)}`, 'grey');
  }
}
