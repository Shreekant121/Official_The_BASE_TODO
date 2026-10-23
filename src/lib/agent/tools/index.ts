import type { ToolArgs, ToolContext, ToolDeclaration, ToolDef, ToolResult } from '../types';
import { boardTools } from './boardTools';
import { queueTools } from './queueTools';
import { shareTools } from './shareTools';
import { subtaskTools } from './subtaskTools';
import { moveTask } from './moveTools';
import { sendToEvening } from './eveningTools';
import { listUndated, scheduleTask } from './scheduleTools';
import { listProjects, taskTools } from './taskTools';
import { trashTools } from './trashTools';
import { eventTools } from './eventTools';

/**
 * The registry.
 *
 * TWO CONSUMERS SINCE ITEM 9, AND THEY DECLARE DIFFERENT THINGS
 * --------------------------------------------------------------
 * This used to be one list handed to one agent loop running in this browser.
 * There are now two hosts for it and the difference matters:
 *
 * - **`mcpTools` — everything, served over MCP** by `mcp/` to Atlas on the
 *   laptop. Atlas does not declare them all at once; they arrive in *drawers*
 *   (`DRAWERS` below, DESIGN.md §7.1), opened one at a time, because declaring
 *   forty tools spends thousands of tokens before anything is said and a
 *   small model choosing among forty similar options picks wrong.
 * - **`fallbackTools` — the original eight**, for the in-browser agent that
 *   answered when the laptop was asleep. **Retired at BIG-12 (27A-5)** with
 *   that agent, his call ("Retire it, Atlas for all"): Atlas now runs in the
 *   page with the lid shut and takes `mcpTools` in drawers there too, through
 *   the same handler (`toolServer/`). One consumer again, on two hosts.
 *
 * DECISION D3 IS REVERSED, AND ONLY HALF OF IT
 * ----------------------------------------------
 * `delete_task` was forbidden here at import time — a permanent boundary, not
 * a phase-1 limitation. The queue item reversing it gives the reason:
 * deletion in this app is soft, into a 30-day Trash, and `restore_from_trash`
 * is registered right beside it. What stayed forbidden was the half with no
 * undo — publishing a public share link — which waited for the approval front
 * door (DESIGN.md §5.2). The wall did not come down; it moved to where the
 * irreversible things actually are.
 *
 * ITEM 13 BUILT THE DOOR, SO THE BAN LIST BECAME A REQUIREMENT LIST
 * ------------------------------------------------------------------
 * `FORBIDDEN_TOOL_NAMES` is gone and `IRREVERSIBLE_TOOL_NAMES` is in its
 * place. The old check said *these tools must not exist*; the new one says
 * *if a tool by one of these names exists, it must be marked `frontDoor`* —
 * and it still throws at import, so getting it wrong is a build that will not
 * start rather than a review somebody skimmed.
 *
 * That is a stronger guarantee than the ban was, because it survives the tool
 * existing. `send_email` is on the list ahead of the tool, so item 22 inherits
 * the protection rather than having to remember it.
 */

/**
 * ITEM 14: `list_projects` is in this list rather than in `taskTools`, and the
 * difference is `fallbackTools` below — the in-browser assistant's eight,
 * which are deliberately not widened. It is a tool Atlas needs because Atlas
 * can publish a share link; the browser path has no share tools at all, so it
 * would be paying tokens for an id it can never use.
 *
 * BUILD-17's `move_task` sits beside it for the other half of that reason: the
 * fallback keeps its eight, and moving a task is not what it is there for.
 */
export const taskDrawerTools: ToolDef[] = [...taskTools, listProjects, moveTask, sendToEvening, scheduleTask, listUndated, ...subtaskTools, ...trashTools];

export const allTools: ToolDef[] = [...taskDrawerTools, ...queueTools, ...boardTools, ...shareTools, ...eventTools];

/**
 * Everything reachable over MCP. Identical to `allTools` today; kept as its
 * own name because the two diverge the moment a tool exists that only makes
 * sense on the host (a file read, a web fetch) or only in the browser.
 */
export const mcpTools: ToolDef[] = allTools;

/*
 * `fallbackTools`, the retired basic assistant's eight, lived here until BIG-12
 * (27A-5, his call "Retire it, Atlas for all"). Every assistant turn is Atlas's
 * now, and Atlas declares `mcpTools` in drawers.
 */

export const toolRegistry: Record<string, ToolDef> = Object.fromEntries(
  allTools.map((tool) => [tool.name, tool]),
);

/**
 * Which drawer each tool is in (DESIGN.md §7.1).
 *
 * Declared here rather than in Atlas because a drawer is a property of the
 * *server* — when relaticle's 37 CRM tools are plugged in they arrive as their
 * own drawer without relaticle knowing the word, and Atlas's job is only to
 * open one at a time. `mcp/` sends this to the client as tool metadata.
 */
