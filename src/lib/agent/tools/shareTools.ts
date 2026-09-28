import { makeShareId, sharePath } from '../../publicShareSnapshot';
import { defineTool, optionalEnum, requiredStringArray } from '../toolKit';
import type { AgentStoreState, ToolDef, ToolResult } from '../types';
import { batchResult, runBatch, titleList } from './batch';
import { BATCH_CAP } from './taskTools';

/**
 * Public share links (item 13, DESIGN.md §5.2).
 *
 * WHAT CAME DOWN, AND WHAT DID NOT
 * ---------------------------------
 * `FORBIDDEN_TOOL_NAMES` used to throw at import if a tool called
 * `create_share_link` or `revoke_share_link` was ever registered, and the note
 * beside it said why: *"the wall did not come down; it moved to where the
 * irreversible things actually are."* This is that place, and the wall has not
 * come down here either — it has become a **door with a latch on Shreekant's
 * side**. `publish_share_link` is declared, the model calls it normally, and
 * it stops one layer up in Atlas's `frontDoorToolset` with its arguments
 * intact until he taps.
 *
 * WHY PUBLISHING NEEDS A TAP AND REVOKING DOES NOT
 * -------------------------------------------------
 * Shreekant's call, put to him with the alternative. Publishing puts a page a
 * stranger can open on the public internet, and a link that has been out in
 * the world cannot be called back — revoking it stops the *page*, not the
 * copies, the caches or the person who already read it. Revoking is the same
 * act pointed the other way: it only ever reduces what is visible. Asking
 * permission to close a door you already wanted closed is ceremony, and
 * ceremony is what teaches someone to tap without reading.
 *
 * THE SNAPSHOT IS NOT WRITTEN HERE
 * ---------------------------------
 * These tools set `shareId` on the entity and nothing else. The
 * `publicShares/{id}` document — the thing an anonymous viewer actually reads
 * — is the *external half*, exactly like the Google Calendar block and the
 * Trash's own cleanup, and it is the host's to write: the browser does it
 * through `scheduleShareReconcile` on the next sync, and `mcp/store.ts` does
 * it with the Admin SDK on the same call. Doing it here would mean importing
 * `publicShare.ts`, which reaches `./firebase`, which cannot load in Node —
 * see `publicShareSnapshot.ts`'s header for the whole of that.
 */

type ShareTarget = 'task' | 'list' | 'project';

/** Where a share id lives, whatever kind of thing is being shared. */
interface Shareable {
  type: ShareTarget;
  id: string;
  title: string;
  shareId?: string;
  /** A sentence about how much would be visible — what an approval card needs. */
  extent: string;
}

function findShareable(state: AgentStoreState, id: string, type: ShareTarget | undefined): Shareable | null {
  const wants = (candidate: ShareTarget) => type === undefined || type === candidate;

  if (wants('task')) {
    const task = state.backlogTasks.find((candidate) => candidate.id === id && !candidate.parent);
    if (task) {
      const steps = (task.subtasks ?? []).length;
      return {
        type: 'task',
        id: task.id,
        title: task.title,
        shareId: task.shareId,
        extent: steps === 0 ? 'the task on its own' : `the task and its ${steps} step${steps === 1 ? '' : 's'}`,
      };
    }
  }

  if (wants('list')) {
    const list = state.taskLists.find((candidate) => candidate.id === id);
    if (list) {
      const tasks = state.backlogTasks.filter(
        (task) => (task.listId === list.id || task.sharedListIds?.includes(list.id)) && !task.parent && !task.hiddenFromShare,
      );
      return {
        type: 'list',
        id: list.id,
        title: list.title,
        shareId: list.shareId,
        extent: `${tasks.length} task${tasks.length === 1 ? '' : 's'} in the list`,
      };
    }
  }

  if (wants('project')) {
    const project = state.projects.find((candidate) => candidate.id === id);
    if (project) {
      const lists = state.taskLists.filter((list) => list.projectId === project.id && !list.hiddenFromShare);
      const listIds = new Set(lists.map((list) => list.id));
      const tasks = state.backlogTasks.filter(
        (task) =>
          !task.parent &&
          !task.hiddenFromShare &&
          (listIds.has(task.listId ?? '') || (task.sharedListIds ?? []).some((listId) => listIds.has(listId))),
      );
      return {
        type: 'project',
        id: project.id,
        title: project.name,
        shareId: project.shareId,
        extent: `${lists.length} list${lists.length === 1 ? '' : 's'} and ${tasks.length} task${tasks.length === 1 ? '' : 's'}`,
      };
    }
  }

  return null;
}

