// This import must stay FIRST. It installs an in-memory `localStorage` as a
// side effect, and Zustand's `persist` middleware reads that global at
// store-*creation* time — which is module evaluation, so it has to be in place
// before anything below pulls a store in. See `storageStub.ts`.
import { silenceStorageWarnings } from './storageStub.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setDeletionEffectHandler } from '../src/lib/deletionEffects';
import { liveSnapshotCapture } from '../src/lib/agent/liveContext';
import { drawerOf, DRAWERS, frontDoorKindOf, getTool, mcpTools } from '../src/lib/agent/tools/index';
import type { ToolContext } from '../src/lib/agent/types';
import { AtlasStore } from './store.ts';
import { ConsistencyGuard, idsIn } from './consistency.ts';
import { applyUndo, beginCapture, endCapture } from './undo.ts';
import { log, serveStdio, type McpTool, type McpToolResult } from './protocol.ts';

/**
 * BASE as an MCP server (item 9).
 *
 * This is the thing that makes Atlas a *layer* rather than a feature. Atlas
 * spawns this process, speaks MCP down a pipe, and reaches everything the app
 * can do without knowing anything about React, Zustand or Firestore. When
 * relaticle's CRM or a mail server is plugged in later they arrive the same
 * way — another process, another drawer — rather than as another adapter
 * written by hand (DESIGN.md §1).
 *
 * RUN IT
 * ------
 *   npm run mcp
 *
 * It is not usually run by hand: Atlas launches it. Run directly it will sit
 * waiting for JSON-RPC on stdin, which looks like a hang and is not one.
 *
 * WHAT IT NEEDS
 * -------------
 * Two values, read from this repo's `.env`:
 *
 * - `FIREBASE_SERVICE_ACCOUNT` — the whole downloaded key file, stringified
 *   onto one line. **This key bypasses `firestore.rules` completely**; it is
 *   the Admin SDK. It never leaves this machine — the transport is a pipe to
 *   a sibling process, not a socket — and it must never be committed.
 * - `ATLAS_FIREBASE_UID` — whose data to act on. Deliberately explicit rather
 *   than "the only user": an Admin credential can read every account in the
 *   project, so the one account it is allowed to touch is named rather than
 *   inferred.
 */

const SERVER_INFO = { name: 'mutineer-os', version: '1.0.0' };

/**
 * A tiny `.env` reader, in the same spirit as Atlas's.
 *
 * `dotenv` is a dependency for a job that is forty lines, and this file is
 * read once at startup. Handles `KEY=value`, `#` comments, blank lines, and a
 * value wrapped in quotes.
 *
 * IT ALSO HANDLES A QUOTED VALUE THAT SPANS LINES, AND THAT IS NOT A FLOURISH
 * ---------------------------------------------------------------------------
 * `FIREBASE_SERVICE_ACCOUNT` is a JSON file, and the file Firebase hands you
 * is **pretty-printed** — so the natural thing to do, opening it and pasting
 * the whole thing between quotes, produces a value twelve lines long. A
 * line-at-a-time parser reads that as the single character `{`, and then fails
 * with "not valid JSON" while the key sits there in the file looking perfectly
 * correct. That is a genuinely horrible half-hour, and the instructions saying
 * "keep it on one line" do not prevent it — they just move the blame.
 *
 * So a value that opens with a quote is read until its closing quote, however
 * many lines that takes. Pasting the file as-is now works, and so does the
 * one-line form.
 */
function readEnvFile(path: string): Record<string, string> {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return {};
  }

  const out: Record<string, string> = {};
  const lines = text.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    if (key === '') continue;

    const value = trimmed.slice(eq + 1).trim();
    const quote = value.startsWith('"') ? '"' : value.startsWith("'") ? "'" : null;

    if (quote === null) {
      out[key] = value;
      continue;
    }

    // Already closed on this line — the ordinary quoted case. The length check
    // matters: a lone `'` opens a value, it does not close one.
    if (value.length >= 2 && value.endsWith(quote)) {
      out[key] = value.slice(1, -1);
      continue;
    }

    // Open quote with no close: keep taking lines until one ends with it.
    // Newlines are preserved, which is what JSON wants back.
    const parts = [value.slice(1)];
    let closed = false;
    while (i + 1 < lines.length) {
      i += 1;
      const next = lines[i];
      if (next.trimEnd().endsWith(quote)) {
        parts.push(next.trimEnd().slice(0, -1));
        closed = true;
        break;
      }
      parts.push(next);
    }

    // An unterminated quote is a typo in the file, not a value. Storing the
    // rest of the file under this key would produce an error pointing at the
    // wrong thing entirely.
    if (closed) out[key] = parts.join('\n');
  }

  return out;
}

