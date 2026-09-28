/**
 * Keeps a client-view share's live timer in step with the focus run (BUILD-14).
 *
 * Starting, pausing or stopping a run writes nothing to the store — the run is
 * in memory (`store/useFocusRun.ts`) — so the reconcile that follows every
 * sync never hears of it. This hook watches the four facts a published run is
 * made of and asks `publicShare.ts` to re-publish when one of them moves.
 * Everything else about a run (the pill's countdown, the noise) changes
 * nothing on a share page, which derives its clock from `since`.
 *
 * `null` uid (signed out, or the screenshot harness's stand-in) watches
 * nothing, like `useFirestoreSync`.
 */
import { useEffect } from 'react';
import { useFocusRun, type FocusRunState } from '../store/useFocusRun';
import { republishForFocusRun } from './publicShare';

function runKey(s: FocusRunState): string {
  return s.task && s.running
    ? `${s.task.id}|${s.runningSince}|${s.segmentStartedAt}|${s.taskZeroAt}`
    : '';
}

export function useShareLiveRun(uid: string | null): void {
  useEffect(() => {
    if (!uid) return;
    let last = runKey(useFocusRun.getState());
    return useFocusRun.subscribe((s) => {
      const key = runKey(s);
      if (key === last) return;
      last = key;
      republishForFocusRun(uid);
    });
  }, [uid]);
}
