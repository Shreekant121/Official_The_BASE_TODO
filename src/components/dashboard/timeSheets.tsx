/**
 * The hours block's two sheets (BIG-6, 29-1b), each mounted only while open
 * (Performance rule 2):
 *
 * - **Hours you have** — today's one-tap override, and the weekly default per
 *   weekday (his start: 12 hours on weekdays, 6 at the weekend). Today's is
 *   the same number as the work session on Set Deadlines and New Session, so
 *   it is set through `setHoursToday`, never the store alone.
 * - **Log time by hand** — against a task, a project, or just a note
 *   ("calls"). It counts on the Dashboard only, drawn lighter; a task's own
 *   time taken stays the timer's.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Icon, Input, LitLine, litSafe, SegmentedControl, SoftButton, SoftIconButton, WhiteButton } from '../../ui';
import { TimeWell } from '../TimeWell';
import { useStore } from '../../store/useStore';
import { useDashboardStore } from '../../store/useDashboardStore';
import { buildProjectTree, flattenProjectTree } from '../../lib/projectTree';
import { resolveUserTimeZone } from '../../lib/agent/dates';
import { workedJudgeOf, notWorkedHolder } from '../../lib/workedTime';
import { WEEKDAY_NAMES, addDays, availableOn, weekdayOfDay } from '../../lib/dashboard/hours';
import { resetHoursToday, setHoursToday, todayOn } from '../../lib/dashboard/todayHours';
import { formatMinutes } from '../../lib/dashboard/blockData';
import { Label, Sheet } from './dialogs';

const span = (seconds: number) => formatMinutes(seconds / 60);
const Caption = ({ children }: { children: ReactNode }) => (
  <span style={{ font: 'var(--type-caption)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>{children}</span>
);

/** Monday first, as the week chart draws it. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

// ─── Hours you have ─────────────────────────────────────────────────────────

export function HoursSheet({ onClose }: { onClose: () => void }) {
  const hours = useDashboardStore((s) => s.hours);
  const setWeekly = useDashboardStore((s) => s.setWeekly);
  const today = useMemo(() => todayOn(resolveUserTimeZone()), []);
  const weekday = weekdayOfDay(today);
  const todays = availableOn(hours, today);
  const overridden = hours.overrides[today] !== undefined;
  const usual = hours.weekly[weekday];

  return (
    <Sheet
      label="Hours you have"
      title="Hours you have"
      sub="What a day holds for work. It is the same number as the work session on Set Deadlines and New Session, and Smart Start begins from what is left of it."
      onClose={onClose}
      width={500}
    >
      <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
        <Label>Today</Label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
          <TimeWell size="lg" seconds={todays} name="available today" onSeconds={setHoursToday} />
          {overridden && (
            <SoftButton icon={<Icon name="rotate-ccw" size={15} />} onClick={resetHoursToday}>
              Back to {WEEKDAY_NAMES[weekday]}’s {span(usual)}
            </SoftButton>
          )}
        </div>
        <Caption>
          {overridden
            ? 'Just for today. Tomorrow goes back to its usual hours.'
            : `${WEEKDAY_NAMES[weekday]}’s usual. A change here is for today only.`}
        </Caption>
      </div>

      <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
        <Label>Every week</Label>
        {WEEK_ORDER.map((d) => (
          <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
            <span
              style={{
                flex: 1, font: 'var(--type-label)',
                color: d === weekday ? 'var(--hue-lime)' : 'var(--fg-2)',
              }}
            >
              {WEEKDAY_NAMES[d]}
            </span>
            <TimeWell size="sm" seconds={hours.weekly[d]} name={`on ${WEEKDAY_NAMES[d]}`} onSeconds={(s) => setWeekly(d, s)} />
          </div>
        ))}
      </div>
    </Sheet>
  );
}

// ─── Log time by hand ───────────────────────────────────────────────────────

type Target = 'task' | 'project' | 'note';

export function LogTimeSheet({ onClose }: { onClose: () => void }) {
  const backlog = useStore((s) => s.backlogTasks);
  const lists = useStore((s) => s.taskLists);
  const projects = useStore((s) => s.projects);
  const timeLog = useDashboardStore((s) => s.timeLog);
  const logTime = useDashboardStore((s) => s.logTime);
  const removeTimeLog = useDashboardStore((s) => s.removeTimeLog);
  const today = useMemo(() => todayOn(resolveUserTimeZone()), []);

  const [seconds, setSeconds] = useState(30 * 60);
  const [when, setWhen] = useState<'today' | 'yesterday'>('today');
  const [target, setTarget] = useState<Target>('task');
  const [query, setQuery] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const day = when === 'today' ? today : addDays(today, -1);

  const judge = workedJudgeOf(backlog, lists, projects);
  const projectRows = useMemo(() => flattenProjectTree(buildProjectTree(projects)), [projects]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return backlog
      .filter((t) => !t.parent && (!q || t.title.toLowerCase().includes(q)))
      .sort((a, b) => Number(a.status === 'completed') - Number(b.status === 'completed'))
      .slice(0, 8);
  }, [backlog, query]);

  const task = taskId ? backlog.find((t) => t.id === taskId) : undefined;
  const project = projectId ? projects.find((p) => p.id === projectId) : undefined;
  const label = target === 'task' ? task?.title : target === 'project' ? project?.name : note.trim();
  const reason = target === 'task' && task ? judge.taskReason(task.id)
    : target === 'project' && project ? judge.projectReason(project.id) : undefined;
  const ready = seconds > 0 && !!label;
  const logged = timeLog.filter((e) => e.day === day).slice().reverse();

  const submit = () => {
    if (!ready || !label) return;
    logTime({
      day,
      seconds,
      label,
      ...(target === 'task' && task ? { taskId: task.id } : {}),
      ...(target === 'project' && project ? { projectId: project.id } : {}),
    });
    setNote('');
  };

  return (
    <Sheet
      label="Log time by hand"
      title="Log time by hand"
      sub="Work the timer did not see. It counts towards hours worked here, drawn lighter; a task’s own time taken stays the timer’s."
      onClose={onClose}
      width={540}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--sp-6)', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          <Label>How long</Label>
          <TimeWell size="lg" seconds={seconds} name="logged by hand" onSeconds={setSeconds} />
        </div>
        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          <Label>Which day</Label>
          <SegmentedControl
            look="soft"
            options={[{ value: 'today', label: 'Today' }, { value: 'yesterday', label: 'Yesterday' }]}
            value={when}
            onChange={(v) => setWhen(v as 'today' | 'yesterday')}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
        <Label>What it was</Label>
        <SegmentedControl
          look="soft"
          options={[
            { value: 'task', label: 'A task' },
            { value: 'project', label: 'A project' },
            { value: 'note', label: 'Just a note' },
          ]}
          value={target}
          onChange={(v) => setTarget(v as Target)}
        />
        {target === 'task' && (
          <>
            <Input
              size="sm"
              block
              placeholder="Search your tasks"
              aria-label="Search your tasks"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              iconLeft={<Icon name="search" size={16} />}
            />
            <div className="ag-scroll ag-fade" role="listbox" aria-label="Task" style={{ display: 'grid', gap: 2, maxHeight: '26vh', overflowY: 'auto' }}>
              {matches.length === 0 && (
                <Caption>
                  <LitLine text={query.trim() === '' ? 'No task matches.' : `No task matches **“${litSafe(query.trim())}”**.`} />
                </Caption>
              )}
              {matches.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="option"
                  aria-selected={t.id === taskId}
                  className="dash-row"
                  onClick={() => setTaskId(t.id)}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: t.id === taskId ? 'var(--fg-1)' : undefined }}>
                    {t.title}
                  </span>
                  {t.id === taskId && <Icon name="check" size={16} style={{ color: 'var(--hue-lime)' }} />}
                </button>
              ))}
            </div>
          </>
        )}
        {target === 'project' && (
          <div className="ag-scroll ag-fade" role="listbox" aria-label="Project" style={{ display: 'grid', gap: 2, maxHeight: '30vh', overflowY: 'auto' }}>
            {projectRows.map((r) => (
              <button
                key={r.project.id}
                type="button"
                role="option"
                aria-selected={r.project.id === projectId}
                className="dash-row"
                onClick={() => setProjectId(r.project.id)}
                style={{ paddingLeft: `calc(var(--sp-3) + ${r.depth * 18}px)` }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: r.project.id === projectId ? 'var(--fg-1)' : undefined }}>
                  {r.project.name}
                </span>
                {r.project.id === projectId && <Icon name="check" size={16} style={{ color: 'var(--hue-lime)' }} />}
              </button>
            ))}
          </div>
        )}
        {target === 'note' && (
          <Input
            block
            placeholder="What was it? Calls, errands…"
            aria-label="What was it"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
        )}
        {reason && (
          <Caption>
            {reason.kind === 'task'
              ? 'This task doesn’t count as worked — it will show greyed.'
              : `“${notWorkedHolder(reason)}” doesn’t count as worked — this will show greyed.`}
          </Caption>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {/* The sheet's confirm: solid white since 29-1P2. */}
        <WhiteButton disabled={!ready} onClick={submit} icon={<Icon name="plus" size={16} />}>
          Log {span(seconds)}
        </WhiteButton>
      </div>

      {logged.length > 0 && (
        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          <Label>Logged by hand {when === 'today' ? 'today' : 'yesterday'}</Label>
          <div style={{ display: 'grid', gap: 2 }}>
            {logged.map((e) => (
              <div key={e.id} className="dash-row" style={{ cursor: 'default' }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label}</span>
                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>{span(e.seconds)}</span>
                <SoftIconButton size="sm" label={`Remove ${span(e.seconds)} of ${e.label}`} onClick={() => removeTimeLog(e.id)}>
                  <Icon name="x" size={14} />
                </SoftIconButton>
              </div>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  );
}
