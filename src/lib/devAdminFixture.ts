/**
 * Dev-only fixture for `/admin`, used by the screenshot harness
 * (`scripts/screenshots.ts`). BUILD-6.
 *
 * Every fact on that screen comes from somewhere the harness cannot reach: the
 * account list from an `api/` route, the switches, the turn counts and each
 * board from Firestore under rules the stand-in user has no token for. So
 * without this the screen has one photographable state, and it is an error.
 *
 * It writes nothing and reaches nothing — flipping a switch in fixture mode
 * changes the screen and no document. The people are invented; the dates are
 * measured back from `FROZEN_NOW` (12 March 2026, 09:30), which is the clock
 * the harness pins, so "joined" and "last active" read the way they are
 * meant to only while that clock is pinned.
 *
 * Same guard as `devHostFixture.ts`, and the same two rules: a bare
 * `import.meta.env.DEV`, and nothing lifted to module scope.
 * `scripts/check-shots-bypass.mjs` greps `dist/` for the marker.
 */
import type { AccountAccess, AccountSummary, KeyUsage } from './adminAccess';

/** The raw board document, as `users/{uid}/data/main` holds it. */
export type AdminBoardDoc = Record<string, unknown>;

export interface AdminFixture {
  accounts: AccountSummary[];
  access: Record<string, AccountAccess>;
  usage: Record<string, KeyUsage>;
  boards: Record<string, AdminBoardDoc>;
  /** Which account is open, for the detail shot. */
  open: string | null;
}

export function devAdminFixture(search: string): AdminFixture | null {
  if (!import.meta.env.DEV) return null;
  const match = /__dev-admin-fixture__=([a-z-]+)/.exec(search);
  if (!match) return null;

  const now = Date.now(); // pinned to FROZEN_NOW by the harness
  const day = 86_400_000;
  const days = (counts: number[]) => {
    const out: Record<string, number> = {};
    counts.forEach((n, i) => {
      if (n) out[new Date(now - (counts.length - 1 - i) * day).toISOString().slice(0, 10)] = n;
    });
    return out;
  };

  const accounts: AccountSummary[] = [
    { uid: 'owner', email: 'owner@example.com', name: 'Shreekant', createdAt: now - 180 * day, lastActiveAt: now - 60_000, disabled: false, owner: true },
    { uid: 'priya', email: 'priya.shah@example.com', name: 'Priya Shah', createdAt: now - 12 * day, lastActiveAt: now - 14 * 60_000, disabled: false, owner: false },
    { uid: 'marcus', email: 'm.lindqvist@example.com', name: 'Marcus Lindqvist', createdAt: now - 20 * day, lastActiveAt: now - 2 * 3_600_000, disabled: false, owner: false },
    { uid: 'aiko', email: 'aiko.tanaka@example.com', name: null, createdAt: now - 3 * day, lastActiveAt: now - 26 * 3_600_000, disabled: false, owner: false },
    { uid: 'oscar', email: 'o.melnyk@example.com', name: 'Oscar Melnyk', createdAt: now - 60 * day, lastActiveAt: now - 19 * day, disabled: false, owner: false },
  ];

  const board = (lists: [string, string, [string, number | null, 'needsAction' | 'in-progress' | 'completed'][]][]) => ({
    projects: [{ id: 'p1', name: 'Studio', color: '#888', createdAt: now, order: 0 }],
    taskLists: lists.map(([id, title]) => ({ id, title, projectId: id === 'backburner' || id === 'action-steps' ? undefined : 'p1' })),
    backlogTasks: lists.flatMap(([id, , tasks]) =>
      tasks.map(([title, minutes, status], i) => ({
        id: `${id}-${i}`,
        title,
        status,
        listId: id,
        ...(minutes ? { estimatedTime: minutes } : {}),
      })),
    ),
  });

  return {
    accounts,
    access: {
      priya: { assistant: true, ownerKey: true },
      marcus: { assistant: true, ownerKey: false },
    },
    usage: {
      owner: { total: 2140, days: days([18, 26, 22, 31, 28, 40, 36]), lastAt: now - 60_000 },
      priya: { total: 412, days: days([4, 9, 14, 11, 22, 19, 26]), lastAt: now - 14 * 60_000 },
    },
    boards: {
      owner: board([['action-steps', '⚡ Action Steps', [['Plan the week', 30, 'in-progress']]]]),
      priya: board([
        ['action-steps', '⚡ Action Steps', [
          ['Rewrite onboarding email', 45, 'in-progress'],
          ['Ship pricing table copy', 30, 'needsAction'],
          ['Reply to Figma thread', 15, 'needsAction'],
        ]],
        ['backburner', '🧊 Backburner', [
          ['Audit old Notion pages', 60, 'needsAction'],
          ['Rename asset folders', 25, 'needsAction'],
        ]],
        ['launch', 'Launch checklist', [
          ['Brand voice notes', null, 'completed'],
          ['Book the photographer', 20, 'needsAction'],
        ]],
      ]),
      marcus: board([['action-steps', '⚡ Action Steps', [['Invoice March', 20, 'needsAction'], ['Call the printer', 10, 'needsAction']]]]),
      aiko: board([]),
      oscar: board([['backburner', '🧊 Backburner', [['Old idea', null, 'needsAction']]]]),
    },
    open: match[1] === 'open' ? 'priya' : null,
  };
}
