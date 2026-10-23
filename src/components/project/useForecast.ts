/**
 * What the project header's "40% done" button and the panel behind it read
 * (29-1P9b): the forecast and the milestones, one pass, one clock. Its own
 * module so `ProjectForecast.tsx` exports components only.
 */
import { useMemo } from 'react';
import { resolveUserTimeZone } from '../../lib/agent/dates';
import { lastDays } from '../../lib/stats';
import { projectForecast, projectMilestones, type Milestone, type ProjectForecast } from '../../lib/projectForecast';
import { usePriorityScores } from '../../store/usePriorityScores';
import { useStore, type Task } from '../../store/useStore';

/** What the island and the panel both read: one pass, one clock. */
export interface ForecastModel {
  forecast: ProjectForecast;
  milestones: Milestone<Task>[];
  today: string;
  timeZone: string;
}

/** The model for some tasks at an instant: the board's, or `/design`'s pretend ones. */
export function forecastModel(
  tasks: readonly Task[],
  backlog: readonly Task[],
  at: Date,
  finishBy: string | undefined,
): ForecastModel {
  const timeZone = resolveUserTimeZone();
  return {
    forecast: projectForecast(tasks, at, timeZone, finishBy),
    milestones: projectMilestones(tasks, backlog, timeZone),
    today: lastDays(at, timeZone, 1)[0],
    timeZone,
  };
}

/** The forecast and the milestones for a project's whole tree, on the score's minute tick. */
export function useForecast(finishBy: string | undefined, treeTasks: readonly Task[]): ForecastModel {
  const { now } = usePriorityScores();
  const backlog = useStore((s) => s.backlogTasks);
  return useMemo(
    () => forecastModel(treeTasks, backlog, new Date(now), finishBy),
    [now, treeTasks, backlog, finishBy],
  );
}

