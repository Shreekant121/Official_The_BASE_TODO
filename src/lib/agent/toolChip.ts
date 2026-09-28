import { parseStoredDate, resolveDateInput } from './dates';
import { getTool } from './tools';
import type { AgentToolCall } from './types';

/**
 * A tool call, as something a person can read.
 *
 * The transcript shows what the agent *did*, not what it sent: a line reading
 * `Updated ‘Call the CA’ · deadline → Thu 6pm` is checkable at a glance, and a
 * pretty-printed tool call is not. Everything here is derived from the
 * call the loop already recorded — nothing is re-computed against the store, so
 * a line always describes the moment it happened rather than the state now.
 *
 * `summary` is the fallback for anything unrecognised, including a tool a later
 * step adds and forgets to teach this file about.
 *
 * UI-33 added the second half. `screens/assistant.html` draws a turn's *reads*
 * and its *writes* as two different objects — what it found is a stack of task
 * rows, what it wrote is one bordered container with the Revert button in its
 * footer — so this module now answers both questions about a call: `wrote`
 * says which side it belongs on, and `describeTaskRows` unpacks the rows a read
 * came back with. Both stay here rather than in the page because they are the
 * same job the chip does: one recorded call, rendered for a person.
 */

export type ToolChipIcon =
  | 'search' | 'read' | 'create' | 'update' | 'complete' | 'queue'
  /** Item 9D: the MCP-only half of the registry reaches the transcript now. */
  | 'step' | 'delete' | 'restore'
  /** Item 11: the web drawer, which is the first tool here that no MCP server of the app's declares. */
  | 'web' | 'link' | 'flag'
  /** Item 13: the two share tools, and the one act that goes through the front door. */
  | 'share' | 'unshare';

/**
 * The glyph each chip kind wears, in `Icon`'s own vocabulary.
 *
 * Here rather than in a screen since item 13, because two screens draw these
 * now — the chat transcript's chips and the action log's rows — and a second
 * copy of the table is a second thing that goes stale when a tool is added.
 * The names are the design bundle's: `trash-2` is `/trash`'s own nav glyph,
 * `undo-2` is the one a spent changes container wears, and `shield-alert` is
 * `atlas.html`'s glyph for something that tried to give Atlas instructions.
 */
export const CHIP_ICON_NAMES: Record<ToolChipIcon, string> = {
  search: 'search',
  read: 'file-text',
  create: 'plus',
  update: 'pencil',
  complete: 'circle-check',
  queue: 'list-checks',
  step: 'list-tree',
  delete: 'trash-2',
  restore: 'undo-2',
  web: 'globe',
  link: 'link',
  flag: 'shield-alert',
  share: 'link-2',
  unshare: 'unlink',
};

export interface ToolChip {
  icon: ToolChipIcon;
  /** `Updated` */
  verb: string;
  /** The task's title, unquoted. */
  subject?: string;
  /** `deadline → Thu 6pm` */
  detail?: string;
  ok: boolean;
  /** The model-facing sentence, for the chip's tooltip. */
  summary: string;
  /**
   * True when this call changed the backlog. Read from the registry's own
   * `mutates` flag rather than a list kept here, so a tool added later cannot
   * land in the wrong half of a turn by being forgotten.
   */
  wrote: boolean;
}

/** One task a read came back with, ready for `<TaskRow>`. */
export interface AgentTaskRow {
  id: string;
  title: string;
  /** `Operations · due Fri 6pm` */
  meta: string;
  /**
   * The deadline on its own (item 13G).
   *
   * `meta` above joins the list name and the deadline into one sentence, which
   * is what `TaskRow` wants and exactly what the redrawn chat screen cannot
   * use: `atlas.html`'s row puts the two in separate columns, right-aligned,
   * so a stack of them reads down as well as across. Both are produced rather
   * than one derived from the other by splitting a string.
   */
  due?: string;
  /**
   * Where the task lives — its project, or its list when it has no project.
   *
   * The mockup's fourth fact is the *project*, and it can afford to be: every
   * row in its data has one. This app's do not — Self Care and Skills are
   * top-level lists — and an empty fourth cell is worse than a wrong one here,
   * because `.tr-meta` is right-aligned, so a row missing it slides its
   * deadline and its status out of line with every row above it. The column's
   * question is "where does this live", and every task has an answer to that.
   */
  where: string;
  /** Pre-formatted with its unit, per `TaskRow.prompt.md`. `list_today` only. */
  allocated?: string;
  status: 'running' | 'queued' | 'done' | 'overrun';
  statusLabel: string;
}

