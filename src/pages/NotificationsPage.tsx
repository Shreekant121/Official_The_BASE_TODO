/**
 * Notifications — REBUILT (DESIGN-2) against the v3
 * `design-system/screens/notifications.html`.
 *
 * WHAT CHANGED, AND WHY IT IS NOT A RESTYLE
 * -----------------------------------------------------
 * v3 did not rename the old mockup, it **redesigned the screen around what
 * BUILD-5 actually fires**. UI-25's reconciliation was faithful to a drawing
 * of a model Shreekant had already settled against: a timeline of scheduled
 * reminders stretching days ahead, each one tunable with a lead-time menu (5 /
 * 10 / 30 / 60 minutes / 1 day before).
 *
 * The settled model is one rule: **only tasks starting today, at
 * `deadline − estimate`** — the moment the work has to begin. So the screen
 * now opens on *what is going to fire today*, each row carrying the
 * arithmetic that produced its time, and **the lead-time menu is gone as a
 * concept rather than moved**. The rail states the rule and locks it:
 * *a lead time you could tune is just a second deadline.*
 *
 * THE OLD SCREEN WAS PRINTING A TIME NOTHING HAPPENED AT
 * -----------------------------------------------------
 * Worth recording, because it is the strongest argument for deriving rather
 * than mirroring. A `NotificationRecord`'s `sendAt` is written as
 * `deadline − leadTime` (`lib/notificationSync.ts:395`). The Google Calendar
 * event it stands for is the *work block*, `deadline − estimate → deadline`,
 * and its popup override fires `leadTime` minutes before that block **starts**
 * — Google's overrides are relative to an event's start. For a 90-minute task
 * due at 18:00 with the default 30-minute lead: the block is 16:30–18:00,
 * Google pings at 16:00, and the old screen printed **17:30**. Three numbers
 * for one event, and the one on screen was the only one nothing used.
 *
 * `lib/firingToday.ts` ends that by taking the time from
 * `deadlineBlockFor().startMs` — the block's own start — so the row and the
 * calendar cannot drift apart. It is pure and it is pinned by
 * `firingToday.test.ts`, including a test that asserts the row's instant *is*
 * the block's, rather than merely equal to it today.
 *
 * TWO CHANNELS, TWO TIMES, BOTH STATED — HIS CALL, 2026-09-16
 * -----------------------------------------------------
 * Put to him: the screen now says everything fires at `deadline − estimate`,
 * but Google keeps its own 30-minute head start on top of that. He chose to
 * **leave the sending exactly as it is and say so on the screen** rather than
 * move the calendar ping to the block's start. So the Delivery card gives
 * each channel one line of truth and the Google line prints the real head
 * start read from the real setting — it is not hardcoded, and it is not
 * silently dropped. The account-wide number now has no control on this screen
 * by design; a task's own Reminder field still overrides it from the task
 * sheet.
 *
 * SENT AND SNOOZED ARRIVED WITH BUILD-5
 * -------------------------------------
 * DESIGN-2 drew `next`, `queued` and `missed` and left snoozed out, because
 * nothing could snooze yet. BUILD-5 built the sender and its one five-minute
 * snooze, and the sender keeps a log (`users/{uid}/push/log`). This screen
 * reads it and `withDelivery` (`lib/pushPlan.ts`) re-labels the rows: a past
 * row is `sent` or `missed` according to what actually happened, a snoozed
 * one says when its last call comes back, and a missed one names the summary
 * it was counted in. With no log the screen is DESIGN-2's, unchanged.
 *
 * WHAT IS UNCHANGED — still the part that matters
 * -----------------------------------------------------
 * Every call out of this page is where it was. The four Firestore
 * subscriptions, `subscribeDiagnostics`, the whole `diagnose()` ladder, and
 * `handleReconnect` — including the reason it goes straight to consent for a
 * scope problem rather than asking for another token — are what they were. So
 * is `handleDismiss`, which is the one place on this screen that writes:
 * dismissing a row is not "hide it", it cancels the real Google Calendar
 * alert behind it, through `updateBacklogTask` for a deadline and
 * `deleteReminder` for a standalone reminder. A successful reconnect still
 * clears `reminderSyncIssue` and `notificationsNeedReconnect` — what the
 * app-wide banner and the nav's amber dot read — and still re-pushes pending
 * deadline reminders through `scheduleReconcile`.
 *
 * THE THREE HONEST PARTS, WHICH ARE LOAD-BEARING
 * -----------------------------------------------------
 * - **The Doze note.** Android decides when to deliver; the screen says so
 *   rather than letting it be discovered as a bug. Not a tooltip — a block
 *   under the timeline, with the battery-exemption steps in words. The button
 *   cannot open Android's settings (no web page can), so it reveals the taps
 *   instead of pretending to perform them — the same call DESIGN-1 made about
 *   the dock screen's *"Open sound & permissions"*.
 * - **The blocked-permission card, written for Brave.** Every document in
 *   this repo that says Chrome is wrong about his tablet. One card covers
 *   both reachable states: never asked (the button works) and already refused
 *   (it cannot, and the three taps are the answer).
 * - **Delivery: two channels, one line of truth each.** Push and the calendar
 *   block are the two ways a task reaches him and the screen does not blur
 *   them together.
 *
 * WHERE WE STILL DIVERGE FROM THE DRAWING
 * -----------------------------------------------------
 * - **No "Mark all read" and no unread dots.** `NotificationRecord` has no
 *   read state (`lib/notifications.ts`); adding one is a Firestore write and a
 *   feature, not a reconciliation. Unchanged from UI-25.
 * - **No "Silent in focus" / "Missed summary" switches.** There is no setting
 *   behind either, and a switch that stores nothing is furniture.
 * - **No state harness in the footer.** The mockup's segmented Allowed /
 *   Blocked control is a spec affordance for reading a drawing. The honest
 *   version is `lib/devNotificationsFixture.ts`, dev-only and folded out of
 *   the shipped bundle — the same decision DESIGN-1 made about `voice.html`'s
 *   footer.
 * - **Diagnostics stays**, at the foot of the left column. The mockup has no
 *   equivalent because its Google connection cannot fail; ours can, and this
 *   log is the only thing that says why.
 * - **The quick-reminder sheet stays ours.** It writes a real standalone
 *   reminder. Those never appear in *Firing today* — they have no task behind
 *   them and so no `due − estimate` to show, and the item is explicit that a
 *   row with no real task behind it does not belong on this screen. They
 *   reach History like everything else.
 * - **The rule line under the rows** says *"tapping it opens the task in
 *   Focus with the timer already running"* again. DESIGN-2 held that sentence
 *   back until it was true; BUILD-5's `/start/:taskId` made it true. The row
 *   menu's *"Start now in Focus"* did not exist either until
 *   **BUILD-2**, which added it. *"Open the task"* became *"Open {project}"*
 *   because no route deep-links to one task — see `FireRow`.
 * - **Rows beyond today are not listed.** That is the model, not an omission:
 *   every dated task already draws a calendar block, and the Delivery card is
 *   the way to the calendar that holds them.
 *
 * `scripts/screenshots.ts` waits on `Firing today` for this screen — it waited
 * on `Default lead time`, which this item deleted.
 *
 * V3 (V3-7) — `Notifications.dc.html`
 * -----------------------------------------------------
 * **His call (2026-09-24): keep today's page, in the V3 look.** The design
 * draws an inbox — unread counts, All / Reminders / Deadlines / Atlas
 * filters, a detail pane with Snooze 15 min and Mark all read — and every
 * piece of it is a feature this screen does not have, for the reasons in
 * "Where we still diverge" above. So only the material moved: the default
 * export is the scope and `NotificationsScreen` sits inside it; the rail
 * carries the mark; Back is round glass; New reminder and Create reminder
 * are gel; and the labels read `--kicker-transform`, so "Firing today",
 * "Missed", "Now" and the countdown pill are sentence case, his second call
 * that day. The diagnostics log's `INFO` / `WARN` / `ERROR` keep their
 * capitals: that is a machine's log line, not a label. BUILD-15's banner is
 * app-wide (`ReminderSyncBanner`, from `App.tsx`) and is not this screen's
 * to place; its Reconnect lands here, on the Delivery card, as before.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Card, Dialog, FieldLabel, Icon, IconButton, Input, Kicker, MiniNav, MorphMenu,
  NotificationCard, StatusPill, Switch, Textarea, V3Scope, Well,
  useMedia, WIDE, type IconName, type NotificationTone, type StatusName,
} from '../ui';
import { RailMark } from '../components/BrandMark';
import { useNavModel } from '../components/navModel';
import { useAuth } from '../contexts/AuthContext';
import { useStore } from '../store/useStore';
import { Z } from '../lib/zLayers';
import { useOverlayDismiss } from '../lib/useOverlayDismiss';
import { resolveUserTimeZone } from '../lib/agent/dates';
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  subscribeNotificationSettings,
  updateNotificationSettings,
  subscribeNotificationHistory,
  dismissNotification,
  type NotificationSettings,
  type NotificationRecord,
} from '../lib/notifications';
import { cancelTaskDeadline, scheduleReconcile } from '../lib/notificationSync';
import { subscribeReminders, createReminder, deleteReminder, type Reminder } from '../lib/reminders';
import { NOTIFICATION_CALENDAR_SUMMARY, tokenHasCalendarScope, tokenHasNotificationScope } from '../lib/googleCalendar';
import { useUIStore } from '../store/useUIStore';
import { firingToday, stillToFire, type FiringRow } from '../lib/firingToday';
import { useStartNowItems } from '../components/task-fields/startNowMenu';
import { enablePush, isPushEnabled, pushConfigured, pushSupported, subscribePushLog } from '../lib/push';
import { withDelivery, type PushLog } from '../lib/pushPlan';
import { devNotificationsFixture, devFiringTasks, devPushLog } from '../lib/devNotificationsFixture';
import {
  subscribeDiagnostics,
  clearDiagnostics,
  formatDiagnosticsForCopy,
  type DiagEntry,
} from '../lib/googleDiagnostics';

function timeAgoOrAt(ms: number): string {
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  if (mins < 60) return diff >= 0 ? `in ${mins}m` : `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return diff >= 0 ? `in ${hours}h` : `${hours}h ago`;
  return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** The unabbreviated reading, for the expanded half of a history card. */
