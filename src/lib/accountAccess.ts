/**
 * This account's standing — the browser half of BUILD-6.
 *
 * Holds two answers for the signed-in account: **is this the admin**, and
 * **which way does the assistant go** (`assistantRoute` in `adminAccess.ts`).
 * The first shows or hides the Admin door in Settings; the second is read by
 * `getActiveApiKey` so a turn goes to Google with the account's own key, to
 * the proxy, or nowhere.
 *
 * **Neither answer is a lock.** The admin's reach is `firestore.rules`, and
 * the key is `server/keyAccess.ts`; this store only saves an account from
 * sending a request that would be refused, and says why when it is.
 *
 * The switches live at `accountAccess/{uid}`, which the account may read and
 * only the admin may write, and are watched live — so when he switches an
 * account onto his key, that account's next turn goes through the proxy
 * without a reload.
 */
import { useEffect } from 'react';
import { create } from 'zustand';
import { reload, sendEmailVerification, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { isDevBypassUid } from './devAuth';
import {
  NO_ACCESS,
  assistantRoute,
  isOwner,
  isUnverifiedOwner,
  readAccess,
  type AccountAccess,
  type AssistantRoute,
} from './adminAccess';

interface AccountAccessState {
  uid: string | null;
  /** The admin, by the same test the rules make. */
  owner: boolean;
  /** His address, not yet verified — the admin screen offers the email. */
  unverifiedOwner: boolean;
  access: AccountAccess;
  /** The switches document has answered at least once. */
  loaded: boolean;
}

export const useAccountAccess = create<AccountAccessState>()(() => ({
  uid: null,
  owner: false,
  unverifiedOwner: false,
  access: NO_ACCESS,
  loaded: false,
}));

function claimsOf(user: User) {
  return { email: user.email, emailVerified: user.emailVerified };
}

/**
 * Keeps the store in step with the signed-in user. Called once, from
 * `AuthProvider`, which is the one place that knows who that is — including
 * the screenshot harness's stand-in, which Firebase itself never sees.
 */
export function useAccountAccessSync(user: User | null): void {
  const uid = user?.uid ?? null;
  const email = user?.email ?? null;
  const verified = user?.emailVerified ?? false;

  useEffect(() => {
    if (!uid) {
      useAccountAccess.setState({ uid: null, owner: false, unverifiedOwner: false, access: NO_ACCESS, loaded: false });
      return;
    }

    /* The harness's stand-in has no credentials, so it reads nothing. It is
       the stand-in for Shreekant — the fixture is his data — so it is drawn
       as the admin. `isDevBypassUid` folds to `false` in a production build. */
    if (isDevBypassUid(uid)) {
      useAccountAccess.setState({ uid, owner: true, unverifiedOwner: false, access: NO_ACCESS, loaded: true });
      return;
    }

    const claims = { email, emailVerified: verified };
    const owner = isOwner(claims);
    useAccountAccess.setState({
      uid,
      owner,
      unverifiedOwner: isUnverifiedOwner(claims),
      access: NO_ACCESS,
      loaded: owner,
    });
    if (owner) return;

    return onSnapshot(
      doc(db, 'accountAccess', uid),
      (snap) => useAccountAccess.setState({ access: readAccess(snap.data()), loaded: true }),
      // Unreadable is off, which is also what the server would decide.
      () => useAccountAccess.setState({ access: NO_ACCESS, loaded: true }),
    );
  }, [uid, email, verified]);
}

/** Which way this account's next assistant turn goes. */
export function currentAssistantRoute(): AssistantRoute {
  const { owner, access } = useAccountAccess.getState();
  return assistantRoute(owner, access);
}

export function useAssistantRoute(): AssistantRoute {
  return useAccountAccess((s) => assistantRoute(s.owner, s.access));
}

/** Mails the verification link to the signed-in address. */
export async function sendOwnerVerification(): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');
  await sendEmailVerification(user);
}

/**
 * After the link was opened: refresh the account, and the token with it —
 * the rules read `email_verified` from the token, and a token minted before
 * the click still says `false` for up to an hour.
 */
export async function recheckOwnerVerification(): Promise<boolean> {
  const user = auth.currentUser;
  if (!user) return false;
  await reload(user);
  await user.getIdToken(true);
  const claims = claimsOf(user);
  useAccountAccess.setState({ owner: isOwner(claims), unverifiedOwner: isUnverifiedOwner(claims), loaded: true });
  return isOwner(claims);
}
