/**
 * **Start now** (BUILD-2): one task, from its own row, straight into Focus,
 * alone, with the clock already running.
 *
 * One hook for every row that offers it — the project board card, the list
 * view row, and a *Firing today* row on Notifications — so the three cannot
 * disagree about what the verb does. Like `emergencyMenu.tsx` it hands back
 * `MorphMenuItem`s to spread into a row's `items`, because a `MorphMenu` is
 * rows and nothing else.
 *
 * WHETHER A TASK CAN START IS NOT DECIDED HERE
 * --------------------------------------------
 * `planStartNow` in `lib/smartStart.ts` answers it, with the same chain walk
 * Smart Start uses. The item was explicit that starting one task alone must not
 * grow a second opinion about it. **The blocked case is the design**, in
 * Shreekant's words: *"just leave that one and give an option to start tasks
 * that block it."* So a blocked row offers the prerequisites that can start,
 * each one its own Start item, and there is no override.
 *
 * REPLACING A SESSION ASKS FIRST
 * ------------------------------
 * His call, 2026-09-16. Starting a task means today's queue becomes that one
 * task, so the item arms in place (`confirm`) whenever pressing it would put
 * something aside: a session on another task, or other tasks planned for
 * today. Nothing is lost either way — the running stretch is banked into the
 * focus log by `clear()`, and a queued task is only a copy of a backlog task
 * that stays in its project — but a plan he made should not vanish on one tap.
 * The confirm strip is rose because that is `MorphMenu`'s only confirm.
 *
 * Starting the task a session is already on keeps its clock: the run is not
 * cleared and the queue keeps its own copy, so `attach` sees nothing new.
 *
 * **Tapping a notification (BUILD-5) is the sixth surface**, and it is a page
 * rather than a menu — `pages/StartFromPushPage.tsx` — so it takes
 * `startQueue` and `setAside` directly rather than the items.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon, type MorphMenuItem } from '../../ui';
import { useStore, taskFocusSeconds, type Task } from '../../store/useStore';
import { useFocusRun, subjectOf } from '../../store/useFocusRun';
import { planStartNow } from '../../lib/smartStart';
import { ignoredWorkOf } from '../../lib/ignoredWork';
import { cue } from '../../lib/sound';

/** How many startable prerequisites a blocked row lists. A menu is not a report. */
const MAX_OFFERED = 3;

/**
 * Makes `queue` today's whole queue and presses play on it.
 *
 * Read from the stores at press time rather than from the render that built
 * the menu: a menu can sit open while a session on the tablet moves the queue.
 */
export function startQueue(queue: Task[], navigate: (to: string) => void) {
  const head = queue[0];
  const app = useStore.getState();
  const run = useFocusRun.getState();

  if (run.task?.id === head.id) {
    /* Same task: keep the session's clock and the queue's own copy of it. */
    const current = app.tasks.find((t) => t.id === head.id) ?? head;
    app.setTasks([current]);
  } else {
    run.clear();
    app.setTasks(queue);
    /* What `FocusMode` will attach on mount, so its own call is a no-op and
       the clock it paints is the one started here. */
    run.attach(subjectOf(head), taskFocusSeconds(head), app.sessionDuration);
  }
  /* `start`, not `resume`: a session made here begins with its one breath
     (29-1P10a, idea 95); the same task carried on just carries on. */
  useFocusRun.getState().start();
  navigate('/focus');
}

/**
 * What pressing Start on `taskId` would set aside, as the confirm strip's
 * wording — or `null` when nothing would be and the press can go straight.
 */
export function setAside(taskId: string, runTitle: string | null, runId: string | null, queue: Task[]) {
  /* The running task is named on its own line, so it is not an "other". */
  const others = queue.filter((t) => t.id !== taskId && t.id !== runId).length;
  const planned = others > 0
    ? `Also clears ${others} other task${others === 1 ? '' : 's'} from today’s plan; ${others === 1 ? 'it stays' : 'they stay'} in the project.`
    : '';

  if (runId !== null && runId !== taskId) {
    return {
      label: 'Replace the running session?',
      hint: `“${runTitle}” stops; its time so far is kept.${planned ? ` ${planned}` : ''}`,
    };
  }
  if (others > 0) return { label: 'Replace today’s queue?', hint: planned };
  return null;
}

/**
 * The Start item(s) for one row. Empty for a task that cannot be started at
 * all — a finished one, or anything not in the backlog — so a spread adds
 * nothing.
 */
export function useStartNowItems(taskId: string): MorphMenuItem[] {
  const navigate = useNavigate();
  const backlogTasks = useStore((s) => s.backlogTasks);
  const queue = useStore((s) => s.tasks);
  const runId = useFocusRun((s) => s.task?.id ?? null);
  const runTitle = useFocusRun((s) => s.task?.title ?? null);

  const lists = useStore((s) => s.taskLists);
  const projects = useStore((s) => s.projects);
  const plan = useMemo(
    () => planStartNow(backlogTasks, taskId, ignoredWorkOf(backlogTasks, lists, projects).ids),
    [backlogTasks, taskId, lists, projects],
  );

  const item = (value: string, label: string, target: Task): MorphMenuItem => {
    const go = () => {
      /* Re-planned at press time, for the reason `startQueue` reads the stores. */
      const fresh = planStartNow(useStore.getState().backlogTasks, target.id);
      if (fresh.kind === 'start') { cue('start'); startQueue(fresh.queue, navigate); }
    };
    const aside = setAside(target.id, runTitle, runId, queue);
    return {
      value,
      label,
      icon: <Icon name="play" size={18} />,
      ...(aside
        ? { confirm: { label: aside.label, hint: aside.hint, action: 'Start', onConfirm: go } }
        : { onSelect: go }),
    };
  };

  if (plan.kind === 'unavailable') return [];
  if (plan.kind === 'start') return [item('start-now', 'Start now', plan.queue[0])];

  /* Blocked. The section says so; the rows under it are what can go instead. */
  if (plan.startable.length === 0) {
    return [{ section: 'Blocked · nothing can start' }];
  }
  return [
    { section: 'Blocked · start first' },
    ...plan.startable.slice(0, MAX_OFFERED).map((t) => item(`start-now-${t.id}`, `Start ${t.title}`, t)),
  ];
}
