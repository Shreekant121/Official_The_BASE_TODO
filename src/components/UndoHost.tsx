/**
 * Every way into his undo (29-1P4a), mounted once in `App.tsx` beside
 * `CommandPaletteHost`:
 *
 * - **The toast with a draining bar** (idea 6, Gmail) after a tick, a delete
 *   or a move — "Ticked “Oil Hair” · Undo". An archive has its own line,
 *   `ArchiveToast`, which carries the same Undo; an untick, a date and an
 *   importance change are undoable but say nothing, as the plan has it —
 *   unless the press names itself (`sayThisPress`): a swipe that starts a
 *   task tomorrow changes nothing visible on its row, so it says so (29-1P6b).
 * - **Ctrl+Z, and Ctrl+Shift+Z or Ctrl+Y to redo** — a modifier chord, so it
 *   lives here beside Ctrl+K and never in the single-key registry. In a text
 *   field it is the field's own undo, untouched.
 * - **Two fingers to undo, three to redo** (idea 130, Procreate), anywhere on
 *   the tablet, with a small bubble where the fingers were saying what came
 *   back.
 *
 * The undo itself is `store/useUndoStore.ts`; this file only listens and says.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useUndoStore, type UndoAction } from '../store/useUndoStore';
import { useUIStore } from '../store/useUIStore';
import { Icon, Toast, useMotion, useV3, v3Attr } from '../ui';
import { Z } from '../lib/zLayers';
import { cue } from '../lib/sound';

/** The idea page's five seconds. */
const HOLD_MS = 5000;
/** The kinds that raise the toast — his plan: "after a tick, delete or move". */
const TOASTED = new Set<UndoAction['kind']>(['tick', 'delete', 'move', 'mixed']);

/* Two- and three-finger taps: every finger down within this long of the first,
   all of them up within `TAP_MS`, none travelling more than `SLOP_PX`. A pinch
   or a two-finger scroll moves; a tap does not. */
const GATHER_MS = 250;
const TAP_MS = 450;
const SLOP_PX = 14;

type Note = {
  key: number;
  title: string;
  detail?: string;
  icon: 'check' | 'trash-2' | 'move' | 'undo-2' | 'redo' | 'calendar-plus';
  tone: 'accent' | 'neutral';
  action?: { label: string; onClick: () => void };
  hold: number;
};

type Bubble = { key: number; x: number; y: number; text: string; fingers: { x: number; y: number }[] };

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** "Ticked “Oil Hair”" → "ticked “Oil Hair”", for after "Undone:". */
const lower = (label: string) => label.charAt(0).toLowerCase() + label.slice(1);

