/**
 * The tray of undated tasks (29-2e3b, idea 125): beside the Calendar's hours,
 * behind the header's "No date" (his calls, 2026-10-22: behind a button, both
 * ways, all of them). What is in it and in what order is
 * `lib/calendar/tray.ts`; the drag is the hours' own `useBlockDrag`, so a row
 * held still lifts, lights a quarter on the hours and is due at its end.
 *
 * A column at the right on the laptop, a strip under the hours on a narrow
 * window, each scrolling its own way, so a finger that moves at once scrolls
 * the tray and one that holds picks a task up. A tap opens the task. A block
 * held from the hours lights the whole tray as a place to drop it
 * (`data-drop-hot`, written by the gesture), and the line at its top says
 * what letting go will do.
 */
import { useRef, type Ref } from 'react';
import { LitLine } from '../../ui';
import { getListTitle, taskEstimatedMinutes, useStore, type Task } from '../../store/useStore';
import { formatMinutes } from '../../lib/dashboard/blockData';
import { useRevealOnScroll } from '../../lib/useRevealOnScroll';
import { dustAttr } from '../../lib/dust';
import type { useBlockDrag } from './useBlockDrag';

export default function CalendarTray({ ref, tasks, wide, drag, onOpenTask }: {
  ref: Ref<HTMLElement>;
  tasks: readonly Task[];
  wide: boolean;
  drag: ReturnType<typeof useBlockDrag>;
  onOpenTask: (task: Task) => void;
}) {
  const lists = useStore((s) => s.taskLists);
  const scroller = useRef<HTMLDivElement>(null);
  /* Rule 3: the rows near the screen, however many tasks have no date. */
  const { count, sentinelRef } = useRevealOnScroll(tasks.length, scroller, 24, 24);

  return (
    <aside ref={ref} className="cal-tray" data-wide={wide || undefined} aria-label="Tasks with no date">
      <p className="cal-tray-head">
        <span className="cal-tray-idle">
          {tasks.length > 0 && <LitLine text={wide ? '**Hold one** and drag it onto **the hours**.' : '**Hold one** and drag it up.'} />}
        </span>
        <span className="cal-tray-take">Let go to take its date off</span>
        <span className="cal-tray-keep">A repeating task keeps its date</span>
      </p>
      <div ref={scroller} className="cal-tray-rows ag-scroll ag-fade">
        {tasks.length === 0 && (
          <LitLine as="p" className="cal-tray-empty" text="**Every task has a date.** Drag a block here to take it off." />
        )}
        {tasks.slice(0, count).map((task) => {
          const minutes = taskEstimatedMinutes(task);
          const list = getListTitle(lists, task.listId, task.listName);
          return (
            <button
              key={task.id}
              type="button"
              {...dustAttr('task', task.id)}
              data-drag-row=""
              className="tl-item cal-tray-item"
              title={`${task.title} · ${formatMinutes(minutes)}`}
              onPointerDown={(e) => drag.press(e, { taskId: task.id, day: null, start: 0, minutes, refusal: null })}
              onClick={() => drag.isTap() && onOpenTask(task)}
            >
              <span className="tl-item-title">{task.title}</span>
              <span className="tl-item-time">{formatMinutes(minutes)}{list ? ` · ${list}` : ''}</span>
            </button>
          );
        })}
        {count < tasks.length && <div ref={sentinelRef} aria-hidden="true" className="cal-tray-sentinel" />}
      </div>
    </aside>
  );
}
