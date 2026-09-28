/**
 * Dev-only fixture for `/skills`, used by the screenshot harness
 * (`scripts/screenshots.ts`).
 *
 * WHY THIS EXISTS
 * ---------------
 * Every folder on that screen is on Shreekant's laptop, fetched from Atlas
 * over Tailscale, and the harness aborts everything off its own origin.
 * Without this there is exactly one photographable state — "the laptop is
 * asleep" — and the screen has no baseline showing a skill at all. Identical
 * reasoning to `devCatalogFixture`, one screen later.
 *
 * It is a *rendering* fixture: it contacts no laptop, writes nothing, and the
 * screen is read-only while it is in force, because a Save with no Atlas
 * behind it would be a button that lies. **The seventh of its kind**, after
 * `devAuth`, `devShareFixture`, `devChatFixture`, `devModelFixture`,
 * `devHostFixture` and `devCatalogFixture`, and it is kept out of the shipped
 * bundle the same way: every branch behind a bare `import.meta.env.DEV`, which
 * Vite folds to `false` in a production build, and
 * `scripts/check-shots-bypass.mjs` greps `dist/` for the marker. **Do not read
 * that flag into a variable first**, and **do not lift anything below to
 * module scope** — a module-level `const` is initialised whether or not the
 * guarded function is reachable, which is how `devShareFixture`'s marker
 * survived into `dist/` the first time.
 *
 * WHAT THE SKILLS SAY, AND WHY THEY ARE THE MOCKUP'S
 * ----------------------------------------------------
 * They are `design-system/screens/skills.html`'s own seeded skills, trimmed to
 * four and re-shaped into what Atlas actually returns. A fixture is a
 * *drawing* of the screen, and drawing it with the design's own content is how
 * the baseline can be diffed against the mockup by eye. None of it reaches
 * Shreekant's real skills folder — that starts empty.
 *
 * The four cover what the screen has to draw: one on and heavily used, one
 * with supporting files, one switched **off**, and one that has **never been
 * loaded** — which is the state the header tile exists to point at, and the
 * one a real folder falls into when its description is too vague for Atlas to
 * match. The mockup's per-skill `reach` row is deliberately absent; Atlas has
 * no such concept and `SkillsPage`'s header says why.
 */
import type { AtlasSkill, AtlasSkillsIndex } from './atlas/client';

export interface SkillsFixture {
  index: AtlasSkillsIndex;
  bodies: Record<string, AtlasSkill>;
  /** `<skill>/<file>` → contents, for the supporting-file tabs. */
  files: Record<string, string>;
}

