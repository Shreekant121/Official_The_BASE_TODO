// This import must stay FIRST. It installs an in-memory `localStorage` as a
// side effect, and Zustand's `persist` middleware reads that global at
// store-*creation* time — which is module evaluation, so it has to be in place
// before anything below pulls a store in. See `storageStub.ts`.
import { silenceStorageWarnings } from './storageStub.ts';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setDeletionEffectHandler } from '../src/lib/deletionEffects';
import { APP_TOOL_SERVER, createToolServer } from '../src/lib/agent/toolServer/index';
import { AtlasStore } from './store.ts';
import { log, serveStdio } from './protocol.ts';

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

const SERVER_INFO = { name: APP_TOOL_SERVER, version: '1.0.0' };

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

async function main(): Promise<void> {
  // The one warning the stand-in storage cannot prevent, on a stream that also
  // carries real failures. `storageStub.ts` has the reasoning.
  silenceStorageWarnings();

  const store = new AtlasStore(config());

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

  /* BIG-12: the handler is shared with the tablet, which runs it in its own
     page with the lid shut. This host's half is the fresh read around every
     call and the zone from `.env`. */
  const tools = createToolServer({
    agentStore: store.agentStore,
    withFreshState: (mutates, run) => store.withFreshState(mutates, run),
    timezone: () => process.env.ATLAS_TIMEZONE?.trim() || 'Asia/Kolkata',
  });
  log(`[mcp] mutineer-os ready — ${store.describe()}`);

  await serveStdio({
    serverInfo: SERVER_INFO,

    listTools: () => tools.listTools(),

    callTool: (name, args, meta) => tools.callTool(name, args, meta),
  });

  log('[mcp] stdin closed — exiting.');
}

main().catch((err: unknown) => {
  log('[mcp] failed to start:', err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
