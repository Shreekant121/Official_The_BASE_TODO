import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// `Task`/`Subtask`/`Project` are full of optional (`?`) fields (e.g.
// `assignee`, `googleEventId`, `customRecurrence`) that get set to a
// literal `undefined` in plenty of places (clearing a field, a spread that
// picks up a missing key, etc.). Firestore's default `setDoc` throws
// "Unsupported field value: undefined" the instant any nested field in the
// whole document is `undefined`, which took down the *entire* sync write —
// not just the one offending field — every time it happened anywhere in
// `taskLists`/`backlogTasks`/`tasks`/`projects`.
// `ignoreUndefinedProperties` makes the SDK silently drop those keys instead
// of throwing, which is safe here because every one of those fields is
// optional and arrays are always written as a whole (never field-merged), so
// an omitted key behaves identically to an explicit `undefined` on read.
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
// Login/identity uses Firebase email/password auth (see AuthContext.tsx) —
// there is no Firebase `GoogleAuthProvider` in the app anymore. Google
// Calendar access (Phases 4/5) is a fully separate, optional integration
// obtained directly via Google Identity Services (see lib/googleTokenClient.ts),
// so a user's login session never expires just because a ~1hr Google OAuth
// access token expired.