const TARGETS = ['task', 'list', 'project'] as const;

/**
 * ITEM 13D — SHARING BATCHES TOO, AND ONE TAP COVERS THE BATCH.
 *
 * This was the one thing 13D deliberately left unsettled: whether five links
 * should cost one tap or five. **Shreekant's call, 2026-09-08: one tap, with
 * all five listed on the card.** His reasoning is the front door's own — what
 * makes a tap safe is that he *read* what he was agreeing to, and five cards
 * that each say one line are read less carefully than one card that says five.
 * Five taps for one sentence he said is also item 13D's complaint pointed the
 * other way.
 *
 * **The mechanism needed nothing new on Atlas's side, which is worth writing
 * down.** `frontDoorToolset.ts` holds the *call* with its arguments intact and
 * re-runs it verbatim on approval, and the card's text is whatever the tool's
 * own preview said — so a batched call is already one tray item, one tap, one
 * execution. What this file owes that arrangement is a preview sentence that
 * names every target and what each would expose, which is what `describeExtent`
 * below is for. The structured half goes in `previewData` so the card can grow
 * from a paragraph into five lines without the tool changing again.
 *
 * `type` stays shared across the batch rather than per-target. Publishing a
 * task and a project in one breath is not a thing anyone asks for, the field is
 * optional and inferred from the id anyway, and a per-target object would cost
 * a 4B model the nesting for no case that exists.
 */
const TARGET_SCHEMA = {
  type: 'object' as const,
  properties: {
    ids: {
      type: 'array' as const,
      items: { type: 'string' as const },
      /*
       * ITEM 14 — WHERE A PROJECT ID COMES FROM, SAID HERE BECAUSE NOTHING
       * ELSE IN THIS DRAWER CAN SAY IT.
       *
       * "Ids come from a search or a read" was true of task ids and quietly
       * false of the other two: until `list_projects` existed nothing on the
       * board handed back a list id or a project id at all, so *"publish a
       * share link for Level Ai"* was impossible. It exists now — and it is in
       * the **Tasks** drawer, because a tool gets exactly one drawer over MCP
       * (see the note in `tools/index.ts`). A model that came straight here to
       * publish therefore cannot see it, and three runs of five spent their
       * turn guessing at `name`, `resourceId` and `projectId` before giving up
       * and asking Shreekant for a uuid. So the route home is written into the
       * parameter the model is trying to fill.
       */
      description:
        'Exact ids of the tasks, lists or projects — never a name, and never invented. A task id comes from ' +
        'search_tasks; a LIST or PROJECT id comes only from list_projects, which is in the Tasks drawer, so open ' +
        'that drawer and call it first when the user named a project or a list.',
    },
    type: {
      type: 'string' as const,
      enum: [...TARGETS],
      description: 'What the ids name, when they are all the same kind. Leave it out and each will be worked out from its id.',
    },
  },
  required: ['ids'],
};

// ─── publish_share_link ─────────────────────────────────────────────────────

