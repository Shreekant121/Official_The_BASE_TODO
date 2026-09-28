import { DEFAULT_LISTS, type Project, type TaskList } from '../../../store/useStore';
import { DEFAULT_PROJECT_COLOR, DEFAULT_PROJECT_ICON, PROJECT_HUES } from '../../projectHues';
import { TRASH_RETENTION_MS } from '../../trashModel';
import {
  ToolArgError,
  defineTool,
  optionalString,
  requiredRecordArray,
  requiredString,
  requiredStringArray,
} from '../toolKit';
import type { AgentStoreState, ToolArgs, ToolDef, ToolResult } from '../types';
import { batchResult, runBatch, titleList } from './batch';
import { BATCH_CAP } from './taskTools';

/**
 * Projects and lists (BUILD-3) — the board's own shape, which until now only
 * `list_projects` could even read.
 *
 * WHAT IS HERE
 * -------------
 * Creating a project (with its lists, in the same call), creating lists in one,
 * renaming either, moving a list into another project, and deleting either.
 * Every tool takes a list, for item 13D's reason, and every write snapshots
 * before it touches anything, so a Revert on `/log` puts it back.
 *
 * DELETION GOES THROUGH THE FRONT DOOR, AND NOT BECAUSE IT IS IRREVERSIBLE
 * -------------------------------------------------------------------------
 * It is not. `deleteProject` and `deleteTaskList` are `applyDeletion`, the
 * same soft path `delete_task` uses: everything goes to the Trash for thirty
 * days, and the capture below is what lets Revert fetch it back. What is
 * different is the **blast radius** — one call on a project takes every list
 * and every task inside it — and the queue item named the trap: either these
 * tools are held for a tap, or they do not exist. Shreekant chose the tap
 * (2026-09-16). So both are `frontDoor`, both answer a preview with exactly
 * what would go, and `tools/index.ts` lists them apart from the acts that
 * cannot be undone, so Atlas can tell him which kind of tap he is making.
 *
 * **Nothing here cleans up after a delete** (CLAUDE.md). The focus queue, the
 * cross-links, the share document and the calendar blocks are all
 * `applyDeletion`'s, and a tool doing any of it by hand re-creates the bug that
 * path exists to fix.
 *
 * THE THREE BUILT-IN LISTS ARE OFF LIMITS
 * ----------------------------------------
 * Action Steps, Backburner and Reference Materials are rows with fixed ids
 * that code depends on — `create_task` files into `action` when no list is
 * named, and the scorer excludes the other two by id. They cannot be renamed,
 * moved or deleted from here.
 *
 * NAMES, NOT ONLY IDS — BUT ONLY EXACT ONES
 * ------------------------------------------
 * `create_task` already resolves a list by name, because the model sees names.
 * These tools do the same, with one difference that matters for a delete:
 * `resolveProject` in `taskTools.ts` falls back to a substring match, and
 * *"delete Launch"* must never reach *"Launch v2"*. So a name here matches
 * exactly (case aside) and only when it is unique; anything else is refused
 * with the way to the id.
 */

const BUILT_IN_LIST_IDS = new Set(DEFAULT_LISTS.map((list) => list.id));

/** A project with more than this many lists in one breath is a plan to write down, not a call. */
const LISTS_PER_CALL_CAP = 20;
const CREATE_PROJECT_CAP = 10;

const TRASH_DAYS = Math.round(TRASH_RETENTION_MS / 86_400_000);

const WHERE_IDS_COME_FROM = 'list_projects (Tasks drawer) has every project and list with its id.';

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

type Lookup<T> = { found: T } | { reason: string };

