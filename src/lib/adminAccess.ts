/**
 * Who is the admin, and who may spend his Gemini key — BUILD-6.
 *
 * Pure: no Firebase, no clock, no store. The browser (`accountAccess.ts`, the
 * admin screen) and the server (`server/keyAccess.ts`, bundled into the three
 * `api/` routes that spend `GEMINI_API_KEY`) both ask these functions, so the
 * two halves cannot disagree about who is let through.
 *
 * THE LOCKS ARE NOT HERE
 * ----------------------
 * Two things enforce this, and neither is the browser:
 *
 *   - **`firestore.rules`** decides who can read another account's board and
 *     who can flip an account's switches. It spells the same email out again,
 *     because rules cannot import anything; `server/rules.test.ts` reads that
 *     file and fails if the two drift.
 *   - **`server/keyAccess.ts`** decides who may spend the key, on every call.
 *
 * What the browser does with these answers is hide a button and pick a route.
 * A browser-side check is a sticker over an open door (IMPROVEMENTS.md,
 * BUILD-6), so nothing here is trusted for anything that matters.
 *
 * WHY "VERIFIED" IS PART OF IT
 * ----------------------------
 * Sign-in is email and password, and Firebase will put whatever address a
 * person typed into their token. Firebase refuses a second account on an
 * address that already has one, but that is a project setting rather than a
 * law, and it stops protecting anything the day the owner's account is
 * recreated. `email_verified` is only true once somebody clicked the link that
 * was mailed to the address, so it is the part that proves the address.
 */

/** Shreekant's call on 2026-09-15: the admin is his email, not a uid. */
export const OWNER_EMAIL = 'owner@example.com';

/** The fields of a Firebase ID token (server) or `User` (browser) this reads. */
export interface OwnerClaims {
  email?: string | null;
  emailVerified?: boolean | null;
}

/** The admin: his address, and proved to be his. */
export function isOwner(claims: OwnerClaims | null | undefined): boolean {
  return !!claims && claims.email === OWNER_EMAIL && claims.emailVerified === true;
}

/** His address, not yet proved. The admin screen offers the verify email. */
export function isUnverifiedOwner(claims: OwnerClaims | null | undefined): boolean {
  return !!claims && claims.email === OWNER_EMAIL && claims.emailVerified !== true;
}

/**
 * The two switches the admin sets per account, stored at
 * `accountAccess/{uid}`. A missing document is `NO_ACCESS`: a new account
 * brings its own key and has the assistant off until he switches it on.
 */
export interface AccountAccess {
  /** The in-browser Gemini assistant is available to this account. */
  assistant: boolean;
  /** This account's turns are paid for by his key, through the proxy. */
  ownerKey: boolean;
}

export const NO_ACCESS: AccountAccess = { assistant: false, ownerKey: false };

/** Reads a stored document defensively — anything that is not `true` is off. */
export function readAccess(data: unknown): AccountAccess {
  const d = (data ?? {}) as Record<string, unknown>;
  return { assistant: d.assistant === true, ownerKey: d.ownerKey === true };
}

/** What this account is allowed to do with the assistant. */
export type AssistantRoute =
  /** The owner, or an account he put on his key: the proxy answers. */
  | 'owner-key'
  /** The assistant is on, and the account must bring a key of its own. */
  | 'own-key'
  /** The assistant is off for this account. */
  | 'off';

export function assistantRoute(owner: boolean, access: AccountAccess): AssistantRoute {
  if (owner) return 'owner-key';
  if (!access.assistant) return 'off';
  return access.ownerKey ? 'owner-key' : 'own-key';
}

/**
 * The server's question: may this caller spend `GEMINI_API_KEY`? Both
 * switches have to be on — switching the assistant off stops the spending
 * even if the key switch was left on.
 */
export function maySpendOwnerKey(owner: boolean, access: AccountAccess): boolean {
  return assistantRoute(owner, access) === 'owner-key';
}

// ─── The account list ───────────────────────────────────────────────────────

/**
 * One row of `api/admin-accounts` — identity metadata from Firebase Auth, and
 * nothing out of the account's data.
 */
export interface AccountSummary {
  uid: string;
  email: string | null;
  name: string | null;
  createdAt: number | null;
  /** The later of last sign-in and last token refresh (about hourly while open). */
  lastActiveAt: number | null;
  disabled: boolean;
  owner: boolean;
}

// ─── Turns on his key ───────────────────────────────────────────────────────

/**
 * `keyUsage/{uid}` — written only by the proxy (Admin SDK), one count per
 * request that reached Gemini on his key. Turns on an account's own key go
 * straight from that browser to Google and are never seen, which is why the
 * admin screen says "on my key" rather than "AI turns".
 *
 * Days are **UTC** calendar dates: the server has no zone of the caller's to
 * go by, and for a count of what was spent a day's edge falling at 05:30 IST
 * is an acceptable blur.
 */
export interface KeyUsage {
  total: number;
  days: Record<string, number>;
  lastAt: number | null;
}

export function readUsage(data: unknown): KeyUsage {
  const d = (data ?? {}) as Record<string, unknown>;
  const days: Record<string, number> = {};
  if (d.days && typeof d.days === 'object') {
    for (const [k, v] of Object.entries(d.days as Record<string, unknown>)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === 'number' && Number.isFinite(v)) days[k] = v;
    }
  }
  return {
    total: typeof d.total === 'number' && Number.isFinite(d.total) ? d.total : 0,
    days,
    lastAt: typeof d.lastAt === 'number' ? d.lastAt : null,
  };
}

/** `2026-09-17` for an instant, in UTC. */
export function usageDay(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** The last `n` UTC days ending today, oldest first, with a zero for a quiet day. */
export function usageSeries(usage: KeyUsage, now: number, n = 7): { day: string; count: number }[] {
  const out: { day: string; count: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = usageDay(now - i * 86_400_000);
    out.push({ day, count: usage.days[day] ?? 0 });
  }
  return out;
}

/** How many days the stored map keeps. Older keys are dropped on write. */
export const USAGE_DAYS_KEPT = 35;

/** The day keys a write should delete — everything older than the window. */
export function staleUsageDays(days: Record<string, number>, now: number): string[] {
  const oldest = usageDay(now - (USAGE_DAYS_KEPT - 1) * 86_400_000);
  return Object.keys(days).filter((k) => k < oldest);
}
