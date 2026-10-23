import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_LISTS, useStore, type Task } from '../src/store/useStore';
import { useSnapshotStore } from '../src/store/useSnapshotStore';
import { liveAgentStore, liveSnapshotCapture } from '../src/lib/agent/liveContext';
import { listUndated } from '../src/lib/agent/tools/scheduleTools';
import { drawerOf } from '../src/lib/agent/tools/index';
import { describeToolCall } from '../src/lib/agent/toolChip';
import { priorityScores } from '../src/store/usePriorityScores';
import { trayTasks } from '../src/lib/calendar/tray';
import type { ToolContext } from '../src/lib/agent/types';
import { beginCapture } from '../src/lib/agent/toolServer/undo';

/**
 * 29-2e3b — ATLAS READS THE CALENDAR'S "NO DATE" TRAY, IN THE TRAY'S ORDER.
 *
 * Against the real store and the app's own scoring pass: the most important
 * first, as the tray draws them, so "my most important undated task" is the
 * one he sees at its top.
 */

const NOW = new Date('2026-10-22T11:00:00+05:30');

const task = (id: string, title: string, extra: Partial<Task> = {}): Task => ({
  id, title, status: 'needsAction', listId: 'action', listName: 'Action Steps', order: 0, subtasks: [], createdAt: 0, ...extra,
});

const BOARD: Task[] = [
  task('t-small', 'Tidy the desk', { humanOverride: 2, estimatedTime: 15 }),
  task('t-big', 'Write the pitch', { humanOverride: 9, estimatedTime: 90 }),
  task('t-dated', 'Send the invoice', { deadline: '2026-10-22T16:00', humanOverride: 10 }),
  task('t-done', 'Old thing', { status: 'completed', completedAt: 1, humanOverride: 10 }),
  task('t-ignored', 'Parked idea', { humanOverride: 10, ignored: true }),
];

beforeEach(() => {
  useStore.setState({ projects: [], taskLists: structuredClone(DEFAULT_LISTS), backlogTasks: structuredClone(BOARD), tasks: [], focusLog: [] });
  useSnapshotStore.getState().clearTurns();
});

async function run() {
  const ctx: ToolContext = {
    snapshotHandle: beginCapture('turn-1', 'list_undated'),
    now: NOW,
    timezone: 'Asia/Kolkata',
    store: liveAgentStore,
    snapshots: liveSnapshotCapture,
  };
  return listUndated.execute({}, ctx);
}

describe('list_undated', () => {
  it('lists the undated open tasks, ignored work out, in the order the tray draws them', async () => {
    const result = await run();
    expect(result.ok).toBe(true);
    const rows = (result.data as { tasks: { id: string; minutes: number }[] }).tasks;
    const s = useStore.getState();
    const scores = priorityScores(s.backlogTasks, s.taskLists, Math.floor(NOW.getTime() / 60_000), s.projects);
    expect(rows.map((r) => r.id)).toEqual(trayTasks(s.backlogTasks, scores.scoreOf, scores.ignored.ids).map((t) => t.id));
    expect(rows.map((r) => r.id)).toEqual(['t-big', 't-small']);
    expect(rows[0].minutes).toBe(90);
    expect(result.summary).toBe('2 tasks with no deadline, the most important first. That is all of them.');
  });

  it('says so when every open task has a date', async () => {
    useStore.setState({ backlogTasks: [task('t-dated', 'Send the invoice', { deadline: '2026-10-22T16:00' })] });
    const result = await run();
    expect(result.summary).toBe('Every open task has a deadline: the "No date" tray is empty.');
  });

  it('is in the Tasks drawer, and its chip reads as a read', async () => {
    expect(drawerOf('list_undated')).toBe('tasks');
    const result = await run();
    const chip = describeToolCall(
      { name: 'list_undated', args: {}, ok: true, summary: result.summary, data: result.data, durationMs: 1 },
      'Asia/Kolkata',
      NOW,
    );
    expect(chip.verb).toBe('Read the tasks with no date');
    expect(chip.wrote).toBe(false);
  });
});
