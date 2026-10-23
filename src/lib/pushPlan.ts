/**
 * What to send right now, and what to remember having sent — BUILD-5.
 *
 * `firingToday` answers *what fires today and when*. This answers the
 * question a sender asks once a minute: **of those, which go out on this
 * knock, which were missed, and which snoozed alert is due back?** Pure, like
 * its neighbour — no clock, no Firebase, no push service — so every rule
 * below is pinned by `pushPlan.test.ts` rather than by waiting for a tablet.
 *
 * THE RULES, ALL SETTLED BY SHREEKANT (2026-09-15 and 2026-09-16)
 * ---------------------------------------------------------------
 * 1. Only tasks starting today fire, at `deadline − estimate`. That is
 *    `firingToday`'s row, taken as it is — this module never works out a
 *    time of its own, so the push, the Notifications screen and the calendar
 *    block are one instant.
 * 2. **Never early.** A row goes out on the first knock at or after its
 *    instant. The cron knocks every minute (his call), so "late" means
 *    seconds, not the fifteen minutes the item was first written with.
 * 3. **A missed one is never re-fired.** A row first seen more than
 *    `LATE_LIMIT_MS` after its instant — the laptop's cron service was down,
 *    or the task was dated into the past — is recorded as missed instead, and
 *    the day's missed rows **collapse into one summary**. The summary carries
 *    one tag, so each new one replaces the last on the device and always
 *    counts the whole day.
 * 4. **One snooze, five minutes, offered once** (`notification.html`). The
 *    returning alert says how much of the block is left and has no second
 *    snooze — the alert already fires at the last possible minute, so a
 *    longer one would be the app agreeing to miss the deadline.
 * 5. **A blocked task still fires**, and says what it is waiting on (his
 *    call). Tapping it lands on `/start/:taskId`, which asks `planStartNow`
 *    and offers the blockers — this module does not decide whether it can
 *    start.
 *
 * WHY THE LOG IS KEYED ON THE INSTANT AS WELL AS THE TASK
 * --------------------------------------------------------
 * `taskId@at`. A task whose deadline is moved later after its alert went out
 * has a new block, and the new start is a new moment to be told about; keyed
 * on the task alone it would stay silent. Moved *earlier* into the past, it
 * is not "missed" — it was already sent today — which is why the missed rule
 * checks the task id across every entry of the day and not just the key.
 *
 * The log is one small document, `users/{uid}/push/log`, pruned to
 * `LOG_KEEP_MS`. It is **not** `data/main`, which is rewritten whole on every
 * task edit under a 1 MB cap; and the owner can read it, which is how the
 * Notifications screen tells *sent* from *missed* (`withDelivery` below).
 */
import { toZonedDayString, zonedParts } from './agent/dates';
import { planStartNow } from './smartStart';
import type { FiringRow } from './firingToday';
import type { Task } from '../store/useStore';
import { alertWhenWords, eventAlertKey, eventLogSubject, type EventAlertRow } from './events/eventAlerts';
import { describeWhen } from './events/events';

/** A row first seen later than this after its instant is missed, not fired. */
export const LATE_LIMIT_MS = 10 * 60_000;
/** The one snooze. */
export const SNOOZE_MS = 5 * 60_000;
/** How long an entry is kept. Long enough to cover yesterday's late rows. */
export const LOG_KEEP_MS = 36 * 60 * 60_000;
/** How many missed tasks a summary names before it says "and N more". */
export const SUMMARY_LINES = 6;

export interface PushLogEntry {
  /** The subject: a task's id, or `event:<id>` for an event's alert (29-2c2). */
  taskId: string;
  /** The fire instant this entry is about — the block's start. */
  at: number;
  /** The task's title when it was logged, so a summary survives the task being deleted. */
  title: string;
  estimateMinutes: number;
  outcome: 'sent' | 'missed';
  /** `sent`: when the alert went out. */
  sentAt?: number;
  /** `missed`: the summary it was first counted in. */
  summaryAt?: number;
  /** `sent` and snoozed: when the last call is due. Set once; never cleared. */
  snoozeUntil?: number;
  /** When the last call went out. */
  lastCallAt?: number;
  /** 29-2c2, an event's alert: the event, and which of its alerts (minutes before). */
  eventId?: string;
  minutesBefore?: number;
}

export interface PushLog {
  entries: Record<string, PushLogEntry>;
}

export const EMPTY_LOG: PushLog = { entries: {} };

export function logKey(taskId: string, at: number): string {
  return `${taskId}@${at}`;
}

