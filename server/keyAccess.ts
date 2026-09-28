/**
 * The lock on Shreekant's Gemini key — BUILD-6.
 *
 * `api/chat.ts` and `api/models.ts` are the routes that spend
 * `GEMINI_API_KEY`, and both ask this file first (a third, `api/gemini-token.ts`,
 * was removed as unused in the half-built audit, C3). Before BUILD-6 they each carried an optional `ALLOWED_UID` check that was not set,
 * so anyone who signed up could spend the key. That variable is no longer read.
 *
 * The rule is `maySpendOwnerKey` in `src/lib/adminAccess.ts`: the owner (his
 * email, verified), or an account whose `accountAccess/{uid}` document has both
 * switches on. That document is written only by him — `firestore.rules` says
 * so — and read here with the Admin SDK on every call, so switching an account
 * off takes effect on its next request, with nothing cached.
 *
 * `api/admin-accounts.ts` asks `authorizeOwner` for the same reason: the list
 * of every account comes from the Admin SDK, which no rule can guard.
 *
 * Bundled into `api/_lib/keyAccess.js` by `npm run build:push`, for the reason
 * at the top of `server/pushRun.ts`.
 */
import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  isOwner,
  maySpendOwnerKey,
  readAccess,
  readUsage,
  staleUsageDays,
  usageDay,
  type AccountSummary,
} from '../src/lib/adminAccess';
import type * as Declared from '../api/_lib/keyAccess';

const APP_NAME = 'base-keys';

function adminApp(): App {
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) return existing;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not configured');
  const account = JSON.parse(raw) as Record<string, string>;
  // Vercel stores the key with literal "\n" sequences; `cert()` needs newlines.
  if (account.private_key) account.private_key = account.private_key.replace(/\\n/g, '\n');
  return initializeApp({ credential: cert(account as unknown as ServiceAccount) }, APP_NAME);
}

function db(): Firestore {
  return getFirestore(adminApp());
}

export type Denied = { ok: false; status: number; error: string; detail?: string };
export type Caller = { ok: true; uid: string; owner: boolean };

/** Extracts the bearer token from an `Authorization: Bearer <token>` header. */
function bearer(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match ? match[1].trim() : null;
}

async function identify(authorization: string | string[] | undefined): Promise<Caller | Denied> {
  const token = bearer(authorization);
  if (!token) return { ok: false, status: 401, error: 'missing_id_token' };
  let app: App;
  try {
    app = adminApp();
  } catch (err) {
    return { ok: false, status: 500, error: 'not_configured', detail: err instanceof Error ? err.message : String(err) };
  }
  try {
    const decoded = await getAuth(app).verifyIdToken(token);
    return {
      ok: true,
      uid: decoded.uid,
      owner: isOwner({ email: decoded.email, emailVerified: decoded.email_verified }),
    };
  } catch {
    return { ok: false, status: 401, error: 'invalid_id_token' };
  }
}

/**
 * May this request spend his key? Answers `own_key_required` with a 403 when
 * the account is simply not on it — the browser turns that into "add your own
 * key in Settings", which is the normal state of a new account.
 */
export async function authorizeKeySpend(authorization: string | string[] | undefined): Promise<Caller | Denied> {
  const caller = await identify(authorization);
  if (!caller.ok || caller.owner) return caller;
  let access;
  try {
    access = readAccess((await db().collection('accountAccess').doc(caller.uid).get()).data());
  } catch (err) {
    // Fail closed: an unreadable switch is an off switch.
    return { ok: false, status: 503, error: 'access_unreadable', detail: err instanceof Error ? err.message : String(err) };
  }
  if (!maySpendOwnerKey(false, access)) {
    return { ok: false, status: 403, error: access.assistant ? 'own_key_required' : 'assistant_off' };
  }
  return caller;
}

/** The admin only. */
export async function authorizeOwner(authorization: string | string[] | undefined): Promise<Caller | Denied> {
  const caller = await identify(authorization);
  if (!caller.ok) return caller;
  if (!caller.owner) return { ok: false, status: 403, error: 'forbidden' };
  return caller;
}

/**
 * Counts one request against his key, at `keyUsage/{uid}`. Best-effort: a
 * failed count must never fail the turn it was counting, so this swallows its
 * own errors. Old days are pruned in the same write so the map stays small.
 */
export async function recordKeyTurn(uid: string, now = Date.now()): Promise<void> {
  try {
    const ref = db().collection('keyUsage').doc(uid);
    await db().runTransaction(async (tx) => {
      const usage = readUsage((await tx.get(ref)).data());
      const day = usageDay(now);
      const days: Record<string, unknown> = { [day]: FieldValue.increment(1) };
      for (const stale of staleUsageDays(usage.days, now)) days[stale] = FieldValue.delete();
      tx.set(ref, { total: FieldValue.increment(1), lastAt: now, days }, { merge: true });
    });
  } catch {
    // Counting is not the product.
  }
}

function toMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function summarise(u: UserRecord): AccountSummary {
  const signIn = toMs(u.metadata.lastSignInTime);
  const refresh = toMs(u.metadata.lastRefreshTime);
  return {
    uid: u.uid,
    email: u.email ?? null,
    name: u.displayName ?? null,
    createdAt: toMs(u.metadata.creationTime),
    // A token refresh happens about hourly while the app is open, so it is
    // the nearest thing to "last active" that Firebase keeps.
    lastActiveAt: Math.max(signIn ?? 0, refresh ?? 0) || null,
    disabled: u.disabled,
    owner: isOwner({ email: u.email, emailVerified: u.emailVerified }),
  };
}

/** Every account that has ever signed up. Identity metadata only — no data. */
export async function listAccounts(): Promise<AccountSummary[]> {
  const out: AccountSummary[] = [];
  let pageToken: string | undefined;
  do {
    const page = await getAuth(adminApp()).listUsers(1000, pageToken);
    out.push(...page.users.map(summarise));
    pageToken = page.pageToken;
  } while (pageToken);
  return out;
}

/**
 * `api/_lib/keyAccess.d.ts` is written by hand, as `pushRun.d.ts` is. If a
 * signature here changes without it, `npm run typecheck` fails on this line.
 */
[authorizeKeySpend, authorizeOwner, recordKeyTurn, listAccounts] satisfies [
  typeof Declared.authorizeKeySpend,
  typeof Declared.authorizeOwner,
  typeof Declared.recordKeyTurn,
  typeof Declared.listAccounts,
];
