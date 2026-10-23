/**
 * The App panel on the Settings page — APP-3.
 *
 * Three facts about the copy of BASE you are looking at, which had nowhere to
 * live before this item:
 *
 *   - **Which version is running.** Not "what is the latest deploy" — the
 *     running one, which after APP-3 can be older, because the app is served
 *     out of a cache that only updates when it is told to. The number comes
 *     from the service worker that served this page, so it cannot disagree with
 *     what is on screen; see `lib/appUpdate.ts`.
 *   - **Whether it works offline.** The whole point of the item, and a thing
 *     with exactly two states that a screen should say out loud rather than
 *     leave to be discovered in aeroplane mode.
 *   - **Whether notifications arrive**, with the one test send APP-3 exists to
 *     prove. Real reminders are item 27's — nothing here schedules anything.
 *
 * WHY IT IS HERE AND NOT ON `/notifications`
 * ------------------------------------------
 * Asked directly, Shreekant chose one place for "facts about this installed
 * app" over splitting the version from the test button. The other half of the
 * reason is that `/notifications` is item 27's screen and is due to be rebuilt
 * against a revised mockup — a control parked there now would be furniture that
 * item then has to decide what to do with.
 *
 * There is no Switch on the notifications row, and that is deliberate rather
 * than unfinished. A browser spends its permission prompt **once** — a denial
 * is remembered for the origin and cannot be re-asked from code — so a control
 * that looks like a toggle you can flick back and forth would be lying about
 * the one direction that is irreversible. The button asks; the line above it
 * says what the browser has already decided.
 */
import { useCallback, useEffect, useState } from 'react';
import { Card, Icon, Kicker, SoftButton, Well, type IconName } from '../ui';
import { useAuth } from '../contexts/AuthContext';
import {
  checkForUpdateNow,
  isOfflineReady,
  readRunningVersion,
  type RunningVersion,
} from '../lib/appUpdate';
import {
  enablePush,
  isPushEnabled,
  pushConfigured,
  pushSupported,
  sendTestNotification,
  type PushFailure,
} from '../lib/push';
import type { ToastPayload } from '../pages/SettingsPage';

/** What `enablePush` can refuse with, in words rather than in codes. */
const PUSH_FAILURE_COPY: Record<PushFailure, string> = {
  unsupported: 'This browser cannot deliver notifications.',
  not_configured: 'The notification keys are not set on the server yet.',
  no_service_worker: 'BASE is not running from its own cache yet — reload and try again.',
  permission_denied:
    'The browser refused. Allow notifications for BASE in its site settings, then try again.',
  subscribe_failed: 'The browser could not register with its notification service.',
};

/**
 * Reads as a sentence rather than as an instant: `builtAt` is only ever shown,
 * so the precision anybody wants from it is "which day, roughly when".
 */
function formatBuiltAt(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Four states, and only one of them is a choice. `blocked` and `unavailable`
 * are the browser's decisions and cannot be changed from here, which is why
 * they get a sentence rather than a control.
 */
type NotifyState = 'on' | 'off' | 'blocked' | 'unavailable';

/** What is knowable synchronously, before anything is awaited. */
function initialNotifyState(): NotifyState {
  if (!pushSupported()) return 'unavailable';
  if (Notification.permission === 'denied') return 'blocked';
  return 'off';
}

/** The same question, with the one part of it that needs the registration. */
async function resolveNotifyState(): Promise<NotifyState> {
  const synchronous = initialNotifyState();
  if (synchronous !== 'off') return synchronous;
  return (await isPushEnabled()) ? 'on' : 'off';
}

/** One labelled fact in the Well. */
function Row({ icon, label, value, note }: { icon: IconName; label: string; value: string; note?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)', minHeight: 44, padding: 'var(--sp-3) 0' }}>
      <span style={{ display: 'flex', flex: '0 0 auto', marginTop: 2, color: 'var(--fg-4)' }}>
        <Icon name={icon} size={16} />
      </span>
      <div style={{ minWidth: 0, display: 'grid', gap: 2, flex: 1 }}>
        <span style={{ font: 'var(--type-body)', color: 'var(--fg-2)' }}>{label}</span>
        {note && (
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>{note}</span>
        )}
      </div>
      <span
        style={{
          font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-2)',
          flex: '0 0 auto', textAlign: 'right', maxWidth: '50%',
        }}
      >
        {value}
      </span>
    </div>
  );
}

