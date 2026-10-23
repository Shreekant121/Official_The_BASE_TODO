/**
 * Offline, and it's fine (29-1P14d1, idea 114).
 *
 * A small pill at the top of every screen: grey "Offline · saving on this
 * tablet" while the internet is gone, then lime "Back online · synced 3
 * changes" once Firestore has every waiting write, and it slips away. What it
 * says is `lib/connectionPill.ts` (pure, tested); when is
 * `lib/connectionWatch.ts`.
 *
 * It takes the connection banner's place rather than sitting beside it: while
 * it is up, `SyncStatusBanner` stands down, because losing the Wi-Fi is not a
 * broken sync. It sits above the pile of notices (`NoticeStack`), not in it —
 * it is a status line, not a notice with a decision on it, and a pill in front
 * of a pile of cards would hide them behind something a third their width.
 *
 * Grey offline, lime back: offline is calm (a warning is grey, and this is not
 * even one), and synced is done, which is lime's job. The lime is a layer that
 * fades in over the grey, because a gradient fill cannot transition.
 */
import { useLayoutEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useConnectionPill } from '../lib/connectionWatch';
import { pillWords, type PillState } from '../lib/connectionPill';
import { Icon, useMedia, useMotion } from '../ui';

const FINE_POINTER = '(hover: hover) and (pointer: fine)';

export default function OfflinePill() {
  const pill = useConnectionPill();
  return <ConnectionPillView state={pill} />;
}

/** The pill for any state — the live one above, and `/design`'s pretend one. */
export function ConnectionPillView({ state }: { state: PillState }) {
  const laptop = useMedia(FINE_POINTER);
  const words = pillWords(state, laptop ? 'laptop' : 'tablet');
  const motionTokens = useMotion();
  const back = state.phase === 'back' || state.phase === 'syncing';

  return (
    <AnimatePresence>
      {words && (
        <motion.div
          key="pill"
          role="status"
          aria-live="polite"
          data-offline-pill={state.phase}
          initial={{ y: -64, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -64, opacity: 0 }}
          /* The idea page's half-second drop, landing soft. */
          transition={{ duration: 0.45, ease: motionTokens.ease.settle }}
          style={{
            justifySelf: 'center',
            position: 'relative',
            display: 'inline-flex', alignItems: 'center', gap: 8,
            height: 32, padding: '0 14px 0 10px',
            borderRadius: 'var(--r-pill)',
            backgroundImage: 'var(--glass-fill-3)',
            boxShadow: 'var(--glass-shadow-thick), var(--glass-rim-2)',
            color: back ? 'var(--job-lime-text)' : 'var(--fg-2)',
            transition: 'color var(--dur-slow) var(--ease-glass)',
            font: 'var(--type-label)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
        >
          <span
            aria-hidden
            style={{
              position: 'absolute', inset: 0, borderRadius: 'inherit',
              backgroundImage: 'var(--glass-tint-lime)',
              boxShadow: 'inset 0 0 0 1px var(--job-lime-line)',
              opacity: back ? 1 : 0,
              transition: 'opacity var(--dur-slow) var(--ease-glass)',
            }}
          />
          <Icon name={back ? 'cloud-check' : 'cloud-off'} size={16} style={{ position: 'relative' }} />
          <Words text={words} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The words fade across when they change; the first ones arrive with the pill. */
function Words({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const said = useRef(text);
  useLayoutEffect(() => {
    if (said.current === text) return;
    said.current = text;
    ref.current?.animate([{ opacity: 0, filter: 'blur(3px)' }, { opacity: 1, filter: 'blur(0)' }], {
      duration: 260, easing: 'ease-out',
    });
  }, [text]);
  return (
    <span ref={ref} style={{ position: 'relative' }}>
      {text}
    </span>
  );
}
