import { auth } from '../../firebase';
import type { BrowserAtlasOptions } from './atlasEngine.generated';

/**
 * Atlas's web lookup with the laptop shut (BIG-12, step 27A-4): the app's
 * `api/lookup` route, as the engine's `lookup` option.
 *
 * A browser cannot open a stranger's page and must not hold the Brave key, so
 * the route does both and hands back plain data — a page or a sentence saying
 * why not. Every failure here becomes that same sentence, because the one who
 * reads it is the model: "could not open the page" is something it can tell
 * him; a thrown error mid-turn is not.
 */
type Lookup = NonNullable<BrowserAtlasOptions['lookup']>;

const ENDPOINT = '/api/lookup';

async function ask(body: Record<string, unknown>): Promise<{ answer: unknown } | { failed: string }> {
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  if (!token) return { failed: 'Web lookup needs a signed-in account, and this one is not signed in.' };
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { failed: `Could not reach the app's lookup service: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (res.status === 401 || res.status === 403) {
    return { failed: 'This account is not allowed web lookups: they run on the owner’s keys, which he allows per account on the Admin screen.' };
  }
  if (!res.ok) return { failed: `The app's lookup service answered ${res.status}.` };
  return { answer: await res.json() };
}

export function lookupThroughApp(): Lookup {
  return {
    async read(url) {
      const reply = await ask({ kind: 'read', url });
      return 'failed' in reply ? { ok: false, refused: reply.failed } : (reply.answer as Awaited<ReturnType<Lookup['read']>>);
    },
    async search(query, page) {
      const reply = await ask({ kind: 'search', query, page });
      return 'failed' in reply ? { ok: false, unavailable: reply.failed } : (reply.answer as Awaited<ReturnType<Lookup['search']>>);
    },
  };
}