/** By id, or by an exact, unique name. See the header for why never by substring. */
export function findProject(state: AgentStoreState, ref: string): Lookup<Project> {
  const byId = state.projects.find((project) => project.id === ref);
  if (byId) return { found: byId };

  const named = state.projects.filter((project) => sameName(project.name, ref));
  if (named.length === 1) return { found: named[0] };
  if (named.length > 1) {
    return { reason: `${named.length} projects are called "${ref.trim()}", so the name cannot say which — use the id. ${WHERE_IDS_COME_FROM}` };
  }

  const near = state.projects.filter((project) => project.name.toLowerCase().includes(ref.trim().toLowerCase()));
  const hint = near.length > 0 ? ` The closest are ${titleList(near.map((project) => project.name))}.` : '';
  return { reason: `no project is called "${ref.trim()}".${hint} ${WHERE_IDS_COME_FROM}` };
}

function projectNameOf(state: AgentStoreState, list: TaskList): string | undefined {
  return list.projectId ? state.projects.find((project) => project.id === list.projectId)?.name : undefined;
}

/** By id, or by an exact, unique title across the whole board. */
export function findList(state: AgentStoreState, ref: string): Lookup<TaskList> {
  const byId = state.taskLists.find((list) => list.id === ref);
  if (byId) return { found: byId };

  const named = state.taskLists.filter((list) => sameName(list.title, ref));
  if (named.length === 1) return { found: named[0] };
  if (named.length > 1) {
    const where = named.map((list) => projectNameOf(state, list) ?? 'no project');
    return {
      reason: `${named.length} lists are called "${ref.trim()}" (in ${titleList(where)}), so the name cannot say which — use the list's id. ${WHERE_IDS_COME_FROM}`,
    };
  }
  return { reason: `no list is called "${ref.trim()}". ${WHERE_IDS_COME_FROM}` };
}

const BUILT_IN_REASON =
  'it is one of the three built-in lists every task can fall back to, so it cannot be renamed, moved or deleted.';

