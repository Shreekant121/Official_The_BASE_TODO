/**
 * What the public share page says, as pure functions of a share and a clock
 * (BUILD-14).
 *
 * `pages/SharePage.tsx` draws; this decides the words and the numbers — "Due
 * 26 Sep · in 3 days", "Took 6h 10m", which of a task's outsourcing states it
 * is in, what the summary card adds up. It reads no store, no Firebase and no
 * `Date.now()`: the clock is an argument, which is what lets
 * `shareView.test.ts` pin a sentence to a date.
 *
 * Dates here are the app's stored `YYYY-MM-DDTHH:mm`, read as local time by
 * `new Date()` exactly as every other screen reads them. A viewer in another
 * zone sees the owner's wall-clock deadline in their own zone's calendar,
 * which is the same trade the rest of the page has always made.
 */
import type { PublicLiveRun, PublicShareDoc, PublicTask } from './publicShareSnapshot';
import type { ShareSubmission } from './shareSubmissions';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local midnight, as a day number, so two instants compare by calendar day. */
function dayNumber(at: number): number {
  const d = new Date(at);
  return Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / DAY_MS);
}

/*
 * Spelled out rather than `toLocaleDateString`: newer ICU writes September as
 * "Sept" in en-GB and older builds do not, so the page — and a baseline —
 * would read differently on two machines.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "26 Sep", with the year only when it is not this one. */
export function shortDate(at: number, now: number): string {
  const d = new Date(at);
  const day = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date(now).getFullYear() ? day : `${day} ${d.getFullYear()}`;
}