/** `process.env` wins, so Atlas can pass either through without editing a file. */
function config(): { serviceAccountJson: string; uid: string } {
  const file = readEnvFile(resolve(import.meta.dirname, '..', '.env'));
  const read = (key: string): string => (process.env[key] ?? file[key] ?? '').trim();

  const serviceAccountJson = read('FIREBASE_SERVICE_ACCOUNT');
  const uid = read('ATLAS_FIREBASE_UID');

  const missing = [
    serviceAccountJson === '' ? 'FIREBASE_SERVICE_ACCOUNT' : null,
    uid === '' ? 'ATLAS_FIREBASE_UID' : null,
  ].filter((name): name is string => name !== null);

  if (missing.length > 0) {
    throw new Error(
      `${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not set. ` +
        'Both go in liquid-glass/.env — see .env.example for where to get them.',
    );
  }

  return { serviceAccountJson, uid };
}

/**
 * The registry, as MCP describes tools.
 *
 * The drawer travels in `_meta`, which MCP reserves for out-of-band data. A
 * client that ignores it sees a flat list of every tool and still works; Atlas
 * reads it and shows the model one drawer at a time (DESIGN.md §7.1). The
 * drawer definitions ride along on the first tool of each so a client can
 * render a drawer's own title and description without a second call.
 */
function describeTools(): McpTool[] {
  return mcpTools.map((tool) => {
    const drawer = drawerOf(tool.name);
    return {
      name: tool.name,
      description: tool.description,
      inputSchema: tool.parametersSchema as unknown as Record<string, unknown>,
      _meta: {
        drawer,
        drawerTitle: drawer ? DRAWERS[drawer].title : undefined,
        drawerDescription: drawer ? DRAWERS[drawer].description : undefined,
        mutates: tool.mutates,
        /*
         * Item 13, DESIGN.md §5.2. Declared by the server that owns the act,
         * because whether something can be taken back is a fact about the act
         * — Atlas holding a list of irreversible tool names would be Atlas
         * knowing what its servers do, which is the one thing the MCP boundary
         * exists to prevent. `tools/index.ts` throws at import if a
         * known-irreversible name is registered without it.
         */
        frontDoor: tool.frontDoor === true,
        /*
         * BUILD-3. WHY it is behind the door — `irreversible` (a share link,
         * mail) or `undoable` (a delete that takes a whole project or list, and
         * that Revert can still fetch back from the Trash). Atlas words the
         * waiting sentence, the tray card and the log from it, and treats a
         * front-door tool with no kind as irreversible, which is the safe
         * reading for a server that has never heard of this field.
         */
        frontDoorKind: frontDoorKindOf(tool),
      },
    };
  });
}

