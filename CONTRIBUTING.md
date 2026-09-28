# Contributing to BASE

Thanks for taking the time. Bug reports, ideas and pull requests are all welcome.

## Reporting a bug

Open an issue with:

- what you did, step by step
- what you expected, and what happened instead
- the device and browser (BASE is used a lot on Android tablets, so say if it's one)
- a screenshot if the problem is visual

Found a security problem? Please don't open a public issue; see [SECURITY.md](SECURITY.md).

## Making a change

1. Fork the repository and create a branch from `main`.
2. Follow [the quick start](README.md#quick-start) to get it running against your own
   Firebase project.
3. **Take your screenshot baselines once**, before you change anything:
   ```bash
   npx playwright install chromium
   npm run shots:update
   ```
   Baselines depend on the machine that takes them (fonts, GPU), so they are not shipped
   with the repository. Each contributor makes their own. The harness signs in with a
   built-in test account and never touches your data, but the app still needs a filled-in
   `.env` to start. Without one, every screenshot times out with `auth/invalid-api-key`.
4. Make your change.
5. Run the full check:
   ```bash
   npm run verify
   ```
   It runs lint, typecheck, tests and the build side by side, then photographs every
   screen if your change could have moved one. If a screen changed *on purpose*, open the
   images in `shots/diff/`, check they show what you meant, and accept them with
   `npm run shots:accept`.
6. Open a pull request. Say what changed from the user's point of view, and attach before
   and after screenshots for anything visual.

## House rules

These keep the app working in ways the tests alone can't see. The reasons are written in
the code beside each one, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) collects them.

- **Read the comment before you "simplify" something.** Many odd-looking lines in this code
  exist because the obvious version broke. The comment above them says how.
- **Keep logic pure and tested.** Scoring, Smart Start, recurrence, deadline maths, deletion
  and sharing live in `src/lib/` as plain functions with no clock, store or network, so
  they can be tested exactly. New logic of that kind goes there, with a test.
- **Styling comes from the design system.** Colours, glass, radii, shadows, type and motion
  come from `src/ui/` and its tokens. Tailwind is for layout only (flex, grid, spacing).
- **One path for each dangerous thing.** Deleting goes through `applyDeletion`, completing a
  task through `updateBacklogTask`. Don't write the task arrays directly.
- **The synced document has a 1 MB cap.** Everything a user owns is one Firestore document.
  Don't store bulk data in the persisted store.
- **Secrets never get a `VITE_` prefix.** Vite writes every `VITE_` variable into the public
  bundle.
- **Changed `server/` or code it imports?** Run `npm run build:push` and commit the
  regenerated files in `api/_lib/`. The build fails if they are stale.

## Style

TypeScript, React function components, Prettier-compatible formatting. Match the code
around you, including how much it comments. Comments explain *why*, not *what*.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
