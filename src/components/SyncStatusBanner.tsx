/**
 * Cloud sync is unhealthy — rebuilt on Aurora Glass (UI-18).
 *
 * Persistent warning shown whenever the Firestore cloud sync is broken
 * (realtime listener error, or a write failed). Without this, a sync outage is
 * completely invisible: changes keep "working" locally (Zustand +
 * localStorage) while silently never reaching the cloud, so the loss is only
 * discovered much later on a different device.
 *
 * `retryFirestoreSync()` forces an immediate reconnect — `onSnapshot`'s error
 * callback permanently ends that listener, and while `firestoreSync.ts`
 * already retries on backoff and on regained connectivity, this is the way to
 * force it now rather than wait.
 *
 * WHY THIS IS A `NotificationCard` AND NOT A `Toast`
 * -------------------------------------------------
 * The design system draws a hard line between its two feedback surfaces, and
 * `Toast.tsx` states it: a Toast DISAPPEARS, so it can only ever confirm;
 * anything that requires a decision goes in a `NotificationCard`, which
 * persists and expands in place. This banner is on screen for exactly as long
 * as the problem is, and it carries an action — so it is the second one. It
 * was neither: a `liquid-glass-nav` pill whose entire surface was a button,
 * with "Click to retry" hidden in a `title` attribute nobody sees on a tablet.
 *
 * It opens expanded on purpose. A banner the user did not ask for should not
 * also make them find the control; pressing the head folds it back to one
 * line, which is the compact pill this used to be, now reachable rather than
 * assumed.
 *
 * **It no longer says where it goes.** Both banners sit in one fixed column
 * owned by `App.tsx`, which is the only place that knows both of them exist.
 * They used to place themselves 40px apart — fine for the ~30px pills they
 * were, and a 105px overlap once each became a card. `Z.panel` moved up there
 * with the column and is load-bearing either way: `zLayers.ts` gives that rung
 * to "app-level sync banners, and the modals that have to clear them", because
 * a banner reporting broken sync must stay readable over an open modal.
 *
 * ONE THING NOT TO RE-LEARN
 * -------------------------
 * `NotificationCard` arrives by condensing, which is a CSS `animation` on
 * `transform`; this wrapper slides it down from the top edge, which Framer
 * writes as an inline `transform`. A running CSS animation outranks an inline
 * style, so the two fight for 260ms and the slide loses. The card's own
 * entrance is switched off here and the wrapper owns the arrival — see
 * CLAUDE.md on Framer Motion and `transform`.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useUIStore } from '../store/useUIStore';
import { retryFirestoreSync } from '../lib/firestoreSync';
import { Button, Icon, NotificationCard } from '../ui';

export default function SyncStatusBanner() {
  const cloudSyncOk = useUIStore((s) => s.cloudSyncOk);

  return (
    <AnimatePresence>
      {!cloudSyncOk && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="pointer-events-auto"
        >
          <NotificationCard
            tone="overrun"
            icon={<Icon name="cloud-off" size={16} />}
            title="Not connected to the cloud"
            body="Your changes are saved on this device only. They are not reaching the cloud, so they will not appear anywhere else until this reconnects."
            defaultOpen
            style={{ animation: 'none' }}
            actions={
              <Button
                size="sm"
                variant="tint"
                tone="rose"
                onClick={() => retryFirestoreSync()}
                iconLeft={<Icon name="rotate-cw" size={14} />}
              >
                Try reconnecting
              </Button>
            }
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