export default function UndoHost() {
  const [note, setNote] = useState<Note | null>(null);
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const keyRef = useRef(0);
  const motionTokens = useMotion();
  const v3 = useV3();

  /*
   * What the store just did. A subscription rather than a render: the toast
   * is a reaction to an event, and two presses in a row with the same
   * outcome are still two toasts.
   *
   * `latest` — a press just recorded: the toast, for the kinds that get one.
   * `ran` — an undo or redo just ran, from here, from Ctrl+Z, or from the
   * archive's own toast. One place sounds it and says it, so every route reads
   * alike; fingers get their bubble instead (the touch handler draws it, since
   * it knows where the fingers were).
   */
  useEffect(() => useUndoStore.subscribe((s, prev) => {
    if (s.latest && s.latest !== prev.latest && (TOASTED.has(s.latest.kind) || s.latest.loud)) {
      const { id, kind, label } = s.latest;
      setNote({
        key: ++keyRef.current,
        title: label,
        detail: kind === 'delete' ? 'In the Trash for 30 days' : undefined,
        icon: kind === 'tick' ? 'check' : kind === 'delete' ? 'trash-2' : kind === 'move' ? 'move' : kind === 'date' ? 'calendar-plus' : 'undo-2',
        tone: kind === 'tick' ? 'accent' : 'neutral',
        action: { label: 'Undo', onClick: () => { useUndoStore.getState().undo('toast', id); } },
        hold: HOLD_MS,
      });
    }
    const ran = s.ran;
    if (!ran || ran === prev.ran) return;
    cue(ran.op);
    if (ran.action.kind === 'archive') useUIStore.getState().clearArchiveNotice();
    if (ran.via === 'fingers') { setNote(null); return; }
    const id = ran.action.id;
    setNote({
      key: ++keyRef.current,
      title: `${ran.op === 'undo' ? 'Undone' : 'Redone'}: ${lower(ran.action.label)}`,
      icon: ran.op === 'undo' ? 'undo-2' : 'redo',
      tone: 'neutral',
      action: ran.op === 'undo'
        ? { label: 'Redo', onClick: () => { useUndoStore.getState().redo('toast'); } }
        : { label: 'Undo', onClick: () => { useUndoStore.getState().undo('toast', id); } },
      hold: HOLD_MS,
    });
  }), []);

  /* The hold. Each note is its own key, so a new one restarts it. */
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote((n) => (n?.key === note.key ? null : n)), note.hold);
    return () => clearTimeout(t);
  }, [note]);

  useEffect(() => {
    if (!bubble) return;
    const t = setTimeout(() => setBubble((b) => (b?.key === bubble.key ? null : b)), 1500);
    return () => clearTimeout(t);
  }, [bubble]);

  /* Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k !== 'z' && k !== 'y') return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      const redo = k === 'y' || e.shiftKey;
      const store = useUndoStore.getState();
      const did = redo ? store.redo('keys') : store.undo('keys');
      if (!did) {
        setNote({ key: ++keyRef.current, title: redo ? 'Nothing to redo' : 'Nothing to undo', icon: redo ? 'redo' : 'undo-2', tone: 'neutral', hold: 1800 });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /*
   * Two and three fingers. Touch events, not pointer events: when the browser
   * takes a gesture for itself (a pinch, a scroll) it cancels the pointers and
   * goes quiet, so a pinch would look like a tap; touch events keep reporting
   * the movement that tells the two apart. Passive, so scrolling never waits.
   */
  useEffect(() => {
    let start = 0;
    let most = 0;
    let spoiled = false;
    const origin = new Map<number, { x: number; y: number }>();
    let swallowUntil = 0;

    const reset = () => { start = 0; most = 0; spoiled = false; origin.clear(); };

    const onStart = (e: TouchEvent) => {
      const now = performance.now();
      if (origin.size === 0 && e.touches.length === e.changedTouches.length) { reset(); start = now; }
      else if (now - start > GATHER_MS) spoiled = true;
      for (const t of Array.from(e.changedTouches)) origin.set(t.identifier, { x: t.clientX, y: t.clientY });
      most = Math.max(most, e.touches.length);
    };
    const onMove = (e: TouchEvent) => {
      if (spoiled) return;
      for (const t of Array.from(e.changedTouches)) {
        const o = origin.get(t.identifier);
        if (o && Math.hypot(t.clientX - o.x, t.clientY - o.y) > SLOP_PX) { spoiled = true; return; }
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length > 0) return;
      const fingers = [...origin.values()];
      /* Read before `reset` empties it. */
      const count = most;
      const ok = !spoiled && (count === 2 || count === 3) && performance.now() - start < TAP_MS && fingers.length === count;
      reset();
      if (!ok) return;
      swallowUntil = performance.now() + 400;
      const x = fingers.reduce((a, f) => a + f.x, 0) / fingers.length;
      const y = fingers.reduce((a, f) => a + f.y, 0) / fingers.length;
      const store = useUndoStore.getState();
      let text: string;
      if (count === 2) {
        const undone = store.undo('fingers');
        text = undone ? `↶ Undone: ${lower(undone.label)}` : 'Nothing to undo';
      } else {
        const redone = store.redo('fingers');
        text = redone ? `↷ Redone: ${lower(redone.label)}` : 'Nothing to redo';
      }
      setBubble({ key: ++keyRef.current, x, y, text, fingers });
    };
    const onCancel = () => reset();
    /* A finger of the tap may still be read as a click on what is under it. */
    const onClick = (e: MouseEvent) => {
      if (performance.now() < swallowUntil) { e.stopPropagation(); e.preventDefault(); }
    };

    document.addEventListener('touchstart', onStart, { passive: true, capture: true });
    document.addEventListener('touchmove', onMove, { passive: true, capture: true });
    document.addEventListener('touchend', onEnd, { passive: true, capture: true });
    document.addEventListener('touchcancel', onCancel, { passive: true, capture: true });
    document.addEventListener('click', onClick, { capture: true });
    return () => {
      document.removeEventListener('touchstart', onStart, { capture: true });
      document.removeEventListener('touchmove', onMove, { capture: true });
      document.removeEventListener('touchend', onEnd, { capture: true });
      document.removeEventListener('touchcancel', onCancel, { capture: true });
      document.removeEventListener('click', onClick, { capture: true });
    };
  }, []);

  return (
    <>
      <div
        style={{
          position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--sp-13) + var(--safe-b))',
          display: 'grid', placeItems: 'center', zIndex: Z.toast, pointerEvents: 'none',
          padding: '0 var(--sp-5)',
        }}
      >
        <AnimatePresence>
          {note && (
            <motion.span
              key={note.key}
              /* One cell: the toast leaving and the one arriving overlap
                 rather than stack while the first fades. */
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: motionTokens.dur.slow, ease: motionTokens.ease.glass }}
              style={{ pointerEvents: 'auto', gridArea: '1 / 1' }}
            >
              <Toast
                data-undo-toast=""
                icon={note.icon === 'redo'
                  ? <Icon name="undo-2" size={16} style={{ transform: 'scaleX(-1)' }} />
                  : <Icon name={note.icon} size={16} />}
                title={note.title}
                detail={note.detail}
                tone={note.tone}
                action={note.action}
                drainMs={note.action ? note.hold : undefined}
                onDismiss={() => setNote(null)}
              />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      {bubble && createPortal(<FingerBubble key={bubble.key} bubble={bubble} v3={v3Attr(v3)} />, document.body)}
    </>
  );
}