/** "30 Oct 2026" — footers and the closed page, where the year always helps. */
export function longDate(at: number): string {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export interface DueLine {
  text: string;
  /** Past its deadline and not done: drawn amber. */
  late: boolean;
}

/**
 * The date line on a task card. Done: when it was delivered. Open: when it is
 * due, and how far off that is. No deadline: nothing.
 */
export function dueLine(task: Pick<PublicTask, 'done' | 'deadline' | 'completedAt'>, now: number): DueLine | null {
  if (task.done) {
    return { text: task.completedAt ? `Delivered ${shortDate(task.completedAt, now)}` : 'Delivered', late: false };
  }
  if (!task.deadline) return null;
  const at = new Date(task.deadline).getTime();
  if (Number.isNaN(at)) return null;
  const days = dayNumber(at) - dayNumber(now);
  const date = shortDate(at, now);
  if (days < 0) return { text: `Due ${date} · ${plural(-days, 'day')} late`, late: true };
  if (days === 0) return { text: at < now ? `Due today · late` : 'Due today', late: at < now };
  if (days === 1) return { text: 'Due tomorrow', late: false };
  if (days <= 14) return { text: `Due ${date} · in ${days} days`, late: false };
  return { text: `Due ${date}`, late: false };
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** An estimate in minutes, as the card shows it: "45 m", "2 h", "1.5 h". */
export function estimateText(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} m`;
  const h = minutes / 60;
  return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
}

/** Worked time: "6h 10m", "38m", "under a minute". */
export function durationText(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 1) return 'under a minute';
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`;
}

/** A running clock: "1:24:07". */
export function clockText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Every task a share shows, in page order. */
export function shareTasks(share: Pick<PublicShareDoc, 'task' | 'list' | 'project'>): PublicTask[] {
  if (share.task) return [share.task];
  if (share.list) return share.list.tasks;
  return (share.project?.lists ?? []).flatMap((l) => l.tasks);
}

/**
 * The focus run the page should show, or `null`. A published run past its
 * `until` is a tab that closed mid-run, and one on a task the share no longer
 * holds is a stale document; neither is shown.
 */
export function liveRunShown(share: Pick<PublicShareDoc, 'live' | 'task' | 'list' | 'project' | 'showPeople'>, now: number): PublicLiveRun | null {
  const live = share.live;
  if (!share.showPeople || !live || now >= live.until) return null;
  return shareTasks(share).some((t) => t.id === live.taskId) ? live : null;
}

/** Whether this document is a closed link, by its flag or by the clock. */
export function isClosed(share: Pick<PublicShareDoc, 'expired' | 'expiresAt'>, now: number): boolean {
  return share.expired === true || (share.expiresAt !== undefined && now >= share.expiresAt);
}

// ─── Outsourcing ─────────────────────────────────────────────────────────────

/**
 * Where one task stands for the worker looking at it.
 *
 * - `approved`: the owner completed it.
 * - `open`: nobody has it, or whoever had it gave it back.
 * - `mine` / `sent`: this device claimed it, and has or has not handed it in.
 * - `taken`: somebody else has it. No lock stops a second claim (his call);
 *   the page just does not offer one.
 */
export type WorkPhase = 'approved' | 'open' | 'mine' | 'sent' | 'taken';

export function workPhase(task: Pick<PublicTask, 'id' | 'done'>, sub: ShareSubmission | undefined, myClaims: readonly string[]): WorkPhase {
  if (task.done) return 'approved';
  if (!sub || sub.state === 'released') return 'open';
  if (!myClaims.includes(task.id)) return 'taken';
  return sub.state === 'submitted' ? 'sent' : 'mine';
}

// ─── The summary card ────────────────────────────────────────────────────────

export interface Stat {
  key: string;
  label: string;
  value: string;
  sub: string;
  /** Money: redrawn when the currency switches. */
  money?: boolean;
}

export interface Summary {
  stats: Stat[];
  /** 0..1 — hours delivered when every task has an estimate, tasks otherwise. */
  progress: number;
  /** Whether any task carries money, which is when the ₹/$ switch is offered. */
  hasMoney: boolean;
}

/**
 * The summary for a read-only or client link. Every figure is a sum over what
 * the share shows, and one with nothing behind it — no estimates, no money —
 * is left out rather than drawn as a zero a client would take literally.
 */
export function readSummary(tasks: PublicTask[], now: number, fmt: (inr: number) => string): Summary {
  const done = tasks.filter((t) => t.done);
  const totalMin = tasks.reduce((a, t) => a + (t.estimatedTime ?? 0), 0);
  const doneMin = done.reduce((a, t) => a + (t.estimatedTime ?? 0), 0);
  const total = tasks.reduce((a, t) => a + (t.valueINR ?? 0), 0);
  const doneValue = done.reduce((a, t) => a + (t.valueINR ?? 0), 0);

  const stats: Stat[] = [
    { key: 'progress', label: 'Progress', value: `${done.length} / ${tasks.length}`, sub: 'tasks delivered' },
  ];

  const next = tasks
    .filter((t) => !t.done && t.deadline && !Number.isNaN(new Date(t.deadline).getTime()))
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())[0];
  if (next) {
    const line = dueLine(next, now);
    const when = line?.text.split(' · ')[1];
    stats.push({
      key: 'next',
      label: 'Next deadline',
      value: shortDate(new Date(next.deadline!).getTime(), now),
      sub: when ? `${next.title}, ${when}` : next.title,
    });
  }
  if (totalMin > 0) {
    stats.push({
      key: 'estimate', label: 'Estimate', value: estimateText(totalMin),
      sub: doneMin > 0 ? `${estimateText(doneMin)} delivered` : 'None delivered yet',
    });
  }
  if (total > 0) {
    stats.push({
      key: 'budget', label: 'Budget', value: fmt(total), money: true,
      sub: doneValue > 0 ? `${fmt(doneValue)} delivered` : 'None delivered yet',
    });
  }

  /* Hours only when every task has an estimate: one finished task with none
     would otherwise sit beside "1 / 6 delivered" as an empty bar. */
  const allEstimated = tasks.length > 0 && tasks.every((t) => (t.estimatedTime ?? 0) > 0);
  const progress = allEstimated ? doneMin / totalMin : tasks.length > 0 ? done.length / tasks.length : 0;
  return { stats, progress, hasMoney: total > 0 };
}

/** The summary for an outsourcing link: what is still up for grabs. */
export function workSummary(
  tasks: PublicTask[],
  subs: Record<string, ShareSubmission>,
  now: number,
  fmt: (inr: number) => string,
): Summary {
  const open = tasks.filter((t) => workPhase(t, subs[t.id], []) === 'open');
  const payout = open.reduce((a, t) => a + (t.valueINR ?? 0), 0);
  const stats: Stat[] = [
    { key: 'open', label: 'Open', value: plural(open.length, 'task'), sub: 'First come, first claimed' },
  ];
  if (payout > 0) stats.push({ key: 'payout', label: 'Payouts', value: fmt(payout), sub: 'Paid on approval', money: true });
  const soonest = open
    .filter((t) => t.deadline && !Number.isNaN(new Date(t.deadline).getTime()))
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime())[0];
  if (soonest) {
    stats.push({ key: 'soonest', label: 'Soonest', value: shortDate(new Date(soonest.deadline!).getTime(), now), sub: soonest.title });
  }
  const hasMoney = tasks.some((t) => (t.valueINR ?? 0) > 0);
  return { stats, progress: 0, hasMoney };
}

/** Two initials for an avatar: "Shreekant Brahmbhatt" → "SB", "Priya" → "PR". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
