/**
 * Quick actions on hover (idea 161, 29-1P7c, BIG-15; Todoist, Linear).
 * Point at a task card and a small bar arrives in its top-right corner:
 * **Start**, **Tomorrow**, **Done**, and the card's own ⋯ for the rest.
 *
 * HIS CALLS, 2026-10-13
 * ---------------------
 * - **Laptop only.** It mounts on Framer's hover, which a finger never
 *   fires, and `screens.css` hides it on a touch screen besides. The tablet
 *   already has all three: swipe right is Done, swipe left is Tomorrow, and
 *   the ⋯ (always visible there) has Start.
 * - **Top-right, over the badges.** It takes the place of the hover ⋯ — the
 *   ⋯ itself stays where it is, the same `MorphMenu` trigger, and the bar is a
 *   plate that slides in to its left, covering the score, the badges and the
 *   ✦ Ask while the pointer is on the card. Nothing on the card moves.
 *
 * WHAT EACH BUTTON IS
 * -------------------
 * Every verb is one that already exists, reached the way the rest of the app
 * reaches it, so the bar cannot grow a second opinion about any of them:
 *   - **Start** is the ⋯ menu's own "Start now" (`useStartNowItems`, BUILD-2),
 *     and it **arms in place** when starting would set a session or today's
 *     plan aside — his 2026-09-16 rule that a plan never vanishes on one tap.
 *     A blocked task has no Start here; its ⋯ offers what it waits on.
 *   - **Tomorrow** is the left swipe (`startTaskTomorrow`): the start date
 *     becomes tomorrow, the undo toast names it.
 *   - **Done** is the right swipe: `pressTick` on the card's own box, so the
 *     tick pops, sounds and cheers exactly as pressing the box does. Absent on
 *     a locked task, whose box refuses.
 * A finished task gets no bar: its box un-ticks it, and nothing else applies.
 *
 * Colours by job: Start's play is orange (go), Tomorrow's calendar sky (a
 * date), Done's check lime (done).
 *
 * BUILT ON THE FIRST HOVER, THEN SHOWN BY CSS. Never per row at load
 * (performance rule 2), and once built it stays and fades (`screens.css`,
 * `.ag-card:hover .ag-quick`) — "fade, never unmount". It was a Framer
 * `AnimatePresence` child first, mounted per hover, and its exit never
 * finished: the bar stayed on the card after the mouse left (measured in
 * Chromium, 2026-10-13).
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../ui';
import type { Task } from '../../store/useStore';
import { useStartNowItems } from '../task-fields/startNowMenu';
import { startTaskTomorrow } from '../../lib/startTomorrow';
import { pressTick } from './pressTick';

/** Below this card width the three buttons drop their words (the tooltips keep them). */
const WORDS_FROM = 360;

export function QuickActions({ task, locked, active, onToggleDone }: {
  task: Task;
  locked: boolean;
  /** The pointer is on the card. Leaving it disarms a Start that was asking. */
  active: boolean;
  onToggleDone: (task: Task) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [words, setWords] = useState(true);
  const [armed, setArmed] = useState(false);
  if (!active && armed) setArmed(false);

  /* Measured once, on the hover that built it — never on a screen's way in
     (performance rule 6). */
  useLayoutEffect(() => {
    const card = ref.current?.closest('.ag-row');
    if (card) setWords(card.clientWidth >= WORDS_FROM);
  }, []);

  const start = useStartNowItems(task.id).find((i) => i.value === 'start-now');

  const pressStart = () => {
    if (!start) return;
    if (start.confirm) { setArmed(true); return; }
    start.onSelect?.();
  };

  const pressDone = () => {
    const box = ref.current?.closest('.ag-row')?.querySelector<HTMLElement>('.ag-check__box') ?? null;
    pressTick(box, false, () => onToggleDone(task));
  };

  return (
    <div
      ref={ref}
      className="ag-quick"
      /* A press on the bar's own padding is not a press on the card. */
      onClick={(e) => e.stopPropagation()}
    >
      {armed && start?.confirm ? (
        <>
          <span className="ag-quick__ask" title={typeof start.confirm.hint === 'string' ? start.confirm.hint : undefined}>{start.confirm.label}</span>
          <button
            type="button"
            className="ag-quick__btn ag-quick__btn--yes"
            onClick={() => { setArmed(false); start.confirm?.onConfirm?.(); }}
          >
            {start.confirm.action ?? 'Start'}
          </button>
          <button type="button" className="ag-quick__btn" aria-label="Don't start" title="Don't start" onClick={() => setArmed(false)}>
            <Icon name="x" size={14} />
          </button>
        </>
      ) : (
        <>
          {start && (
            <button type="button" className="ag-quick__btn" aria-label={`Start ${task.title}`} title="Start now" onClick={pressStart}>
              <Icon name="play" size={14} style={{ color: 'var(--job-orange)' }} />
              {words && 'Start'}
            </button>
          )}
          <button
            type="button"
            className="ag-quick__btn"
            aria-label={`Start ${task.title} tomorrow`}
            title="Start it tomorrow"
            onClick={() => startTaskTomorrow(task.id, task.title)}
          >
            <Icon name="calendar-plus" size={14} style={{ color: 'var(--job-sky)' }} />
            {words && 'Tomorrow'}
          </button>
          {!locked && (
            <button type="button" className="ag-quick__btn" aria-label={`Mark ${task.title} done`} title="Done" onClick={pressDone}>
              <Icon name="check" size={14} style={{ color: 'var(--job-lime)' }} />
              {words && 'Done'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
