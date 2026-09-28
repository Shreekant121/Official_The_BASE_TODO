# Security

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Use GitHub's private
reporting instead: the **Security** tab of this repository → **Report a vulnerability**.

Include what an attacker could do, and the steps to reproduce it. You'll get a reply as soon
as possible, and credit in the fix if you'd like it.

## How BASE protects data

Useful if you are reviewing the code or running your own copy:

- **`firestore.rules` is the lock.** Every account can read and write only its own data. The
  admin can *read* other accounts' task boards and nothing else under them, and has no write
  access to any of it. The app hiding a button is never the protection; the rules are.
- **Server secrets stay on the server.** The Gemini key, the Google client secret, the VAPID
  private key and the Firebase service account are read only by the functions in `api/`.
  None of them has a `VITE_` prefix, which is what would put them in the browser bundle.
- **Every server route checks who is calling.** Routes that spend the Gemini key verify the
  caller's Firebase sign-in and check that account's access switches on every request.
- **Google Calendar refresh tokens** live in a collection the rules close to every browser.
  Only the server functions can read them.
- **Share links** show only what their mode allows. A worker's email and notes on an
  outsourcing link are readable by the owner alone.

If you run your own copy, **publish `firestore.rules`** before you invite anyone. A new
Firestore database in *test mode* lets anyone read and write it.
