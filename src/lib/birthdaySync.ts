/**
 * Cloud sync for his birthday (29-1P14b, idea 109) — its own small document,
 * `users/{uid}/settings/moments`, `{ birthday }` (`MM-DD`, or null once
 * cleared), for the reason `darkTintSync.ts` gives: `data/main` is rewritten
 * whole by `mcp/` and the page engine, and a field an older build does not
 * know would be wiped by the next Atlas call. The owner may read and write
 * anything under `users/{uid}`, so no rules change.
 *
 * Cloud wins on first read; after that a pick on this device is written, and
 * the other device's arrives over the listener.
 */
import { useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { adoptBirthday, readBirthday, subscribeBirthday } from './birthday';

export function useBirthdaySync(uid: string | null): void {
  useEffect(() => {
    if (!uid) return undefined;
    const ref = doc(db, 'users', uid, 'settings', 'moments');
    let loaded = false;

    const unsubCloud = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) adoptBirthday(snap.data()?.birthday ?? null);
        else if (readBirthday()) {
          /* First pick on this account: this device's is the only copy. */
          void setDoc(ref, { birthday: readBirthday() }, { merge: true }).catch(() => {});
        }
        loaded = true;
      },
      () => { /* keep this device's copy; SyncStatusBanner already says the cloud is away */ },
    );

    const unsubLocal = subscribeBirthday((birthday, fromHere) => {
      if (!fromHere || !loaded) return;
      void setDoc(ref, { birthday }, { merge: true }).catch(() => {});
    });

    return () => {
      unsubCloud();
      unsubLocal();
    };
  }, [uid]);
}
