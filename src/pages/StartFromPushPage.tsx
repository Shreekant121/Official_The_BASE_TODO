/**
 * Where tapping a notification lands — BUILD-5. `/start/:taskId`.
 *
 * The rule (`design-system/screens/notification.html`, rule 03): **tapping it
 * opens the task in Focus, already running.** So on the plain path this page
 * is never seen — it starts the task and replaces itself with `/focus`.
 *
 * It exists as a page, rather than as a query string Focus reads, for the
 * three cases where starting is not the whole answer, and every one of them
 * is BUILD-2's decision, reached through BUILD-2's code:
 *
 * - **Blocked.** A blocked task still fires (his call, 2026-09-16), and the
 *   notification says what it is waiting on. Here it offers the prerequisites
 *   that can start instead — `planStartNow`, the same chain walk as every
 *   other Start. There is no override.
 * - **Something would be set aside** — a session on another task, or other
 *   tasks planned for today. BUILD-2 asks first, and a tap on the lock screen
 *   is no reason to stop asking: the plan he made should not vanish because a
 *   notification arrived.
 * - **Gone or done.** Finished since the alert went out, or deleted. Said
 *   plainly rather than dropped on an empty Focus screen.
 *
 * A cold open from the lock screen reaches here before the cloud document
 * has, and a task Atlas created on the laptop may not be in this device's
 * copy yet — so a task that is not found is waited for, briefly, before it is
 * called gone.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore, type Task } from '../store/useStore';
import { useFocusRun } from '../store/useFocusRun';
import { planStartNow } from '../lib/smartStart';
import { ignoredWorkOf } from '../lib/ignoredWork';
import { setAside, startQueue } from '../components/task-fields/startNowMenu';
import { cue } from '../lib/sound';
import { sessionMinutes, startsBySlide } from '../lib/focusCommitment';
import { Button, Card, GelButton, Icon, Kicker, SlideToStart, SoftButton, TravellingTrack } from '../ui';

/** How long a task that is not in this device's copy is waited for. */
const FIND_WAIT_MS = 8000;
/** How many startable prerequisites are offered — the menu's number. */
const MAX_OFFERED = 3;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="ag-page ag-page--focal flex items-center justify-center min-h-screen" style={{ padding: 'var(--sp-8) var(--gutter-page-sm)' }}>
      <div style={{ width: '100%', maxWidth: 460 }}>{children}</div>
    </div>
  );
}

function Waiting({ label }: { label: string }) {
  return (
    <Shell>
      <div role="status" aria-busy="true" className="flex flex-col items-center" style={{ gap: 'var(--sp-6)' }}>
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>{label}</span>
        <TravellingTrack width={160} />
      </div>
    </Shell>
  );
}

