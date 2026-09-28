/**
 * `npm run verify` — the whole pre-commit gate from CLAUDE.md, in one command.
 *
 * 1. lint, typecheck, test and build run at the same time (about 25 s together,
 *    where one after another took 40). Only a failing check prints its output.
 * 2. Then it decides whether `npm run shots` is needed, from what changed, and
 *    runs it if so. A change that cannot reach a rendered screen — `api/`,
 *    `server/`, `mcp/`, docs, `design-system/` (which Vite never builds),
 *    `firestore.rules` — skips the ~10-minute photograph run. Anything under
 *    `src/` that is not a test counts as a screen change: store and model code
 *    moves what screens show often enough that guessing otherwise is the trap.
 *
 *   npm run verify                      # uncommitted changes decide
 *   npm run verify -- --since=HEAD~1    # a commit range decides instead
 *   npm run verify -- --shots           # photograph regardless
 *   npm run verify -- --no-shots        # quick checks only, and say so
 *
 * The tree is shared with other sessions, so "uncommitted changes" includes
 * theirs; that only ever errs towards running shots, never towards skipping.
 */
import { spawn, execFileSync } from 'node:child_process';

const CHECKS = ['lint', 'typecheck', 'test', 'build'];

/** Paths whose change can move a pixel in a `shots` capture. */
const REACHES_A_SCREEN = [
  /^src\/(?!.*\.test\.tsx?$)/,
  /^index\.html$/,
  /^public\//,
  /^(tailwind|postcss|vite)\.config\./,
  /^scripts\/(screenshots|fixture|imageDiff)\.ts$/,
  /^package(-lock)?\.json$/,
  /^shots\/baseline\//,
];

const args = process.argv.slice(2);
const since = args.find((a) => a.startsWith('--since='))?.slice('--since='.length);

function run(script, { quiet }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(`npm run -s ${script}`, { shell: true, stdio: quiet ? 'pipe' : 'inherit' });
    let output = '';
    child.stdout?.on('data', (d) => (output += d));
    child.stderr?.on('data', (d) => (output += d));
    child.on('close', (code) => resolve({ script, code, output, seconds: Math.round((Date.now() - started) / 1000) }));
  });
}

function changedFiles() {
  const git = (...a) => execFileSync('git', a, { encoding: 'utf8' });
  if (since) return git('diff', '--name-only', since).split('\n').filter(Boolean);
  return git('status', '--porcelain', '--untracked-files=all')
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, ''));
}

console.log(`Running ${CHECKS.join(', ')} side by side…`);
const results = await Promise.all(CHECKS.map((c) => run(c, { quiet: true })));
for (const r of results) console.log(`  ${r.code === 0 ? 'ok  ' : 'FAIL'}  ${r.script} (${r.seconds}s)`);
const broken = results.filter((r) => r.code !== 0);
for (const r of broken) console.log(`\n── ${r.script} ──\n${r.output.trim()}`);
if (broken.length > 0) {
  console.log(`\n${broken.length} check(s) failed. Not running shots until they pass.`);
  process.exit(1);
}

let shotsReason;
if (args.includes('--no-shots')) shotsReason = null;
else if (args.includes('--shots')) shotsReason = 'asked for with --shots';
else {
  const hits = changedFiles().filter((f) => REACHES_A_SCREEN.some((re) => re.test(f)));
  shotsReason = hits.length > 0 ? `${hits.length} changed file(s) can reach a screen, e.g. ${hits.slice(0, 3).join(', ')}` : null;
}

if (shotsReason === null) {
  console.log(`\nShots skipped: ${args.includes('--no-shots') ? '--no-shots' : 'nothing changed that a screen renders'}.`);
  console.log('All checks passed.');
  process.exit(0);
}

console.log(`\nShots needed — ${shotsReason}.\n`);
const shots = await run('shots', { quiet: false });
process.exit(shots.code);