/** `#10B981`, `10b981`, or one of the six hue names the New Project sheet offers. */
function readColor(raw: string): string {
  const value = raw.trim();
  const hue = PROJECT_HUES.find((candidate) => candidate.id === value.toLowerCase());
  if (hue) return hue.hex;
  if (/^#?[0-9a-f]{6}$/i.test(value)) return value.startsWith('#') ? value : `#${value}`;
  throw new ToolArgError(
    `"color" must be one of ${PROJECT_HUES.map((candidate) => candidate.id).join(', ')}, or a hex colour like #10B981 (got "${raw}").`,
  );
}

/** A string is one title; an array is several. Blank and repeated titles (case aside) collapse. */
function readTitles(value: unknown, key: string): string[] {
  const items = value === undefined ? [] : Array.isArray(value) ? value : [value];
  if (items.some((item) => typeof item !== 'string')) throw new ToolArgError(`"${key}" must be a list of names.`);
  const titles: string[] = [];
  for (const item of items as string[]) {
    const title = item.trim();
    if (title !== '' && !titles.some((existing) => sameName(existing, title))) titles.push(title);
  }
  if (titles.length > LISTS_PER_CALL_CAP) {
    throw new ToolArgError(`"${key}" had ${titles.length} lists and at most ${LISTS_PER_CALL_CAP} can be made in one call.`);
  }
  return titles;
}

/** What goes with a project: its lists, and every top-level task filed in them. */
function projectContents(state: AgentStoreState, projectId: string): { lists: number; tasks: number } {
  const listIds = new Set(state.taskLists.filter((list) => list.projectId === projectId).map((list) => list.id));
  return {
    lists: listIds.size,
    tasks: state.backlogTasks.filter((task) => !task.parent && !!task.listId && listIds.has(task.listId)).length,
  };
}

function listContents(state: AgentStoreState, listId: string): number {
  return state.backlogTasks.filter((task) => !task.parent && task.listId === listId).length;
}

function describeProjectContents(contents: { lists: number; tasks: number }): string {
  if (contents.lists === 0) return 'an empty project';
  if (contents.tasks === 0) return `${plural(contents.lists, 'list')}, with no tasks in them,`;
  return `${plural(contents.lists, 'list')} and ${plural(contents.tasks, 'task')}`;
}

// ─── create_project ─────────────────────────────────────────────────────────

export const createProject: ToolDef = defineTool({
  name: 'create_project',
  mutates: true,
  description:
    'Create projects, each with the lists inside it, in ONE call — "make a project for the launch with Research, ' +
    'Design and Ship" is one call, not four. Send description or color only when the user gave one. Refuses a name ' +
    'that is already a project: add lists to that one with create_list instead of making a second.',
  parametersSchema: {
    type: 'object',
    properties: {
      projects: {
        type: 'array',
        description: 'Every project to create. A plain string is read as a name.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'The project name.' },
            lists: { type: 'array', items: { type: 'string' }, description: 'Names of the lists to create inside it, in order.' },
            description: { type: 'string', description: 'One line about the project, only if the user gave one.' },
            color: {
              type: 'string',
              description: `One of ${PROJECT_HUES.map((hue) => hue.id).join(', ')}, or a hex colour. Defaults to emerald.`,
            },
          },
          required: ['name'],
        },
      },
    },
    required: ['projects'],
  },
  execute: async (args, ctx): Promise<ToolResult> => {
    const wanted = requiredRecordArray(args, 'projects', 'name', (item) => item, {
      max: CREATE_PROJECT_CAP,
      what: 'projects',
    });

    const outcome = await runBatch(
      wanted.map((item, index) => (typeof item.name === 'string' && item.name.trim() !== '' ? item.name.trim() : `entry ${index + 1}`)),
      async (_key, index) => {
        // Re-read per entry: `order` counts the projects already there, and a
        // second project in this call must see the first.
        const state = ctx.store.getState();
        const item = wanted[index] as ToolArgs;

        let name: string | undefined;
        let fields: { description?: string; color: string; lists: string[] };
        try {
          name = requiredString(item, 'name');
          const description = optionalString(item, 'description')?.trim();
          const colorRef = optionalString(item, 'color');
          fields = {
            ...(description ? { description } : {}),
            color: colorRef === undefined || colorRef.trim() === '' ? DEFAULT_PROJECT_COLOR : readColor(colorRef),
            lists: readTitles(item.lists, 'lists'),
          };
        } catch (err) {
          return { ok: false as const, title: name, reason: err instanceof Error ? err.message : String(err) };
        }

        const projectName = name;
        if (state.projects.some((project) => sameName(project.name, projectName))) {
          return {
            ok: false as const,
            title: projectName,
            reason: 'a project with that name already exists — add lists to it with create_list, or rename it with update_project, rather than making a second one.',
          };
        }

        // Minted and captured before the write, so the snapshot records "this did
        // not exist" and a Revert deletes it rather than leaving it standing.
        const projectId = crypto.randomUUID();
        ctx.snapshots.captureProject(ctx.snapshotHandle, projectId);
        ctx.store.addProject({
          id: projectId,
          name: projectName,
          ...(fields.description ? { description: fields.description } : {}),
          color: fields.color,
          icon: DEFAULT_PROJECT_ICON,
          createdAt: ctx.now.getTime(),
          order: state.projects.length,
        });

        const lists = fields.lists.map((title, order) => {
          const list: TaskList = { id: crypto.randomUUID(), title, projectId, order };
          ctx.snapshots.captureList(ctx.snapshotHandle, list.id);
          ctx.store.addTaskList(list);
          return { id: list.id, name: title };
        });

        return { ok: true as const, title: projectName, value: { id: projectId, name: projectName, lists } };
      },
    );

    return batchResult(
      outcome,
      (done) => {
        if (done.length === 1) {
          const { name, lists } = done[0].value;
          return lists.length === 0
            ? `Created the project "${name}", with no lists in it yet.`
            : `Created the project "${name}" with ${plural(lists.length, 'list')}: ${titleList(lists.map((list) => list.name))}.`;
        }
        return `Created ${done.length} projects: ${done
          .map((entry) => `"${entry.value.name}" (${entry.value.lists.length === 0 ? 'no lists' : plural(entry.value.lists.length, 'list')})`)
          .join(', ')}.`;
      },
      { projects: outcome.done.map((entry) => entry.value) },
    );
  },
});