/** One button on the notification. Android shows two at most. */
export interface PushAction {
  action: 'start' | 'snooze' | 'replan';
  title: string;
  /** Where tapping it goes. Absent for `snooze`, which the worker handles in place. */
  url?: string;
}

/**
 * Exactly what `public/sw.js` renders. Four fields are ours on Android —
 * small icon, title, body, actions — and the icon is fixed in the worker.
 */
export interface PushMessage {
  kind: 'fire' | 'lastCall' | 'summary' | 'reconnect' | 'event';
  title: string;
  body: string;
  tag: string;
  /** Where tapping the notification itself goes. */
  url: string;
  actions: PushAction[];
  /** Android prints "when" from this, so a late one says so. */
  timestamp: number;
  /** Present on a fire that can still be snoozed: the log key the worker sends back. */
  snoozeKey?: string;
}

export interface PushPlanInput {
  /** `firingToday`'s rows. Their `state` is ignored; only `at` is read against `now`. */
  rows: FiringRow[];
  /** The whole backlog, for the blocked check. */
  backlog: Task[];
  log: PushLog;
  now: number;
  timeZone: string;
  /** 29-2c2: `eventAlertsToday`'s rows, merged like `rows` around midnight. */
  events?: EventAlertRow[];
}

export interface PushPlan {
  messages: PushMessage[];
  /** The log to write back. Always pruned; unchanged entries are carried over. */
  log: PushLog;
  /** Whether anything in the log changed, so an idle knock writes nothing. */
  changed: boolean;
}

/** `45 min`, `1 h`, `1 h 30 min`. */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest === 0 ? `${h} h` : `${h} h ${rest} min`;
}