/** How many `field → value` pairs fit in a chip before it stops being one. */
const MAX_FIELDS = 2;

/** `Thu 6pm`, `Thu 6:30pm`, `12 Sep 9am` when it is more than a week out. */
function shortDate(instant: Date, timezone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';

  const minute = read('minute');
  const dayPeriod = read('dayPeriod').toLowerCase().replace(/\s/g, '');
  const clock = `${read('hour')}${minute === '00' ? '' : `:${minute}`}${dayPeriod}`;

  const withinAWeek = Math.abs(instant.getTime() - now.getTime()) < 7 * 86_400_000;
  return withinAWeek ? `${read('weekday')} ${clock}` : `${read('day')} ${read('month')} ${clock}`;
}

/**
 * What the user typed, rendered the way the task will show it. A relative word
 * ("tomorrow") is resolved the same way the tool resolved it; anything that is
 * not a date at all is passed through verbatim rather than guessed at.
 */
function describeValue(field: string, raw: unknown, timezone: string, now: Date): string {
  if (raw === null || raw === undefined) return 'cleared';
  if (Array.isArray(raw)) return raw.length === 0 ? 'none' : raw.join(', ');
  if (typeof raw === 'boolean') return raw ? 'yes' : 'no';

  const text = String(raw);
  if (field === 'deadline' || field === 'startDate') {
    const resolved = resolveDateInput(text, now, timezone);
    if (resolved.ok) return shortDate(resolved.instant, timezone, now);
    const stored = parseStoredDate(text, timezone);
    return stored ? shortDate(stored, timezone, now) : text;
  }
  if (field === 'estimatedTime') return `${text} min`;
  return text.length > 28 ? `${text.slice(0, 27)}…` : text;
}

function joinFields(pairs: string[]): string | undefined {
  if (pairs.length === 0) return undefined;
  const shown = pairs.slice(0, MAX_FIELDS).join(', ');
  return pairs.length > MAX_FIELDS ? `${shown} +${pairs.length - MAX_FIELDS} more` : shown;
}

/** Tool summaries name their task in double quotes; that is the subject. */
function quotedSubject(summary: string): string | undefined {
  return /"([^"]+)"/.exec(summary)?.[1];
}

function readString(args: AgentToolCall['args'], key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function readCount(data: unknown, key: string): number | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : undefined;
}

