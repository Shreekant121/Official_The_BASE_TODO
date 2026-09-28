/**
 * UI audit — a visual inventory of the whole app, for redesign work.
 *
 * This is *not* the regression harness. `scripts/screenshots.ts` owns the
 * committed baselines and the diffing; it photographs the 25 surfaces whose
 * appearance is under contract, and it deliberately leaves out anything that
 * cannot be captured identically twice.
 *
 * This script has the opposite job: reach **every** screen, panel, modal,
 * dropdown and row menu once, so a redesign can be planned against pictures
 * rather than memory. Nothing here is compared to anything — it captures and
 * writes, numbered in the order you would walk the app.
 *
 * Because nothing is diffed, it can photograph surfaces the baseline set has to
 * skip: `/login`, whose aura animates on a real-time loop, is in here.
 *
 * Everything else about the environment matches the harness on purpose — the
 * same seeded fixture, the same frozen clock, the same offline rule — so what
 * you see here is what the baselines show, with more of it.
 *
 *   npx tsx scripts/uiAudit.ts              # everything, to ui-audit/
 *   npx tsx scripts/uiAudit.ts --only=task  # just the shots whose name matches
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { DEV_AUTH_KEY } from '../src/lib/devAuth.ts';
import {
  FROZEN_NOW, LOCALE, STORAGE_KEY, TIMEZONE, TRASH_STORAGE_KEY,
  serializedStore, serializedTrash,
} from './fixture.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'ui-audit');

/** Desktop only. Add a second entry and loop if a tablet pass is wanted again. */
const VIEWPORT = { width: 1440, height: 900 };

// The same virtual timeline as the harness: fixed jumps only, never "however
// long the machine took". See `scripts/screenshots.ts` for why that matters.
const BOOT_MS = 3_000;
const READY_AT_MS = 12_000;
const OPEN_STEP_MS = 1_000;
const OPENED_AT_MS = 20_000;

interface Shot {
  name: string;
  path: string;
  /** Must be visible before the screen counts as loaded. */
  ready: string;
  /** Interactions that open whatever this shot is about. */
  open?: (page: Page, settle: () => Promise<void>) => Promise<void>;
  /** Must be visible after `open` has run. Omit when the result has no stable text. */
  opened?: string;
  /**
   * Virtual milliseconds since navigation at which to take the picture, when
   * the default `OPENED_AT_MS` is too late — a toast that dismisses itself is
   * already gone by then.
   */
  openedAt?: number;
  /** `/login` only — skips seeding the dev-auth bypass, which would redirect away. */
  anonymous?: boolean;
}

/** Scrolls the section whose `<h2>` reads `heading` to the top of the viewport. */
function scrollToSection(heading: string) {
  return (page: Page) => page.evaluate((text: string) => {
    const found = [...document.querySelectorAll('h2')].find((el) => el.textContent?.trim() === text);
    found?.closest('section')?.scrollIntoView({ block: 'start' });
  }, heading);
}

/**
 * Scrolls the page's tallest scroll container to `fraction` of its length.
 *
 * Picking it by "most overflow" rather than by a class or a nearby string is
 * what makes this survive a redesign: when a panel is open it is always the
 * longest scrollable thing on screen, whatever it ends up being called.
 */
function scrollDeepestPane(page: Page, fraction: number) {
  return page.evaluate((f: number) => {
    let best: HTMLElement | null = null;
    let most = 40; // ignore containers that barely overflow
    for (const el of document.querySelectorAll<HTMLElement>('*')) {
      const overflow = el.scrollHeight - el.clientHeight;
      if (overflow > most) { most = overflow; best = el; }
    }
    if (best) best.scrollTop = (best.scrollHeight - best.clientHeight) * f;
  }, fraction);
}

