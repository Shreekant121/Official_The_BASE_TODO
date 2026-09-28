/**
 * Google Calendar reminder sync failed — rebuilt on Aurora Glass (UI-18).
 *
 * Ephemeral warning when deadline/reminder sync to Google fails. Mirrors
 * `SyncStatusBanner` so a broken reminder pipeline is never silent the way
 * cloud-sync outages used to be, and it is deliberately still the *second*
 * banner: this one is dismissable and that one is not, because a reminder that
 * did not sync is a thing you can decide about and a cloud outage is not.
 *
 * It is a `NotificationCard` for the reason its sibling is — a surface that
 * persists and carries a decision is not a Toast — and it opens expanded so
 * the way out is visible rather than a click away. Read that file's header for
 * the full argument, including why the card's own condense entrance is
 * switched off under a Framer wrapper that slides it in.
 *
 * `--status-review` (amber) rather than rose, and the distinction is the
 * design system's own: rose is `--status-overrun`, a live problem, which is
 * what a dead cloud sync is. A reminder that failed to reach Google needs a
 * decision — reconnect, or let it go — and amber is "needs a decision". Same
 * call UI-13 made for an incomplete prerequisite.
 *
 * **Neither banner says where it goes any more.** Both sit in one fixed column
 * owned by `App.tsx` — see `SyncStatusBanner`'s header for why two hard-coded
 * top offsets stopped working the moment these became cards.
 *
 * **Try again is the card's primary action (FIX-8), and it is a real retry.**
 * `googleCalendar.ts` now backs off on a rate limit by itself, which covers the
 * failure that lifts in seconds; this covers the rest — a laptop that was
 * offline, a Google outage, a limit that outlasted the backoff — where the
 * honest answer is that the person watching knows better than a timer when it
 * is worth another go. It runs `reconcileAllNotifications` directly rather than
 * `scheduleReconcile`, because the debounce exists to coalesce the pass that
 * fires after every store write and a button press is not one of those: waiting
 * two seconds to start would only make the press feel broken.
 *
 * **A dead grant gets a different offer (BUILD-15).** When the reason sync
 * stopped is the Google connection itself — revoked, expired, or missing the
 * calendar scope — "Try again" is the wrong button: the pass will refuse
 * identically for ever, and pressing it is how somebody spends a week
 * believing the app is merely flaky. That case swaps the primary action for
 * Reconnect Google and says so in the title. The banner is the same card
 * because it is the same question — *your calendar is not syncing* — with a
 * different answer.
 *
 * It needs no arguments of its own. The pass is a diff over the whole backlog
 * (CLAUDE.md), so "try again" is the same pass the app runs anyway, and it
 * reports itself the same way — clearing `reminderSyncIssue` on success, which
 * is what takes this card off the screen. That is the entire success state;
 * there is deliberately no "Synced!" of its own to dismiss afterwards.
 *
 * **`Open Notifications` steps down to `ghost` to make room.** UI-25 made it the
 * tint button when it was the only way forward. It is now the second one — the
 * place you go when trying again did not work — and two tinted buttons in one
 * row would say neither is the answer.
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../store/useUIStore';
import { useStore } from '../store/useStore';
import { useAuth } from '../contexts/AuthContext';
import { reconcileAllNotifications } from '../lib/notificationSync';
import { Button, Icon, NotificationCard } from '../ui';

export default function ReminderSyncBanner() {
  const issue = useUIStore((s) => s.reminderSyncIssue);
  const kind = useUIStore((s) => s.reminderSyncIssueKind);
  const setIssue = useUIStore((s) => s.setReminderSyncIssue);
  const { user, getCalendarAccessToken } = useAuth();
  const [retrying, setRetrying] = useState(false);
  const navigate = useNavigate();

  const retry = async () => {
    if (!user || retrying) return;
    setRetrying(true);
    try {
      // The backlog is read at press time, not captured in a closure: this
      // card can sit on screen across several edits before anybody presses it.
      await reconcileAllNotifications(
        user.uid,
        useStore.getState().backlogTasks,
        getCalendarAccessToken(),
      );
    } catch {
      // The pass writes its own verdict into the store, and a throw means it
      // got nowhere — so the message already on this card is still the true
      // one. Replacing it with "trying again failed" would trade Google's own
      // reason for our paraphrase of it.
    } finally {
      setRetrying(false);
    }
  };

  const needsReconnect = kind === 'reconnect';

  return (
    <AnimatePresence>
      {issue && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="pointer-events-auto"
        >
          <NotificationCard
            tone="review"
            icon={<Icon name="triangle-alert" size={16} />}
            title={needsReconnect ? 'BASE lost access to Google Calendar' : "Reminder didn't reach Google Calendar"}
            body={issue}
            defaultOpen
            style={{ animation: 'none' }}
            /* UI-25 moved dismissal out of the card head and into the
               actions row, where the rest of the decision already is. The
               banner opens expanded, so it is no less reachable. */
            actions={
              <>
                {needsReconnect ? (
                  /* Reconnect lives on the Notifications page, which is where
                     Connect Google already is — so this is the tint button and
                     there is no second one, rather than two ways to the same
                     place. */
                  <Button
                    size="sm"
                    variant="tint"
                    tone="amber"
                    onClick={() => navigate('/notifications')}
                    iconLeft={<Icon name="link" size={14} />}
                  >
                    Reconnect Google
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="tint"
                      tone="amber"
                      onClick={retry}
                      loading={retrying}
                      disabled={!user}
                      iconLeft={<Icon name="rotate-cw" size={14} />}
                    >
                      {retrying ? 'Trying again…' : 'Try again'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => navigate('/notifications')}
                      iconLeft={<Icon name="bell" size={14} />}
                    >
                      Open Notifications
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" onClick={() => setIssue(null)}>
                  Hide this warning
                </Button>
              </>
            }
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
