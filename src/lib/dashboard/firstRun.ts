/**
 * The first run (BIG-6, step 29-1c4) — pure: three questions a new account
 * answers once, and the starting Dashboard their answers build.
 *
 * HIS CALLS
 * ---------
 * - **New accounts only** (2026-10-15), and no "Redo setup": everything it
 *   builds is changed afterwards the ordinary way, in Edit.
 * - **The wording below is the draft he approved on 2026-10-21** ("Build it as
 *   drafted"): what to see first (up to two), what a normal day looks like
 *   (one, which sets the hours per weekday) and what he is working on (any,
 *   or a name typed in).
 * - **The third answer makes real projects** (2026-10-21), so a new account
 *   is not blank; the first one gets a Project progress block.
 * - **Blocks from later steps come in as Samples** (`SAMPLE_KINDS`), never
 *   data that looks real.
 *
 * Only the order and sizes are decided here: `layout.ts` packs them, as it
 * packs every layout, so the same answer fits four columns or one.
 */

import { DEFAULT_WEEKLY } from './hours';
import { BLOCK_SPECS, type BlockKind, type BlockSettings, type DashboardBlock } from './layout';

// ─── The questions ──────────────────────────────────────────────────────────

export type SeeFirst = 'one-thing' | 'today' | 'deadlines' | 'worked' | 'habits';
export type NormalDay = 'weekdays' | 'own-hours' | 'evenings' | 'changes';

export interface Choice<T extends string> {
  id: T;
  label: string;
  /** What picking it adds, in his words: shown under the label. */
  adds: string;
}

/** Question 1, up to two. The first picked leads the Dashboard. */
export const SEE_FIRST: readonly Choice<SeeFirst>[] = [
  { id: 'one-thing', label: 'The one thing to do next', adds: 'Do this one thing' },
  { id: 'today', label: "Today's plan", adds: 'Today, Timeline' },
  { id: 'deadlines', label: 'Deadlines coming up', adds: 'Next deadline, Countdown, Runway' },
  { id: 'worked', label: "How much I've worked", adds: 'Hours today, Focus this week' },
  { id: 'habits', label: 'My habits and streaks', adds: 'Streak, Routine (samples)' },
];
export const SEE_FIRST_MAX = 2;

/** Question 2, one. Sets the hours he has on each weekday. */
export const NORMAL_DAY: readonly Choice<NormalDay>[] = [
  { id: 'weekdays', label: 'Work or college on weekdays', adds: '8h Mon to Fri, 3h weekends' },
  { id: 'own-hours', label: 'My own hours, most days', adds: '10h Mon to Sat, 4h Sunday' },
  { id: 'evenings', label: 'Evenings, after my job', adds: '3h weekdays, 6h weekends' },
  { id: 'changes', label: 'It changes every day', adds: '12h weekdays, 6h weekends' },
];

/** Question 3's ready-made names. Any can be picked, and he can type his own. */
export const PROJECT_IDEAS: readonly string[] = ['Work', 'Studies', 'Side project', 'Health', 'Home'];
/** More than this on day one is a list to tidy, not a start. */
export const MAX_STARTER_PROJECTS = 8;
export const MAX_PROJECT_NAME = 60;

export interface FirstRunAnswers {
  see: SeeFirst[];
  day: NormalDay;
  /** Project names, in the order picked. Empty is "Nothing yet". */
  projects: string[];
}

// ─── What the answers build ─────────────────────────────────────────────────

const H = 3600;
/** Sunday first, as `HoursSettings.weekly` is. */
const WEEKLY: Record<NormalDay, readonly number[]> = {
  weekdays: [3 * H, 8 * H, 8 * H, 8 * H, 8 * H, 8 * H, 3 * H],
  'own-hours': [4 * H, 10 * H, 10 * H, 10 * H, 10 * H, 10 * H, 10 * H],
  evenings: [6 * H, 3 * H, 3 * H, 3 * H, 3 * H, 3 * H, 6 * H],
  changes: [...DEFAULT_WEEKLY],
};

export function starterWeekly(day: NormalDay): number[] {
  return [...(WEEKLY[day] ?? DEFAULT_WEEKLY)];
}

interface Part { kind: BlockKind; w?: number; h?: number }

/** Each answer's blocks, the one that answers it first. */
const PARTS: Record<SeeFirst, readonly Part[]> = {
  'one-thing': [{ kind: 'one-thing' }],
  /* Two tall, so it has rows to show beside the timeline. */
  today: [{ kind: 'today', h: 2 }, { kind: 'timeline' }],
  deadlines: [{ kind: 'next-deadline' }, { kind: 'countdown' }, { kind: 'runway' }],
  worked: [{ kind: 'hours-today' }, { kind: 'focus-week' }],
  habits: [{ kind: 'sample-routine' }, { kind: 'sample-streak' }],
};

/** What every Dashboard gets when he picked nothing in question 1: the default's lead. */
const NOTHING_PICKED: readonly SeeFirst[] = ['one-thing', 'today'];

/**
 * The names question 3 will make into projects: trimmed, blanks dropped,
 * the same name twice kept once (in any case), at most `MAX_STARTER_PROJECTS`.
 */
export function starterProjectNames(names: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_PROJECT_NAME);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length === MAX_STARTER_PROJECTS) break;
  }
  return out;
}

/**
 * The starting layout. The first answer to question 1 leads, then the
 * second; then Today if neither brought it, so the Dashboard always says
 * what is due; then the first project's progress (or, with no projects, a
 * Jot it down note to start from); last, Atlas's morning note as a sample,
 * because that is what the Dashboard is for once 29-5 lands.
 */
export function starterLayout(
  answers: Pick<FirstRunAnswers, 'see'>,
  firstProjectId: string | null,
  makeId: () => string,
): DashboardBlock[] {
  const picked = answers.see.filter((s, i, all) => s in PARTS && all.indexOf(s) === i).slice(0, SEE_FIRST_MAX);
  const see = picked.length > 0 ? picked : NOTHING_PICKED;
  const parts: Part[] = see.flatMap((s) => PARTS[s]);
  if (!parts.some((p) => p.kind === 'today')) parts.push({ kind: 'today' });
  parts.push(firstProjectId ? { kind: 'project-progress' } : { kind: 'quick-add' });
  parts.push({ kind: 'sample-morning' });

  return parts.map((p) => {
    const spec = BLOCK_SPECS[p.kind];
    const settings: BlockSettings | undefined =
      p.kind === 'project-progress' && firstProjectId ? { projectId: firstProjectId } : undefined;
    return {
      id: makeId(),
      kind: p.kind,
      w: p.w ?? spec.defaultW,
      h: p.h ?? spec.defaultH,
      ...(settings ? { settings } : {}),
    };
  });
}