async function main(): Promise<void> {
  // The one warning the stand-in storage cannot prevent, on a stream that also
  // carries real failures. `storageStub.ts` has the reasoning.
  silenceStorageWarnings();

  const store = new AtlasStore(config());
  /* §5.4, per turn. One per process because one process serves one Atlas, and
     `enterTurn` empties it whenever the turn id changes. */
  const guard = new ConsistencyGuard();

  /*
   * Nothing is registered as a deletion effect, and that is the documented
   * correct behaviour rather than an omission: `deletionEffects.ts` says a
   * deletion with no handler "simply has no external half". The two external
   * halves — the `publicShares/{id}` document and the Google Calendar
   * reminder — are rebuilt from the store by the reconcile passes
   * `firestoreSync.ts` runs on the app's next snapshot, and a delete from here
   * *is* a snapshot. So they are cleaned up when the app is next open rather
   * than never. Set explicitly to `null` so that a future import which
   * registers one by side effect cannot do it silently.
   *
   * **Item 13 narrowed that by exactly one case and left the rest true.**
   * Deleting a *shared* entity now takes its `publicShares/{id}` document down
   * on the spot, because `store.ts` reconciles the share ids it can see before
   * and after every write — and a public page that outlives the thing it
   * describes is the one stale external half that is somebody else's problem
   * rather than Shreekant's. The calendar block still waits for the app.
   */
  setDeletionEffectHandler(null);

  await store.hydrate();
  log(`[mcp] mutineer-os ready — ${store.describe()}`);

  await serveStdio({
    serverInfo: SERVER_INFO,

    listTools: () => describeTools(),

    callTool: async (name, args, meta): Promise<McpToolResult> => {
      /*
       * ITEM 13: PUTTING A CHANGE BACK IS NOT A TOOL THE MODEL CAN SEE.
       *
       * `revert_actions` is handled here and is absent from `tools/list`, so
       * it costs no tokens and the model can never reach for it. Reverting is
       * something *Shreekant* does, from the action log, and routing it down
       * the same pipe is what lets Atlas offer the button without knowing what
       * undoing a task means (DESIGN.md §5.3, `undo.ts`).
       */
      if (name === 'revert_actions') {
        const report = await store.withFreshState(true, async () =>
          applyUndo((args as { payload?: unknown }).payload),
        );
        return { content: [{ type: 'text', text: report.summary }], isError: !report.ok };
      }

      const tool = getTool(name);
      if (!tool) {
        return {
          content: [
            {
              type: 'text',
              text: `There is no tool called "${name}". Available tools: ${mcpTools.map((t) => t.name).join(', ')}.`,
            },
          ],
          isError: true,
        };
      }

      /*
       * ITEM 13: A PREVIEW NEVER WRITES, AND THAT IS ENFORCED HERE RATHER THAN
       * TRUSTED OF THE TOOL.
       *
       * `preview` reaches the tool as `ctx.preview` so that it can *describe*
       * what it would do — which is what fills a front-door approval card. But
       * the safety does not rest on the tool honouring it: a preview runs
       * through the read-only path, which never flushes, and the next call
       * re-hydrates from Firestore. So a tool that ignored the flag entirely
       * would still change nothing outside this process's memory for one call.
       */
      const preview = meta?.preview === true;
      const mutates = tool.mutates && !preview;
      const turnId = typeof meta?.turnId === 'string' ? meta.turnId : null;
      guard.enterTurn(turnId);

      const result = await store.withFreshState(mutates, async () => {
        /*
         * `now` is pinned per call rather than per turn, which is the one
         * place this host is weaker than the browser's. In the app a whole
         * turn shares one clock (decision D14) so six tool calls cannot
         * disagree about "tomorrow"; over MCP each call arrives on its own.
         * Item 13 puts a `turnId` in `_meta` — used below for §5.4 — so the
         * grouping now exists and pinning the clock to it is the obvious next
         * step; it is not taken here because it changes what dates a turn
         * resolves to, which is a behaviour change wanting its own session.
         *
         * The timezone is Shreekant's, not the laptop's, for the reason the
         * chat route already gives: the tablet decides what "today" is.
         */
        const ctx: ToolContext = {
          snapshotHandle: beginCapture(turnId ?? 'no-turn', name),
          now: new Date(),
          timezone: process.env.ATLAS_TIMEZONE?.trim() || 'Asia/Kolkata',
          store: store.agentStore,
          ...(preview ? { preview: true } : {}),
          /*
           * ITEM 13: THE SNAPSHOT RING RUNS HERE NOW.
           *
           * It used to be three no-ops with a note saying the action log would
           * replace them. It does — but not by replacing the *capture*, which
           * was always the right mechanism and the only one that knows to keep
           * the first value a turn saw. What the log adds is durability: the
           * entries are lifted out after the call and travel to Atlas, which
           * writes them to the laptop. See `undo.ts`.
           */
          snapshots: liveSnapshotCapture,
        };

        /*
         * §5.4, checked before the tool runs and after the fresh read.
         *
         * The targets come out of the *arguments* — every id the model named —
         * and are matched against what Atlas saw earlier in this turn. See
         * `consistency.ts` for why this is not the same thing as
         * `withFreshState` re-reading.
         */
        if (mutates) {
          const refusal = guard.check(store.agentStore.getState(), idsIn(args));
          if (refusal !== null) return { ok: false, summary: refusal, handle: ctx.snapshotHandle };
        }

        const outcome = await tool.execute(args, ctx);
        return { ...outcome, handle: ctx.snapshotHandle };
      });

      const { handle, ...toolResult } = result;
      /* Closed unconditionally — a capture left open would pin every entity a
         refused call touched in a process that lives as long as Atlas does.
         Only a write that actually landed produces a token. */
      const captured = endCapture(handle);
      const undo = mutates && toolResult.ok ? captured : null;

      /*
       * What Atlas has now seen, recorded after the call rather than before.
       *
       * A read records what it returned; a successful write records the new
       * value, so Atlas writing the same task twice in one turn is not Atlas
       * fighting itself. Both come from the freshly-read state the call just
       * ran against.
       */
      const state = store.agentStore.getState();
      if (!mutates) guard.observe(state, idsIn(toolResult.data));
      else if (toolResult.ok) guard.refresh(state, idsIn(args));

      return {
        // `summary` is written to be read by a model on its next turn — that
        // is its whole purpose — so it is the text content, and the structured
        // payload rides alongside for a client that wants it.
        content: [{ type: 'text', text: toolResult.summary }],
        isError: !toolResult.ok,
        structuredContent: toolResult.data === undefined ? undefined : toolResult.data,
        /* Item 13. Beside the result, never inside it — this is a complete
           copy of everything the call touched and must not cost the model a
           token. `drawers.ts` on Atlas's side reads it. */
        ...(undo === null ? {} : { _meta: { undo: { payload: undo } } }),
      };
    },
  });

  log('[mcp] stdin closed — exiting.');
}

main().catch((err: unknown) => {
  log('[mcp] failed to start:', err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
