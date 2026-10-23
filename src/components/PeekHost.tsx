/**
 * The card a held task row raises (idea 22, 29-1P6b) — mounted once in
 * `App.tsx` beside `UndoHost`. How a press becomes a peek is `lib/peek.ts`.
 *
 * The idea card's look, in BASE's own pieces: the page behind sinks back the
 * way it does behind a sheet (`sinkPage`, 29-1P6a) and dims, and the card
 * springs up out of the row from 60% — the idea page blurred the page as well,
 * which is a full-screen filter on the tablet (CLAUDE.md "Performance", rule
 * 4); the sink and the dim say the same thing for a transform and an opacity.
 * It says what the row has no room for: where the task lives, how long it
 * takes, when it is due, what it waits on, its score, and the start of its
 * notes. Letting go and it is gone.
 *
 * Nothing is built until the first peek, and the card's own reads (the scores
 * above all) run only while one is up.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, useV3, v3Attr } from '../ui';
import { Z } from '../lib/zLayers';
import { installPeek, usePeekStore } from '../lib/peek';
import { sinkPage, prefersReducedMotion } from '../ui/overlay/sheetMotion';
import { useStore, getBlockingTasks, getListTitle, type Task } from '../store/useStore';
import { usePriorityScores } from '../store/usePriorityScores';
import { minutesLabel, subtaskCount } from './project/derive';
import { DueDate } from './task-fields/DueDate';
import { describeDate, resolveUserTimeZone } from '../lib/agent/dates';

const GUTTER = 16;
const WIDTH = 360;

export default function PeekHost() {
  useEffect(() => { installPeek(); }, []);
  const taskId = usePeekStore((s) => s.taskId);
  const from = usePeekStore((s) => s.from);
  /* What is on screen: the last peek stays drawn while it fades away. Taken
     from the store as it changes, during render (React's "adjust state when
     a prop changes"), so nothing renders twice to catch up. */
  const [shown, setShown] = useState<{ taskId: string; from: DOMRect | null } | null>(null);
  if (taskId && (shown?.taskId !== taskId || shown.from !== from)) setShown({ taskId, from });
  const leaving = !taskId && shown !== null;
  const gone = useCallback(() => setShown(null), []);

  /* The page sinks behind it as behind a sheet, for as long as it is up. */
  useEffect(() => {
    if (!taskId) return undefined;
    sinkPage(true);
    return () => sinkPage(false);
  }, [taskId]);

  if (!shown) return null;
  return (
    <PeekLayer
      key={shown.taskId + String(shown.from?.top)}
      taskId={shown.taskId}
      from={shown.from}
      leaving={leaving}
      onGone={gone}
    />
  );
}

