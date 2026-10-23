/**
 * The line after something was put away (BUILD-11) — "Archived Diwali gift
 * boxes 2025 · On the shelf · Settings → Archive".
 *
 * Mounted once in `App.tsx` rather than by each menu, because archiving from
 * a project's own header also navigates Home, and a toast owned by the page
 * that raised it would unmount on the same tap.
 *
 * **It has an Undo now (29-1P4a, idea 6), with a bar that drains.** It had
 * none, because a toast may only confirm; his undo changed that — the same
 * archive is on Ctrl+Z and the two-finger tap for his last 20 actions, so
 * nothing is lost when the toast goes, and Put back on `/archive` still keeps
 * it for good. The Undo shows only once `useUndoStore` has recorded this
 * archive, a microtask after the notice — so a refusal ("The archive is
 * full") never offers one.
 */
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useUIStore } from '../store/useUIStore';
import { useUndoStore } from '../store/useUndoStore';
import { Icon, Toast, useMotion } from '../ui';
import { Z } from '../lib/zLayers';

/** The design's 4.2 s hold. */
const HOLD_MS = 4200;

export default function ArchiveToast() {
  const notice = useUIStore((s) => s.archiveNotice);
  const clear = useUIStore((s) => s.clearArchiveNotice);
  const latest = useUndoStore((s) => s.latest);
  const undoable = notice && notice.tone !== 'overrun' && latest?.kind === 'archive' ? latest.id : null;
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
              action={undoable !== null ? { label: 'Undo', onClick: () => { useUndoStore.getState().undo('toast', undoable); } } : undefined}
              drainMs={undoable !== null ? HOLD_MS : undefined}
              onDismiss={clear}
            />
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
