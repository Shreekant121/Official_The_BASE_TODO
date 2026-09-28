/**
 * The line after something was put away (BUILD-11) — "Archived Diwali gift
 * boxes 2025 · On the shelf · Settings → Archive".
 *
 * Mounted once in `App.tsx` rather than by each menu, because archiving from
 * a project's own header also navigates Home, and a toast owned by the page
 * that raised it would unmount on the same tap.
 *
 * **No Undo button, although `Archive.dc.html` draws one.** `Toast.tsx` is
 * explicit that a toast disappears and so may only ever confirm — a choice
 * goes somewhere that persists. The way back is Put back on `/archive`, which
 * the detail line names, and nothing is lost in the meantime: the archive
 * keeps it for good.
 */
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useUIStore } from '../store/useUIStore';
import { Icon, Toast, useMotion } from '../ui';
import { Z } from '../lib/zLayers';

/** The design's 4.2 s hold. */
const HOLD_MS = 4200;

export default function ArchiveToast() {
  const notice = useUIStore((s) => s.archiveNotice);
  const clear = useUIStore((s) => s.clearArchiveNotice);
  const motionTokens = useMotion();

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(clear, HOLD_MS);
    return () => clearTimeout(t);
  }, [notice, clear]);

  return (
    <div
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--sp-13) + var(--safe-b))',
        display: 'grid', placeItems: 'center', zIndex: Z.toast, pointerEvents: 'none',
        padding: '0 var(--sp-5)',
      }}
    >
      <AnimatePresence>
        {notice && (
          <motion.span
            key={notice.at}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: motionTokens.dur.slow, ease: motionTokens.ease.glass }}
            style={{ pointerEvents: 'auto' }}
          >
            <Toast
              icon={<Icon name={notice.tone === 'overrun' ? 'triangle-alert' : 'library'} size={16} />}
              title={notice.title}
              detail={notice.detail}
              tone={notice.tone}
              onDismiss={clear}
            />
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
