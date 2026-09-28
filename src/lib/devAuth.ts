/**
 * Dev-only authentication bypass, used by the screenshot harness
 * (`scripts/screenshots.ts`).
 *
 * Every screen worth photographing sits behind `ProtectedRoute`, which needs a
 * real Firebase email/password session. Rather than give an automated run live
 * credentials, the harness writes one localStorage key before the app boots and
 * `AuthContext` hands back the stand-in user below instead of subscribing to
 * `onAuthStateChanged`.
 *
 * Every function here short-circuits on `import.meta.env.DEV`, which Vite
 * replaces with the literal `false` when building for production — the checks
 * fold to constants and the bundler drops the rest, so the key is completely
 * inert in the deployed app. `scripts/check-shots-bypass.mjs` fails the build
 * if the marker below ever survives into `dist/`.
 */
import type { User } from 'firebase/auth';

/** Written by the harness via `addInitScript`, before any app module evaluates. */
export const DEV_AUTH_KEY = 'mutineer-dev-auth';

/**
 * Deliberately conspicuous: this string is what the post-build check greps
 * `dist/` for to prove the bypass was stripped from the production bundle.
 */
const DEV_BYPASS_UID = '__dev-screenshot-harness__';

/**
 * The stand-in for the Firebase `User` the app would normally receive from
 * `onAuthStateChanged`. Only the fields the UI actually reads are real
 * (`uid`, `displayName`, `email`, `photoURL`); nothing in the app ever calls a
 * method on the user object, and the bypass never talks to Firebase, so the
 * rest of the interface is asserted away rather than stubbed.
 *
 * Returns `null` — the "no bypass" answer — unless this is a dev build *and*
 * the key is present.
 */
export function devBypassUser(): User | null {
  if (!import.meta.env.DEV) return null;
  try {
    if (localStorage.getItem(DEV_AUTH_KEY) !== '1') return null;
  } catch {
    return null;
  }
  return {
    uid: DEV_BYPASS_UID,
    email: 'harness@mutineer.local',
    displayName: 'Screenshot Harness',
    photoURL: null,
    emailVerified: true,
    isAnonymous: false,
    providerId: 'firebase',
    providerData: [],
    refreshToken: '',
    tenantId: null,
    metadata: {},
  } as unknown as User;
}

/**
 * True for the bypass user's uid.
 *
 * That uid has no Firebase credentials behind it, so anything that would talk
 * to Firestore on its behalf has to opt out. The one that matters is
 * `useFirestoreSync` in `App.tsx`: handing it this uid fails the realtime
 * listener, which flips `cloudSyncOk` false and paints the "Not connected to
 * the cloud" banner across every single screenshot.
 */
export function isDevBypassUid(uid: string | null | undefined): boolean {
  return import.meta.env.DEV && uid === DEV_BYPASS_UID;
}
