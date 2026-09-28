/**
 * Item 6 — which Gemini models the deployment's key can see.
 *
 * The model picker's list is fetched rather than written down, so that a
 * preview being retired takes itself off the list instead of failing a turn.
 * On the bring-your-own-key path the browser asks Google directly, with the
 * user's key; with no key of their own — the default (D8) — it cannot, because
 * `GEMINI_API_KEY` lives on the server and must stay there. So this endpoint
 * exists for the same single reason `api/chat.ts` does, and is its read-only
 * twin: same lock (`authorizeKeySpend`, BUILD-6), same env vars, same error
 * vocabulary.
 *
 * It is stateless and holds nothing. It attaches the key, asks Google for the
 * list, and returns the three fields the picker reads — trimmed rather than
 * forwarded whole, because the full response carries a paragraph of
 * description per model and this is a list the client fetches on every visit
 * to the Assistant.
 *
 * Required Vercel env vars:
 *   GEMINI_API_KEY           — Gemini Developer API key (server-side ONLY)
 *   FIREBASE_SERVICE_ACCOUNT — service-account JSON (string) for token verification
 *
 * Docs: https://ai.google.dev/api/models#method:-models.list
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authorizeKeySpend } from './_lib/keyAccess.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/** Google paginates this. Five pages is far past the size of the real list. */
const PAGE_SIZE = 200;
const MAX_PAGES = 5;

interface GoogleModel {
  name?: string;
  displayName?: string;
  supportedGenerationMethods?: string[];
}

interface GoogleModelsPage {
  models?: GoogleModel[];
  nextPageToken?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // 1) Who is calling, and may they spend this key? (BUILD-6 — listing models
  //    is free, but the list is only any use to an account the proxy answers.)
  const caller = await authorizeKeySpend(req.headers.authorization);
  // `in`, not `!caller.ok`: Vercel type-checks without strict mode, where a
  // boolean discriminant does not narrow.
  if ('error' in caller) {
    return res.status(caller.status).json({ error: caller.error, ...(caller.detail ? { detail: caller.detail } : {}) });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'not_configured' });
  }

  // 2) Walk Google's pages, trimming each one to what the picker reads. The
  //    filtering itself is the client's (`parseGeminiModels`), so both routes —
  //    this one and the user's own key — get the same list from the same code.
  const models: GoogleModel[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = `${GEMINI_API_BASE}/models?pageSize=${PAGE_SIZE}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;

    let upstream: Response;
    try {
      upstream = await fetch(url, { headers: { 'x-goog-api-key': apiKey } });
    } catch (err) {
      return res.status(502).json({
        error: 'gemini_unreachable',
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      return res.status(upstream.status === 429 ? 429 : 502).json({
        error: 'gemini_request_failed',
        status: upstream.status,
        detail: detail.slice(0, 2000),
      });
    }

    const body = (await upstream.json()) as GoogleModelsPage;
    for (const model of body.models ?? []) {
      models.push({
        name: model.name,
        displayName: model.displayName,
        supportedGenerationMethods: model.supportedGenerationMethods,
      });
    }

    pageToken = body.nextPageToken;
    if (!pageToken) break;
  }

  // The list moves about as often as Google ships a model. A minute of caching
  // costs nothing and keeps a reload of the Assistant off the upstream quota.
  res.setHeader('Cache-Control', 'private, max-age=60');
  return res.status(200).json({ models });
}
