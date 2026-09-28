/**
 * The outside-the-store half of a deletion, registered into the seam that
 * `lib/deletionEffects.ts` holds open.
 *
 * Two things outlive a delete unless they are told:
 *
 * - **The public share document.** `publicShares/{shareId}` is world-readable
 *   by design (that is what a share link *is*), so leaving it behind means a
 *   deleted project keeps serving its old snapshot to anyone holding the URL.
 *   It goes immediately, not in thirty days with the Trash entry — a link that
 *   outlives its deletion is a leak, not an undo. Restoring re-creates it: the
 *   entity comes back carrying its `shareId`, and `publicShare.ts`'s reconcile
 *   pass re-pushes a snapshot for anything that has one.
 * - **The Google Calendar reminder.** Same idea, worse symptom: the app would
 *   pop a "Deadline: …" alert for a task that no longer exists.
 *
 * Both are best-effort and deliberately un-awaited. The store has already
 * applied the removal by the time this runs; an unreachable Google must not
 * turn a successful delete into an error.
 */
import { useEffect, useRef } from 'react';
import { setDeletionEffectHandler } from './deletionEffects';
import { deleteShare } from './publicShare';
import { cancelDeletedTaskDeadlines } from './notificationSync';

export function useDeletionCleanup(uid: string | null, getGoogleToken: () => string | null): void {
  const getGoogleTokenRef = useRef(getGoogleToken);
  useEffect(() => {
    getGoogleTokenRef.current = getGoogleToken;
  });

  useEffect(() => {
    if (!uid) {
      setDeletionEffectHandler(null);
      return;
    }

    setDeletionEffectHandler((plan) => {
      for (const shareId of plan.shareIds) {
        void deleteShare(shareId).catch(() => {});
      }
      void cancelDeletedTaskDeadlines(uid, plan.calendarTaskIds, getGoogleTokenRef.current())
        .catch(() => {});
    });

    return () => setDeletionEffectHandler(null);
  }, [uid]);
}
