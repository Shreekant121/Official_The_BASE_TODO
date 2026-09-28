# Setting up BASE

This guide takes you from a fresh clone to your own running copy, then through each optional
feature. Only **Part 1** is required.

- [Part 1: Firebase and your first run](#part-1-firebase-and-your-first-run)
- [Part 2: Deploy to Vercel](#part-2-deploy-to-vercel)
- [Part 3: The server key (`FIREBASE_SERVICE_ACCOUNT`)](#part-3-the-server-key)
- [Part 4: AI assistant (Gemini)](#part-4-ai-assistant-gemini)
- [Part 5: Google Calendar](#part-5-google-calendar)
- [Part 6: Push reminders](#part-6-push-reminders)
- [Part 7: Local AI and MCP](#part-7-local-ai-and-mcp)
- [Troubleshooting](#troubleshooting)

Every variable is also described, at length, in [`.env.example`](../.env.example).

---

## Part 1: Firebase and your first run

**You need:** Node.js 22 or newer, Git, and a Google account.

### 1.1 Get the code

```bash
git clone https://github.com/Shreekant121/Official_The_BASE_TODO.git
cd Official_The_BASE_TODO
npm install
```

### 1.2 Create the Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
   Google Analytics is not needed.
2. **Build → Authentication → Get started → Sign-in method → Email/Password → Enable.**
   BASE signs people in with email and password only.
3. **Build → Firestore Database → Create database.** Choose **production mode** and a region
   near you. The region can't be changed later.
4. **Project settings** (the gear) **→ General → Your apps → Web (`</>`)**. Register an app
   (no Hosting needed). Firebase shows a `firebaseConfig` block.

### 1.3 Fill in `.env`

```bash
cp .env.example .env
```

Copy the six values from `firebaseConfig` into the top of `.env`:

```ini
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

These are safe to be public. Every web app that uses Firebase ships them in its browser code.
What protects your data is the security rules in the next step.

### 1.4 Make yourself the admin

The admin is one email address, written in two places that must match:

- `src/lib/adminAccess.ts`: `export const OWNER_EMAIL = 'you@example.com';`
- `firestore.rules`, near the top: `request.auth.token.email == 'you@example.com'`

`npm test` includes a check that fails if the two disagree. The admin also has to **verify**
that address (the app offers to send the link), so someone who types your address into the
sign-up form still isn't the admin.

### 1.5 Publish the security rules

**Don't skip this.** Without it, either nobody can read anything or, in test mode, everybody
can read everything.

- **In the console:** Firestore Database → **Rules** → replace everything with the contents of
  `firestore.rules` → **Publish**. Then **Indexes** → add those in `firestore.indexes.json`, or
  wait until the app's first query fails with a link that creates them.
- **Or from the command line:** set your project id in `.firebaserc`, then
  ```bash
  npx firebase-tools login
  npx firebase-tools deploy --only firestore
  ```

### 1.6 Run it

```bash
npm run dev
```

Open <http://localhost:5173>, sign up with the email you put in step 1.4, and verify it.

---

## Part 2: Deploy to Vercel

1. Push your copy to a GitHub repository.
2. At [vercel.com/new](https://vercel.com/new), import it. Vercel detects Vite; leave the build
   settings as they are (`npm run build`, output `dist`).
3. **Settings → Environment Variables**: add the six `VITE_FIREBASE_*` variables for
   **Production** (and Preview, if you use preview deployments).
4. **Deploy.** Every push to your main branch deploys again.

`VITE_` variables are baked in **when the app is built**. After you change one in Vercel,
redeploy, or the old value stays.

From your own computer instead: `npx vercel link` once, then `npx vercel --prod`.

---

## Part 3: The server key

Parts 4, 5 and 6 run code on the server that has to read and write Firestore on a user's
behalf. That needs a **service account** key.

1. Firebase console → **Project settings → Service accounts → Generate new private key.** A
   `.json` file downloads.
2. In Vercel, add `FIREBASE_SERVICE_ACCOUNT` with the **whole file's contents** as the value.
3. For local testing with `npm run dev:full`, put it in `.env` on one line, in single quotes:
   ```ini
   FIREBASE_SERVICE_ACCOUNT='{"type":"service_account","project_id":"...",...}'
   ```

> **This key can read and write every account and ignores the security rules.** Never commit
> it, never give it a `VITE_` prefix, and if it leaks, delete it in the same console screen
> and make a new one.

---

## Part 4: AI assistant (Gemini)

1. Get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Add `GEMINI_API_KEY` in Vercel (and `.env` for `dev:full`). **No `VITE_` prefix.**
3. Make sure Part 3 is done; the server uses it to check who is asking.
4. Redeploy.

**Who can use it:** you, the admin, always. For anyone else, open **Admin** (from Settings),
find their account and switch the assistant on, either on **their own key** (they paste a
Gemini key into Settings; it goes from their browser straight to Google) or on **your key**
(through the server, which counts their use).

The assistant's list of models is fetched from Google, so new Gemini models show up without
a code change.

---

## Part 5: Google Calendar

Puts every task with a deadline into your Google Calendar as a block of work, and keeps it
there for good without asking you to sign in to Google again.

1. [Google Cloud Console](https://console.cloud.google.com), same project as Firebase →
   **APIs & Services → Library → Google Calendar API → Enable.**
2. **OAuth consent screen**: fill it in, add the scopes `calendar.events`,
   `calendar.readonly` and `calendar.app.created`, then **Publish app**. While it says *Testing*, Google expires the connection every 7 days.
3. **Credentials → Create credentials → OAuth client ID → Web application.**
   - **Authorized JavaScript origins:** `http://localhost:3000`, `https://<your-app>.vercel.app`
   - **Authorized redirect URIs:** the same two, each followed by `/oauth/callback`. Google
     matches these character for character.
4. Set `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID` (the same client id), and
   `GOOGLE_CLIENT_SECRET`. Part 3 is also needed.
5. Redeploy. In the app: **Notifications → Connect Google**, approve once.

---

## Part 6: Push reminders

A notification on your phone at the moment work on a task has to *start*.

1. Make a key pair:
   ```bash
   npx web-push generate-vapid-keys --json
   ```
2. Set `VITE_VAPID_PUBLIC_KEY` (the public one), `VAPID_PRIVATE_KEY` (the private one, **no
   `VITE_`**), and `VAPID_SUBJECT` (`mailto:you@example.com`).
3. Set `CRON_SECRET` to a long random string:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
4. Part 3 is needed too. Redeploy.
5. Something has to call `https://<your-app>.vercel.app/api/push-fire` **every minute** with
   the header `Authorization: Bearer <CRON_SECRET>`. Vercel's free plan runs its own cron only
   once a day, so use a free service such as [cron-job.org](https://cron-job.org). On Vercel
   Pro, a `crons` entry in `vercel.json` sends that same header for you.
6. In the app: **Notifications** → allow notifications on each device.
   **Settings → App → Send a test** checks the whole chain.

Add `?dry=1` to the push-fire address to see what it *would* send, without sending anything.

---

## Part 7: Local AI and MCP

**MCP server.** `npm run mcp` starts BASE as a [Model Context Protocol](https://modelcontextprotocol.io)
server over standard input and output. An MCP-capable agent can then list, create, edit,
move, share and delete tasks. It uses the same logic as the app, so deletes still go to the
Trash and repeating tasks still repeat. It needs two variables in `.env`:

```ini
FIREBASE_SERVICE_ACCOUNT='{...}'     # Part 3
ATLAS_FIREBASE_UID=...               # whose tasks: Firebase console → Authentication → Users → User UID
```

**Local models (Atlas).** The chat can talk to a companion program, *Atlas*, running on your
own computer with [Ollama](https://ollama.com), reached over
[Tailscale](https://tailscale.com). Atlas is a **separate project and not part of this
repository**. The app's side is one variable, `VITE_ATLAS_URL`: a Tailscale `https://` address
(from `tailscale serve`), since a browser won't let an HTTPS page call a plain `http://` address.
Unset, the chat uses Gemini.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Blank page, or a Firebase error in the browser console (`auth/invalid-api-key` and the like) | `.env` isn't filled in, or Vercel is missing a `VITE_FIREBASE_*` variable (redeploy after adding it). |
| "Missing or insufficient permissions" | The rules weren't published (Part 1.5), or you're not signed in. |
| No Admin option in Settings | Your email doesn't match `OWNER_EMAIL`, or it isn't verified yet. |
| Every `/api/...` call fails locally | `npm run dev` doesn't serve `api/`. Use `npm run dev:full`. |
| Assistant says it has no access | You're not the admin, and the admin hasn't switched your account on. Or `GEMINI_API_KEY` / `FIREBASE_SERVICE_ACCOUNT` is missing on the server. |
| Google Calendar disconnects every week | The consent screen is still in *Testing*. Publish it (Part 5.2). |
| Push works in the test but reminders never come | Nothing is calling `/api/push-fire` every minute, or `CRON_SECRET` doesn't match. |
| An old version keeps loading | The service worker waits for you: tap the **Update** banner. |
| `npm run build` says the push bundle is stale | You changed `server/` or code it imports. Run `npm run build:push`. |
