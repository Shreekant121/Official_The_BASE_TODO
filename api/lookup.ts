/**
 * Web lookup for Atlas with the laptop shut — BIG-12, step 27A-4.
 *
 * With the lid shut the tablet runs Atlas itself, including its `fetch_url`
 * and `search_web` tools. Two halves of those a browser cannot do: open a
 * stranger's page (the browser forbids it), and hold the Brave key (it must
 * not reach a device). This route does exactly those two, with Atlas's own
 * code (`../atlas/src/lookup/remote.ts`, bundled into `_lib/lookup.js` by
 * `npm run build:atlas`), and nothing else — the page goes back whole and is
 * read and summarised on the tablet by the turn's own model. It never sees a
 * question, a model or a key of his.
 *
 * POST { kind: 'read', url }            → RemoteRead   (a page, or a refusal in words)
 * POST { kind: 'search', query, page? } → RemoteSearch (Brave results, or why not)
 *
 * **Locked like the Gemini key** (`authorizeKeySpend`, BUILD-6): a signed-in
 * account the owner has allowed the assistant. The Brave key is his, on its
 * free tier, and an open fetcher on his domain would be somebody else's proxy.
 * The page fetch keeps the laptop's private-address guard, so this cannot be
 * pointed at anything inside Vercel's network either.
 *
 * Required Vercel env var for search: `BRAVE_SEARCH_API_KEY` (his tap). Without
 * it, search answers with a sentence saying so and reading a link still works.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authorizeKeySpend } from './_lib/keyAccess.js';
import { readForRemote, searchForRemote } from './_lib/lookup.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const caller = await authorizeKeySpend(req.headers.authorization);
  if ('error' in caller) {
    return res.status(caller.status).json({ error: caller.error, ...(caller.detail ? { detail: caller.detail } : {}) });
  }

  const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
  res.setHeader('Cache-Control', 'no-store');

  if (body.kind === 'read') {
    return res.status(200).json(await readForRemote(typeof body.url === 'string' ? body.url : ''));
  }
  if (body.kind === 'search') {
    const page = typeof body.page === 'number' ? body.page : 1;
    return res
      .status(200)
      .json(await searchForRemote(typeof body.query === 'string' ? body.query : '', page, process.env.BRAVE_SEARCH_API_KEY));
  }
  return res.status(400).json({ error: 'bad_request', detail: 'Pass "kind": "read" or "search".' });
}