export const DRAWERS: Record<string, { title: string; description: string; tools: string[] }> = {
  tasks: {
    title: 'Tasks',
    description:
      'Everything about a task: finding one, reading it, creating, editing every field on its detail card, moving it ' +
      'to another list or project and reordering it, sending it to this evening, putting it on the calendar at a time and the tasks with no date, its steps, completing it, deleting it and restoring it from the Trash.',
    tools: taskDrawerTools.map((tool) => tool.name),
  },
  queue: {
    title: "Today's queue",
    description: 'What the user has picked to work on today — reading the queue, adding to it and taking things off it.',
    tools: queueTools.map((tool) => tool.name),
  },
  /*
   * BUILD-3. Its own drawer for §7.1's reason — reshaping the board is rare
   * next to editing a task, and six more tools in `tasks` would be paid for on
   * every message about a deadline. `list_projects` stays in `tasks` (a tool
   * has exactly one drawer, see the note on `sharing` below), which is why
   * these tools take exact names as well as ids.
   */
  projects: {
    title: 'Projects and lists',
    description:
      'Creating projects and the lists inside them, renaming either, moving a list to another project, and deleting ' +
      'either. Deleting waits for the user to tap.',
    tools: boardTools.map((tool) => tool.name),
  },
  /*
   * Its own drawer rather than two more tools in `tasks`, for §7.1's reason: a
   * drawer is a token budget, and sharing is rare. Two more options in front
   * of a 4B model on every message about a deadline would cost every turn to
   * serve the one that wants a link — and `find_tool` finds them when the
   * model does not know where to look.
   */
  /*
   * 29-2a. Its own drawer for §7.1's reason: events are a different thing from
   * tasks, and four more tools in `tasks` would be paid for on every message
   * about a deadline.
   */
  events: {
    title: 'Events and countdowns',
    description:
      'Dates he counts down to, which are not tasks: a trip, a birthday, a race, a class. Listing them with the time ' +
      'left, creating, changing (date, repeat, place, how the countdown counts) and deleting them. Also his calendar: ' +
      'what is on a day or a week, events and tasks due together.',
    tools: eventTools.map((tool) => tool.name),
  },
  sharing: {
    title: 'Sharing',
    description:
      'Public read-only links for a task, a list or a project. Publishing one waits for the user to tap; taking one ' +
      'down does not.',
    /*
     * ITEM 14 TRIED TO PUT `list_projects` IN THIS DRAWER AS WELL, AND A TOOL
     * CANNOT BE IN TWO DRAWERS. Worth writing down, because the attempt looks
     * like it works: `DRAWERS` is a record of name lists and nothing stops a
     * name appearing twice. What carries a drawer to Atlas is `_meta.drawer`
     * in `mcp/index.ts`, which is **one** value per tool from `drawerOf` —
     * the first drawer the name appears in, so the second membership changes
     * nothing and silently reads as though it had.
     *
     * Measured: with the name listed here, `open_drawer("sharing")` still came
     * back *"You can now use: publish_share_link, revoke_share_link"*, and
     * three runs of `t4` in five then guessed at parameter names (`name`,
     * `resourceId`, `projectId`), failed, and asked Shreekant for a uuid.
     *
     * The fix is a sentence rather than a second membership: `publish_share_link`
     * names the tool and the drawer that hands out project and list ids, and
     * so does the error it returns when it is given a name instead of an id.
     * Making a tool belong to two drawers would mean `_meta.drawers` as a list
     * and a matching change in Atlas's `drawers.ts` — the MCP boundary in both
     * repos, for one tool.
     */
    tools: shareTools.map((tool) => tool.name),
  },
};

/**
 * Names whose act cannot be undone, and which must therefore go through the
 * front door (item 13, DESIGN.md §5.2).
 *
 * Every one of these puts something outside this machine, where revoking it
 * changes the page and not the fact that somebody read it. A tool by one of
 * these names may now exist — that is what item 13 changed — but only marked
 * `frontDoor`, which is what makes Atlas hold it for a tap instead of running
 * it.
 *
 * `revoke_share_link` is deliberately NOT here. Shreekant's call, made with
 * the alternative in front of him: taking a link down only ever reduces what
 * is visible, and asking permission to close a door you already wanted closed
 * is the kind of ceremony that teaches someone to tap without reading.
 *
 * The four `delete_*` names that used to be in the ban list are gone
 * deliberately. See the D3 note above; `tools/trashTools.ts` carries the full
 * reasoning.
 */
export const IRREVERSIBLE_TOOL_NAMES = [
  'publish_share_link',
  'create_share_link',
  'share_project',
  'share_task',
  'send_email',
  'send_mail',
] as const;