function fullWhen(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

/** `17:15`, the fire row's leading column and the Now line. 24-hour, so a column of them reads as a column. */
function clockAt(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** `in 35 min` / `in 2 h 10 min` — the pill on the next row, and only on that row. */
function countdownTo(ms: number, now: number): string {
  const mins = Math.max(0, Math.round((ms - now) / 60000));
  if (mins < 60) return `In ${mins} min`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest === 0 ? `In ${hours} h` : `In ${hours} h ${rest} min`;
}

const TYPE_LABEL: Record<NotificationRecord['type'], string> = {
  deadline: 'Deadline',
  reminder: 'Reminder',
};

const TYPE_ICON: Record<NotificationRecord['type'], IconName> = {
  deadline: 'calendar-clock',
  reminder: 'alarm-clock',
};

/**
 * A record's status in the design system's own vocabulary.
 *
 * `StatusPill`'s seven states are semantic, not decorative, so these are
 * chosen by meaning rather than by matching the old colours. A failed sync is
 * `overrun`, the one status besides `running` that ripples, because it is a
 * live problem and not a historical note. `passed` is deliberately not
 * `accent`: `--status-done` is its own green, and emerald on this screen
 * means *live*, which a fired alert is not.
 */
const STATUS_LOOK: Record<NotificationRecord['status'], { pill: StatusName; label: string; tone: NotificationTone }> = {
  scheduled: { pill: 'queued',   label: 'Scheduled',      tone: 'queued' },
  passed:    { pill: 'done',     label: 'Passed',         tone: 'done' },
  cancelled: { pill: 'archived', label: 'Cancelled',      tone: 'neutral' },
  failed:    { pill: 'overrun',  label: 'Failed to sync', tone: 'overrun' },
};

/** A label's case: capitals outside a V3 scope, sentence case inside (V3-7). */
const KICKER_CASE = 'var(--kicker-transform)' as CSSProperties['textTransform'];

/** Diagnostics level → the token that carries it. Info is deliberately hueless. */
const DIAG_LOOK: Record<DiagEntry['level'], string> = {
  info: 'var(--fg-4)',
  warn: 'var(--status-review)',
  error: 'var(--status-overrun)',
};

/* ------------------------------------------------------------------ */
/* Firing today — the point of the screen                              */

/**
 * One alert that will fire today, or has.
 *
 * Level-1 glass and a hairline rim rather than a Card: a row you read, not a
 * surface you act on. `next` is the only row that carries accent and a glow —
 * the mockup's emerald ration, spent on the one thing the screen is for.
 *
 * **The second line is the arithmetic**, `18:00 − 45 min`, so the fire time is
 * never a mystery and never has to be trusted. Every number in it comes from
 * `firingToday`, which takes them from the task's own calendar block.
 */
function FireRow({
  row,
  now,
  muted,
  delay,
  onOpenProject,
  onSkip,
}: {
  row: FiringRow;
  now: number;
  muted: boolean;
  delay: number;
  onOpenProject: (() => void) | null;
  onSkip: () => void;
}) {
  const [hover, setHover] = useState(false);
  const missed = row.state === 'missed';
  const sent = row.state === 'sent';
  const snoozed = row.state === 'snoozed';
  /* Gone by: dimmed, and nothing left to fire. */
  const past = missed || sent;
  const next = row.state === 'next';
  /* BUILD-2's verb, from the same hook as the project rows. It reads the
     backlog, so a row the dev fixture invented has nothing to start and the
     item is simply absent. */
  const startNow = useStartNowItems(row.task.id);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', minHeight: 76,
        padding: 'var(--sp-4) var(--sp-6)', borderRadius: 'var(--r-lg)', boxSizing: 'border-box',
        backgroundImage: next || hover ? 'var(--glass-fill-2)' : 'var(--glass-fill-1)',
        boxShadow: next
          ? 'var(--glass-rim-2), var(--glass-cast-2), var(--glow-accent-sm)'
          : hover ? 'var(--glass-rim-2), var(--glass-cast-1)' : 'var(--glass-rim-1)',
        opacity: muted || past ? 0.5 : 1,
        transform: hover && !past ? 'translateY(-1px)' : 'none',
        transition: 'var(--t-hover)',
        animation: 'var(--kf-condense) var(--dur-slow) var(--ease-glass) both',
        animationDelay: `${delay}ms`,
      }}
    >
      <div style={{ display: 'grid', gap: 1, width: 58, flex: '0 0 auto' }}>
        <span
          style={{
            font: 'var(--type-numeric)', color: next ? 'var(--accent)' : 'var(--fg-1)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {clockAt(row.at)}
        </span>
        <span style={{ font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)', color: 'var(--fg-4)' }}>
          fires
        </span>
      </div>

      <span
        aria-hidden="true"
        style={{ width: 1, alignSelf: 'stretch', margin: 'var(--sp-3) 0', background: 'var(--line-faint)', flex: '0 0 auto' }}
      />

      <div style={{ display: 'grid', gap: 3, flex: 1, minWidth: 0 }}>
        <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {row.task.title}
        </span>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-3)', minWidth: 0 }}>
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {row.projectName ?? row.listName}
          </span>
          <span aria-hidden="true" style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>·</span>
          {/* The arithmetic, so the fire time is never a mystery. */}
          <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-2xs)', color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>
            {clockAt(row.dueAt)} − {row.estimateMinutes} min
          </span>
        </span>
        {missed && (
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
            {row.delivery?.summaryAt !== undefined
              ? `Not re-fired. Counted in the ${clockAt(row.delivery.summaryAt)} summary.`
              : 'Not re-fired. A missed alert is never sent twice.'}
          </span>
        )}
        {sent && row.delivery?.sentAt !== undefined && (
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
            {row.delivery.lastCallAt !== undefined
              ? `Sent at ${clockAt(row.delivery.sentAt)}, last call at ${clockAt(row.delivery.lastCallAt)}.`
              : `Sent at ${clockAt(row.delivery.sentAt)}.`}
          </span>
        )}
        {snoozed && row.delivery?.snoozeUntil !== undefined && (
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
            Snoozed once. Back at {clockAt(row.delivery.snoozeUntil)} as the last call.
          </span>
        )}
      </div>

      {next && (
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 var(--sp-4)',
            borderRadius: 'var(--r-pill)', backgroundImage: 'var(--glass-tint-accent)',
            boxShadow: 'var(--glass-rim-2), var(--glow-accent-sm)', color: 'oklch(0.93 0.07 162)',
            font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)', textTransform: KICKER_CASE,
            whiteSpace: 'nowrap', flex: '0 0 auto',
          }}
        >
          {countdownTo(row.at, now)}
        </span>
      )}
      {(past || snoozed) && (
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', height: 26, padding: '0 var(--sp-4)',
            borderRadius: 'var(--r-pill)',
            /* Amber for the one row still owed an alert; the gone-by pills stay quiet. */
            backgroundImage: snoozed ? 'var(--glass-tint-amber)' : 'var(--glass-fill-1)',
            boxShadow: snoozed ? 'var(--glass-rim-2)' : 'var(--glass-rim-1)',
            color: snoozed ? 'var(--status-review)' : 'var(--fg-4)',
            font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)', textTransform: KICKER_CASE,
            whiteSpace: 'nowrap', flex: '0 0 auto',
          }}
        >
          {missed ? 'Missed' : sent ? 'Sent' : 'Snoozed'}
        </span>
      )}

      {!missed && (
        <MorphMenu
          align="end"
          width={236}
          /* Portalled since V3-7. In flow, the panel opened UNDER the rows
             below it — each row's condense entrance leaves it a stacking
             context of its own, painted after this one — so the menu's items
             were half-hidden behind the next alert. The board's fix, for the
             same kind of trap (MorphMenu's port note 4). */
          portal
          zIndex={Z.dropdown}
          trigger={
            <IconButton label={`Options for ${row.task.title}`} variant="ghost" size="sm">
              <Icon name="ellipsis" size={16} />
            </IconButton>
          }
          /* The mockup's three. **"Start now in Focus" is BUILD-2's
             `useStartNowItems`**, not a `setTasks([task])` here: its whole
             design is the blocked case, where it offers the blockers instead,
             and it asks before replacing a running session. It is labelled
             "Start now", as on the project rows — one verb, one name.
             "Open the task" is not built: no route in this app deep links to
             a single task, so the honest version reaches the board it is on,
             and is absent for a task in a bare list that has no board. */
          items={[
            ...startNow,
            /* A blocked row's offers sit under their own section label, so
               the project link needs a rule to stop reading as one of them. */
            ...(onOpenProject && startNow.some((it) => it.section) ? [{ divider: true }] : []),
            ...(onOpenProject
              ? [{
                  value: 'project',
                  label: `Open ${row.projectName}`,
                  icon: <Icon name="folder-open" size={16} />,
                  onSelect: onOpenProject,
                }]
              : []),
            /* A sent row has nothing left to fire, so there is nothing to skip. */
            ...(!sent && (onOpenProject || startNow.length > 0) ? [{ divider: true }] : []),
            ...(sent ? [] : [{
              value: 'skip',
              label: 'Do not fire today',
              icon: <Icon name="bell-off" size={16} />,
              tone: 'danger' as const,
              /* Destructive items arm in place — MorphMenu's own convention,
                 and this one really does write: it sets the task's reminder to
                 none, which is the same field `handleDismiss` clears. */
              confirm: {
                label: `Do not fire for ${row.task.title}?`,
                hint: 'The calendar block stays. Only the alert is switched off.',
                action: 'Do not fire',
                onConfirm: onSkip,
              },
            }]),
          ]}
        />
      )}
    </div>
  );
}