// ─── update_project ─────────────────────────────────────────────────────────

export const updateProject: ToolDef = defineTool({
  name: 'update_project',
  mutates: true,
  description:
    'Rename projects, or change their description or colour. Takes a list, but a new name can only go to one ' +
    'project at a time. An empty description removes it. To add lists to a project use create_list; to rename a ' +
    'list use update_list.',
  parametersSchema: {
    type: 'object',
    properties: {
      projectIds: { type: 'array', items: { type: 'string' }, description: 'Project ids, or exact project names.' },
      name: { type: 'string', description: 'The new name. Only with a single project.' },
      description: { type: 'string', description: 'The new one-line description. Empty removes it.' },
      color: { type: 'string', description: `One of ${PROJECT_HUES.map((hue) => hue.id).join(', ')}, or a hex colour.` },
    },
    required: ['projectIds'],
  },
  execute: async (args, ctx): Promise<ToolResult> => {
    const refs = requiredStringArray(args, 'projectIds', { max: BATCH_CAP, what: 'projects' });
    const name = optionalString(args, 'name')?.trim();
    const description = optionalString(args, 'description');
    const colorRef = optionalString(args, 'color');

    if (name === undefined && description === undefined && colorRef === undefined) {
      throw new ToolArgError('there is nothing to change — send name, description or color.');
    }
    if (name === '') throw new ToolArgError('"name" cannot be empty — a project needs a name.');
    if (name !== undefined && refs.length > 1) {
      throw new ToolArgError('a new name can only go to one project — two projects cannot both be renamed to the same thing.');
    }
    const color = colorRef === undefined ? undefined : readColor(colorRef);

    const outcome = await runBatch(refs, async (ref) => {
      const state = ctx.store.getState();
      const lookup = findProject(state, ref);
      if ('reason' in lookup) return { ok: false as const, reason: lookup.reason };
      const project = lookup.found;
      // Read before the write: the store may hand back the same object it updates.
      const was = project.name;

      if (name !== undefined && state.projects.some((other) => other.id !== project.id && sameName(other.name, name))) {
        return { ok: false as const, title: project.name, reason: `another project is already called "${name}".` };
      }

      const patch: Partial<Project> = {};
      const changed: string[] = [];
      if (name !== undefined && name !== project.name) patch.name = name;
      if (description !== undefined) {
        const next = description.trim() === '' ? undefined : description.trim();
        if (next !== project.description) {
          // `undefined`, not '' — the same rule `revoke_share_link` follows.
          patch.description = next;
          changed.push(next === undefined ? 'removed its description' : 'changed its description');
        }
      }
      if (color !== undefined && color.toLowerCase() !== project.color.toLowerCase()) {
        patch.color = color;
        changed.push('changed its colour');
      }

      if (Object.keys(patch).length > 0) {
        ctx.snapshots.captureProject(ctx.snapshotHandle, project.id);
        ctx.store.updateProject(project.id, patch);
      }

      return {
        ok: true as const,
        title: was,
        value: { id: project.id, was, name: patch.name ?? was, renamed: patch.name !== undefined, changed },
      };
    });

    return batchResult(
      outcome,
      (done) =>
        done
          .map(({ value }) => {
            const edits = value.changed.length === 0 ? '' : value.changed.join(' and ');
            if (value.renamed) return `Renamed the project "${value.was}" to "${value.name}"${edits ? ` and ${edits}` : ''}.`;
            if (edits) return `Updated "${value.name}": ${edits}.`;
            return `"${value.name}" already looked like that, so nothing changed.`;
          })
          .join(' '),
      { projects: outcome.done.map((entry) => ({ id: entry.value.id, name: entry.value.name })) },
    );
  },
});

