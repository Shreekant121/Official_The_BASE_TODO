/**
 * "New version available, tap to reload" — APP-3.
 *
 * The fourth banner in `App.tsx`'s fixed column, and the one that pays for the
 * service worker. Caching the app shell is what lets BASE open in aeroplane
 * mode; the price is that a new deploy no longer arrives on its own, and the
 * settled decision is that the price is **paid out loud**. Not silent, not
 * forced: the new version is downloaded and parked, this offers it, and nothing
 * swaps until it is tapped. Shreekant chose that deliberately — do not
 * "simplify" it into an automatic reload.
 *
 * `tone="neutral"` rather than accent or amber, and both halves of that are
 * deliberate. Amber is "needs a decision" in the sense its two neighbours use
 * it — something is wrong and you have to choose what to do about it — and
 * nothing is wrong here. Accent is the emerald `colors.css` rations to genuine
 * progress, and an update that has been sitting in the cache for a day is not
 * progress. So the card carries no hue and the Button does the inviting.
 *
 * It is the only one of the four with **no way to dismiss it**, which puts it
 * beside `SyncStatusBanner` rather than beside the two that can be hidden. The
 * reason is the same: dismissing it would not make the running version any less
 * stale, it would only make the staleness invisible again — which is the exact
 * failure this banner exists to end. Taking the update is one tap and is the
 * way out.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useUIStore } from '../store/useUIStore';
import { applyUpdate } from '../lib/appUpdate';
import { Icon, NotificationCard, SoftButton } from '../ui';

export default function UpdateBanner() {
  const updateReady = useUIStore((s) => s.updateReady);

  return (
    <AnimatePresence>
      {updateReady && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="pointer-events-auto"
        >
          <NotificationCard
            icon={<Icon name="refresh-cw" size={16} />}
            title="New version available"
            body="It is already downloaded. Reloading takes a second and loses nothing you have typed."
            defaultOpen
            /* The card's own condense entrance would play against the Framer
               wrapper sliding it in — same reason its three neighbours switch
               it off. `SyncStatusBanner`'s header has the full argument. */
            style={{ animation: 'none' }}
            actions={
              <SoftButton
                size="sm"
                onClick={applyUpdate}
                icon={<Icon name="refresh-cw" size={14} />}
              >
                Reload now
              </SoftButton>
            }
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