/** Where the clock is, between the rows that have fired and the rows that have not. */
function NowLine({ at }: { at: number }) {
  return (
    <div aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', padding: 'var(--sp-2)' }}>
      <span
        style={{
          font: 'var(--type-numeric)', fontSize: 'var(--text-2xs)', color: 'var(--accent)',
          width: 58, flex: '0 0 auto', fontVariantNumeric: 'tabular-nums',
        }}
      >
        {clockAt(at)}
      </span>
      <span
        style={{
          width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)',
          boxShadow: 'var(--glow-accent-sm)', flex: '0 0 auto',
          animation: 'var(--kf-pulse) 2.4s var(--ease-glass) infinite',
        }}
      />
      <span style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--accent-hairline), transparent)' }} />
      <span
        style={{
          font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
          textTransform: KICKER_CASE, color: 'var(--accent)',
        }}
      >
        Now
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The honest limit. Stated, not discovered.                           */

/**
 * Android may hold a notification back, and the screen says so.
 *
 * The item is explicit that this must not be softened into a tooltip, so it
 * is a block under the timeline. The button does the half that works: no web
 * page can open Android's battery settings, so rather than pretending to, it
 * reveals the taps.
 */
function DozeNote() {
  const [showSteps, setShowSteps] = useState(false);
  const STEPS = [
    'Open Android Settings, then Apps, then Brave.',
    'Tap Battery.',
    'Choose Unrestricted.',
  ];

  return (
    <Well pad="var(--sp-6)">
      <div style={{ display: 'flex', gap: 'var(--sp-5)', alignItems: 'flex-start' }}>
        <span aria-hidden="true" style={{ display: 'flex', color: 'var(--fg-3)', flex: '0 0 auto', marginTop: 2 }}>
          <Icon name="moon" size={18} />
        </span>
        <div style={{ display: 'grid', gap: 'var(--sp-3)', minWidth: 0 }}>
          <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)' }}>These times are when BASE asks</span>
          <p style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty', maxWidth: '62ch' }}>
            Android decides when to deliver. While the tablet is dozing, a 17:15 alert can land at 17:20, or
            not until you wake the screen. Nothing else shifts: the deadline, the estimate and the timer are
            unaffected, and anything that arrives late is reported here instead of re-fired.
          </p>
          <p style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty', maxWidth: '62ch' }}>
            Exempting Brave from battery optimisation makes late delivery rare. It cannot make it impossible.
          </p>
          <span style={{ display: 'flex', marginTop: 'var(--sp-2)' }}>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={showSteps}
              iconLeft={<Icon name="battery-charging" size={16} />}
              onClick={() => setShowSteps((v) => !v)}
            >
              How to exempt Brave
            </Button>
          </span>
          {showSteps && (
            <div style={{ display: 'grid', gap: 'var(--sp-4)', paddingTop: 'var(--sp-3)' }}>
              {STEPS.map((s, i) => (
                <div key={s} style={{ display: 'flex', gap: 'var(--sp-4)', alignItems: 'baseline', minWidth: 0 }}>
                  <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-2xs)', color: 'var(--accent)', flex: '0 0 auto' }}>
                    {`0${i + 1}`}
                  </span>
                  <span style={{ font: 'var(--type-caption)', color: 'var(--fg-2)', textWrap: 'pretty' }}>{s}</span>
                </div>
              ))}
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
                This is a setting on the tablet itself — BASE cannot open it for you.
              </span>
            </div>
          )}
        </div>
      </div>
    </Well>
  );
}

/* ------------------------------------------------------------------ */
/* Permission off in the browser. The tablet runs Brave.               */

/**
 * One card for both states the browser can be in, because the copy that
 * answers one answers the other.
 *
 * `off` means the prompt has never been spent and the button works. `blocked`
 * means it has been refused, a refusal is remembered for the origin, and **no
 * code can ask again** — so the three taps are the whole answer and the
 * button is there only to say plainly that it will not help.
 */