// ─── create_list ────────────────────────────────────────────────────────────

export const createList: ToolDef = defineTool({
  name: 'create_list',
  mutates: true,
  description:
    'Add lists to an existing project — "add a Marketing list to Launch". Takes several names at once. For a ' +
    'project that does not exist yet, use create_project, which makes the lists with it. Refuses a name the project ' +
    'already has as a list.',
  parametersSchema: {
    type: 'object',
    properties: {
      project: { type: 'string', description: 'The project id, or its exact name.' },
      titles: { type: 'array', items: { type: 'string' }, description: 'The new lists’ names, in order.' },
    },
    required: ['project', 'titles'],
  },
  execute: async (args, ctx): Promise<ToolResult> => {
    const projectRef = requiredString(args, 'project');
    const titles = readTitles(args.titles, 'titles');
    if (titles.length === 0) throw new ToolArgError('"titles" was empty. Pass at least one list name.');

    const lookup = findProject(ctx.store.getState(), projectRef);
    if ('reason' in lookup) throw new ToolArgError(lookup.reason);
    const project = lookup.found;

    const outcome = await runBatch(titles, async (title) => {
      const siblings = ctx.store.getState().taskLists.filter((list) => list.projectId === project.id);
      if (siblings.some((list) => sameName(list.title, title))) {
        return { ok: false as const, title, reason: `"${project.name}" already has a list with that name.` };
      }

      const list: TaskList = { id: crypto.randomUUID(), title, projectId: project.id, order: siblings.length };
      ctx.snapshots.captureList(ctx.snapshotHandle, list.id);
      ctx.store.addTaskList(list);
      return { ok: true as const, title, value: { id: list.id, name: title } };
    });

    return batchResult(
      outcome,
      (done) =>
        done.length === 1
          ? `Added the list "${done[0].title}" to "${project.name}".`
          : `Added ${done.length} lists to "${project.name}": ${titleList(done.map((entry) => entry.title))}.`,
      { project: { id: project.id, name: project.name }, lists: outcome.done.map((entry) => entry.value) },
    );
  },
});

// ─── update_list ────────────────────────────────────────────────────────────