export function devSkillsFixture(): SkillsFixture | null {
  if (!import.meta.env.DEV) return null;
  if (!/__dev-skills-fixture__/.test(window.location.search)) return null;

  /*
   * Dates as literals rather than offsets from `Date.now()`, so a capture does
   * not depend on the day it was taken, and placed around `FROZEN_NOW` — the
   * harness pins its clock to 12 March 2026 — so a "last used" never reads as
   * being after the day the app thinks it is.
   */
  const seed: AtlasSkill[] = [
    {
      name: 'chase-invoice',
      declaredName: 'chase-invoice',
      description:
        'Chase an unpaid invoice: work out how late it is, draft the reminder in his voice, and put the next chase on the calendar.',
      body: [
        '# Chasing an invoice',
        '',
        '1. Read the invoice from the project note. Get the amount, the date',
        '   sent, and the terms.',
        '2. Count the days past terms. Never say "a while ago" — say the number.',
        '3. Pick the rung on escalation-ladder.md by days late:',
        '   0–7 soft · 8–21 firm with a date · 22+ tell him, do not draft.',
        '4. Draft using reminder-template.md and preferences/writing-voice.md.',
        '   Two or three sentences. A date in the commitment.',
        '5. STOP. Mail to a person is the front door. Put the draft in the tray',
        '   and say so.',
        '6. Create the next chase task, 7 days out, 10 minutes.',
        '',
      ].join('\n'),
      files: ['escalation-ladder.md', 'reminder-template.md'],
      bytes: 4120,
      enabled: true,
      uses: 12,
      lastUsedAt: '2026-03-12T14:22:00.000Z',
      updatedAt: '2026-03-02T09:10:00.000Z',
      author: 'you',
      valid: true,
      problem: null,
    },
    {
      name: 'weekly-review',
      declaredName: 'weekly-review',
      description: 'Sunday evening: what moved, what slipped, and the three things that decide next week.',
      body: [
        '# The weekly review',
        '',
        '1. Count what was finished, and what was allocated against it.',
        '2. Name what slipped, and how many days. No softening.',
        '3. Find anything that has moved three weeks running without being',
        '   touched. That is a decision he is avoiding — say so.',
        '4. Propose three tasks for next week. No more than three.',
        '5. Append what you learned to preferences/how-shreekant-works.md.',
        '',
      ].join('\n'),
      files: ['questions.md'],
      bytes: 1840,
      enabled: true,
      uses: 4,
      lastUsedAt: '2026-03-08T18:40:00.000Z',
      updatedAt: '2026-02-14T11:02:00.000Z',
      author: 'outside',
      valid: true,
      problem: null,
    },
    {
      name: 'lease-terms',
      declaredName: 'lease-terms',
      description: 'Read a lease draft and list the clauses that differ from the last one he signed.',
      body: [
        '# Reading a lease draft',
        '',
        '1. Extract deposit, lock-in, notice, escalation, and who pays for what.',
        '2. Compare against known-clauses.md.',
        '3. List only the differences. Do not summarise the whole lease.',
        '4. Hold at 3 months deposit. That is his number, not mine.',
        '5. Never accept, sign, or agree to anything. Report and stop.',
        '',
      ].join('\n'),
      files: ['known-clauses.md'],
      bytes: 2210,
      enabled: false,
      uses: 3,
      lastUsedAt: '2026-02-26T10:15:00.000Z',
      updatedAt: '2026-02-26T10:15:00.000Z',
      author: 'atlas',
      valid: true,
      problem: null,
    },
    {
      name: 'summarise-pdf',
      declaredName: 'summarise-pdf',
      description: 'Pull the numbers and dates out of a PDF and leave the prose behind.',
      body: [
        '# Reading a PDF',
        '',
        'Numbers, dates, names, obligations. In that order.',
        'No executive summary. No "this document outlines".',
        '',
      ].join('\n'),
      files: [],
      bytes: 640,
      enabled: true,
      uses: 0,
      lastUsedAt: null,
      updatedAt: '2026-03-01T08:00:00.000Z',
      author: 'outside',
      valid: true,
      problem: null,
    },
  ];

  const bodies: Record<string, AtlasSkill> = {};
  for (const skill of seed) bodies[skill.name] = skill;

  return {
    index: {
      root: 'C:\\Shreekant Empire\\...\\atlas\\data\\skills',
      /* Headers only, and built by listing the fields rather than by spreading
         minus `body` — `skills.ts` makes the same call in `headerOf` and for
         the same reason: the body is the one field that must never reach the
         prompt or the list, and a field list is something the compiler
         checks. */
      skills: seed.map((skill) => ({
        name: skill.name,
        declaredName: skill.declaredName,
        description: skill.description,
        files: skill.files,
        bytes: skill.bytes,
        enabled: skill.enabled,
        uses: skill.uses,
        lastUsedAt: skill.lastUsedAt,
        updatedAt: skill.updatedAt,
        author: skill.author,
        valid: skill.valid,
        problem: skill.problem,
      })),
      enabled: seed.filter((skill) => skill.enabled).length,
      skillFile: 'SKILL.md',
    },
    bodies,
    files: {
      'chase-invoice/escalation-ladder.md': [
        '# How hard to push, by days late',
        '',
        '- 0–7    soft. "Just checking this reached you."',
        '- 8–21   firm, with a date. Name the amount.',
        '- 22+    do not draft. Tell him, and let him decide.',
        '',
      ].join('\n'),
      'chase-invoice/reminder-template.md': [
        '# The reminder',
        '',
        'Two or three sentences. Open with the invoice number and the amount.',
        'One commitment with a date in it. No apology unless we are late.',
        '',
      ].join('\n'),
      'weekly-review/questions.md': [
        '# What to ask, in order',
        '',
        '1. What finished?',
        '2. What slipped, and by how many days?',
        '3. What has not moved in three weeks?',
        '',
      ].join('\n'),
      'lease-terms/known-clauses.md': [
        '# Terms he has accepted before',
        '',
        '- Deposit: 3 months. Not more.',
        '- Lock-in: 11 months.',
        '- Notice: 2 months either side.',
        '',
      ].join('\n'),
    },
  };
}