const SHOTS: Shot[] = [
  // ── Signed out ──
  { name: '00-login', path: '/login', ready: 'input[type="email"]', anonymous: true },

  // ── Home ──
  { name: '01-home', path: '/', ready: 'text=Your Projects' },
  {
    name: '02-home-project-menu',
    path: '/', ready: 'text=Your Projects',
    open: (page) => page.locator('button:has(svg.lucide-ellipsis)').first().click(),
    opened: 'text=Edit Project',
  },
  {
    name: '03-home-edit-project',
    path: '/', ready: 'text=Your Projects',
    open: async (page, settle) => {
      await page.locator('button:has(svg.lucide-ellipsis)').first().click();
      await settle();
      await page.getByRole('button', { name: /Edit Project/ }).first().click();
    },
  },
  {
    name: '04-home-new-project',
    path: '/', ready: 'text=Your Projects',
    open: (page) => page.keyboard.press('p'),
    opened: 'text=New Project',
  },
  {
    name: '05-home-smart-start',
    path: '/', ready: 'text=Your Projects',
    open: (page) => page.keyboard.press('s'),
    opened: 'text=Smart Start',
  },
  {
    name: '06-home-smart-start-held-back',
    path: '/', ready: 'text=Your Projects',
    open: async (page, settle) => {
      await page.keyboard.press('s');
      await settle();
      await page.getByRole('button', { name: '1h', exact: true }).click();
      await settle();
      await page.getByRole('button', { name: /held back/ }).click();
    },
  },
  {
    name: '07-home-shortcuts',
    path: '/', ready: 'text=Your Projects',
    open: (page) => page.keyboard.press('?'),
    opened: 'text=Shortcuts',
  },

  // ── Project view ──
  { name: '10-project', path: '/project/p-empire', ready: 'text=Operations' },
  {
    name: '11-project-list-menu',
    path: '/project/p-empire', ready: 'text=Operations',
    open: (page) => page.locator('button:has(svg.lucide-chevron-down)').first().click(),
    opened: 'text=Delete List',
  },
  {
    name: '12-project-quick-add',
    path: '/project/p-empire', ready: 'text=Operations',
    open: (page) => page.keyboard.press('n'),
    opened: '[placeholder^="Task title"]',
  },
  {
    name: '13-project-new-list',
    path: '/project/p-empire', ready: 'text=Operations',
    open: (page) => page.keyboard.press('l'),
    opened: '[placeholder^="List name"]',
  },
  {
    name: '14-task-detail-top',
    path: '/project/p-empire', ready: 'text=Operations',
    open: (page) => page.getByText('Rewrite the landing page copy', { exact: true }).first().click(),
    opened: 'text=Depends on',
  },
  {
    name: '15-task-detail-middle',
    path: '/project/p-empire', ready: 'text=Operations',
    open: async (page, settle) => {
      await page.getByText('Rewrite the landing page copy', { exact: true }).first().click();
      await settle();
      await scrollDeepestPane(page, 0.5);
    },
  },
  {
    name: '16-task-detail-bottom',
    path: '/project/p-empire', ready: 'text=Operations',
    open: async (page, settle) => {
      await page.getByText('Rewrite the landing page copy', { exact: true }).first().click();
      await settle();
      await scrollDeepestPane(page, 1);
    },
  },

  // ── Task selection ──
  { name: '20-select', path: '/select', ready: 'text=Task Selection' },
  {
    name: '21-select-filter',
    path: '/select', ready: 'text=Task Selection',
    open: (page) => page.getByTitle('Filter by list').click(),
    opened: 'text=FILTER BY LIST',
  },
  {
    name: '22-select-new-task',
    path: '/select', ready: 'text=Task Selection',
    open: (page) => page.keyboard.press('n'),
    opened: '[placeholder^="What needs to be done"]',
  },
  {
    name: '23-select-task-menu',
    path: '/select', ready: 'text=Task Selection',
    open: (page) => page.getByTitle('View details').first().click(),
  },

  // ── Set deadlines ──
  { name: '30-deadlines', path: '/deadlines', ready: 'text=Set Deadlines' },
  {
    name: '31-deadlines-pert',
    path: '/deadlines', ready: 'text=Set Deadlines',
    open: (page) => page.locator('button:has(svg.lucide-calculator)').first().click(),
    opened: 'text=PERT Estimation',
  },
  {
    name: '32-deadlines-subtasks',
    path: '/deadlines', ready: 'text=Set Deadlines',
    open: (page) => page.locator('button:has(svg.lucide-list-tree)').first().click(),
    opened: 'text=Subtasks',
  },
  {
    name: '33-deadlines-capture',
    path: '/deadlines', ready: 'text=Set Deadlines',
    open: (page) => page.getByTitle('Capture an idea or task').click(),
    opened: 'text=Capture Idea',
  },

  // ── Focus mode ──
  { name: '40-focus', path: '/focus', ready: 'text=Global Work Session' },
  {
    name: '41-focus-details',
    path: '/focus', ready: 'text=Global Work Session',
    open: (page) => page.getByRole('button', { name: /DETAILS/ }).click(),
    opened: 'text=Task Details',
  },
  {
    name: '42-focus-subtasks',
    path: '/focus', ready: 'text=Global Work Session',
    open: (page) => page.getByRole('button', { name: /SUBTASKS/ }).click(),
    opened: 'text=Upload to the MCA portal',
  },
  {
    // The toast clears itself after 2.5s, so this one is photographed early —
    // at the default shutter mark it has already gone and the frame is empty.
    name: '43-focus-deferred-toast',
    path: '/focus', ready: 'text=Global Work Session',
    open: (page) => page.getByRole('button', { name: /Defer/ }).click(),
    openedAt: 13_600,
  },

  // ── Needs attention ──
  { name: '50-scoring', path: '/scoring', ready: 'text=Quarterly compliance review' },
  {
    name: '51-scoring-advanced',
    path: '/scoring', ready: 'text=Quarterly compliance review',
    open: (page) => page.getByRole('button', { name: /Advanced/ }).click(),
    opened: 'text=Every 2 weeks',
  },
  {
    name: '52-scoring-recurrence',
    path: '/scoring', ready: 'text=Quarterly compliance review',
    open: async (page, settle) => {
      await page.getByRole('button', { name: /Advanced/ }).click();
      await settle();
      await page.getByRole('button', { name: /Every 2 weeks/ }).click();
    },
    opened: 'text=Custom recurrence',
  },

  // ── Notifications ──
  { name: '60-notifications', path: '/notifications', ready: 'text=Reminder defaults' },
  {
    name: '61-notifications-dropdown',
    path: '/notifications', ready: 'text=Reminder defaults',
    open: (page) => page.locator('button:has(svg.lucide-chevron-down)').first().click(),
  },

  // ── Settings ──
  { name: '70-settings', path: '/settings', ready: 'text=Settings' },
  {
    name: '71-settings-storage',
    path: '/settings', ready: 'text=Settings',
    open: scrollToSection('Storage'),
    opened: 'text=Remembered timings',
  },
  {
    name: '72-settings-trash',
    path: '/settings', ready: 'text=Settings',
    open: scrollToSection('Trash'),
    opened: 'text=Consulting side line',
  },

  // ── Assistant ──
  { name: '80-chat', path: '/chat', ready: 'text=Assistant' },
  {
    name: '81-chat-keys',
    path: '/chat', ready: 'text=Assistant',
    open: (page) => page.getByTitle('Choose which Gemini key this conversation uses').click(),
    opened: 'text=Gemini API keys',
  },

  // ── Google Calendar callback (the failure card — the success path only flashes) ──
  { name: '90-oauth-callback', path: '/oauth/callback', ready: 'text=Google Calendar was not connected' },
];

