/**
 * Where a tick's cheer is drawn (29-1P4b), mounted once in `App.tsx` beside
 * `UndoHost`: the fixed layer the gold +1s float in (idea 41), and the
 * "3 in a row!" chip that drops in at the top of the screen (idea 90).
 *
 * The chip is the card's: it drops in at the second quick tick, says "3 in a
 * row!" from the third, bumps on each one after, warms gold → amber → orange →
 * coral (his call over the colour jobs), and slips away eight seconds after
 * the last tick. That is a single timeout, re-armed per tick — nothing loops
 * while it waits. The top of the screen, because the undo toast that the
 * same tick raises sits at the bottom.
 *
 * The rules for which ticks cheer are in `lib/tickCheer.ts`. Since 29-1P14a
 * the big ones' confetti is drawn in the same layer (`lib/confetti.ts`).
 */
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon, useMotion, useV3, v3Attr } from '../ui';
import { Z } from '../lib/zLayers';
import { COMBO_WINDOW_MS, NO_COMBO, comboColour, comboLabel, setCheerLayer, useComboStore } from '../lib/tickCheer';
import { setConfettiLayer } from '../lib/confetti';

/** The +1s and the confetti (29-1P14a) share the one layer. */
function setLayer(el: HTMLDivElement | null): void {
  setCheerLayer(el);
  setConfettiLayer(el);
}

export default function TickCheerHost() {
  const v3 = v3Attr(useV3());
  const motionTokens = useMotion();
  const { n, last } = useComboStore();
  const chip = useRef<HTMLDivElement>(null);
  const shown = useRef(false);

  /* The chip slips away a run's length after the last tick. */
  useEffect(() => {
    if (n === 0) return;
    const t = setTimeout(() => useComboStore.setState(NO_COMBO), COMBO_WINDOW_MS);
    return () => clearTimeout(t);
  }, [n, last]);

  /* Already down, so each further tick bumps it instead. */
  useEffect(() => {
    const on = n >= 2;
    if (on && shown.current && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      chip.current?.animate?.(
        [{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }],
        { duration: 380, easing: 'cubic-bezier(.34,1.56,.64,1)' },
      );
    }
    shown.current = on;
  }, [n]);

  return createPortal(
    <div
      {...v3}
      ref={setLayer}
      data-tick-cheer=""
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: Z.toast }}
    >
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'absolute', left: 0, right: 0,
          top: 'calc(env(safe-area-inset-top, 0px) + var(--sp-6))',
          display: 'flex', justifyContent: 'center',
        }}
      >
        <AnimatePresence>
          {n >= 2 && (
            <motion.div
              key="combo"
              initial={{ y: -60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -60, opacity: 0 }}
              transition={{ duration: motionTokens.dur.slow * 1.6, ease: motionTokens.ease.springy }}
            >
              <div
                ref={chip}
                data-combo={n}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 30, padding: '0 12px 0 9px', borderRadius: 15,
                  font: '700 13px / 1 var(--font-sans)', letterSpacing: 'var(--tracking-ui)',
                  color: 'var(--job-gold-ink)',
                  backgroundColor: comboColour(n),
                  /* A still glow in the chip's own colour, as the card's. */
                  boxShadow: `0 0 22px -2px ${comboColour(n)}`,
                  transition: 'background-color 400ms var(--ease-glass), box-shadow 400ms var(--ease-glass)',
                }}
              >
                <Icon name="flame" size={14} style={{ color: 'inherit' }} />
                {comboLabel(n)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>,
    document.body,
  );
}
