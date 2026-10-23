/**
 * **Doesn't count as worked** (BIG-6, 29-1b): the one menu item that takes a
 * task, a list or a project's time out of the hours he worked — and puts it
 * back. It sits beside Ignore on every menu that offers that (`ignoreMenu.tsx`),
 * one hook for all of them, so none grows its own idea of what it says.
 *
 * His call, 2026-09-30: it passes down like Ignore, **but unlike Ignore one
 * task inside can switch itself back on**. So a task has four states and a
 * list or a project three:
 * - **nothing says so** — "Doesn't count as worked", at once: nothing is lost,
 *   the time only moves to the greyed part of the Dashboard's charts;
 * - **its own switch** — "Count as worked again";
 * - **a task under a list or project that doesn't count** — "Count this one as
 *   worked", its switch back on;
 * - **a task switched back on** — "Stop counting, like “Self Care”";
 * - **a list or project held by a project above** — names that project and
 *   does nothing, like Ignore: only a task can opt back in.
 */
import { Icon, type MorphMenuItem } from '../../ui';
import { useStore, type IgnoreTarget } from '../../store/useStore';
import { isOwnNotWorked, notWorkedHolder, workedJudgeOf } from '../../lib/workedTime';

export function useWorkedItems(target: IgnoreTarget): MorphMenuItem[] {
  const setNotWorked = useStore((s) => s.setNotWorked);
  const backlog = useStore((s) => s.backlogTasks);
  const lists = useStore((s) => s.taskLists);
  const projects = useStore((s) => s.projects);
  const judge = workedJudgeOf(backlog, lists, projects);
  const icon = <Icon name="hand" size={18} />;

  if (target.kind === 'task') {
    const own = backlog.find((t) => t.id === target.id)?.notWorked;
    const above = judge.aboveTask(target.id);
    if (above && own === false) {
      return [{ value: 'worked-stop', label: `Stop counting, like “${notWorkedHolder(above)}”`, icon, onSelect: () => setNotWorked(target, undefined) }];
    }
    if (above) {
      return [{ value: 'worked-anyway', label: 'Count this one as worked', icon: <Icon name="timer" size={18} />, onSelect: () => setNotWorked(target, false) }];
    }
    if (own === true) {
      return [{ value: 'worked-again', label: 'Count as worked again', icon: <Icon name="timer" size={18} />, onSelect: () => setNotWorked(target, undefined) }];
    }
    return [{ value: 'not-worked', label: 'Doesn’t count as worked', icon, onSelect: () => setNotWorked(target, true) }];
  }

  const held = target.kind === 'project' ? judge.projectReason(target.id) : judge.listReason(target.id);
  if (held && !isOwnNotWorked(held, target)) {
    const holder = notWorkedHolder(held);
    return [{
      value: 'not-worked-above',
      label: `Not worked, with “${holder}”`,
      icon,
      flash: `Switch it off on “${holder}”`,
      flashIcon: <Icon name="info" size={18} />,
      onSelect: () => {},
    }];
  }
  if (held) {
    return [{ value: 'worked-again', label: 'Count as worked again', icon: <Icon name="timer" size={18} />, onSelect: () => setNotWorked(target, undefined) }];
  }
  return [{ value: 'not-worked', label: 'Doesn’t count as worked', icon, onSelect: () => setNotWorked(target, true) }];
}