export const publishShareLink: ToolDef = defineTool({
  name: 'publish_share_link',
  mutates: true,
  /*
   * The one flag that makes this safe, and `tools/index.ts` throws at import if
   * it is ever missing. See DESIGN.md §5.2.
   */
  frontDoor: true,
  description:
    'Put tasks, lists or projects on public, read-only web pages that anyone with the link can open. Takes a list, ' +
    'and ONE tap from Shreekant covers the whole batch — so ask for everything he named in one call. This CANNOT be ' +
    'undone — a link that has been out in the world cannot be called back — so it does not happen when you call it: ' +
    'it goes to Shreekant and waits for his tap, however long that takes. Call it when he asks to share something, ' +
    'say plainly that it is waiting for him, and carry on with the rest of the request.',
  parametersSchema: TARGET_SCHEMA,
  execute: async (args, ctx): Promise<ToolResult> => {
    const ids = requiredStringArray(args, 'ids', { max: BATCH_CAP, what: 'things to publish' });
    const type = optionalEnum(args, 'type', TARGETS);

    /*
     * THE PREVIEW PASS — the same lookups, no write.
     *
     * It runs first and whole, rather than per target inside the write loop,
     * because the card has to describe **the batch** before any of it happens:
     * one tap is agreeing to all five, so all five have to be on the card. The
     * checks that would refuse are the same checks, so a target that cannot be
     * published is caught here rather than failing after the tap.
     */
    if (ctx.preview) {
      const state = ctx.store.getState();
      const found = ids.map((id) => ({ id, target: findShareable(state, id, type) }));
      const known = found.filter((entry) => entry.target !== null).map((entry) => entry.target as Shareable);
      const fresh = known.filter((target) => !target.shareId);
      const already = known.filter((target) => target.shareId);
      const unknown = found.length - known.length;

      if (fresh.length === 0) {
        return {
          ok: false,
          summary:
            already.length > 0
              ? `${titleList(already.map((target) => target.title))} ${already.length === 1 ? 'is' : 'are'} already published, and nothing else here could be found. There is nothing to agree to.`
              : 'None of those ids is a task, list or project. If you sent a name, that is why: call list_projects ' +
                '(Tasks drawer) for a project or list id, or search_tasks for a task id, then use the id that comes back.',
          data: { targets: [], alreadyPublished: already.map(previewRow), unknown },
        };
      }

      const lines = fresh.map((target) => `the ${target.type} "${target.title}" — ${target.extent}`);
      const tail = [
        already.length > 0 ? `${already.length} of them ${already.length === 1 ? 'is' : 'are'} already public and will not change` : null,
        unknown > 0 ? `${unknown} could not be found and will be skipped` : null,
      ].filter(Boolean);

      return {
        ok: true,
        summary:
          (fresh.length === 1
            ? `Publish a public, read-only page for ${lines[0]}.`
            : `Publish ${fresh.length} public, read-only pages: ${lines.join('; ')}.`) +
          ` Anyone with the link${fresh.length === 1 ? '' : 's'} can open ${fresh.length === 1 ? 'it' : 'them'}, and ${fresh.length === 1 ? 'it' : 'they'} cannot be unpublished once seen.` +
          (tail.length > 0 ? ` (${tail.join('; ')}.)` : ''),
        // The structured half of the same thing, so the approval card can draw
        // one line per target instead of one paragraph. `ChatPage.tsx`'s
        // `ApprovalCard` reads this; a client that ignores it still has the
        // sentence above, which says everything the rows do.
        data: { targets: fresh.map(previewRow), alreadyPublished: already.map(previewRow), unknown },
      };
    }

    const outcome = await runBatch(ids, async (id) => {
      const state = ctx.store.getState();
      const target = findShareable(state, id, type);
      if (!target) {
        return {
          ok: false as const,
          reason: `nothing with that id is a ${type ?? 'task, list or project'} — find it first and use the id that comes back.`,
        };
      }

      if (target.shareId) {
        return {
          ok: true as const,
          title: target.title,
          value: {
            type: target.type,
            id: target.id,
            title: target.title,
            extent: target.extent,
            shareId: target.shareId,
            path: sharePath(target.shareId),
            alreadyPublished: true,
          },
        };
      }

      const shareId = makeShareId();
      if (target.type === 'task') {
        ctx.snapshots.captureTask(ctx.snapshotHandle, target.id);
        ctx.store.updateBacklogTask(target.id, { shareId });
      } else if (target.type === 'list') {
        ctx.snapshots.captureList(ctx.snapshotHandle, target.id);
        ctx.store.updateTaskList(target.id, { shareId });
      } else {
        ctx.snapshots.captureProject(ctx.snapshotHandle, target.id);
        ctx.store.updateProject(target.id, { shareId });
      }

      return {
        ok: true as const,
        title: target.title,
        value: { type: target.type, id: target.id, title: target.title, extent: target.extent, shareId, path: sharePath(shareId), alreadyPublished: false },
      };
    });

    return batchResult(
      outcome,
      (done) => {
        const published = done.filter((entry) => !entry.value.alreadyPublished);
        const already = done.filter((entry) => entry.value.alreadyPublished);
        const parts: string[] = [];
        if (published.length === 1) {
          parts.push(`Published "${published[0].title}" — ${published[0].value.extent} — at ${published[0].value.path}. Anyone with that link can read it`);
        } else if (published.length > 1) {
          parts.push(
            `Published ${published.length} pages: ${published.map((entry) => `"${entry.title}" at ${entry.value.path}`).join(', ')}. Anyone with those links can read them`,
          );
        }
        if (already.length > 0) {
          parts.push(
            `${titleList(already.map((entry) => entry.title))} ${already.length === 1 ? 'was' : 'were'} already published and ${already.length === 1 ? 'its' : 'their'} existing link${already.length === 1 ? '' : 's'} keep${already.length === 1 ? 's' : ''} working`,
          );
        }
        return `${parts.join('; ')}.`;
      },
      { targets: outcome.done.map((entry) => entry.value) },
    );
  },
});