export default function StartFromPushPage() {
  const { taskId = '' } = useParams();
  const navigate = useNavigate();
  const backlogTasks = useStore((s) => s.backlogTasks);
  const queue = useStore((s) => s.tasks);
  const runId = useFocusRun((s) => s.task?.id ?? null);
  const runTitle = useFocusRun((s) => s.task?.title ?? null);

  const task = backlogTasks.find((t) => t.id === taskId);
  const lists = useStore((s) => s.taskLists);
  const projects = useStore((s) => s.projects);
  const plan = useMemo(
    () => planStartNow(backlogTasks, taskId, ignoredWorkOf(backlogTasks, lists, projects).ids),
    [backlogTasks, taskId, lists, projects],
  );

  const [waitedOut, setWaitedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaitedOut(true), FIND_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  /* Replace, never push: Back from Focus must not land here and start it again. */
  const go = (to: string) => navigate(to, { replace: true });

  const start = (target: Task) => {
    /* Re-planned at press time, as BUILD-2 does. */
    const fresh = planStartNow(useStore.getState().backlogTasks, target.id);
    if (fresh.kind === 'start') startQueue(fresh.queue, go);
  };

  const aside = plan.kind === 'start' ? setAside(taskId, runTitle, runId, queue) : null;

  /* The plain path: nothing in the way, so no page at all. Once. */
  const started = useRef(false);
  useEffect(() => {
    if (started.current || plan.kind !== 'start' || aside) return;
    started.current = true;
    startQueue(plan.queue, (to) => navigate(to, { replace: true }));
  }, [plan, aside, navigate]);

  if (plan.kind === 'start' && !aside) return <Waiting label="Starting" />;

  if (!task && !waitedOut) return <Waiting label="Finding the task" />;

  if (plan.kind === 'unavailable') {
    const done = task?.status === 'completed';
    return (
      <Shell>
        <Card>
          <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
            <Kicker>{done ? 'Already done' : 'Not found'}</Kicker>
            <h1 style={{ font: 'var(--type-title)', fontSize: 'var(--text-lg)', color: 'var(--fg-1)' }}>
              {done ? task?.title : 'That task is not here any more'}
            </h1>
            <p style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
              {done
                ? 'It was finished after the notification went out. Nothing to start.'
                : 'It was deleted, or moved inside another task, after the notification went out.'}
            </p>
            <span style={{ display: 'flex' }}>
              <SoftButton icon={<Icon name="house" size={16} />} onClick={() => go('/')}>
                Go to Home
              </SoftButton>
            </span>
          </div>
        </Card>
      </Shell>
    );
  }

  if (plan.kind === 'blocked') {
    const offered = plan.startable.slice(0, MAX_OFFERED);
    return (
      <Shell>
        <Card>
          <div style={{ display: 'grid', gap: 'var(--sp-6)' }}>
            <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
              <Kicker>Blocked</Kicker>
              <h1 style={{ font: 'var(--type-title)', fontSize: 'var(--text-lg)', color: 'var(--fg-1)' }}>
                {task?.title}
              </h1>
              <p style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
                It is waiting on {plan.blockers.map((b) => `“${b.title}”`).join(', ')}, so it cannot start yet.
              </p>
            </div>
            {offered.length > 0 ? (
              <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
                <Kicker>Start first</Kicker>
                {offered.map((t) => (
                  <SoftButton
                    key={t.id}
                    icon={<Icon name="play" size={16} />}
                    onClick={() => start(t)}
                    style={{ width: '100%', justifyContent: 'flex-start' }}
                  >
                    {t.title}
                  </SoftButton>
                ))}
              </div>
            ) : (
              <p style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
                Nothing in its chain can start right now either.
              </p>
            )}
            <span style={{ display: 'flex' }}>
              <Button variant="ghost" onClick={() => go('/')}>
                Not now
              </Button>
            </span>
          </div>
        </Card>
      </Shell>
    );
  }

  /* Something would be set aside: ask, as every other Start does. */
  return (
    <Shell>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-6)' }}>
          <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
            <Kicker>Start now</Kicker>
            <h1 style={{ font: 'var(--type-title)', fontSize: 'var(--text-lg)', color: 'var(--fg-1)' }}>
              {task?.title}
            </h1>
          </div>
          <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
            <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)' }}>{aside?.label}</span>
            <p style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>{aside?.hint}</p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
            {/* The screen's one Start (29-1P2): the orange gel with the tile,
                or a slide when the session is 90 minutes or more — his rule,
                the same line the Dashboard and Set Deadlines draw. */}
            {plan.kind === 'start' && startsBySlide(sessionMinutes(plan.queue)) ? (
              <div style={{ flex: '1 1 220px', maxWidth: 320 }}>
                <SlideToStart onConfirm={() => startQueue(plan.queue, go)}>Slide to start</SlideToStart>
              </div>
            ) : (
              <GelButton
                colour="orange"
                size="md"
                onClick={() => { if (plan.kind === 'start') { cue('start'); startQueue(plan.queue, go); } }}
              >
                Start
              </GelButton>
            )}
            <Button variant="ghost" onClick={() => go(runId ? '/focus' : '/')}>
              {runId ? 'Keep the current session' : 'Not now'}
            </Button>
          </div>
        </div>
      </Card>
    </Shell>
  );
}
