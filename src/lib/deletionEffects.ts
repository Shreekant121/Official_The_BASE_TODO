/**
 * The seam between "the store removed it" and "the rest of the world was told".
 *
 * A deletion has consequences outside the store: a `publicShares/{id}` document
 * anyone with the link can still read, and a Google Calendar event that will
 * fire a reminder for a deadline that no longer exists. Both need Firebase, a
 * uid and a Google token — none of which belong in `useStore.ts`, which stays
 * free of I/O and of any import that would drag `firebase` into a unit test.
 *
 * So the store announces the deletion here and forgets about it. The real
 * handler is registered once by `lib/deletionCleanup.ts` from inside the app.
 * When nothing is registered — a test, the screenshot harness, a signed-out
 * session — deletions simply have no external half, which is correct: there is
 * no cloud state to clean up either.
 */
import type { DeletionPlan } from './cascadeDelete';

export type DeletionEffectHandler = (plan: DeletionPlan) => void;

let handler: DeletionEffectHandler | null = null;

export function setDeletionEffectHandler(next: DeletionEffectHandler | null): void {
  handler = next;
}

/**
 * Never throws and never returns a promise: the store has already applied the
 * removal by the time this runs, and an unreachable Google must not turn a
 * successful delete into an error the user sees.
 */
export function runDeletionEffects(plan: DeletionPlan): void {
  if (!handler || !plan.matched) return;
  try {
    handler(plan);
  } catch {
    // Best-effort by construction — see above.
  }
}
