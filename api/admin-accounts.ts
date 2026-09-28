/**
 * Every account that has ever signed up — BUILD-6, for the admin screen.
 *
 * WHY THIS IS A ROUTE AND THE REST OF THE SCREEN IS NOT
 * -----------------------------------------------------
 * The list of accounts lives in Firebase Auth, which a browser cannot read, so
 * it has to come from the Admin SDK — and the Admin SDK ignores
 * `firestore.rules`. So this route checks the caller itself, with the same
 * `isOwner` the rules spell out, and returns identity metadata only: address,
 * name, when they joined, when they were last active. **No board, no key, no
 * data.** Everything else on the screen — another account's board, the two
 * switches, the turn counts — is read by the browser straight from Firestore,
 * where the rules are the lock.
 *
 * Required Vercel env var: FIREBASE_SERVICE_ACCOUNT.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { authorizeOwner, listAccounts } from './_lib/keyAccess.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const caller = await authorizeOwner(req.headers.authorization);
  // `in`, not `!caller.ok`: Vercel type-checks without strict mode, where a
  // boolean discriminant does not narrow.
  if ('error' in caller) {
    return res.status(caller.status).json({ error: caller.error, ...(caller.detail ? { detail: caller.detail } : {}) });
  }

  try {
    return res.status(200).json({ accounts: await listAccounts() });
  } catch (err) {
    console.error('admin-accounts failed', err);
    return res.status(500).json({ error: 'list_failed', detail: err instanceof Error ? err.message : String(err) });
  }
}
