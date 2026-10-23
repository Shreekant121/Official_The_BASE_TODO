/**
 * `/design`'s 29-1P9b section: "40% done" with the day it lands, and the
 * milestones and chart folded down behind it, on a pretend project. Local
 * state only — nothing here reads or writes his tasks. It uses the real
 * pieces (`ForecastButton`, `ForecastPanel`, `lib/projectForecast.ts`), fed
 * pretend tasks dated from the score's clock.
 */
import { useMemo, useState } from 'react';
import { ForecastButton, ForecastPanel } from './ProjectForecast';
import { forecastModel } from './useForecast';
import { toTaskDateString, resolveUserTimeZone } from '../../lib/agent/dates';
import { usePriorityScores } from '../../store/usePriorityScores';
import type { Task } from '../../store/useStore';

const DAY = 86_400_000;

/** Twenty pretend tasks: eight done over the last two weeks, four of them milestones. */
function pretendTasks(now: number): Task[] {
  const zone = resolveUserTimeZone();
  const due = (days: number) => toTaskDateString(new Date(now + days * DAY), zone);
  const t = (id: string, title: string, extra: Partial<Task> = {}): Task => ({
    id: `spec-ph-${id}`, title, status: 'needsAction', listName: 'Launch', ...extra,
  });
  const done = (id: string, title: string, ago: number, extra: Partial<Task> = {}) =>
    t(id, title, { status: 'completed', completedAt: now - ago * DAY, ...extra });
  const tasks: Task[] = [
    done('names', 'Pick three names', 13, { listName: 'Operations' }),
    done('run', 'File the RUN form', 11, { listName: 'Operations' }),
    done('pan', 'Get the PAN', 9, { listName: 'Money' }),
    done('account', 'Open the current account', 7, { listName: 'Money' }),
    done('hero', 'Hero section', 5, { listName: 'Build' }),
    done('deck', 'Draft the pitch deck', 3, { listName: 'Build' }),
    t('priya', 'Get feedback from Priya', { listName: 'Build' }),
    t('venue', 'Book the venue', { listName: 'Launch' }),
    t('invites', 'Send invites', { listName: 'Launch' }),
    t('flyers', 'Print the flyers', { listName: 'Launch' }),
    t('copy', 'Rewrite the landing page copy', { listName: 'Build' }),
    t('advance', 'Pay the advance', { listName: 'Money' }),
    t('review', 'Quarterly compliance review', { listName: 'Operations' }),
    t('photos', 'Shoot the studio photos', { listName: 'Build' }),
    t('thanks', 'Send thank-you notes', { listName: 'Launch' }),
    t('press', 'Fix the press kit link', { listName: 'Launch' }),
    /* The four milestones. */
    done('m1', 'Name registered', 10, { milestone: true, deadline: due(-10), dependsOn: ['spec-ph-names', 'spec-ph-run'] }),
    done('m2', 'Bank account', 6, { milestone: true, deadline: due(-6), dependsOn: ['spec-ph-pan', 'spec-ph-account'] }),
    t('m3', 'Pitch deck', { milestone: true, deadline: due(7), dependsOn: ['spec-ph-deck', 'spec-ph-priya'] }),
    t('m4', 'Launch day', { milestone: true, deadline: due(21), dependsOn: ['spec-ph-venue', 'spec-ph-invites', 'spec-ph-flyers'] }),
  ];
  return tasks;
}

export function ProjectHeaderSpecimen() {
  const { now } = usePriorityScores();
  /* Dated once, on the day the section opened: the specimen is pretend, so a
     minute tick has nothing to move. */
  const [at] = useState(now);
  const tasks = useMemo(() => pretendTasks(at), [at]);
  const [finishBy, setFinishBy] = useState<string | undefined>(() =>
    toTaskDateString(new Date(at + 14 * DAY), resolveUserTimeZone()).slice(0, 10));
  const [open, setOpen] = useState(true);
  const model = useMemo(() => forecastModel(tasks, tasks, new Date(at), finishBy), [tasks, at, finishBy]);
  const doneCount = tasks.filter((x) => x.status === 'completed').length;
  const progress = Math.round((doneCount / tasks.length) * 100);
  const [opened, setOpened] = useState<string | null>(null);

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-6)' }}>
      <div
        style={{
          display: 'grid', gap: 'var(--sp-5)', padding: 'var(--sp-6)', borderRadius: 'var(--r-card)',
          backgroundImage: 'var(--glass-fill-3)',
          boxShadow: 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-6)', flexWrap: 'wrap' }}>
          <span style={{ font: 'var(--type-title)', fontSize: 'var(--text-lg)', color: 'var(--fg-1)', flex: '1 1 auto' }}>
            Studio Launch
          </span>
          <ForecastButton progress={progress} model={model} open={open} onToggle={() => setOpen((v) => !v)} />
        </div>
        <ForecastPanel
          finishBy={finishBy}
          onFinishBy={setFinishBy}
          model={model}
          open={open}
          onOpenTask={(task) => setOpened(task.title)}
        />
      </div>
      <p style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
        {opened ? `On a board this would open “${opened}”.` : 'On a board, tapping a task here opens its sheet.'}
      </p>
    </div>
  );
}