/** Like `readString`, but off a tool's `data`, which is `unknown` rather than `ToolArgs`. */
function readDataString(data: unknown, key: string): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const value = (data as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function readStringArray(data: unknown, key: string): string[] {
  if (typeof data !== 'object' || data === null) return [];
  const value = (data as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function readArrayLength(data: unknown, key: string): number {
  if (typeof data !== 'object' || data === null) return 0;
  const value = (data as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.length : 0;
}

/** The rows a batching tool came back with, whatever it calls them. `[]` for anything else. */
function readRows(data: unknown, key: string): Record<string, unknown>[] {
  if (typeof data !== 'object' || data === null) return [];
  const value = (data as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null) : [];
}

/**
 * ITEM 13D — A CHIP FOR A CALL THAT ACTED ON MANY THINGS.
 *
 * Every mutating tool takes a list now, so `Completed · Email the CA` is no
 * longer the whole truth about a call that completed five. The rule is the one
 * the summaries follow: **one thing keeps its name, several become a count.**
 * A chip is one line on a phone, and five titles in it ellipsise to nothing.
 *
 * `quotedSubject` still supplies the name in the one-thing case — it reads the
 * tool's own sentence, so a tool that rewords keeps working — and this only
 * takes over when there is more than one.
 */
function batchSubject(count: number, noun: string, fallback: string | undefined): string | undefined {
  return count > 1 ? `${count} ${noun}${count === 1 ? '' : 's'}` : fallback;
}

/**
 * What did not happen, for the end of the detail line.
 *
 * Partial success is the normal shape of a batch — ten good ids and two bad
 * ones — and a chip that showed only the ten would be the misleading half of
 * a true sentence. The reasons are in `summary`, which is the chip's tooltip
 * and the log row's open panel; the count is what fits on the line.
 */
function failedNote(data: unknown): string | null {
  const failed = readArrayLength(data, 'failed');
  return failed > 0 ? `${failed} failed` : null;
}

/** `detail`, with the failure count appended when there was one. */
function withFailures(data: unknown, parts: (string | null | undefined)[]): string | undefined {
  const joined = [...parts, failedNote(data)].filter(Boolean).join(' · ');
  return joined === '' ? undefined : joined;
}

export function describeToolCall(call: AgentToolCall, timezone: string, now: Date = new Date()): ToolChip {
  const base = {
    ok: call.ok,
    summary: call.summary,
    // A mutating tool that FAILED wrote nothing, so it belongs on the read
    // side of the turn — the changes container is what did land.
    wrote: call.ok && (getTool(call.name)?.mutates ?? false),
  };
  const subject = quotedSubject(call.summary);

  // A failure has no interesting arguments to show, only a reason.
  if (!call.ok) {
    const iconByTool: Record<string, ToolChipIcon> = {
      search_tasks: 'search',
      list_all_tasks: 'read',
      get_task: 'read',
      create_task: 'create',
      update_task: 'update',
      move_task: 'update',
      complete_task: 'complete',
      add_to_today: 'queue',
      remove_from_today: 'queue',
      list_today: 'queue',
      add_subtask: 'step',
      update_subtask: 'step',
      remove_subtask: 'step',
      list_subtasks: 'step',
      delete_task: 'delete',
      list_trash: 'restore',
      restore_from_trash: 'restore',
      search_web: 'web',
      fetch_url: 'link',
      publish_share_link: 'share',
      revoke_share_link: 'unshare',
      create_project: 'create',
      create_list: 'create',
      update_project: 'update',
      update_list: 'update',
      delete_project: 'delete',
      delete_list: 'delete',
    };
    return { ...base, icon: iconByTool[call.name] ?? 'read', verb: call.name.replace(/_/g, ' '), detail: call.summary };
  }

  switch (call.name) {
    case 'search_tasks': {
      const total = readCount(call.data, 'totalMatches') ?? 0;
      const query = readString(call.args, 'query');
      const scope = readString(call.args, 'list') ?? readString(call.args, 'project');
      return {
        ...base,
        icon: 'search',
        verb: 'Searched',
        subject: query,
        detail: [scope, `${total} ${total === 1 ? 'match' : 'matches'}`].filter(Boolean).join(' · '),
      };
    }

    /*
     * ITEM 13C — THE WHOLE-BOARD READ
     *
     * Without a case here it falls to `default`, which draws it as the words
     * *"list all tasks"* — and this is the one call whose *size* is the
     * interesting fact about it, because the whole reason it exists is that
     * reading everything turned out to be cheap.
     */
    /*
     * ITEM 14 — `list_projects`, and why a new tool needs a line here at once.
     *
     * `default` below would draw it as the words *"list projects"* with the
     * whole `summary` as its detail — a sentence written for a model, on
     * Shreekant's screen. Harmless for a read, unlike the `delete_task` case
     * the block below was written for, but it is the same omission and the
     * cost of closing it is six lines.
     */
    case 'list_projects': {
      const projects = readRows(call.data, 'projects');
      const lists = projects.reduce(
        (sum, project) => sum + (Array.isArray(project.lists) ? project.lists.length : 0),
        readArrayLength(call.data, 'lists'),
      );
      return {
        ...base,
        icon: 'read',
        verb: 'Read the projects',
        detail: `${projects.length} project${projects.length === 1 ? '' : 's'} · ${lists} list${lists === 1 ? '' : 's'}`,
      };
    }

    case 'list_all_tasks': {
      const total = readCount(call.data, 'totalTasks') ?? readArrayLength(call.data, 'tasks');
      const overdue = readCount(call.data, 'overdue');
      return {
        ...base,
        icon: 'read',
        verb: 'Read the whole board',
        detail: [
          `${total} task${total === 1 ? '' : 's'}`,
          overdue !== undefined && overdue > 0 ? `${overdue} overdue` : null,
        ]
          .filter(Boolean)
          .join(' · '),
      };
    }

    case 'get_task': {
      const read = readRows(call.data, 'tasks');
      return {
        ...base,
        icon: 'read',
        verb: 'Read',
        subject: batchSubject(read.length, 'task', subject),
        detail: withFailures(call.data, []),
      };
    }

    case 'create_task': {
      const made = readRows(call.data, 'tasks');
      const first = made[0] as { listName?: string; deadline?: string } | undefined;
      const deadline = first?.deadline ? describeValue('deadline', first.deadline, timezone, now) : undefined;
      // The list is worth naming when they all went to the same one, and is
      // noise when they did not — the summary lists them either way.
      const lists = new Set(made.map((task) => task.listName).filter((name): name is string => typeof name === 'string'));
      return {
        ...base,
        icon: 'create',
        verb: 'Created',
        subject: batchSubject(made.length, 'task', subject),
        detail: withFailures(call.data, [lists.size === 1 ? [...lists][0] : null, made.length === 1 ? deadline : null]),
      };
    }

    case 'update_task': {
      const touched = readRows(call.data, 'tasks');
      // The union across the batch: one call applies one change, so this is
      // normally the same one or two fields however many tasks got them.
      const changed = [...new Set(touched.flatMap((task) => (Array.isArray(task.changed) ? (task.changed as unknown[]) : [])))].filter(
        (field): field is string => typeof field === 'string',
      );
      const cleared = new Set(readStringArray(call.args, 'clear'));
      const pairs = changed.map((field) =>
        field === 'title'
          ? 'renamed'
          : `${field} → ${cleared.has(field) ? 'cleared' : describeValue(field, call.args[field], timezone, now)}`,
      );
      return {
        ...base,
        icon: 'update',
        verb: 'Updated',
        subject: batchSubject(touched.length, 'task', subject),
        detail: withFailures(call.data, [joinFields(pairs)]),
      };
    }

    /*
     * BUILD-17. Where the tasks went is the whole of what happened, so it is
     * the detail; the tasks that were already there are counted apart, as
     * `complete_task` counts the ones already done.
     */
    case 'move_task': {
      const rows = readRows(call.data, 'tasks');
      const moved = rows.filter((task) => task.moved === true);
      const list = (call.data as { list?: unknown } | undefined)?.list;
      const listName = readDataString(list, 'name');
      const projectName = readDataString(list, 'project');
      const position = readDataString(call.data, 'position');
      const anchorTitle = readDataString((call.data as { anchor?: unknown } | undefined)?.anchor, 'title');
      const place =
        position === 'top' ? 'to the top' : position === 'bottom' ? 'to the bottom' : anchorTitle !== undefined ? `${position === 'before' ? 'above' : 'below'} ${anchorTitle}` : null;
      return {
        ...base,
        icon: 'update',
        verb: moved.length === 0 ? 'Already in place' : 'Moved',
        subject: batchSubject(moved.length > 0 ? moved.length : rows.length, 'task', subject),
        detail: withFailures(call.data, [
          listName !== undefined ? `${place === null ? 'to ' : 'in '}${listName}${projectName !== undefined ? ` · ${projectName}` : ''}` : null,
          place,
        ]),
      };
    }

    case 'complete_task': {
      const finished = readRows(call.data, 'tasks');
      const already = finished.filter((task) => task.alreadyCompleted === true).length;
      return {
        ...base,
        icon: 'complete',
        verb: 'Completed',
        subject: batchSubject(finished.length, 'task', subject),
        // Saying so matters: a chip reading "Completed · 5 tasks" over a call
        // where three were already ticked claims work that did not happen.
        detail: withFailures(call.data, [already > 0 ? `${already} already done` : null]),
      };
    }

    case 'add_to_today': {
      const queued = readRows(call.data, 'tasks');
      const first = queued[0]?.position;
      return {
        ...base,
        icon: 'queue',
        verb: 'Added to today',
        subject: batchSubject(queued.length, 'task', subject),
        detail: withFailures(call.data, [queued.length === 1 && typeof first === 'number' ? `position ${first}` : null]),
      };
    }

    case 'remove_from_today': {
      const dropped = readRows(call.data, 'tasks');
      return {
        ...base,
        icon: 'queue',
        verb: 'Removed from today',
        subject: batchSubject(dropped.length, 'task', subject),
        detail: withFailures(call.data, []),
      };
    }

    case 'list_today': {
      const queued = readArrayLength(call.data, 'queue');
      return { ...base, icon: 'queue', verb: 'Read today’s queue', detail: `${queued} queued` };
    }

    /*
     * ITEM 9D — THE SEVEN THE APP'S OWN AGENT CANNOT CALL
     * ---------------------------------------------------
     * `fallbackTools` is the original eight; `mcpTools` is all fifteen. Until
     * 9D put Atlas's tool calls on the wire, the other seven had never reached
     * this file at all, so they fell to `default` — which reads a `delete_task`
     * as the words *"delete task"* under a `file-text` glyph, inside the
     * changes container. That is not a chip that failed to be pretty; it is a
     * destructive action drawn as a document.
     *
     * Each of these takes its subject from the tool's own quoted title, like
     * every case above, so a tool that rewords its summary keeps working.
     */
    case 'delete_task': {
      const gone = readRows(call.data, 'tasks');
      return {
        ...base,
        icon: 'delete',
        verb: 'Deleted',
        subject: batchSubject(gone.length, 'task', subject),
        detail: withFailures(call.data, ['to the Trash']),
      };
    }

    case 'restore_from_trash': {
      const back = readRows(call.data, 'entries');
      const rerouted = back.flatMap((entry) => (Array.isArray(entry.reroutedTaskIds) ? (entry.reroutedTaskIds as unknown[]) : [])).length;
      return {
        ...base,
        icon: 'restore',
        verb: 'Restored',
        subject: batchSubject(back.length, 'thing', subject),
        // `planRestore` rebuilds a missing parent chain; when it cannot, the
        // task lands in Action Steps and the count says how many did.
        detail: withFailures(call.data, [rerouted > 0 ? `${rerouted} moved to Action Steps` : null]),
      };
    }

    case 'list_trash': {
      const held = readArrayLength(call.data, 'entries');
      return { ...base, icon: 'restore', verb: 'Read the Trash', detail: `${held} held` };
    }

    case 'add_subtask': {
      const added = readRows(call.data, 'subtasks');
      const parent = readDataString(call.data, 'parentTitle');
      return {
        ...base,
        icon: 'step',
        // The verb carries the count here rather than the subject, because the
        // subject is the *parent* — "Added 5 steps · Chase invoices" says what
        // happened and "5 steps · Chase invoices" does not.
        verb: added.length > 1 ? `Added ${added.length} steps` : 'Added a step',
        subject: added.length > 1 ? parent : subject,
        detail: withFailures(call.data, [added.length > 1 ? null : parent]),
      };
    }

    case 'update_subtask': {
      const touched = readRows(call.data, 'subtasks');
      const changed = readStringArray(call.data, 'changed');
      const cleared = new Set(readStringArray(call.args, 'clear'));
      const pairs = changed.map((field) =>
        field === 'title'
          ? 'renamed'
          : `${field} → ${cleared.has(field) ? 'cleared' : describeValue(field, call.args[field], timezone, now)}`,
      );
      return {
        ...base,
        icon: 'step',
        verb: touched.length > 1 ? `Updated ${touched.length} steps` : 'Updated a step',
        subject: touched.length > 1 ? undefined : subject,
        detail: withFailures(call.data, [joinFields(pairs)]),
      };
    }

    case 'remove_subtask': {
      const removedRows = readRows(call.data, 'subtasks');
      // A step can own steps, so removing one can take several with it.
      const total = removedRows.reduce((sum, row) => sum + (typeof row.removedCount === 'number' ? row.removedCount : 1), 0);
      return {
        ...base,
        icon: 'step',
        verb: removedRows.length > 1 ? `Removed ${removedRows.length} steps` : 'Removed a step',
        subject: removedRows.length > 1 ? undefined : subject,
        detail: withFailures(call.data, [total > removedRows.length ? `${total} in all` : null]),
      };
    }

    case 'list_subtasks': {
      const read = readRows(call.data, 'tasks');
      const steps = read.reduce((sum, row) => sum + (Array.isArray(row.subtasks) ? row.subtasks.length : 0), 0);
      return {
        ...base,
        icon: 'step',
        verb: 'Read the steps',
        subject: batchSubject(read.length, 'task', subject),
        detail: withFailures(call.data, [`${steps} step${steps === 1 ? '' : 's'}`]),
      };
    }

    /*
     * ITEM 11 — THE WEB DRAWER, WHICH IS NOT THE APP'S
     * -------------------------------------------------
     * Every tool above belongs to BASE. These two come from a second
     * MCP server — Atlas's own — which is the whole point of item 11, and it
     * means `getTool(call.name)` returns `undefined` for them. That is
     * *correct* rather than a gap: `wrote` falls to false, which is exactly
     * right for two tools that read, and it happens without this file being
     * told. The in-browser agent will never produce either of these; a browser
     * cannot fetch a third-party page at all, which is why they had to live on
     * the host.
     *
     * **The link is the point of the chip.** DESIGN.md §7.5 ends *"Atlas
     * always says where an answer came from"*, and the transcript is where
     * that has to be visible without taking the assistant's word for it. So
     * the collapsed line names the source and the open panel carries the whole
     * call — the URL asked for, the summary that came back, its own `Source:`
     * line.
     */
    case 'search_web': {
      const results = readArrayLength(call.data, 'results');
      const provider = readDataString(call.data, 'provider');
      const query = readString(call.args, 'query') ?? readDataString(call.data, 'query');
      const page = readCount(call.data, 'page');

      return {
        ...base,
        // A result crafted to read as an instruction is the more important
        // fact about this call than the fact that it was a search, so the
        // glyph says so. `atlas.html` draws exactly this with `shield-alert`.
        icon: isSuspicious(call.data) ? 'flag' : 'web',
        verb: 'Searched the web',
        subject: query,
        detail: [
          `${results} result${results === 1 ? '' : 's'}`,
          page !== undefined && page > 1 ? `page ${page}` : null,
          provider,
          isSuspicious(call.data) ? 'one looks like an instruction' : null,
        ]
          .filter(Boolean)
          .join(' · '),
      };
    }

    case 'fetch_url': {
      const url = readDataString(call.data, 'url') ?? readString(call.args, 'url');
      const title = readDataString(call.data, 'title');
      const words = readCount(call.data, 'words');
      const host = hostOf(url);

      return {
        ...base,
        icon: isSuspicious(call.data) ? 'flag' : 'link',
        verb: 'Read',
        // The title when the page had one, and the host when it did not — a
        // whole URL in a chip is unreadable and ellipsises to nothing useful.
        subject: title ?? host ?? url,
        detail: [
          title !== undefined ? host : null,
          words !== undefined ? `${words.toLocaleString('en-IN')} words` : null,
          isTruncated(call.data) ? 'part read' : null,
          isSuspicious(call.data) ? 'page tried to give instructions' : null,
        ]
          .filter(Boolean)
          .join(' · '),
      };
    }

    /*
     * BUILD-3 — PROJECTS AND LISTS.
     *
     * Six new tools, and `default` would draw every one as its own name under a
     * document glyph — which for the two deletes is the 9D mistake again: a
     * project and all its tasks going to the Trash, drawn as a read. A held
     * delete is `ok: false` and takes the failure branch above, with the
     * delete glyph, which is right: it has not happened yet.
     */
    case 'create_project': {
      const made = readRows(call.data, 'projects');
      const one = made.length === 1 ? made[0] : undefined;
      const lists = one && Array.isArray(one.lists) ? one.lists.length : 0;
      return {
        ...base,
        icon: 'create',
        verb: made.length > 1 ? `Created ${made.length} projects` : 'Created the project',
        subject: made.length > 1 ? undefined : (typeof one?.name === 'string' ? one.name : undefined) ?? subject,
        detail: withFailures(call.data, [one ? (lists === 0 ? 'no lists yet' : `${lists} list${lists === 1 ? '' : 's'}`) : null]),
      };
    }

    case 'create_list': {
      const made = readRows(call.data, 'lists');
      const projectName = readDataString((call.data as { project?: unknown } | undefined)?.project, 'name');
      // `subject` is the first quoted name in the summary — the list's own
      // name for one, the project's for several ("Added 3 lists to "Launch"").
      return {
        ...base,
        icon: 'create',
        verb: made.length > 1 ? `Added ${made.length} lists to` : 'Added the list',
        subject,
        detail: withFailures(call.data, [made.length === 1 && projectName !== undefined ? `in ${projectName}` : null]),
      };
    }

    case 'update_project':
    case 'update_list': {
      const kind = call.name === 'update_project' ? 'project' : 'list';
      const rows = readRows(call.data, kind === 'project' ? 'projects' : 'lists');
      const newName = readString(call.args, kind === 'project' ? 'name' : 'title');
      const into = kind === 'list' ? readString(call.args, 'project') : undefined;
      return {
        ...base,
        icon: 'update',
        verb: newName !== undefined ? `Renamed the ${kind}` : into !== undefined ? `Moved ${rows.length > 1 ? `${rows.length} lists` : 'the list'}` : `Updated the ${kind}`,
        subject: rows.length > 1 ? undefined : subject,
        detail: withFailures(call.data, [
          newName !== undefined ? `→ ${newName}` : null,
          into !== undefined ? `into ${into}` : null,
        ]),
      };
    }

    case 'delete_project':
    case 'delete_list': {
      const kind = call.name === 'delete_project' ? 'project' : 'list';
      const gone = readRows(call.data, kind === 'project' ? 'projects' : 'lists');
      return {
        ...base,
        icon: 'delete',
        verb: gone.length > 1 ? `Deleted ${gone.length} ${kind}s` : `Deleted the ${kind}`,
        subject: gone.length > 1 ? undefined : subject,
        detail: withFailures(call.data, ['with everything in it', 'to the Trash']),
      };
    }

    /*
     * ITEM 13 — THE FRONT DOOR, IN THE TRANSCRIPT AND IN THE ACTION LOG
     * ------------------------------------------------------------------
     * `publish_share_link` reaches this file in three different states and
     * they must not look alike. Called and **held** for a tap, it is
     * `ok: false` and falls to the failure branch above — which is right, it
     * did not happen. Called and **already published**, it changed nothing.
     * **Approved and run**, it is the one line in the whole log that says
     * something left the house.
     *
     * The share id is deliberately not the subject: it is twelve random
     * characters and says nothing. The title does, and the path is in the
     * detail where it can be read.
     */
    case 'publish_share_link': {
      const targets = readRows(call.data, 'targets');
      const fresh = targets.filter((target) => target.alreadyPublished !== true);
      const already = targets.length > 0 && fresh.length === 0;
      const one = targets.length === 1 ? targets[0] : undefined;
      const path = typeof one?.path === 'string' ? one.path : undefined;
      return {
        ...base,
        icon: 'share',
        verb: already ? 'Already public' : fresh.length > 1 ? `Published ${fresh.length} links` : 'Published',
        subject: fresh.length > 1 ? undefined : (typeof one?.title === 'string' ? one.title : undefined) ?? subject,
        detail: withFailures(call.data, [already ? 'no change' : 'anyone with the link', path]),
      };
    }

    case 'revoke_share_link': {
      const targets = readRows(call.data, 'targets');
      const revoked = targets.filter((target) => target.revoked === true);
      const one = targets.length === 1 ? targets[0] : undefined;
      return {
        ...base,
        icon: 'unshare',
        verb:
          revoked.length > 1
            ? `Took ${revoked.length} links down`
            : revoked.length === 1
              ? 'Took the link down'
              : 'No link to take down',
        subject: revoked.length > 1 ? undefined : (typeof one?.title === 'string' ? one.title : undefined) ?? subject,
        detail: withFailures(call.data, [revoked.length > 0 ? `the page${revoked.length === 1 ? '' : 's'} no longer open${revoked.length === 1 ? 's' : ''}` : null]),
      };
    }

    default:
      return { ...base, icon: 'read', verb: call.name.replace(/_/g, ' '), detail: call.summary };
  }
}

/** `example.com`, for a chip. `www.` goes because it is never the distinguishing part. */
function hostOf(url: string | undefined): string | undefined {
  if (url === undefined) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

/** The web drawer's own verdict, never re-derived here. See `atlas/src/lookup/injection.ts`. */
function isSuspicious(data: unknown): boolean {
  return typeof data === 'object' && data !== null && (data as Record<string, unknown>).suspicious === true;
}

function isTruncated(data: unknown): boolean {
  return typeof data === 'object' && data !== null && (data as Record<string, unknown>).truncated === true;
}

/**
 * The tasks a read came back with.
 *
 * `search_tasks` and `list_today` both return whole rows and the assistant
 * screen draws them (`screens/assistant.html`'s `turn.tasks`) rather than
 * paraphrasing them into the reply. Every other tool returns `null` here and
 * stays a one-line chip: `get_task` answers about a task the user already
 * named, and a stack of one row is furniture.
 *
 * Reading `call.data` and not the store is the same rule as above — these are
 * the rows as they were when the agent looked, which is what the sentence
 * beside them is describing.
 */
export function describeTaskRows(
  call: AgentToolCall,
  timezone: string,
  now: Date = new Date(),
): AgentTaskRow[] | null {
  if (!call.ok || typeof call.data !== 'object' || call.data === null) return null;
  const key = call.name === 'search_tasks' ? 'results' : call.name === 'list_today' ? 'queue' : null;
  if (key === null) return null;

  const raw = (call.data as Record<string, unknown>)[key];
  if (!Array.isArray(raw) || raw.length === 0) return null;

  return raw.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const row = entry as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id : null;
    const title = typeof row.title === 'string' ? row.title : null;
    if (id === null || title === null) return [];

    const deadline = typeof row.deadline === 'string' ? parseStoredDate(row.deadline, timezone) : null;
    const listName = typeof row.listName === 'string' ? row.listName : '';
    const projectName = typeof row.projectName === 'string' && row.projectName !== '' ? row.projectName : undefined;
    const minutes = typeof row.allocatedMinutes === 'number' ? row.allocatedMinutes : undefined;
    const status = row.status;

    const late = deadline !== null && deadline.getTime() < now.getTime() && status !== 'completed';
    const daysLate = late
      ? Math.max(1, Math.ceil((now.getTime() - (deadline as Date).getTime()) / 86_400_000))
      : 0;

    return [{
      id,
      title,
      meta: [listName, deadline ? `due ${shortDate(deadline, timezone, now)}` : null]
        .filter((part): part is string => part !== null && part !== '')
        .join(' · '),
      /* Item 13G. The bare date, with no "due" in front of it — the column it
         sits in is the deadline column, and a word repeated down forty-eight
         rows is noise the mockup does not draw. */
      due: deadline ? shortDate(deadline, timezone, now) : undefined,
      where: projectName ?? listName,
      allocated: minutes !== undefined ? `${minutes} min` : undefined,
      status: status === 'completed'
        ? 'done' as const
        : late
          ? 'overrun' as const
          : status === 'in-progress'
            ? 'running' as const
            : 'queued' as const,
      statusLabel: status === 'completed'
        ? 'Done'
        : late
          ? `${daysLate}d late`
          : status === 'in-progress'
            ? 'Running'
            : 'Queued',
    }];
  });
}
