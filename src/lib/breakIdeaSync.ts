/**
 * Cloud sync for his break ideas (29-1P11a, idea 104) — its own document,
 * `users/{uid}/settings/breaks`, `{ hidden, added }`: what he changed about the
 * seed list, never the list itself. `darkTintSync.ts`'s pattern and its
 * reasons (not `data/main`; the owner may write anything under `users/{uid}`,
 * so no rules change).
 *
 * Cloud wins on first read; after that an edit on this device is written, and
 * the other device's arrives over the listener. The harness's stand-in user
 * has no uid here, so the shots read the seed.
 */
import { useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { adoptBreakIdeaEdits, getBreakIdeaEdits, subscribeBreakIdeas } from './breakIdeaStore';

export function useBreakIdeaSync(uid: string | null): void {
  useEffect(() => {
    if (!uid) return undefined;
    const ref = doc(db, 'users', uid, 'settings', 'breaks');
    let loaded = false;

    const unsubCloud = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) adoptBreakIdeaEdits(snap.data());
        else {
          const mine = getBreakIdeaEdits();
          /* First edit on this account: this device's is the only copy. */
          if (mine.hidden.length > 0 || mine.added.length > 0) {
            void setDoc(ref, { hidden: mine.hidden, added: mine.added }).catch(() => {});
          }
        }
        loaded = true;
      },
      () => { /* keep this device's copy; SyncStatusBanner already says the cloud is away */ },
    );

    const unsubLocal = subscribeBreakIdeas((edits, fromHere) => {
      if (!fromHere || !loaded) return;
      void setDoc(ref, { hidden: edits.hidden, added: edits.added }).catch(() => {});
    });

    return () => {
      unsubCloud();
      unsubLocal();
    };
  }, [uid]);
}
