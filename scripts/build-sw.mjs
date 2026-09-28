/*
 * Gives `dist/sw.js` its precache list and its version — APP-3.
 *
 *   node scripts/build-sw.mjs        (runs as part of `npm run build`)
 *
 * `public/sw.js` is the worker as written, and it is a working worker on its
 * own: an empty precache, the version `development`, every rule falling through
 * to the network. Vite copies it into `dist/` verbatim. This script then
 * rewrites exactly one line of the copy — the one marked `__BUILD__` — with
 * what was actually emitted.
 *
 * WHY THE LIST IS WALKED RATHER THAN WRITTEN DOWN
 * -----------------------------------------------
 * Two of the files are content-hashed (`index-CrmmPky3.js`), so the list cannot
 * be a constant; and a precache that is missing a file the app needs is an app
 * that white-screens in aeroplane mode, which is the one failure nobody would
 * find before Shreekant did. So the source of truth is `dist/` itself, after
 * the build, with three deliberate exclusions and nothing else:
 *
 *   - `sw.js` — a worker that precaches itself pins its own old copy.
 *   - `brand/source/` — the 1024px masters `scripts/brand.mjs` derives from.
 *     They are in `public/` so the derivation is reproducible from a clean
 *     checkout, not because anything loads them.
 *   - `*.md` — the two READMEs that ride along in `public/`.
 *
 * Everything else ships: the shell, the hashed chunks, the icons the manifest
 * names, the favicon. About 2 MB, once, on the install of a new version.
 *
 * THE VERSION IS DERIVED, NOT STAMPED
 * -----------------------------------
 * It is a short hash over the precache list plus the bytes of `index.html`.
 * That makes it a fingerprint of what was emitted rather than of the moment the
 * build ran: two builds of the same tree carry the same version, so the cache
 * keeps its name and Settings keeps its number across a rebuild that changed
 * nothing. Both asset filenames are content-hashed by Vite, so this moves if
 * and only if the app moved.
 *
 * `builtAt` is separate and IS the clock — it is only ever shown, never
 * compared, because "which version am I running" and "when did it come from"
 * are different questions and Settings answers both.
 *
 * **The clock is why a rebuild still offers itself, and that is worth knowing
 * rather than being surprised by.** What decides whether the browser installs a
 * new worker is a byte comparison of `sw.js`, not the version string inside it
 * — and `builtAt` changes on every run, so every build produces a worker the
 * browser treats as new and the banner appears. That is the right answer for
 * how this app is actually shipped (by hand, `vercel --prod`, after real
 * changes) and the cost of being wrong is one tap. Removing `builtAt` would
 * make the worker byte-stable and take the "built when" line off Settings with
 * it; that trade was considered and the date won, because a date is the half of
 * this panel Shreekant can actually read.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

/** Paths (relative to dist, posix-style) that must never reach the cache. */
function excluded(rel) {
  if (rel === 'sw.js') return true;
  if (rel.startsWith('brand/source/')) return true;
  if (rel.endsWith('.md')) return true;
  return false;
}

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

const files = walk(DIST)
  .map((full) => relative(DIST, full).split(sep).join(posix.sep))
  .filter((rel) => !excluded(rel))
  .sort();

if (!files.includes('index.html')) {
  console.error('[build-sw] dist/index.html is missing — did vite build run?');
  process.exit(1);
}

const precache = files.map((rel) => `/${rel}`);

const fingerprint = createHash('sha256');
fingerprint.update(precache.join('\n'));
fingerprint.update(readFileSync(join(DIST, 'index.html')));
const version = fingerprint.digest('hex').slice(0, 8);

const build = { version, builtAt: new Date().toISOString(), precache };

const swPath = join(DIST, 'sw.js');
const source = readFileSync(swPath, 'utf8');

/*
 * One line, matched on its marker. The `{ ... }` is matched to the end of the
 * line rather than by brace counting because the line it replaces is written to
 * be a single-line object literal — see `public/sw.js`. If that ever stops
 * being true this fails loudly below rather than emitting a broken worker.
 */
const MARKER = /const BUILD = \/\* __BUILD__ \*\/ \{.*\};/;
if (!MARKER.test(source)) {
  console.error(
    '[build-sw] the __BUILD__ line in public/sw.js no longer matches. The worker ' +
      'would have shipped with an empty precache and no version, which looks ' +
      'exactly like a working build until the tablet goes offline.',
  );
  process.exit(1);
}

writeFileSync(
  swPath,
  source.replace(MARKER, `const BUILD = /* __BUILD__ */ ${JSON.stringify(build)};`),
  'utf8',
);

const bytes = files.reduce((total, rel) => total + statSync(join(DIST, rel)).size, 0);
console.log(
  `[build-sw] OK — version ${version}, ${precache.length} files precached ` +
    `(${(bytes / 1024).toFixed(0)} kB).`,
);