/** One target as an approval card would draw it: what it is, and how much of it. */
function previewRow(target: Shareable): { type: ShareTarget; id: string; title: string; extent: string } {
  return { type: target.type, id: target.id, title: target.title, extent: target.extent };
}

// ─── revoke_share_link ──────────────────────────────────────────────────────

export const revokeShareLink: ToolDef = defineTool({
  name: 'revoke_share_link',
  mutates: true,
  description:
    'Take down the public pages for tasks, lists or projects, so the links stop working. Takes a list. This needs no ' +
    'approval — it only ever makes less visible, never more. Anyone who already opened a page has already seen it; ' +
    'revoking does not change that, and say so rather than implying the information came back.',
  parametersSchema: TARGET_SCHEMA,
  execute: async (args, ctx): Promise<ToolResult> => {
    const ids = requiredStringArray(args, 'ids', { max: BATCH_CAP, what: 'things to take down' });
    const type = optionalEnum(args, 'type', TARGETS);

    const outcome = await runBatch(ids, async (id) => {
      const state = ctx.store.getState();
      const target = findShareable(state, id, type);
      if (!target) {
        return {
          ok: false as const,
          reason: `nothing with that id is a ${type ?? 'task, list or project'} — find it first and use the id that comes back.`,
        };
      }

      /*
       * No link is a success, not a failure: the page is not public, which is
       * what was asked for. It just did not take a write to get there.
       */
      if (!target.shareId) {
        return { ok: true as const, title: target.title, value: { type: target.type, id: target.id, title: target.title, revoked: false, path: undefined as string | undefined } };
      }

      const wasShareId = target.shareId;

      /*
       * `undefined`, not an empty string. `withPatch` in the store is what makes
       * clearing a field work at all — CLAUDE.md is explicit that a hand-written
       * empty value is what Firestore rejects, and that every later edit then
       * silently stops syncing.
       */
      if (target.type === 'task') {
        ctx.snapshots.captureTask(ctx.snapshotHandle, target.id);
        ctx.store.updateBacklogTask(target.id, { shareId: undefined });
      } else if (target.type === 'list') {
        ctx.snapshots.captureList(ctx.snapshotHandle, target.id);
        ctx.store.updateTaskList(target.id, { shareId: undefined });
      } else {
        ctx.snapshots.captureProject(ctx.snapshotHandle, target.id);
        ctx.store.updateProject(target.id, { shareId: undefined });
      }

      return {
        ok: true as const,
        title: target.title,
        value: { type: target.type, id: target.id, title: target.title, revoked: true, path: sharePath(wasShareId) },
      };
    });

    return batchResult(
      outcome,
      (done) => {
        const revoked = done.filter((entry) => entry.value.revoked);
        const never = done.filter((entry) => !entry.value.revoked);
        const parts: string[] = [];
        if (revoked.length === 1) {
          parts.push(`Took down the public page for "${revoked[0].title}" — the link at ${revoked[0].value.path} no longer opens`);
        } else if (revoked.length > 1) {
          parts.push(`Took down ${revoked.length} public pages: ${titleList(revoked.map((entry) => entry.title))} — those links no longer open`);
        }
        if (never.length > 0) {
          parts.push(
            revoked.length > 0
              ? `${never.length} had no public link to begin with`
              : `${titleList(never.map((entry) => entry.title))} had no public link, so there was nothing to take down`,
          );
        }
        const seen =
          revoked.length > 0
            ? ` Anyone who already read ${revoked.length === 1 ? 'it' : 'them'} still has what they read.`
            : '';
        return `${parts.join('; ')}.${seen}`;
      },
      { targets: outcome.done.map((entry) => entry.value) },
    );
  },
});

export const shareTools: ToolDef[] = [publishShareLink, revokeShareLink];