function BlockedCard({
  state,
  busy,
  onAllow,
  error,
}: {
  state: 'off' | 'blocked' | 'unavailable';
  busy: boolean;
  onAllow: () => void;
  error: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const STEPS = [
    'Tap the lock icon to the left of the address bar.',
    'Set Notifications to Allow.',
    'Reload this page.',
  ];

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText('brave://settings/content/notifications');
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const headline =
    state === 'unavailable'
      ? 'This browser cannot deliver notifications'
      : state === 'blocked'
        ? 'Notifications are switched off in Brave'
        : 'Notifications are not switched on yet';

  const detail =
    state === 'unavailable'
      ? 'Nothing reaches the lock screen here. The schedule below still runs inside the app.'
      : !pushConfigured()
        ? 'The notification keys are not set on the server yet. The schedule below still runs inside the app.'
        : 'Nothing reaches the lock screen. The schedule below still runs inside the app.';

  return (
    <Card style={{ boxShadow: 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-3)' }}>
      <div style={{ display: 'grid', gap: 'var(--sp-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', minWidth: 0 }}>
          <span
            aria-hidden="true"
            style={{
              display: 'grid', placeItems: 'center', width: 44, height: 44, flex: '0 0 auto', borderRadius: '50%',
              backgroundImage: 'var(--glass-tint-amber)', boxShadow: 'var(--glass-rim-2)', color: 'var(--status-review)',
            }}
          >
            <Icon name="bell-off" size={20} />
          </span>
          <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
            <h2 style={{ font: 'var(--type-title)', letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)' }}>
              {headline}
            </h2>
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
              {detail}
            </span>
          </div>
        </div>

        {/* **The button is absent once Brave has said no, and that is the
            point.** A denial is remembered for the origin and
            `Notification.requestPermission()` then resolves `denied` without
            ever showing a prompt — so a button here would do nothing at all,
            visibly, every time. The mockup draws it in both states because a
            drawing has no browser behind it; this is the same call DESIGN-1
            made about `voice.html`'s *"Open sound & permissions"*. What
            replaces it is the three taps below, which are the whole answer. */}
        {state === 'off' && pushConfigured() && (
          <Button
            variant="frost"
            size="lg"
            block
            loading={busy}
            iconLeft={<Icon name="bell" size={18} />}
            onClick={onAllow}
          >
            Allow notifications
          </Button>
        )}

        {error && (
          <Well
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)',
              backgroundImage: 'var(--glass-tint-rose)', boxShadow: 'var(--glass-rim-1)',
            }}
          >
            <span aria-hidden="true" style={{ display: 'flex', flex: '0 0 auto', marginTop: 1, color: 'var(--status-overrun)' }}>
              <Icon name="x-circle" size={16} />
            </span>
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-2)', textWrap: 'pretty', overflowWrap: 'anywhere' }}>
              {error}
            </span>
          </Well>
        )}

        {state !== 'unavailable' && (
          <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
              {state === 'blocked'
                ? 'Brave has already been told no, so the prompt will not appear again. Set it by hand:'
                : 'If Brave has already been told no, the prompt will not appear again. Set it by hand:'}
            </span>
            <Well pad="var(--sp-5) var(--sp-6)">
              <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
                {STEPS.map((s, i) => (
                  <div key={s} style={{ display: 'flex', gap: 'var(--sp-4)', alignItems: 'baseline', minWidth: 0 }}>
                    <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-2xs)', color: 'var(--accent)', flex: '0 0 auto' }}>
                      {`0${i + 1}`}
                    </span>
                    <span style={{ font: 'var(--type-caption)', color: 'var(--fg-2)', textWrap: 'pretty' }}>{s}</span>
                  </div>
                ))}
                <div aria-hidden="true" style={{ height: 1, background: 'var(--line-faint)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minWidth: 0 }}>
                  <span
                    style={{
                      font: 'var(--type-numeric)', fontSize: 'var(--text-2xs)', color: 'var(--fg-3)',
                      flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}
                  >
                    brave://settings/content/notifications
                  </span>
                  <IconButton
                    label="Copy the Brave settings path"
                    title="Copy the Brave settings path"
                    variant="ghost"
                    size="sm"
                    onClick={() => { void copyPath(); }}
                  >
                    <Icon name={copied ? 'check' : 'copy'} size={16} />
                  </IconButton>
                </div>
              </div>
            </Well>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Quick reminder                                                      */

/**
 * A standalone reminder, not tied to a task or a focus session.
 *
 * Built on `Dialog`. It is mounted permanently by the page and only its `open`
 * prop moves, which is what lets the sheet play its own dissolve — `Dialog`
 * holds itself in the DOM for one `--dur-base` after closing. The fields reset
 * on open as a render-time adjustment rather than in an effect, the same
 * pattern `CreateProjectModal` uses and for the same reason: an effect would
 * flash the previous reminder's text for a paint.
 */
function QuickReminderModal({
  isOpen,
  onClose,
  onCreate,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (input: { title: string; notes?: string; remindAt: string }) => void;
}) {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [remindAt, setRemindAt] = useState('');

  useOverlayDismiss(isOpen, onClose);

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setTitle('');
      setNotes('');
      setRemindAt('');
    }
  }

  const valid = title.trim().length > 0 && remindAt.length > 0;

  const handleCreate = () => {
    if (!valid) return;
    onCreate({ title: title.trim(), notes: notes.trim() || undefined, remindAt });
    setTitle('');
    setNotes('');
    setRemindAt('');
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      width={520}
      label="Quick reminder"
      /* Escape is `useOverlayDismiss`'s above, which answers only for the
         topmost overlay. See Dialog's port note 2. */
      closeOnEscape={false}
      zIndex={Z.modal}
      style={{ gap: 'var(--sp-8)' }}
    >
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-5)' }}>
        <span
          aria-hidden="true"
          style={{
            display: 'grid', placeItems: 'center', width: 44, height: 44, flex: '0 0 auto',
            borderRadius: '50%', backgroundImage: 'var(--glass-tint-violet)',
            boxShadow: 'var(--glass-rim-2)', color: 'var(--hue-violet)',
          }}
        >
          <Icon name="alarm-clock" size={20} />
        </span>
        <div style={{ display: 'grid', gap: 'var(--sp-2)', flex: 1, minWidth: 0 }}>
          <h2
            style={{
              font: 'var(--type-title)', fontSize: 'var(--text-xl)',
              letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)',
            }}
          >
            Quick reminder
          </h2>
          <p style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
            Not tied to a task — fires as its own Google Calendar alert.
          </p>
        </div>
        <IconButton label="Close" variant="ghost" onClick={onClose}>
          <Icon name="x" size={18} />
        </IconButton>
      </header>

      <div style={{ display: 'grid', gap: 'var(--gap-stack)' }}>
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
          placeholder="Remind me about…"
          aria-label="What to be reminded about"
        />
        <Textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          aria-label="Notes"
        />
        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <FieldLabel icon={<Icon name="clock" size={14} />}>Remind me at</FieldLabel>
          <Input
            type="datetime-local"
            value={remindAt}
            onChange={(e) => setRemindAt(e.target.value)}
            aria-label="Remind me at"
          />
        </div>
      </div>

      {/* Gel since V3-7, the sheet's one primary. It draws as `solid` if
          this dialog is ever opened from outside a scope. */}
      <Button
        variant="gel"
        block
        disabled={!valid}
        iconLeft={<Icon name="calendar-plus" size={16} />}
        onClick={handleCreate}
      >
        Create reminder
      </Button>
    </Dialog>
  );
}

/** Why Google sync is unhealthy — drives the actionable reconnect copy. */
type GoogleSyncDiagnosis =
  | { kind: 'checking' }
  | { kind: 'not_connected' }
  | { kind: 'session_expired' }
  | { kind: 'missing_notification_scope' }
  | { kind: 'missing_calendar_scope' }
  | { kind: 'connected' };

/**
 * What the browser has decided about notifications. Four states, and only one
 * of them is a choice — `blocked` and `unavailable` are the browser's and
 * cannot be changed from here, which is why they get a sentence rather than a
 * control. Shared vocabulary with `components/AppInfoSection.tsx`, which asks
 * the same question about the same device.
 */
type NotifyState = 'on' | 'off' | 'blocked' | 'unavailable';

/* V3-7: the default export is the scope, and the screen sits inside it, the
   way Focus, Score and Set Deadlines do. */
export default function NotificationsPage() {
  return (
    <V3Scope>
      <NotificationsScreen />
    </V3Scope>
  );
}

function NotificationsScreen() {
  const {
    user,
    hasCalendarAccess,
    hasEverConnectedCalendar,
    getCalendarAccessToken,
    ensureCalendarAccess,
    startCalendarConnect,
  } = useAuth();
  const uid = user?.uid ?? null;
  const { backlogTasks, taskLists, projects, updateBacklogTask } = useStore();
  const setReminderSyncIssue = useUIStore((s) => s.setReminderSyncIssue);
  const setNotificationsNeedReconnect = useUIStore((s) => s.setNotificationsNeedReconnect);

  const navigate = useNavigate();
  const wide = useMedia(WIDE);
  const nav = useNavModel();

  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [history, setHistory] = useState<NotificationRecord[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [diagnosis, setDiagnosis] = useState<GoogleSyncDiagnosis>({ kind: 'checking' });
  const [showQuickReminder, setShowQuickReminder] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectError, setReconnectError] = useState<string | null>(null);
  const [diagEntries, setDiagEntries] = useState<DiagEntry[]>([]);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [copiedDiag, setCopiedDiag] = useState(false);

  /*
   * The browser's own answer, read synchronously because it has already
   * settled by the time this screen can be opened — lazy initial state rather
   * than an effect, so the card does not render once saying "off" and again
   * saying "on". The dev fixture pins it, because a permission is the
   * browser's to give and the harness's Chromium is started without one.
   */
  const [notifyState, setNotifyState] = useState<NotifyState>(() => {
    if (import.meta.env.DEV) {
      const pinned = devNotificationsFixture();
      if (pinned === 'blocked') return 'blocked';
      if (pinned === 'today' || pinned === 'delivered') return 'on';
    }
    if (!pushSupported()) return 'unavailable';
    if (Notification.permission === 'denied') return 'blocked';
    return Notification.permission === 'granted' ? 'on' : 'off';
  });
  const [allowing, setAllowing] = useState(false);
  const [allowError, setAllowError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    const unsubSettings = subscribeNotificationSettings(uid, setSettings);
    const unsubHistory = subscribeNotificationHistory(uid, setHistory);
    const unsubReminders = subscribeReminders(uid, setReminders);
    return () => {
      unsubSettings();
      unsubHistory();
      unsubReminders();
    };
  }, [uid]);

  /* BUILD-5: what the sender actually did. The dev fixture supplies its own. */
  const [pushLog, setPushLog] = useState<PushLog | null>(() =>
    import.meta.env.DEV ? devPushLog() : null,
  );
  useEffect(() => {
    if (!uid) return;
    if (import.meta.env.DEV && devNotificationsFixture() !== null) return;
    return subscribePushLog(uid, setPushLog);
  }, [uid]);

  useEffect(() => subscribeDiagnostics(setDiagEntries), []);

  /*
   * "Granted" is not the same as "subscribed" — the permission can be held
   * while this device has no push subscription behind it, which is exactly the
   * state that delivers nothing and looks fine. Only this half needs the
   * service worker, so it is the only half in an effect.
   */
  useEffect(() => {
    if (import.meta.env.DEV && devNotificationsFixture() !== null) return;
    if (!pushSupported() || Notification.permission !== 'granted') return;
    let cancelled = false;
    isPushEnabled().then((on) => {
      if (!cancelled) setNotifyState(on ? 'on' : 'off');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Immediately flip to "checking" the moment the diagnosis inputs change,
  // computed during render (comparing against the last-seen input key)
  // instead of as a direct `setState` at the top of the effect below — the
  // effect itself is then only ever responsible for the async lookup and
  // its eventual `setDiagnosis(result)`, never a synchronous reset.
  const diagnosisInputKey = `${hasCalendarAccess}|${hasEverConnectedCalendar}`;
  const [prevDiagnosisInputKey, setPrevDiagnosisInputKey] = useState(diagnosisInputKey);
  if (diagnosisInputKey !== prevDiagnosisInputKey) {
    setPrevDiagnosisInputKey(diagnosisInputKey);
    setDiagnosis({ kind: 'checking' });
  }

  useEffect(() => {
    let cancelled = false;
    async function diagnose(): Promise<GoogleSyncDiagnosis> {
      if (!hasCalendarAccess) {
        return hasEverConnectedCalendar
          ? { kind: 'session_expired' }
          : { kind: 'not_connected' };
      }
      const token = getCalendarAccessToken();
      if (!token) {
        return hasEverConnectedCalendar
          ? { kind: 'session_expired' }
          : { kind: 'not_connected' };
      }
      const [notificationScope, calendarScope] = await Promise.all([
        tokenHasNotificationScope(token),
        tokenHasCalendarScope(token),
      ]);
      if (notificationScope === null || calendarScope === null) return { kind: 'checking' };
      if (notificationScope) return { kind: 'connected' };
      // Token works for some Calendar APIs but can't create/manage the
      // dedicated notifications calendar — the classic stale-grant case.
      if (calendarScope) return { kind: 'missing_notification_scope' };
      return { kind: 'missing_calendar_scope' };
    }
    diagnose().then((result) => {
      if (!cancelled) setDiagnosis(result);
    });
    return () => {
      cancelled = true;
    };
  }, [hasCalendarAccess, hasEverConnectedCalendar, getCalendarAccessToken]);

  const handleReconnect = async () => {
    setReconnecting(true);
    setReconnectError(null);
    try {
      // A scope problem is the one case a token request cannot fix: the stored
      // grant is alive and `ensureCalendarAccess` would hand back the very
      // token that is missing the permission, reporting success while the page
      // stays broken. Only re-running consent widens a grant, so go straight
      // there.
      if (
        diagnosis.kind === 'missing_notification_scope' ||
        diagnosis.kind === 'missing_calendar_scope'
      ) {
        const widened = await startCalendarConnect('/notifications');
        if (!widened.started) {
          setReconnectError(widened.message);
          setShowDiagnostics(true);
        }
        return;
      }

      const result = await ensureCalendarAccess();
      if (result.ok) {
        if (uid) {
          setReminderSyncIssue(null);
          setNotificationsNeedReconnect(false);
          // Immediately re-push any pending deadline reminders now that we have
          // a fresh token — don't wait for the next store write.
          const token = result.token;
          scheduleReconcile(uid, useStore.getState().backlogTasks, () => token);
        }
      } else if (result.code === 'connect_required') {
        // The server has no lasting permission for this account (never granted,
        // or Google revoked it). Nothing here can be fixed by another token
        // request, so go straight to Google's consent screen — from the user's
        // side this is still one click, it just happens to leave the page.
        // `startCalendarConnect` navigates away; the browser comes back to
        // /oauth/callback, which stores the permission and returns here.
        const started = await startCalendarConnect('/notifications');
        if (!started.started) {
          setReconnectError(started.message);
          setShowDiagnostics(true);
        }
      } else {
        // Show the *specific* reason the reconnect failed (denied consent,
        // blocked popup, missing client id, etc.) — and auto-reveal the full
        // diagnostics log so it can be inspected/copied.
        setReconnectError(result.message);
        setShowDiagnostics(true);
      }
    } finally {
      setReconnecting(false);
    }
  };

  /**
   * Asks the browser for the permission and registers this device.
   *
   * The prompt is spent once and a denial is remembered for the origin, which
   * is why this is behind a button somebody pressed on purpose and why a
   * refusal moves the card to its `blocked` copy rather than leaving a button
   * that will never work again.
   */
  const handleAllow = async () => {
    if (!uid) return;
    setAllowing(true);
    setAllowError(null);
    try {
      const result = await enablePush(uid);
      if (result.ok) {
        setNotifyState('on');
        return;
      }
      if (result.failure === 'permission_denied') {
        setNotifyState('blocked');
        setAllowError(null);
        return;
      }
      setAllowError(
        result.failure === 'not_configured'
          ? 'The notification keys are not set on the server yet.'
          : result.failure === 'no_service_worker'
            ? 'BASE is not running from its own cache yet — reload and try again.'
            : result.detail || 'The browser could not register with its notification service.',
      );
    } finally {
      setAllowing(false);
    }
  };

  const handleCopyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(formatDiagnosticsForCopy());
      setCopiedDiag(true);
      setTimeout(() => setCopiedDiag(false), 1800);
    } catch {
      setCopiedDiag(false);
    }
  };

  const handleSetting = (updates: Partial<NotificationSettings>) => {
    if (!uid) return;
    setSettings((prev) => ({ ...prev, ...updates })); // optimistic
    updateNotificationSettings(uid, updates);
  };

  const handleCreateReminder = (input: { title: string; notes?: string; remindAt: string }) => {
    if (!uid) return;
    createReminder(uid, input, getCalendarAccessToken());
  };

  /** Dismissing doesn't just hide the row — it cancels the real Google Calendar alert. */
  const handleDismiss = async (record: NotificationRecord) => {
    if (!uid) return;
    const token = getCalendarAccessToken();

    if (record.type === 'deadline') {
      const task = backlogTasks.find((t) => t.id === record.sourceId);
      if (task) {
        updateBacklogTask(task.id, { reminderMinutes: 0 });
        if (token) cancelTaskDeadline(task, settings, token);
      }
    } else if (record.type === 'reminder') {
      const reminder = reminders.find((r) => r.id === record.sourceId);
      if (reminder) {
        await deleteReminder(uid, reminder, token);
        return; // deleteReminder already removes the history row
      }
    }

    await dismissNotification(uid, record.id);
  };

  /**
   * "Do not fire today" from a row's menu.
   *
   * It writes the same field `handleDismiss` writes — `reminderMinutes: 0`,
   * the app's one way of saying a task does not ping — and cancels the real
   * alert behind it. It deliberately does **not** touch the deadline or the
   * estimate, so the calendar block stays exactly where it was: the work is
   * still planned, it just does not interrupt.
   */
  const handleSkipToday = (row: FiringRow) => {
    const task = backlogTasks.find((t) => t.id === row.task.id);
    if (!task) return; // a dev-fixture row has nothing behind it to write
    updateBacklogTask(task.id, { reminderMinutes: 0 });
    const token = getCalendarAccessToken();
    if (token) cancelTaskDeadline(task, settings, token);
  };

  const googleStatusOk = diagnosis.kind === 'connected';
  const googleStatusLabel =
    diagnosis.kind === 'connected'
      ? 'Connected'
      : diagnosis.kind === 'checking'
        ? 'Checking…'
        : diagnosis.kind === 'not_connected'
          ? 'Not connected'
          : diagnosis.kind === 'session_expired'
            ? 'Needs reconnect — no active token'
            : diagnosis.kind === 'missing_notification_scope'
              ? 'Needs reconnect — missing calendar.app.created'
              : 'Needs reconnect — missing Calendar scope';

  const googleStatusDetail =
    diagnosis.kind === 'connected'
      ? 'Alerts land on a dedicated calendar, so they reach your phone with this app closed.'
      : diagnosis.kind === 'checking'
        ? 'Verifying Google Calendar permissions…'
        : diagnosis.kind === 'not_connected'
          ? 'Not connected. Reminders are scheduled, but nothing will reach your phone yet.'
          : diagnosis.kind === 'session_expired'
            ? 'The saved Google permission is no longer working — it was revoked, or it lapsed because the app’s Google consent screen is still unpublished. One click on Reconnect grants it again, and it will keep working after that.'
            : diagnosis.kind === 'missing_notification_scope'
              ? 'Your Google token can access Calendar events, but it’s missing the calendar.app.created permission needed to manage the dedicated notifications calendar. Reconnect to grant it — without this, deadline reminders cannot be created.'
              : 'Your Google token is missing Calendar API permissions entirely. Reconnect and approve Calendar access so deadline reminders can sync.';

  const connectButtonLabel =
    diagnosis.kind === 'not_connected' ? 'Connect Google' : reconnecting ? 'Reconnecting…' : 'Reconnect Google';

  const diagIssueCount = diagEntries.filter((e) => e.level !== 'info').length;

  /* `now` is read once per mount rather than once per render — the same
     `useState(() => Date.now())` reading `TrashPage` takes, and for the same
     reason: the clock is impure, and a boundary that moved on every re-render
     would let a row hop between missed and next mid-interaction. */
  const [now] = useState(() => Date.now());
  const timeZone = resolveUserTimeZone();

  /* The dev fixture's tasks are merged here and nowhere else — they never
     reach the store, so no other screen can see them. See
     `lib/devNotificationsFixture.ts` for why dating a shared-fixture task
     would have been the wrong fix. */
  const tasksForToday =
    import.meta.env.DEV && devNotificationsFixture() !== null
      ? [...backlogTasks, ...devFiringTasks()]
      : backlogTasks;

  const rows = withDelivery(
    firingToday({ tasks: tasksForToday, taskLists, projects, settings, timeZone, now }),
    pushLog,
    now,
  );
  const toCome = stillToFire(rows);
  /* Above the Now line: what has gone by. A snoozed row is still owed its
     last call, so it sits below with what is to come. */
  const fired = rows.filter((r) => r.state === 'missed' || r.state === 'sent');
  const afterNow = rows.filter((r) => r.state !== 'missed' && r.state !== 'sent');

  const past = history.filter((n) => !(n.status === 'scheduled' && n.sendAt > now));

  const pushOk = notifyState === 'on';
  const where = pushOk ? 'lock screen and in-app' : 'in-app only';
  const headerSubtitle = !settings.enabled
    ? 'Paused. Nothing fires until you turn this back on.'
    : toCome.length === 0
      ? `Nothing left to fire today · ${where}`
      : `${toCome.length} still to fire today · ${where}`;

  return (
    /* `ag-page` rather than an opaque wrapper, so the grid backdrop shows
       through and the panes above it have something to refract. */
    <div className="ag-page h-screen overflow-y-auto">
      <div style={{ display: 'flex', minHeight: '100%', alignItems: 'stretch' }}>

        {wide && (
          <div
            style={{
              position: 'sticky', top: 0, alignSelf: 'flex-start', flex: '0 0 auto',
              padding: 'var(--sp-9) 0 var(--sp-9) var(--sp-7)',
            }}
          >
            <MiniNav orientation="vertical" items={nav.items} value={nav.current} onChange={nav.go} lead={<RailMark />} />
          </div>
        )}

        <div
          style={{
            flex: 1, minWidth: 0, boxSizing: 'border-box',
            padding: wide
              ? 'var(--sp-9) var(--gutter-page) var(--sp-13)'
              : 'var(--sp-8) var(--gutter-page-sm) 128px',
          }}
        >
          <div style={{ width: '100%', maxWidth: 1160, margin: '0 auto', display: 'grid', gap: 'var(--sp-9)' }}>

            <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
              {/* Round glass since V3-7, as every V3 screen's Back. */}
              <IconButton label="Back" onClick={() => navigate(-1)}>
                <Icon name="arrow-left" size={18} />
              </IconButton>
              <span
                aria-hidden="true"
                style={{
                  display: 'grid', placeItems: 'center', width: 44, height: 44, flex: '0 0 auto',
                  borderRadius: '50%',
                  backgroundImage: settings.enabled && pushOk ? 'var(--glass-tint-accent)' : 'var(--glass-fill-2)',
                  boxShadow: settings.enabled && pushOk ? 'var(--glass-rim-2), var(--glow-accent-sm)' : 'var(--glass-rim-2)',
                  color: settings.enabled && pushOk ? 'oklch(0.93 0.07 162)' : 'var(--fg-3)',
                  transition: 'var(--t-hover)',
                }}
              >
                <Icon name={settings.enabled && pushOk ? 'bell' : 'bell-off'} size={20} />
              </span>
              <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                <h1
                  style={{
                    font: 'var(--type-title)', fontSize: 'var(--text-xl)',
                    letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)',
                  }}
                >
                  Notifications
                </h1>
                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
                  {headerSubtitle}
                </span>
              </div>
              <span style={{ flex: 1 }} />
              {/* Gel since V3-7: the screen's one primary, as New task is
                  on the board. */}
              <Button
                variant="gel"
                iconLeft={<Icon name="plus" size={16} />}
                onClick={() => setShowQuickReminder(true)}
                style={{ flex: '0 0 auto' }}
              >
                New reminder
              </Button>
            </header>

            {notifyState !== 'on' && (
              <BlockedCard state={notifyState} busy={allowing} onAllow={() => { void handleAllow(); }} error={allowError} />
            )}

            <div
              style={{
                display: 'grid', gap: 'var(--sp-8)',
                gridTemplateColumns: wide ? 'minmax(0, 1fr) 360px' : 'minmax(0, 1fr)',
                alignItems: 'start',
              }}
            >
              {/* ── Left: what fires today, what has already gone ───────── */}
              <div style={{ display: 'grid', gap: 'var(--sp-9)', minWidth: 0 }}>

                {/* ---- FIRING TODAY — the point of the screen ---- */}
                <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
                  <Kicker trail={rows.length > 0 ? `${toCome.length} to come` : undefined}>Firing today</Kicker>

                  {rows.length === 0 ? (
                    <Well
                      style={{
                        display: 'grid', placeItems: 'center', gap: 'var(--sp-3)', textAlign: 'center',
                        padding: 'var(--sp-11) var(--sp-7)', borderRadius: 'var(--r-card)',
                      }}
                    >
                      <span aria-hidden="true" style={{ display: 'flex', color: 'var(--fg-4)' }}>
                        <Icon name="bell" size={20} />
                      </span>
                      <span style={{ font: 'var(--type-label)', color: 'var(--fg-2)' }}>Nothing fires today.</span>
                      <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', maxWidth: '44ch', textWrap: 'pretty' }}>
                        A task appears here on the day its work has to start — its deadline, less how long you
                        said it takes.
                      </span>
                    </Well>
                  ) : (
                    <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
                      {fired.map((r, i) => (
                        <FireRow
                          key={r.task.id}
                          row={r}
                          now={now}
                          muted={!settings.enabled}
                          delay={i * 44}
                          onOpenProject={r.projectId ? () => navigate(`/project/${r.projectId}`) : null}
                          onSkip={() => handleSkipToday(r)}
                        />
                      ))}
                      <NowLine at={now} />
                      {afterNow.map((r, i) => (
                        <FireRow
                          key={r.task.id}
                          row={r}
                          now={now}
                          muted={!settings.enabled}
                          delay={(fired.length + i) * 44}
                          onOpenProject={r.projectId ? () => navigate(`/project/${r.projectId}`) : null}
                          onSkip={() => handleSkipToday(r)}
                        />
                      ))}
                    </div>
                  )}

                  {/* The rule, under the rows it explains. With no rows the
                      empty well already says it, so it is not said twice. */}
                  {rows.length > 0 && (
                    <p
                      style={{
                        font: 'var(--type-caption)', color: 'var(--fg-4)', padding: '0 var(--sp-2)',
                        textWrap: 'pretty', maxWidth: '68ch',
                      }}
                    >
                      Only tasks starting today appear. Each fires once, at its deadline minus its estimate — the
                      moment the work has to begin. Tapping it opens the task in Focus with the timer already running.
                    </p>
                  )}

                  <DozeNote />
                </div>

                {/* ---- ALREADY FIRED ----
                    A feed of panes rather than rows inside one pane: each entry
                    is something you act on, and a Card holding Cards inverts
                    the material (see panels.tsx). */}
                <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
                  <Kicker trail={past.length > 0 ? `${past.length}` : undefined}>Already fired</Kicker>

                  {past.length === 0 ? (
                    <Well
                      style={{
                        display: 'grid', placeItems: 'center', gap: 'var(--sp-3)', textAlign: 'center',
                        padding: 'var(--sp-11) var(--sp-7)', borderRadius: 'var(--r-card)',
                      }}
                    >
                      <span aria-hidden="true" style={{ display: 'flex', color: 'var(--fg-4)' }}>
                        <Icon name="bell" size={20} />
                      </span>
                      <span style={{ font: 'var(--type-label)', color: 'var(--fg-2)' }}>Nothing has fired yet.</span>
                      <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', maxWidth: '40ch', textWrap: 'pretty' }}>
                        Alerts land here as deadlines approach and sessions close.
                      </span>
                    </Well>
                  ) : (
                    <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
                      {past.map((n) => {
                        const look = STATUS_LOOK[n.status];
                        return (
                          <NotificationCard
                            key={n.id}
                            tone={look.tone}
                            icon={<Icon name={TYPE_ICON[n.type]} size={18} />}
                            title={n.title}
                            /* A failed row's body is Google's own reason for
                               refusing the event, so it is rose and it is long
                               — the card clamps it to two lines shut and shows
                               it whole open, which is why nothing below
                               repeats it. */
                            body={
                              n.body
                                ? <span style={{ color: n.status === 'failed' ? 'var(--status-overrun)' : undefined }}>{n.body}</span>
                                : undefined
                            }
                            time={timeAgoOrAt(n.sendAt)}
                            badge={<StatusPill size="sm" status={look.pill}>{look.label}</StatusPill>}
                            actions={
                              <>
                                {n.googleEventLink && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    iconRight={<Icon name="external-link" size={14} />}
                                    onClick={() => window.open(n.googleEventLink, '_blank', 'noopener,noreferrer')}
                                  >
                                    Open in Google Calendar
                                  </Button>
                                )}
                                {/* `handleDismiss` can cancel a real Google
                                    Calendar alert, so it sits beside the other
                                    decision rather than one mis-click from the
                                    title. */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  iconLeft={<Icon name="bell-off" size={14} />}
                                  title="Removes this alert, and cancels any reminder still scheduled for it"
                                  onClick={() => { void handleDismiss(n); }}
                                >
                                  Dismiss
                                </Button>
                              </>
                            }
                          >
                            {/* What the head has no room for: which kind of
                                alert this is, and the date in full rather than
                                "in 42m". */}
                            <Well style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
                              <span
                                style={{
                                  font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
                                  textTransform: KICKER_CASE, color: 'var(--fg-3)',
                                }}
                              >
                                {TYPE_LABEL[n.type]}
                              </span>
                              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-2)', fontVariantNumeric: 'tabular-nums' }}>
                                {fullWhen(n.sendAt)}
                              </span>
                            </Well>
                          </NotificationCard>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ── Diagnostics ────────────────────────────────────────
                    Not in the mockup — see the header. It lives at the foot
                    of this column rather than in the rail because it is a
                    dense, wide log and 360px would shred it. */}
                <Card>
                  <div style={{ display: 'grid' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => setShowDiagnostics((v) => !v)}
                        aria-expanded={showDiagnostics}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 'var(--sp-5)',
                          flex: 1, minWidth: 200, border: 0, padding: 0,
                          background: 'transparent', textAlign: 'left', cursor: 'pointer',
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            display: 'grid', placeItems: 'center', width: 34, height: 34, flex: '0 0 auto',
                            borderRadius: '50%', backgroundImage: 'var(--glass-fill-2)',
                            boxShadow: 'var(--glass-rim-1)', color: 'var(--fg-3)',
                          }}
                        >
                          <Icon name="stethoscope" size={17} />
                        </span>
                        <span style={{ display: 'grid', gap: 'var(--sp-2)', minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
                            <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)' }}>Diagnostics</span>
                            {diagIssueCount > 0 && (
                              <StatusPill size="sm" status="overrun">
                                {diagIssueCount} issue{diagIssueCount === 1 ? '' : 's'}
                              </StatusPill>
                            )}
                          </span>
                          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
                            Detailed log of every Google connection &amp; sync attempt — pinpoints exactly what failed.
                          </span>
                        </span>
                        <span
                          aria-hidden="true"
                          style={{
                            display: 'flex', flex: '0 0 auto', color: 'var(--fg-4)',
                            transform: showDiagnostics ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform var(--dur-base) var(--ease-glass)',
                          }}
                        >
                          <Icon name="chevron-down" size={16} />
                        </span>
                      </button>

                      {diagEntries.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flex: '0 0 auto' }}>
                          <Button
                            variant="ghost"
                            size="sm"
                            iconLeft={<Icon name={copiedDiag ? 'check' : 'copy'} size={15} />}
                            onClick={handleCopyDiagnostics}
                            title="Copy the full diagnostics log to share"
                          >
                            {copiedDiag ? 'Copied' : 'Copy'}
                          </Button>
                          <IconButton
                            label="Clear the diagnostics log"
                            title="Clear the diagnostics log"
                            variant="ghost"
                            size="sm"
                            onClick={() => clearDiagnostics()}
                          >
                            <Icon name="trash-2" size={15} />
                          </IconButton>
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateRows: showDiagnostics ? '1fr' : '0fr',
                        transition: 'grid-template-rows var(--dur-base) var(--ease-glass)',
                      }}
                    >
                      <div style={{ overflow: 'hidden', minHeight: 0 }}>
                        <div style={{ paddingTop: 'var(--sp-6)' }}>
                          {diagEntries.length === 0 ? (
                            <Well pad="var(--sp-8)">
                              <p style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textAlign: 'center', textWrap: 'pretty' }}>
                                No diagnostics yet — connection and sync events will be logged here as they happen.
                              </p>
                            </Well>
                          ) : (
                            <div
                              className="ag-scroll"
                              style={{
                                display: 'grid', gap: 'var(--sp-3)',
                                maxHeight: 320, overflowY: 'auto', overscrollBehavior: 'contain',
                              }}
                            >
                              {[...diagEntries].reverse().map((e) => (
                                <Well key={e.id} pad="var(--sp-4) var(--sp-5)" style={{ borderRadius: 'var(--r-sm)' }}>
                                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)' }}>
                                    <span
                                      aria-hidden="true"
                                      style={{
                                        flex: '0 0 auto', marginTop: 6, width: 6, height: 6, borderRadius: '50%',
                                        background: DIAG_LOOK[e.level],
                                      }}
                                    />
                                    <div style={{ minWidth: 0, flex: 1, display: 'grid', gap: 2 }}>
                                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
                                        <span
                                          style={{
                                            font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
                                            textTransform: 'uppercase', color: DIAG_LOOK[e.level],
                                          }}
                                        >
                                          {e.level}
                                        </span>
                                        <span style={{ font: 'var(--type-kicker)', color: 'var(--fg-4)' }}>
                                          {e.phase}/{e.code}
                                        </span>
                                        <span
                                          style={{
                                            marginLeft: 'auto', font: 'var(--type-kicker)', color: 'var(--fg-4)',
                                            fontVariantNumeric: 'tabular-nums',
                                          }}
                                        >
                                          {new Date(e.time).toLocaleString(undefined, {
                                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
                                          })}
                                        </span>
                                      </div>
                                      <span style={{ font: 'var(--type-caption)', color: 'var(--fg-2)', textWrap: 'pretty', overflowWrap: 'anywhere' }}>
                                        {e.message}
                                      </span>
                                      {e.detail && (
                                        <span
                                          style={{
                                            font: 'var(--type-kicker)', color: 'var(--fg-4)',
                                            textWrap: 'pretty', overflowWrap: 'anywhere',
                                          }}
                                        >
                                          {e.detail}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </Well>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* ── Rail: delivery and behaviour ────────────────────────── */}
              <div
                style={{
                  display: 'grid', gap: 'var(--sp-5)', minWidth: 0,
                  position: wide ? 'sticky' : 'static', top: 'var(--sp-9)',
                }}
              >
                {/* Delivery — two channels, one line of truth each. They are
                    the two ways a task reaches him and the screen does not
                    blur them together. */}
                <Card>
                  <div style={{ display: 'grid', gap: 'var(--sp-6)' }}>
                    <Kicker>Delivery</Kicker>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minWidth: 0 }}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 7, height: 7, borderRadius: '50%', flex: '0 0 auto',
                          background: pushOk ? 'var(--accent)' : 'var(--status-review)',
                          boxShadow: pushOk ? 'var(--glow-accent-sm)' : 'none',
                        }}
                      />
                      <span aria-hidden="true" style={{ display: 'flex', color: 'var(--fg-3)', flex: '0 0 auto' }}>
                        <Icon name="tablet" size={16} />
                      </span>
                      <div style={{ display: 'grid', gap: 1, flex: 1, minWidth: 0 }}>
                        <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)' }}>Brave on this tablet</span>
                        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
                          {pushOk
                            ? 'Allowed. Alerts reach the lock screen with the app closed.'
                            : notifyState === 'unavailable'
                              ? 'This browser cannot deliver them. In-app only.'
                              : 'Blocked. In-app only.'}
                        </span>
                      </div>
                    </div>

                    <div aria-hidden="true" style={{ height: 1, background: 'var(--line-faint)' }} />

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)', minWidth: 0 }}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 7, height: 7, borderRadius: '50%', flex: '0 0 auto', marginTop: 6,
                          background: googleStatusOk ? 'var(--accent)' : 'var(--status-review)',
                          boxShadow: googleStatusOk ? 'var(--glow-accent-sm)' : 'none',
                        }}
                      />
                      <span aria-hidden="true" style={{ display: 'flex', color: 'var(--fg-3)', flex: '0 0 auto', marginTop: 3 }}>
                        <Icon name="calendar-clock" size={16} />
                      </span>
                      <div style={{ display: 'grid', gap: 'var(--sp-2)', flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-4)', minWidth: 0 }}>
                          <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)', flex: 1, minWidth: 0 }}>
                            Google Calendar
                          </span>
                          <span
                            style={{
                              font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
                              color: 'var(--fg-4)', textAlign: 'right', flex: '0 0 auto',
                            }}
                          >
                            {googleStatusLabel}
                          </span>
                        </span>
                        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
                          {googleStatusDetail}
                        </span>
                        {/* The second channel keeps its own head start, and
                            the screen says so rather than letting the two
                            times be discovered as a discrepancy. His call,
                            2026-09-16: leave the sending alone, state it
                            here. Read from the real setting, never hardcoded. */}
                        {googleStatusOk && settings.defaultDeadlineOffsetMinutes > 0 && (
                          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
                            The calendar keeps its own head start: its popup arrives{' '}
                            {settings.defaultDeadlineOffsetMinutes} min before the block begins, so it is the
                            earlier of the two. A task with its own reminder set uses that instead.
                          </span>
                        )}
                      </div>
                    </div>

                    {googleStatusOk ? (
                      <Well style={{ display: 'grid', gap: 'var(--sp-3)' }}>
                        {[
                          ['Account', user?.email ?? '—'],
                          ['Calendar', NOTIFICATION_CALENDAR_SUMMARY],
                        ].map(([k, v]) => (
                          <div key={k} style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-4)' }}>
                            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', width: 68, flex: '0 0 auto' }}>{k}</span>
                            <span
                              style={{
                                font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-2)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}
                            >
                              {v}
                            </span>
                          </div>
                        ))}
                      </Well>
                    ) : diagnosis.kind !== 'checking' ? (
                      <Button
                        variant="tint"
                        tone="amber"
                        block
                        loading={reconnecting}
                        iconLeft={<Icon name="link" size={16} />}
                        onClick={handleReconnect}
                      >
                        {connectButtonLabel}
                      </Button>
                    ) : null}

                    {reconnectError && (
                      <Well
                        style={{
                          display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)',
                          backgroundImage: 'var(--glass-tint-rose)',
                          boxShadow: 'var(--glass-rim-1)',
                        }}
                      >
                        <span aria-hidden="true" style={{ display: 'flex', flex: '0 0 auto', marginTop: 1, color: 'var(--status-overrun)' }}>
                          <Icon name="x-circle" size={16} />
                        </span>
                        <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
                          <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)' }}>Reconnect failed</span>
                          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-2)', textWrap: 'pretty', overflowWrap: 'anywhere' }}>
                            {reconnectError}
                          </span>
                        </div>
                      </Well>
                    )}
                  </div>
                </Card>

                {/* How alerts behave. */}
                <Card>
                  <div style={{ display: 'grid', gap: 'var(--sp-6)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
                      <div style={{ display: 'grid', gap: 1, flex: 1, minWidth: 0 }}>
                        <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)' }}>Notifications</span>
                        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
                          {settings.enabled ? 'On' : 'Paused'}
                        </span>
                      </div>
                      <Switch
                        checked={settings.enabled}
                        onChange={(v) => handleSetting({ enabled: v })}
                        aria-label="Notifications enabled"
                      />
                    </div>

                    <div aria-hidden="true" style={{ height: 1, background: 'var(--line-faint)' }} />

                    {/* Not a setting. A lead time you could tune would just be
                        a second deadline, so it is reported, not offered — the
                        mockup's own words, and the reason the five-option
                        MorphMenu that stood here is gone rather than moved. */}
                    <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
                      <span
                        style={{
                          font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
                          textTransform: KICKER_CASE, color: 'var(--fg-3)',
                        }}
                      >
                        Fires at
                      </span>
                      <Well style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
                        <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-1)' }}>
                          deadline − estimate
                        </span>
                        <span style={{ flex: 1 }} />
                        <span aria-hidden="true" style={{ display: 'flex', color: 'var(--fg-4)' }}>
                          <Icon name="lock" size={14} />
                        </span>
                      </Well>
                      <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
                        Not adjustable. A lead time you could tune is just a second deadline.
                      </span>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </div>

      <QuickReminderModal
        isOpen={showQuickReminder}
        onClose={() => setShowQuickReminder(false)}
        onCreate={handleCreateReminder}
      />

      {!wide && (
        <div
          style={{
            position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--sp-5) + var(--safe-b))',
            display: 'grid', placeItems: 'center',
            zIndex: Z.nav, pointerEvents: 'none',
          }}
        >
          <span style={{ pointerEvents: 'auto' }}>
            <MiniNav items={nav.items} value={nav.current} onChange={nav.go} />
          </span>
        </div>
      )}
    </div>
  );
}
