/**
 * Cloud sync for the dark tint (idea 63, 29-1P1) — its own document,
 * `users/{uid}/settings/appearance`, `{ darkTint }`.
 *
 * NOT IN `data/main`, on purpose: `mcp/` and the tablet's page engine rewrite
 * that document whole from whatever build they are running, so a field an
 * older build does not know would be wiped by the next Atlas call. A
 * document of its own under `settings/` (beside `integrations` and
 * `notifications`) is read and written only by this. `firestore.rules` lets
 * the owner read and write anything under `users/{uid}`, so no rules change.
 *
 * Cloud wins on first read; after that a pick on this device is written, and
 * the other device's arrives over the listener. The harness's stand-in user
 * has no uid here, so the shots never tint.
 */
import { useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { adoptDarkTint, isDarkTint, readDarkTint, subscribeDarkTint } from './darkTint';

export function useDarkTintSync(uid: string | null): void {
  useEffect(() => {
    if (!uid) return undefined;
    const ref = doc(db, 'users', uid, 'settings', 'appearance');
    let loaded = false;

    const unsubCloud = onSnapshot(
      ref,
      (snap) => {
        const tint = snap.data()?.darkTint;
        if (isDarkTint(tint)) adoptDarkTint(tint);
        else if (!snap.exists() && readDarkTint() !== 'neutral') {
          /* First pick on this account: this device's is the only copy. */
          void setDoc(ref, { darkTint: readDarkTint() }, { merge: true }).catch(() => {});
        }
        loaded = true;
      },
      () => { /* keep this device's copy; SyncStatusBanner already says the cloud is away */ },
    );

    const unsubLocal = subscribeDarkTint((tint, fromHere) => {
      if (!fromHere || !loaded) return;
      void setDoc(ref, { darkTint: tint }, { merge: true }).catch(() => {});
    });

    return () => {
      unsubCloud();
      unsubLocal();
    };
  }, [uid]);
}
