/**
 * Types for the generated `pushRun.js` — see `server/pushRun.ts`, which is
 * the source and the place to change anything.
 *
 * Written by hand rather than re-exported from the source, because `api/` is
 * checked under Node's own module resolution and the source's graph reaches
 * `src/`, whose extensionless imports that resolution rejects. Keep it to the
 * two calls the functions make.
 */
export interface RunReport {
  accounts: number;
  sent: number;
  gone: number;
  failed: number;
  skipped: Record<string, number>;
  planned?: string[];
}

export function runPushes(opts: {
  secret: string;
  vapid: { subject: string; publicKey: string; privateKey: string };
  now?: number;
  dryRun?: boolean;
}): Promise<RunReport>;

export function snoozePush(opts: {
  secret: string;
  uid: string;
  key: string;
  token: string;
  now?: number;
}): Promise<'snoozed' | 'already' | 'forbidden'>;