function PeekLayer({ taskId, from, leaving, onGone }: {
  taskId: string;
  from: DOMRect | null;
  leaving: boolean;
  onGone: () => void;
}) {
  const v3 = v3Attr(useV3());
  const card = useRef<HTMLDivElement>(null);
  const dim = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; origin: string } | null>(null);
  const task = useStore((s) => s.backlogTasks.find((t) => t.id === taskId));

  /* Placed over the row it came from, kept on screen. Measured once, as it
     opens — an event, not a screen being shown (Performance rule 6). */
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const cx = from ? from.left + from.width / 2 : vw / 2;
    const cy = from ? from.top + from.height / 2 : vh / 2;
    const left = Math.min(Math.max(cx - w / 2, GUTTER), Math.max(GUTTER, vw - w - GUTTER));
    const top = Math.min(Math.max((from ? from.top : vh / 2) - 12, GUTTER), Math.max(GUTTER, vh - h - GUTTER));
    setPos({ left, top, origin: `${cx - left}px ${cy - top}px` });
  }, [from]);

  /* Up: springs out of the row, the idea page's .6 → 1. */
  useLayoutEffect(() => {
    if (!pos || prefersReducedMotion()) return;
    const up = card.current?.animate(
      [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
      { duration: 350, easing: 'cubic-bezier(.34,1.3,.64,1)' },
    );
    const fade = dim.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'ease-out' });
    return () => { up?.cancel(); fade?.cancel(); };
  }, [pos]);

  /* Let go: back into the row, quicker. */
  useEffect(() => {
    if (!leaving) return;
    if (prefersReducedMotion() || !card.current) { onGone(); return; }
    const down = card.current.animate(
      [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(.85)', opacity: 0 }],
      { duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' },
    );
    dim.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
    down.onfinish = onGone;
    return () => { down.onfinish = null; };
  }, [leaving, onGone]);

  return createPortal(
    <div {...v3} aria-live="polite" style={{ position: 'fixed', inset: 0, zIndex: Z.dropdown, pointerEvents: 'none' }}>
      <div ref={dim} style={{ position: 'absolute', inset: 0, backgroundColor: 'oklch(0 0 0 / 0.38)' }} />
      <div
        ref={card}
        data-peek-card=""
        role="dialog"
        aria-label={task ? `Peek: ${task.title}` : 'Peek'}
        style={{
          position: 'absolute',
          left: pos?.left ?? -9999, top: pos?.top ?? 0,
          width: `min(${WIDTH}px, calc(100vw - ${GUTTER * 2}px))`,
          transformOrigin: pos?.origin ?? '50% 50%',
          display: 'grid', gap: 'var(--sp-4)', padding: 'var(--sp-7)',
          borderRadius: 'var(--r-lg)',
          backgroundImage: 'var(--glass-fill-3)',
          backgroundColor: 'var(--glass-floor)',
          boxShadow: 'var(--glass-shadow-thick)',
        }}
      >
        {task ? <PeekBody task={task} /> : (
          <span style={{ font: 'var(--type-body)', color: 'var(--fg-3)' }}>This task is not in a list any more.</span>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** What the card says. Its own component so the scores are read only while a peek is up. */
function PeekBody({ task }: { task: Task }) {
  const taskLists = useStore((s) => s.taskLists);
  const projects = useStore((s) => s.projects);
  const backlogTasks = useStore((s) => s.backlogTasks);
  const reading = usePriorityScores().read(task);
  const timeZone = resolveUserTimeZone();

  const list = taskLists.find((l) => l.id === task.listId);
  const project = list?.projectId ? projects.find((p) => p.id === list.projectId) : undefined;
  const where = [project?.name, getListTitle(taskLists, task.listId, task.listName)].filter(Boolean).join(' · ');
  const done = task.status === 'completed';
  const subs = subtaskCount(task);
  const waits = done ? [] : getBlockingTasks(backlogTasks, task);
  const minutes = task.estimatedTime ?? 0;
  /* A start set by a swipe is a day, not a minute: "Tue, 13 Oct 2026", not "…, 00:00". */
  const day = (value: string) => describeDate(value, timeZone).replace(/, 00:00$/, '');

  const fact = (icon: Parameters<typeof Icon>[0]['name'], text: string, colour = 'var(--fg-2)') => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)', color: colour, whiteSpace: 'nowrap' }}>
      <Icon name={icon} size={14} />
      {text}
    </span>
  );

  return (
    <>
      <span
        className="ag-clamp-2"
        style={{ font: 'var(--type-title)', fontSize: 'var(--text-md)', color: 'var(--fg-1)', overflowWrap: 'anywhere' }}
      >
        {task.title}
      </span>
      {where && <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>{where}</span>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-3) var(--sp-5)', font: 'var(--type-caption)', fontVariantNumeric: 'tabular-nums' }}>
        {done && fact('check', 'Done', 'var(--job-lime)')}
        {minutes > 0 && fact('clock', minutesLabel(minutes))}
        {/* 29-1P7a: the card's own calendar page, so a peek matches its row. */}
        {!done && <DueDate deadline={task.deadline} />}
        {task.startDate && !done && fact('calendar-plus', `starts ${day(task.startDate)}`, 'var(--job-sky)')}
        {subs.total > 0 && fact('list-checks', `${subs.done}/${subs.total} subtasks`)}
      </div>
      {waits.length > 0 && (
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
          Waiting on: <span style={{ color: 'var(--fg-1)' }}>{waits.map((t) => t.title).join(', ')}</span>
        </span>
      )}
      {task.description?.trim() && (
        <span
          style={{
            display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty', overflowWrap: 'anywhere',
          }}
        >
          {task.description.trim()}
        </span>
      )}
      {reading.score > 0 && (
        <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-2)' }}>
          Score {reading.score.toFixed(1)}
        </span>
      )}
    </>
  );
}