/**
 * Deletes that take a whole container with them, and which must therefore
 * also go through the front door (BUILD-3).
 *
 * **They are NOT irreversible, and that is why this is a second list rather
 * than two more names on the first.** A deleted project goes to the Trash for
 * thirty days and Revert on `/log` fetches it back. What earns the tap is the
 * blast radius: one call takes every list and task inside. The queue item put
 * it as a choice — held for a tap through `applyDeletion`, or not registered —
 * and Shreekant chose the tap (2026-09-16).
 *
 * Kept apart so that neither Atlas nor he is told something false. Atlas reads
 * the difference from `_meta.frontDoorKind` (`mcp/index.ts`) and says *"goes to
 * the Trash, and can be put back"* on these instead of *"cannot be undone"*;
 * the approval card and the log draw the two differently for the same reason.
 * `delete_task` is deliberately absent: one task is one record, and the Trash
 * has been enough for it since item 9.
 */
export const CASCADING_DELETE_TOOL_NAMES = ['delete_project', 'delete_list'] as const;

/** Every name that must be marked `frontDoor`, whichever the reason. */
const FRONT_DOOR_TOOL_NAMES: readonly string[] = [...IRREVERSIBLE_TOOL_NAMES, ...CASCADING_DELETE_TOOL_NAMES];

/**
 * Why a front-door tool is behind the door, as `mcp/index.ts` tells Atlas.
 * `undefined` for a tool that is not behind it.
 */
export function frontDoorKindOf(tool: ToolDef): 'irreversible' | 'undoable' | undefined {
  if (tool.frontDoor !== true) return undefined;
  return (CASCADING_DELETE_TOOL_NAMES as readonly string[]).includes(tool.name) ? 'undoable' : 'irreversible';
}

const unlatched = allTools
  .filter((tool) => FRONT_DOOR_TOOL_NAMES.includes(tool.name) && tool.frontDoor !== true)
  .map((tool) => tool.name);
if (unlatched.length > 0) {
  throw new Error(
    `These tools must wait for the user's own tap and are not marked frontDoor: ${unlatched.join(', ')}. ` +
      'An irreversible act, or a delete that takes a whole project or list, goes through the front door (item 13, BUILD-3).',
  );
}

/*
 * And the check pointed the other way: a tool marked `frontDoor` that is not
 * on either list above. That is not a safety failure — it is *more* cautious
 * than asked for — but it means the lists have stopped describing the surface,
 * and a list nobody trusts stops being read. Since BUILD-3 it also matters: an
 * unlisted front-door tool would be reported to Atlas as irreversible.
 */
const unlisted = allTools
  .filter((tool) => tool.frontDoor === true && !FRONT_DOOR_TOOL_NAMES.includes(tool.name))
  .map((tool) => tool.name);
if (unlisted.length > 0) {
  throw new Error(
    `These tools are marked frontDoor but are in neither IRREVERSIBLE_TOOL_NAMES nor CASCADING_DELETE_TOOL_NAMES: ${unlisted.join(', ')}. ` +
      'Add them to the one that is true, so the lists stay the whole answer.',
  );
}

/** Every tool that needs a tap. What `mcp/index.ts` reports in each one's `_meta`. */
export const frontDoorTools: ToolDef[] = allTools.filter((tool) => tool.frontDoor === true);

const duplicates = allTools.map((t) => t.name).filter((name, i, names) => names.indexOf(name) !== i);
if (duplicates.length > 0) {
  throw new Error(`Duplicate tool name(s) in the registry: ${duplicates.join(', ')}.`);
}

const undrawered = allTools
  .map((tool) => tool.name)
  .filter((name) => !Object.values(DRAWERS).some((drawer) => drawer.tools.includes(name)));
if (undrawered.length > 0) {
  throw new Error(`These tools are in no drawer and Atlas would never declare them: ${undrawered.join(', ')}.`);
}

export function getTool(name: string): ToolDef | undefined {
  return toolRegistry[name];
}

/** The drawer a tool belongs to, or `undefined` for a name that is not registered. */
export function drawerOf(toolName: string): string | undefined {
  return Object.keys(DRAWERS).find((key) => DRAWERS[key].tools.includes(toolName));
}

/**
 * The registry as a model is told about it: name, description and parameter
 * schema, with the executable half left behind. Provider-neutral — turning one
 * of these into a vendor's own declaration shape is the adapter's job (see
 * `providers/gemini.ts`).
 */
export function toToolDeclarations(tools: ToolDef[] = allTools): ToolDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parametersSchema,
  }));
}

/**
 * Dispatch by name. An unknown name is a `ToolResult`, not a throw — the agent
 * loop has to send *something* back as the function response, and a model that
 * hallucinated a tool recovers faster from being told which ones exist.
 */
export async function runTool(name: string, args: ToolArgs, ctx: ToolContext): Promise<ToolResult> {
  const tool = getTool(name);
  if (!tool) {
    return { ok: false, summary: `There is no tool called "${name}". Available tools: ${Object.keys(toolRegistry).join(', ')}.` };
  }
  return tool.execute(args ?? {}, ctx);
}

export { boardTools, queueTools, subtaskTools, taskTools, trashTools };