/**
 * Where the fingers were: a ring for each that swells and fades, and the
 * sentence above them. One-off Web Animations — nothing here loops.
 */
function FingerBubble({ bubble, v3 }: { bubble: Bubble; v3: Record<string, string | undefined> }) {
  const label = useRef<HTMLDivElement>(null);
  const rings = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    label.current?.animate?.(
      [
        { opacity: 0, transform: 'translate(-50%, -80%) scale(.9)' },
        { opacity: 1, transform: 'translate(-50%, -100%)', offset: 0.2 },
        { opacity: 1, transform: 'translate(-50%, -100%)', offset: 0.75 },
        { opacity: 0, transform: 'translate(-50%, -115%)' },
      ],
      { duration: 1500, easing: 'ease-out', fill: 'forwards' },
    );
    for (const r of rings.current) {
      r?.animate?.([{ transform: 'scale(.4)', opacity: 1 }, { transform: 'scale(1.3)', opacity: 0 }], { duration: 500, easing: 'ease-out', fill: 'forwards' });
    }
  }, []);
  /* Kept on screen: a bubble at the very edge would print half off it. */
  const x = Math.min(Math.max(bubble.x, 120), window.innerWidth - 120);
  const y = Math.max(bubble.y - 24, 60);
  return (
    <div {...v3} aria-live="polite" style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: Z.toast }}>
      {bubble.fingers.map((f, i) => (
        <span
          key={i}
          ref={(el) => { rings.current[i] = el; }}
          style={{
            position: 'absolute', left: f.x - 17, top: f.y - 17, width: 34, height: 34, borderRadius: '50%',
            boxShadow: '0 0 0 2px var(--fg-2)', opacity: 0,
          }}
        />
      ))}
      <div
        ref={label}
        data-undo-bubble=""
        style={{
          position: 'absolute', left: x, top: y, transform: 'translate(-50%, -100%)',
          maxWidth: 'min(80vw, 360px)', padding: '8px 14px', borderRadius: 'var(--r-md)',
          backgroundImage: 'var(--glass-fill-3)', boxShadow: 'var(--glass-shadow-thick)',
          font: 'var(--type-label)', color: 'var(--fg-1)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        {bubble.text}
      </div>
    </div>
  );
}