export const updateList: ToolDef = defineTool({
  name: 'update_list',
  mutates: true,
  description:
    'Rename a list, or move lists into another project — the tasks go with them. Takes a list, but a new title can ' +
    'only go to one list at a time. The three built-in lists (Action Steps, Backburner, Reference Materials) cannot ' +
    'be changed.',
  parametersSchema: {
    type: 'object',
    properties: {
      listIds: { type: 'array', items: { type: 'string' }, description: 'List ids, or exact list names.' },
      title: { type: 'string', description: 'The new name. Only with a single list.' },
      project: { type: 'string', description: 'Move the lists into this project (id or exact name).' },
    },
    required: ['listIds'],
  },
  execute: async (args, ctx): Promise<ToolResult> => {
    const refs = requiredStringArray(args, 'listIds', { max: BATCH_CAP, what: 'lists' });
    const title = optionalString(args, 'title')?.trim();
    const projectRef = optionalString(args, 'project');

    if (title === undefined && projectRef === undefined) {
      throw new ToolArgError('there is nothing to change — send title to rename, project to move, or both.');
    }
    if (title === '') throw new ToolArgError('"title" cannot be empty — a list needs a name.');
    if (title !== undefined && refs.length > 1) {
      throw new ToolArgError('a new title can only go to one list — two lists cannot both be renamed to the same thing.');
    }

    let destination: Project | undefined;
    if (projectRef !== undefined) {
      const lookup = findProject(ctx.store.getState(), projectRef);
      if ('reason' in lookup) throw new ToolArgError(lookup.reason);
      destination = lookup.found;
    }

    const outcome = await runBatch(refs, async (ref) => {
      const state = ctx.store.getState();
      const lookup = findList(state, ref);
      if ('reason' in lookup) return { ok: false as const, reason: lookup.reason };
      const list = lookup.found;
      if (BUILT_IN_LIST_IDS.has(list.id)) return { ok: false as const, title: list.title, reason: BUILT_IN_REASON };
      const was = list.title;
      const from = projectNameOf(state, list);
      const tasks = listContents(state, list.id);

      const moving = destination !== undefined && destination.id !== list.projectId;
      const targetProjectId = moving ? destination?.id : list.projectId;
      const newTitle = title ?? list.title;
      const clash = state.taskLists.some(
        (other) => other.id !== list.id && other.projectId === targetProjectId && sameName(other.title, newTitle),
      );
      if (clash && (moving || newTitle !== list.title)) {
        return { ok: false as const, title: list.title, reason: `that project already has a list called "${newTitle}".` };
      }

      const renaming = title !== undefined && title !== was;
      if (renaming || moving) ctx.snapshots.captureList(ctx.snapshotHandle, list.id);
      if (renaming) ctx.store.renameTaskList(list.id, newTitle);
      if (moving && destination) {
        const order = state.taskLists.filter((other) => other.projectId === destination.id).length;
        ctx.store.updateTaskList(list.id, { projectId: destination.id, order });
      }

      return {
        ok: true as const,
        title: was,
        value: { id: list.id, was, name: newTitle, renamed: renaming, movedTo: moving ? destination?.name : undefined, from, tasks },
      };
    });

    return batchResult(
      outcome,
      (done) => {
        const moved = done.filter((entry) => entry.value.movedTo !== undefined);
        const untouched = done.filter((entry) => !entry.value.renamed && entry.value.movedTo === undefined);
        const parts: string[] = [];
        const renamed = done.find((entry) => entry.value.renamed);
        if (renamed) {
          const into = renamed.value.movedTo !== undefined ? ` and moved it into "${renamed.value.movedTo}"` : '';
          parts.push(`Renamed the list "${renamed.value.was}" to "${renamed.value.name}"${into}.`);
        } else if (moved.length === 1) {
          const { value } = moved[0];
          parts.push(`Moved the list "${value.name}" into "${value.movedTo}", with its ${plural(value.tasks, 'task')}.`);
        } else if (moved.length > 1) {
          parts.push(`Moved ${moved.length} lists into "${moved[0].value.movedTo}": ${titleList(moved.map((entry) => entry.value.name))}.`);
        }
        if (untouched.length > 0) {
          parts.push(`${titleList(untouched.map((entry) => entry.value.name))} already ${untouched.length === 1 ? 'was' : 'were'} like that, so nothing changed there.`);
        }
        return parts.join(' ');
      },
      { lists: outcome.done.map((entry) => ({ id: entry.value.id, name: entry.value.name })) },
    );
  },
});

// ─── delete_project / delete_list ───────────────────────────────────────────

/** One thing a delete would take, as the approval card draws it (`readApprovalTargets` in `components/chat/approvalCopy.ts`). */
interface DeleteTarget {
  type: 'project' | 'list';
  id: string;
  title: string;
  extent: string;
}

const UNDO_SENTENCE = `It stays in the Trash for ${TRASH_DAYS} days, and Revert on the action log puts it back.`;

/**
 * The preview half both deletes share: resolve every ref, say what would go,
 * write nothing. The card has to describe **the batch** before any of it
 * happens, so this runs whole rather than per item — the same reason
 * `publish_share_link` gives.
 */
