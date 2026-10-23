/**
 * What a project card tells you (29-1P8b): its pulse (idea 151) and its
 * word (idea 152), for Home's cards and the Dashboard's project block — his
 * two places, 2026-10-13. One hook so the two can never read a project
 * differently.
 *
 * Both are the whole subtree's, each task once (`subtreeTasks`), like every
 * other number on a card. The pulse counts everything done on the board,
 * ignored work included, as progress does; the word leaves ignored work out
 * (BIG-3: it is never scored, offered or pushed, so it cannot make a project
 * late), and an ignored project gets no word at all.
 *
 * The clock is the score's minute tick (`usePriorityScores().now`), so a
 * card turns Off track within a minute of a deadline passing, with no timer
 * of its own.
 */
import { useMemo } from 'react';
import { resolveUserTimeZone } from '../../lib/agent/dates';
import { subtreeTasks, type ProjectTree } from '../../lib/projectTree';
import { doneByDay, type DayCount } from '../../lib/stats';
import { projectHealth, type HealthState, type ProjectHealth } from '../../lib/projectHealth';
import { usePriorityScores } from '../../store/usePriorityScores';
import type { Task, TaskList } from '../../store/useStore';
import type { StatusName } from '../../ui';

/** The pill each word wears: done's lime, a warning's grey with its triangle, overrun's coral. */
export const HEALTH_PILL: Record<HealthState, StatusName> = {
  'on-track': 'done',
  'at-risk': 'review',
  'off-track': 'overrun',
  quiet: 'archived',
};

export function useProjectPulse(
  projectId: string,
  tree: ProjectTree,
  lists: readonly TaskList[],
  backlog: readonly Task[],
): { days: DayCount[]; health: ProjectHealth | null } {
  const { now, ignored } = usePriorityScores();
  return useMemo(() => {
    const at = new Date(now);
    const timeZone = resolveUserTimeZone();
    const tasks = subtreeTasks(tree, lists, backlog, projectId);
    const health = ignored.projectReason(projectId)
      ? null
      : projectHealth(tasks.filter((t) => !ignored.has(t)), at, timeZone);
    return { days: doneByDay(tasks, at, timeZone), health };
  }, [now, ignored, tree, lists, backlog, projectId]);
}
