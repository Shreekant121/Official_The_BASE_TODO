/*
 * Proves the dev-only code the screenshot harness needs is not in the shipped
 * bundle.
 *
 * `src/lib/devAuth.ts` lets the harness skip the login screen by handing
 * `AuthContext` a stand-in user whenever one localStorage key is set.
 * `src/lib/devShareFixture.ts` hands `SharePage` a literal share document
 * whenever the share id in the URL carries its prefix, because that page reads
 * only Firestore and the harness is offline. `src/lib/devChatFixture.ts` hands
 * `ChatPage` a literal transcript when the query string carries its marker,
 * because a real turn needs a live Gemini call. `src/lib/devModelFixture.ts` hands
 * it a literal model catalogue for the same reason — both of the picker's lists
 * are fetched. `src/lib/devHostFixture.ts` hands `/atlas-host` a landed probe,
 * because every fact on that screen comes from a laptop over Tailscale and the
 * harness blocks it. `src/lib/devCatalogFixture.ts` hands `/catalog` a folder of
 * notes, for the same reason — they are Markdown files on that same laptop.
 * `src/lib/devServiceWorker.ts` (APP-3) is the odd one out: it hands nothing to
 * a screen, it lets a dev session register the real service worker against
 * `vercel dev` so the offline shell, the update banner and a push notification
 * can be driven on the laptop. It is on this list because the worker it turns
 * on would cache the dev server — which is how a stale bundle gets served to a
 * screenshot run, and the failure would look like the app, not like the cache.
 * Every branch of all seven is guarded
 * by `import.meta.env.DEV`, which Vite replaces with the literal `false` for a
 * production build so the bundler drops the code — but that is a *convention*
 * holding an authentication bypass shut, and a convention is exactly the kind
 * of thing that quietly stops holding. A refactor that reads the flag into a
 * variable, or a stray `import.meta.env` spread, would compile fine and ship a
 * way to bypass login by writing one value to localStorage.
 *
 * So: grep the emitted JS for the bypass's uid, its localStorage key and the
 * fixture's share-id prefix. If any survives, the build fails.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const distAssets = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'assets')

// Kept deliberately distinctive so a substring search cannot false-positive.
// Must match the literals in src/lib/devAuth.ts, src/lib/devShareFixture.ts,
// src/lib/devChatFixture.ts, src/lib/devModelFixture.ts,
// src/lib/devHostFixture.ts and src/lib/devCatalogFixture.ts.
const MARKERS = [
  '__dev-screenshot-harness__',
  'mutineer-dev-auth',
  '__dev-share-fixture__',
  '__dev-chat-fixture__',
  '__dev-model-fixture__',
  '__dev-host-fixture__',
  '__dev-catalog-fixture__',
  '__dev-skills-fixture__',
  /* `devLogFixture` was missing from this list until DESIGN-1; the fixture
     shipped in 2026-09 with no check behind it. */
  '__dev-log-fixture__',
  '__dev-dock-fixture__',
  '__dev-notifications-fixture__',
  '__dev-panel-fixture__',
  '__dev-admin-fixture__',
  '__dev-service-worker__',
  /* `devStillPresence` holds the WebGL orb on one frame for the harness. */
  '__dev-still-presence__',
  /* BIG-12: Claude and ChatGPT answered by Ollama, for testing Atlas on the tablet path. */
  '__dev-cloud-via-ollama__',
]

const jsFiles = readdirSync(distAssets).filter((f) => f.endsWith('.js'))
if (jsFiles.length === 0) {
  console.error('[check-shots-bypass] no JS emitted in dist/assets')
  process.exit(1)
}

let failed = false

for (const file of jsFiles) {
  const js = readFileSync(join(distAssets, file), 'utf8')
  for (const marker of MARKERS) {
    if (js.includes(marker)) {
      console.error(
        `[check-shots-bypass] ${file} contains "${marker}" — the dev auth bypass ` +
          'survived into the production bundle.',
      )
      failed = true
    }
  }
}

if (failed) {
  console.error(
    '\n[check-shots-bypass] FAILED. Every read of src/lib/devAuth.ts, ' +
      'src/lib/devShareFixture.ts, src/lib/devChatFixture.ts, src/lib/devModelFixture.ts ' +
      'and src/lib/devHostFixture.ts ' +
      'must sit behind a bare `import.meta.env.DEV` check that Vite can constant-fold away. ' +
      'Do not copy the flag into a variable first.',
  )
  process.exit(1)
}

console.log(`[check-shots-bypass] OK — no dev-only harness code in ${jsFiles.length} emitted JS file(s).`)