function previewDelete(
  refs: string[],
  resolve: (ref: string) => Lookup<DeleteTarget>,
  noun: 'project' | 'list',
): ToolResult {
  const targets: DeleteTarget[] = [];
  const reasons: string[] = [];
  for (const ref of refs) {
    const lookup = resolve(ref);
    if ('reason' in lookup) reasons.push(lookup.reason);
    else if (!targets.some((target) => target.id === lookup.found.id)) targets.push(lookup.found);
  }

  if (targets.length === 0) {
    const why = [...new Set(reasons)].map((reason) => `${reason.charAt(0).toUpperCase()}${reason.slice(1)}`).join(' ');
    return { ok: false, summary: `There is nothing to delete. ${why}`, data: { targets: [], unknown: reasons.length } };
  }

  const head =
    targets.length === 1
      ? `Delete the ${noun} "${targets[0].title}" — ${targets[0].extent}.`
      : `Delete ${targets.length} ${noun}s: ${targets.map((target) => `"${target.title}" (${target.extent})`).join('; ')}.`;
  const skipped = reasons.length > 0 ? ` (${reasons.length} could not be found and will be skipped.)` : '';
  return {
    ok: true,
    summary: `${head} ${targets.length === 1 ? UNDO_SENTENCE : UNDO_SENTENCE.replace('It stays', 'They stay').replace('puts it', 'puts them')}${skipped}`,
    data: { targets, unknown: reasons.length },
  };
}

export const deleteProject: ToolDef = defineTool({
  name: 'delete_project',
  mutates: true,
  /* BUILD-3: not irreversible, but a whole project's tasks in one call. See the
     header, and `CASCADING_DELETE_TOOL_NAMES` in `tools/index.ts`. */
  frontDoor: true,
  description:
    'Delete projects, with every list and task inside them. Only when the user asked for exactly that. It does NOT ' +
    'happen when you call it: it waits for Shreekant’s tap, and after the tap everything goes to the Trash for ' +
    `${TRASH_DAYS} days and can be put back. Say plainly that it is waiting for him. To get rid of one list, use delete_list.`,
  parametersSchema: {
    type: 'object',
    properties: {
      projectIds: { type: 'array', items: { type: 'string' }, description: 'Project ids, or exact project names.' },
    },
    required: ['projectIds'],
  },
  execute: async (args, ctx): Promise<ToolResult> => {
    const refs = requiredStringArray(args, 'projectIds', { max: BATCH_CAP, what: 'projects' });

    const asTarget = (state: AgentStoreState, ref: string): Lookup<DeleteTarget> => {
      const lookup = findProject(state, ref);
      if ('reason' in lookup) return lookup;
      const contents = projectContents(state, lookup.found.id);
      return {
        found: {
          type: 'project',
          id: lookup.found.id,
          title: lookup.found.name,
          extent: contents.lists === 0 ? 'an empty project' : `its ${describeProjectContents(contents)} go with it`,
        },
      };
    };

    if (ctx.preview) {
      const state = ctx.store.getState();
      return previewDelete(refs, (ref) => asTarget(state, ref), 'project');
    }

    const outcome = await runBatch(refs, async (ref) => {
      // Fresh per item: an earlier delete in the batch may already have taken this one.
      const state = ctx.store.getState();
      const lookup = findProject(state, ref);
      if ('reason' in lookup) return { ok: false as const, reason: lookup.reason };
      const project = lookup.found;
      const contents = projectContents(state, project.id);

      // The project only. Its lists and tasks travel in the same Trash entry, and
      // the revert fetches that entry back whole (`revertSnapshotEntries`).
      ctx.snapshots.captureProject(ctx.snapshotHandle, project.id);
      ctx.store.deleteProject(project.id);

      // Read the Trash back rather than assume: `applyDeletion` is silent on a plan
      // that matched nothing.
      const entry = ctx.store
        .trashEntries()
        .find((candidate) => candidate.kind === 'project' && candidate.projects.some((p) => p.id === project.id));
      if (!entry) {
        return { ok: false as const, title: project.name, reason: 'it was no longer there by the time the deletion ran, so nothing changed.' };
      }
      return { ok: true as const, title: project.name, value: { id: project.id, name: project.name, entryId: entry.id, ...contents } };
    });

    return batchResult(
      outcome,
      (done) =>
        done.length === 1
          ? `Deleted the project "${done[0].title}" and ${done[0].value.lists === 0 ? 'nothing else — it was empty' : `its ${describeProjectContents(done[0].value).replace(/,$/, '')}`}. ${UNDO_SENTENCE}`
          : `Deleted ${done.length} projects: ${titleList(done.map((entry) => entry.title))}, with everything in them. They stay in the Trash for ${TRASH_DAYS} days, and Revert on the action log puts them back.`,
      { entryIds: outcome.done.map((entry) => entry.value.entryId), projects: outcome.done.map((entry) => entry.value) },
    );
  },
});