// ─── Capture ─────────────────────────────────────────────────────────────────

async function newContext(browser: Browser, anonymous: boolean): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    timezoneId: TIMEZONE,
    locale: LOCALE,
    reducedMotion: 'no-preference',
  });

  await context.clock.install({ time: new Date(FROZEN_NOW) });

  // Nothing leaves the machine — Firebase and the Google Identity tag both die
  // here, and both paths already handle being offline.
  await context.route('**/*', (route) => {
    const { hostname } = new URL(route.request().url());
    return hostname === 'localhost' || hostname === '127.0.0.1'
      ? route.continue()
      : route.abort();
  });

  await context.addInitScript(
    ({ storageKey, storeJson, trashKey, trashJson, authKey, seedAuth }) => {
      localStorage.setItem(storageKey, storeJson);
      localStorage.setItem(trashKey, trashJson);
      if (seedAuth) localStorage.setItem(authKey, '1');
    },
    {
      storageKey: STORAGE_KEY, storeJson: serializedStore(),
      trashKey: TRASH_STORAGE_KEY, trashJson: serializedTrash(),
      authKey: DEV_AUTH_KEY, seedAuth: !anonymous,
    },
  );

  return context;
}

async function capture(page: Page, shot: Shot, baseUrl: string): Promise<Buffer> {
  let elapsed = 0;
  const advanceBy = async (ms: number) => { await page.clock.runFor(ms); elapsed += ms; };
  const advanceTo = (mark: number) => advanceBy(Math.max(0, mark - elapsed));
  const settle = () => advanceBy(OPEN_STEP_MS);

  await page.goto(`${baseUrl}${shot.path}`, { waitUntil: 'domcontentloaded' });
  await advanceBy(BOOT_MS);
  await page.waitForSelector(shot.ready, { state: 'visible', timeout: 20_000 });
  await advanceTo(READY_AT_MS);

  if (shot.open) {
    await shot.open(page, settle);
    await settle();
    if (shot.opened) await page.waitForSelector(shot.opened, { state: 'visible', timeout: 20_000 });
    await advanceTo(shot.openedAt ?? OPENED_AT_MS);
  }

  await page.addStyleTag({ content: '*, *::before, *::after { caret-color: transparent !important; }' });
  return page.screenshot({ animations: 'disabled', caret: 'hide' });
}