export default function AppInfoSection({ onToast }: { onToast: (t: ToastPayload) => void }) {
  const { user } = useAuth();

  const [running, setRunning] = useState<RunningVersion | null>(null);
  const [checking, setChecking] = useState(false);
  const [working, setWorking] = useState(false);

  /*
   * Both of these read a browser API that has already settled by the time this
   * screen can be opened, so they are lazy initial state rather than an effect.
   * That is not only to keep `react-hooks/set-state-in-effect` quiet: state set
   * from an effect renders the panel once saying "not cached" and again saying
   * "ready", and the honest answer was available before the first render.
   */
  const [cached] = useState(isOfflineReady);
  const [notifyState, setNotifyState] = useState<NotifyState>(initialNotifyState);

  /*
   * One effect for both asks, and both are `.then` rather than `await` so no
   * state is set synchronously while the effect body runs — same shape the
   * rest of the app uses, and what `react-hooks/set-state-in-effect` is for.
   *
   * Only the `on` half of the notification state needs asking at all: whether a
   * subscription exists is a promise on the registration, while "unsupported"
   * and "blocked" are synchronous and are already the initial state above.
   */
  useEffect(() => {
    let active = true;
    readRunningVersion().then((version) => {
      if (active) setRunning(version);
    });
    resolveNotifyState().then((next) => {
      if (active) setNotifyState(next);
    });
    return () => { active = false; };
  }, []);

  /** Re-ask after the user has changed something. Handlers only, never an effect. */
  const refreshNotifyState = useCallback(async () => {
    setNotifyState(await resolveNotifyState());
  }, []);

  const handleCheck = async () => {
    setChecking(true);
    const found = await checkForUpdateNow();
    setChecking(false);
    onToast(
      found
        ? { icon: 'refresh-cw', title: 'A new version is ready', detail: 'Take it from the banner at the top.', tone: 'accent' }
        : { icon: 'check', title: 'BASE is up to date', detail: 'Nothing newer has been deployed.' },
    );
  };

  const handleEnable = async () => {
    if (!user) return;
    setWorking(true);
    const result = await enablePush(user.uid);
    await refreshNotifyState();
    setWorking(false);
    onToast(
      result.ok
        ? { icon: 'bell-ring', title: 'Notifications are on for this device', tone: 'accent' }
        : {
            icon: 'triangle-alert',
            title: 'Could not turn notifications on',
            detail: result.failure ? PUSH_FAILURE_COPY[result.failure] : result.detail,
            tone: 'overrun',
          },
    );
  };

  const handleTest = async () => {
    if (!user) return;
    setWorking(true);
    /*
     * Minted here rather than held anywhere: an ID token lives an hour and this
     * button is pressed once in a blue moon, so asking for a fresh one is
     * always right and costs nothing. `getIdToken()` returns the cached one
     * until it is close to expiry. Taken off the context's `user` rather than
     * off `lib/firebase`'s `auth`, so this file does not add another static
     * importer to a module the agent path deliberately imports dynamically.
     */
    const idToken = await user.getIdToken();
    const result = await sendTestNotification(idToken);
    setWorking(false);
    onToast(
      result.ok
        ? { icon: 'send', title: 'Test notification sent', detail: result.detail, tone: 'accent' }
        : { icon: 'triangle-alert', title: 'It did not send', detail: result.detail, tone: 'overrun' },
    );
  };

  const builtAt = formatBuiltAt(running?.builtAt ?? null);

  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--sp-7)' }}>

        {/* Headline — the version, as a figure, the way Storage leads with its
            own number. It is the one thing on this panel somebody reads out
            loud to somebody else. */}
        <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
          <Kicker trail={builtAt ? `built ${builtAt}` : undefined}>Version running</Kicker>
          <div style={{ padding: '0 var(--sp-2)' }}>
            <span
              style={{
                font: 'var(--type-numeric)',
                fontSize: 'clamp(32px, 5vw, 48px)',
                fontWeight: 300,
                letterSpacing: '-0.02em',
                color: 'var(--fg-1)',
                lineHeight: 1,
              }}
            >
              {running ? running.version : '—'}
            </span>
          </div>
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty', padding: '0 var(--sp-2)' }}>
            {running
              ? 'BASE is served from its own cache, so this can be older than the newest deploy until you take an update. That is the trade for opening with no connection.'
              : 'BASE is running straight from the network on this device — nothing is cached yet, so it will not open offline. Reload once and this fills in.'}
          </span>
        </div>

        <Well pad="var(--sp-2) var(--sp-5)">
          <Row
            icon={cached ? 'cloud-off' : 'globe'}
            label="Works offline"
            value={cached ? 'Ready' : 'Not yet'}
            note={
              cached
                ? 'Your tasks are on this device already. Atlas, Google Calendar and cloud sync still need a connection, and say so when they cannot reach one.'
                : 'Reload once on a connection and the app keeps a copy of itself.'
            }
          />
          <div style={{ borderTop: '1px solid var(--line-faint)' }} />
          <Row
            icon={notifyState === 'on' ? 'bell-ring' : 'bell-off'}
            label="Notifications"
            value={
              notifyState === 'on' ? 'On'
                : notifyState === 'blocked' ? 'Blocked'
                  : notifyState === 'off' ? 'Off'
                    : 'Unavailable'
            }
            note={
              notifyState === 'on'
                ? 'This device can be reached on its lock screen. Reminders that fire on a schedule are still to come.'
                : notifyState === 'blocked'
                  ? 'The browser is refusing them for BASE. Allow notifications for it in the site settings.'
                  : notifyState === 'off'
                    ? 'Turn them on to be reachable when BASE is shut.'
                    : 'This browser does not support them.'
            }
          />
        </Well>

        <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
          <SoftButton
            size="sm"
            onClick={handleCheck}
            disabled={checking || !running}
            icon={<Icon name="refresh-cw" size={14} />}
          >
            {checking ? 'Checking…' : 'Check for updates'}
          </SoftButton>

          {notifyState === 'off' && pushConfigured() && (
            <SoftButton
              size="sm"
              onClick={handleEnable}
              disabled={working}
              icon={<Icon name="bell" size={14} />}
            >
              Turn on notifications
            </SoftButton>
          )}

          {notifyState === 'on' && (
            <SoftButton
              size="sm"
              onClick={handleTest}
              disabled={working}
              icon={<Icon name="send" size={14} />}
            >
              {working ? 'Sending…' : 'Send a test notification'}
            </SoftButton>
          )}
        </div>

        {!pushConfigured() && (
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
            Notifications are switched off in this build — the keys that sign them are not set on the
            server.
          </span>
        )}
      </div>
    </Card>
  );
}