/** `09:05`, in the user's zone — the server runs in UTC. */
export function clockIn(ms: number, timeZone: string): string {
  const p = zonedParts(new Date(ms), timeZone);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

function startUrl(taskId: string): string {
  return `/start/${encodeURIComponent(taskId)}`;
}

function fireMessage(row: FiringRow, backlog: Task[], timeZone: string): PushMessage {
  const key = logKey(row.task.id, row.at);
  const plan = planStartNow(backlog, row.task.id);
  const due = clockIn(row.dueAt, timeZone);
  const second =
    plan.kind === 'blocked' && plan.blockers.length > 0
      ? `Waiting on ${plan.blockers[0].title}${plan.blockers.length > 1 ? ` and ${plan.blockers.length - 1} more` : ''}.`
      : `${row.projectName ? `${row.projectName} · ` : ''}${formatMinutes(row.estimateMinutes)} allocated. No slack after this.`;
  return {
    kind: 'fire',
    /* The instruction, then the number — never the task name, because the
       title is the one line guaranteed to survive truncation. */
    title: `Start now — ${formatMinutes(row.estimateMinutes)}`,
    body: `${row.task.title} · due ${due}\n${second}`,
    tag: `base-task-${row.task.id}`,
    url: startUrl(row.task.id),
    actions: [
      { action: 'start', title: 'Start', url: startUrl(row.task.id) },
      { action: 'snooze', title: '5 min' },
    ],
    timestamp: row.at,
    snoozeKey: key,
  };
}

function lastCallMessage(row: FiringRow, now: number, timeZone: string): PushMessage {
  /* The snoozed minutes come out of the block: the title says what is left
     rather than repeating the estimate. */
  const left = Math.floor((row.dueAt - now) / 60_000);
  return {
    kind: 'lastCall',
    title: left > 0 ? `Start now — ${formatMinutes(left)} left` : 'Due now',
    body: `${row.task.title} · due ${clockIn(row.dueAt, timeZone)}. Last call.`,
    /* Same tag as the fire, so it replaces it rather than stacking. */
    tag: `base-task-${row.task.id}`,
    url: startUrl(row.task.id),
    actions: [{ action: 'start', title: 'Start', url: startUrl(row.task.id) }],
    timestamp: now,
  };
}

function summaryMessage(missedToday: PushLogEntry[], now: number, timeZone: string): PushMessage {
  const sorted = [...missedToday].sort((a, b) => a.at - b.at || a.taskId.localeCompare(b.taskId));
  const n = sorted.length;
  const unclaimed = sorted.reduce((sum, e) => sum + e.estimateMinutes, 0);
  /* A push payload is capped near 4 KB, and a notification is not a report. */
  const shown = sorted.slice(0, SUMMARY_LINES);
  const lines = shown.map((e) => `${clockIn(e.at, timeZone)}  ${e.title} — ${formatMinutes(e.estimateMinutes)}`);
  if (n > shown.length) lines.push(`and ${n - shown.length} more`);
  return {
    kind: 'summary',
    title: `${n} task${n === 1 ? '' : 's'} started without you`,
    body: [
      `Since ${clockIn(sorted[0].at, timeZone)} — ${formatMinutes(unclaimed)} of allocated time unclaimed.`,
      ...lines,
    ].join('\n'),
    /* One tag for the day's summary: each new one replaces the last. */
    tag: 'base-missed',
    url: '/notifications',
    /* A report, not an alarm — no per-task actions, each of these is past. */
    actions: [{ action: 'replan', title: 'Re-plan today', url: '/' }],
    timestamp: now,
  };
}

/**
 * An event's alert (29-2c2): when it is, then what. "Tomorrow — Mumbai
 * Marathon", "In 30 min — Dentist", "Today — Asha's birthday"; the body says
 * the day and time and the place. Tapping opens the event's sheet over the
 * Dashboard. No snooze: the alert is about a date, not a block of work that
 * has to start, and a later alert of the same event (an hour before, after a
 * day before) is already the second ring. One tag per event, so that later
 * alert replaces this one rather than stacking.
 */
function eventMessage(row: EventAlertRow, timeZone: string): PushMessage {
  const when = describeWhen(row.occurrence, row.allDay, new Date(row.at), timeZone);
  return {
    kind: 'event',
    title: `${alertWhenWords(row.minutes, row.allDay)} — ${row.event.title}`,
    body: row.event.location ? `${when} · ${row.event.location}` : when,
    tag: `base-event-${row.event.id}`,
    url: `/dashboard?event=${encodeURIComponent(row.event.id)}`,
    actions: [],
    timestamp: row.at,
  };
}

/**
 * "BASE lost Google Calendar, tap to reconnect" — BUILD-15.
 *
 * The one alert here that is not about a task. It exists because the failure
 * it reports is invisible from inside the app: Google ends the grant, the
 * calendar quietly stops syncing, and the only sign is a nav dot he finds days
 * later — by which time a deleted task still has its event and a finished
 * repeat has popped a reminder every morning since.
 *
 * Not planned by `planPushes` and deliberately outside the push log: it is not
 * a task, has no `taskId`, and is deduplicated by its own flag on the settings
 * document (`googleReconnectPushedAt`) so it is said once per breakage rather
 * than once a minute until he fixes it. `normal` urgency and a long TTL —
 * this can wait for the screen to come on, unlike a task about to start.
 */
export function reconnectMessage(now: number): PushMessage {
  return {
    kind: 'reconnect',
    title: 'BASE lost Google Calendar',
    body: 'Deadlines, reminders and repeats have stopped syncing. Tap to reconnect Google.',
    tag: 'base-reconnect',
    url: '/notifications',
    actions: [],
    timestamp: now,
  };
}

/**
 * The knock. Returns what to send and the log to write back; the caller
 * writes the log **before** sending, inside a transaction, so two knocks that
 * overlap cannot both send the same alert.
 */
export function planPushes({ rows, backlog, log, now, timeZone, events = [] }: PushPlanInput): PushPlan {
  const entries: Record<string, PushLogEntry> = {};
  let changed = false;
  for (const [key, entry] of Object.entries(log.entries)) {
    if (now - entry.at <= LOG_KEEP_MS) entries[key] = { ...entry };
    else changed = true;
  }

  const today = toZonedDayString(new Date(now), timeZone);
  const sentTaskIdsToday = new Set(
    Object.values(entries)
      .filter((e) => e.outcome === 'sent' && toZonedDayString(new Date(e.at), timeZone) === today)
      .map((e) => e.taskId),
  );

  const messages: PushMessage[] = [];
  let newlyMissed = false;

  /* De-duplicated by key: the caller merges two days' rows around midnight. */
  const seen = new Set<string>();
  const ordered = [...rows].sort((a, b) => a.at - b.at || a.task.id.localeCompare(b.task.id));

  for (const row of ordered) {
    const key = logKey(row.task.id, row.at);
    if (seen.has(key)) continue;
    seen.add(key);

    const entry = entries[key];

    if (entry) {
      /* Already handled. The only thing left to do for it is the last call. */
      if (
        entry.outcome === 'sent' &&
        entry.snoozeUntil !== undefined &&
        entry.lastCallAt === undefined &&
        entry.snoozeUntil <= now
      ) {
        messages.push(lastCallMessage(row, now, timeZone));
        entries[key] = { ...entry, lastCallAt: now };
        changed = true;
      }
      continue;
    }

    if (row.at > now) continue; // Never early.

    const base = {
      taskId: row.task.id,
      at: row.at,
      title: row.task.title,
      estimateMinutes: row.estimateMinutes,
    };

    if (now - row.at <= LATE_LIMIT_MS) {
      messages.push(fireMessage(row, backlog, timeZone));
      entries[key] = { ...base, outcome: 'sent', sentAt: now };
      sentTaskIdsToday.add(row.task.id);
      changed = true;
      continue;
    }

    /* Too late to be an alarm. A task already told about today — its
       deadline has since moved — is not "missed", it is simply done with. */
    if (sentTaskIdsToday.has(row.task.id)) continue;
    entries[key] = { ...base, outcome: 'missed', summaryAt: now };
    newlyMissed = true;
    changed = true;
  }

  /* 29-2c2, the events' alerts, on the same three rules: never early, sent on
     the first knock after, and one first seen past the late limit is missed,
     never sent late. A missed one is logged, so the screen says so, but is
     not in the summary, which counts work that started without him. */
  const alertOf = (eventId: string | undefined, minutes: number | undefined) => `${eventId}|${minutes}`;
  const sentEventAlertsToday = new Set(
    Object.values(entries)
      .filter((e) => e.eventId && e.outcome === 'sent' && toZonedDayString(new Date(e.at), timeZone) === today)
      .map((e) => alertOf(e.eventId, e.minutesBefore)),
  );
  const orderedEvents = [...events].sort((a, b) => a.at - b.at || a.event.id.localeCompare(b.event.id));
  for (const row of orderedEvents) {
    const key = eventAlertKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    if (entries[key] || row.at > now) continue;
    const base = {
      taskId: eventLogSubject(row.event.id),
      eventId: row.event.id,
      minutesBefore: row.minutes,
      at: row.at,
      title: row.event.title,
      estimateMinutes: 0,
    };
    if (now - row.at <= LATE_LIMIT_MS) {
      messages.push(eventMessage(row, timeZone));
      entries[key] = { ...base, outcome: 'sent', sentAt: now };
      sentEventAlertsToday.add(alertOf(row.event.id, row.minutes));
      changed = true;
      continue;
    }
    /* The event was moved after this alert went out: done with, not missed. */
    if (sentEventAlertsToday.has(alertOf(row.event.id, row.minutes))) continue;
    entries[key] = { ...base, outcome: 'missed' };
    changed = true;
  }

  if (newlyMissed) {
    const missedToday = Object.values(entries).filter(
      (e) => !e.eventId && e.outcome === 'missed' && toZonedDayString(new Date(e.at), timeZone) === today,
    );
    if (missedToday.length > 0) messages.push(summaryMessage(missedToday, now, timeZone));
  }

  return { messages, log: { entries }, changed };
}

/**
 * Marks one sent alert as snoozed. Returns `null` when there is nothing to
 * snooze — an unknown key, a missed one, or one already snoozed: the snooze
 * is offered once, and a second tap on a stale notification must not move it.
 */
export function applySnooze(log: PushLog, key: string, now: number): PushLog | null {
  const entry = log.entries[key];
  if (!entry || entry.outcome !== 'sent' || entry.snoozeUntil !== undefined) return null;
  return { entries: { ...log.entries, [key]: { ...entry, snoozeUntil: now + SNOOZE_MS } } };
}

/**
 * The Notifications screen's view of the same log: a past row is `sent` or
 * `missed` according to what actually happened, and a snoozed one is
 * `snoozed` until its last call goes out.
 *
 * With no log — the device has never been told about, or the read has not
 * landed — the rows are returned untouched, which is DESIGN-2's screen
 * exactly: everything past reads as missed.
 */
export function withDelivery(rows: FiringRow[], log: PushLog | null, now: number): FiringRow[] {
  if (!log) return rows;
  const out = rows.map((row) => {
    const entry = log.entries[logKey(row.task.id, row.at)];
    if (!entry) {
      /* Past, not yet seen by a knock, and still inside the limit: it is
         about to go out, so it is still to come rather than missed. */
      if (row.at <= now && now - row.at <= LATE_LIMIT_MS) return { ...row, state: 'queued' as const };
      return row;
    }
    if (entry.outcome === 'missed') return { ...row, state: 'missed' as const, delivery: entry };
    if (entry.snoozeUntil !== undefined && entry.lastCallAt === undefined) {
      return { ...row, state: 'snoozed' as const, delivery: entry };
    }
    return { ...row, state: 'sent' as const, delivery: entry };
  });

  const nextIndex = out.findIndex((r) => r.state === 'queued' || r.state === 'next');
  return out.map((r, i) => {
    if (r.state !== 'queued' && r.state !== 'next') return r;
    return { ...r, state: i === nextIndex ? ('next' as const) : ('queued' as const) };
  });
}