export const deleteList: ToolDef = defineTool({
  name: 'delete_list',
  mutates: true,
  frontDoor: true,
  description:
    'Delete lists, with every task in them. Only when the user asked for exactly that. It does NOT happen when you ' +
    'call it: it waits for Shreekant’s tap, and after the tap the list and its tasks go to the Trash for ' +
    `${TRASH_DAYS} days and can be put back. Say plainly that it is waiting for him. The three built-in lists cannot be deleted.`,
  parametersSchema: {
    type: 'object',
    properties: {
      listIds: { type: 'array', items: { type: 'string' }, description: 'List ids, or exact list names.' },
    },
    required: ['listIds'],
  },
  execute: async (args, ctx): Promise<ToolResult> => {
    const refs = requiredStringArray(args, 'listIds', { max: BATCH_CAP, what: 'lists' });

    const asTarget = (state: AgentStoreState, ref: string): Lookup<DeleteTarget> => {
      const lookup = findList(state, ref);
      if ('reason' in lookup) return lookup;
      const list = lookup.found;
      if (BUILT_IN_LIST_IDS.has(list.id)) return { reason: `"${list.title}" is ${BUILT_IN_REASON.replace(/^it is /, '')}` };
      const where = projectNameOf(state, list);
      const tasks = listContents(state, list.id);
      return {
        found: {
          type: 'list',
          id: list.id,
          title: list.title,
          extent: `${where ? `in ${where}, ` : ''}${tasks === 0 ? 'no tasks in it' : `its ${plural(tasks, 'task')} go with it`}`,
        },
      };
    };

    if (ctx.preview) {
      const state = ctx.store.getState();
      return previewDelete(refs, (ref) => asTarget(state, ref), 'list');
    }

    const outcome = await runBatch(refs, async (ref) => {
      const state = ctx.store.getState();
      const lookup = findList(state, ref);
      if ('reason' in lookup) return { ok: false as const, reason: lookup.reason };
      const list = lookup.found;
      if (BUILT_IN_LIST_IDS.has(list.id)) return { ok: false as const, title: list.title, reason: BUILT_IN_REASON };
      const tasks = listContents(state, list.id);

      ctx.snapshots.captureList(ctx.snapshotHandle, list.id);
      ctx.store.deleteTaskList(list.id);

      const entry = ctx.store
        .trashEntries()
        .find((candidate) => candidate.kind === 'list' && candidate.taskLists.some((l) => l.id === list.id));
      if (!entry) {
        return { ok: false as const, title: list.title, reason: 'it was no longer there by the time the deletion ran, so nothing changed.' };
      }
      return { ok: true as const, title: list.title, value: { id: list.id, name: list.title, entryId: entry.id, tasks } };
    });

    return batchResult(
      outcome,
      (done) =>
        done.length === 1
          ? `Deleted the list "${done[0].title}"${done[0].value.tasks === 0 ? '' : ` and its ${plural(done[0].value.tasks, 'task')}`}. ${UNDO_SENTENCE}`
          : `Deleted ${done.length} lists: ${titleList(done.map((entry) => entry.title))}, with their tasks. They stay in the Trash for ${TRASH_DAYS} days, and Revert on the action log puts them back.`,
      { entryIds: outcome.done.map((entry) => entry.value.entryId), lists: outcome.done.map((entry) => entry.value) },
    );
  },
});

export const boardTools: ToolDef[] = [createProject, updateProject, createList, updateList, deleteProject, deleteList];
