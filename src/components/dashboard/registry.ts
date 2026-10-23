/**
 * Which component draws each block kind, and its icon and colour in the
 * gallery. Its own file so the component files export only components (fast
 * refresh).
 */
import type { ReactNode } from 'react';
import type { IconName } from '../../ui';
import type { BlockKind } from '../../lib/dashboard/layout';
import {
  NextDeadlineBlock, OneThingBlock, OverdueBlock, ProjectProgressBlock, TodayBlock, type BlockProps,
} from './blocks';
import { FocusTimerBlock, FocusWeekBlock, HoursTodayBlock } from './timeBlocks';
import { RunwayBlock, StackBlock, WaitingOnBlock } from './moreBlocks';
import { QuickAddBlock } from './QuickAddBlock';
import { TimelineBlock } from './TimelineBlock';
import { CountdownBlock } from './CountdownBlock';
import { SampleMorningBlock, SampleRoutineBlock, SampleStreakBlock } from './sampleBlocks';

export const BLOCK_COMPONENTS: Record<BlockKind, (props: BlockProps) => ReactNode> = {
  'one-thing': OneThingBlock,
  today: TodayBlock,
  'next-deadline': NextDeadlineBlock,
  overdue: OverdueBlock,
  'project-progress': ProjectProgressBlock,
  'hours-today': HoursTodayBlock,
  'focus-week': FocusWeekBlock,
  'focus-timer': FocusTimerBlock,
  stack: StackBlock,
  'waiting-on': WaitingOnBlock,
  runway: RunwayBlock,
  'quick-add': QuickAddBlock,
  timeline: TimelineBlock,
  countdown: CountdownBlock,
  'sample-streak': SampleStreakBlock,
  'sample-routine': SampleRoutineBlock,
  'sample-morning': SampleMorningBlock,
};

export const BLOCK_ICONS: Record<BlockKind, IconName> = {
  'one-thing': 'target',
  today: 'list-checks',
  'next-deadline': 'hourglass',
  overdue: 'clock',
  'project-progress': 'folder',
  'hours-today': 'activity',
  'focus-week': 'bar-chart-3',
  'focus-timer': 'timer',
  stack: 'layers',
  'waiting-on': 'users',
  runway: 'flag-triangle-right',
  'quick-add': 'square-pen',
  timeline: 'calendar-clock',
  countdown: 'hourglass',
  'sample-streak': 'flame',
  'sample-routine': 'repeat',
  'sample-morning': 'sparkles',
};

/*
 * The colour behind each widget's layered glass icon in the gallery (29-1P5b,
 * idea 80; his call: each widget its job's colour). By what the widget is
 * about, from the colour jobs: go is orange, today lime, dates sky, urgent
 * coral, focus teal. A widget no job claims (Projects, Stack) is the quiet
 * grey, which is `undefined` here.
 */
export const BLOCK_TINTS: Record<BlockKind, string | undefined> = {
  'one-thing': 'var(--job-orange)',
  today: 'var(--job-lime)',
  'next-deadline': 'var(--job-sky)',
  overdue: 'var(--job-coral)',
  'project-progress': undefined,
  'hours-today': 'var(--job-teal)',
  'focus-week': 'var(--job-teal)',
  'focus-timer': 'var(--job-teal)',
  stack: undefined,
  'waiting-on': 'var(--job-sky)',
  runway: 'var(--job-sky)',
  /* Adding: the floating +'s lime. */
  'quick-add': 'var(--job-lime)',
  /* Dates: sky. */
  timeline: 'var(--job-sky)',
  /* 29-1c4's samples, by the job of the block each stands in for. */
  countdown: 'var(--job-sky)',
  'sample-streak': 'var(--job-rose)',
  'sample-routine': 'var(--job-rose)',
  'sample-morning': 'var(--job-violet)',
};
