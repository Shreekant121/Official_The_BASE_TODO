/**
 * Types for the generated `keyAccess.js` — see `server/keyAccess.ts`, which is
 * the source and the place to change anything. Written by hand for the reason
 * given at the top of `pushRun.d.ts`.
 */
export type Denied = { ok: false; status: number; error: string; detail?: string };
export type Caller = { ok: true; uid: string; owner: boolean };

export function authorizeKeySpend(authorization: string | string[] | undefined): Promise<Caller | Denied>;

export function authorizeOwner(authorization: string | string[] | undefined): Promise<Caller | Denied>;

export function recordKeyTurn(uid: string, now?: number): Promise<void>;

export interface AccountSummary {
  uid: string;
  email: string | null;
  name: string | null;
  createdAt: number | null;
  lastActiveAt: number | null;
  disabled: boolean;
  owner: boolean;
}

export function listAccounts(): Promise<AccountSummary[]>;