// ─── Run ─────────────────────────────────────────────────────────────────────

async function startDevServer(): Promise<{ server: ViteDevServer; baseUrl: string }> {
  const server = await createServer({ root: ROOT, server: { port: 0 }, logLevel: 'warn' });
  await server.listen();
  const baseUrl = server.resolvedUrls?.local[0];
  if (!baseUrl) throw new Error('Vite did not report a local URL to point the browser at.');
  return { server, baseUrl: baseUrl.replace(/\/$/, '') };
}

async function main(): Promise<void> {
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const only = onlyArg?.slice('--only='.length);
  const shots = only ? SHOTS.filter((s) => s.name.includes(only)) : SHOTS;

  if (shots.length === 0) {
    console.error(`No shot name matches "${only}".`);
    process.exit(1);
  }

  if (!only) await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const { server, baseUrl } = await startDevServer();
  const browser = await chromium.launch();
  const failures: string[] = [];

  console.log(`Capturing ${shots.length} shot(s) at ${VIEWPORT.width}x${VIEWPORT.height} against ${baseUrl}\n`);

  try {
    for (const shot of shots) {
      const context = await newContext(browser, shot.anonymous ?? false);
      const page = await context.newPage();
      try {
        const buffer = await capture(page, shot, baseUrl);
        await writeFile(join(OUT_DIR, `${shot.name}.png`), buffer);
        console.log(`  ok    ${shot.name}`);
      } catch (err) {
        console.log(`  FAIL  ${shot.name} — ${err instanceof Error ? err.message.split('\n')[0] : err}`);
        failures.push(shot.name);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await server.close();
  }

  console.log(`\nWritten to ui-audit/ (${shots.length - failures.length}/${shots.length}).`);
  if (failures.length > 0) console.log(`Could not capture: ${failures.join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
