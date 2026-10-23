/**
 * The Dashboard's three sheets (BIG-6, 29-1a): the widget gallery (+ Add
 * widget), a block's ⚙, and the whole overdue pile. Each is mounted only while
 * open (CLAUDE.md, Performance rule 2).
 */
import { Fragment, useMemo, useState, type ReactNode } from 'react';
import {
  COLOUR_JOBS, COLOUR_JOB_INFO, Dialog, Icon, IconButton, Input, LayeredIcon, LitLine, SegmentedControl, SoftButton, SoftIconButton, Switch,
} from '../../ui';
import { BLOCK_ICONS, BLOCK_TINTS } from './registry';
import { useStore, type Task } from '../../store/useStore';
import { usePriorityScores } from '../../store/usePriorityScores';
import { useDashboardStore } from '../../store/useDashboardStore';
import { useOverlayDismiss } from '../../lib/useOverlayDismiss';
import { Z } from '../../lib/zLayers';
import { buildProjectTree, flattenProjectTree } from '../../lib/projectTree';
import { resolveUserTimeZone } from '../../lib/agent/dates';
import {
  BLOCK_COLOUR, BLOCK_KINDS, BLOCK_SPECS, GRID_COLUMNS, MAX_ROWS, MAX_STACK_PAGES, NOT_A_PAGE, SAMPLE_KINDS, blockLook, stackPages,
  type BlockKind, type BlockLook, type BlockSettings, type DashboardBlock, type ProgressMetric, type StackPage,
} from '../../lib/dashboard/layout';
import CustomDropdown from '../CustomDropdown';
import { agoPhrase, overdueTasks } from '../../lib/dashboard/blockData';
import { quickAddList } from '../../lib/dashboard/quickAdd';
import { timelineRange, type TimelineRange } from '../../lib/dashboard/timeline';
import { useEventStore } from '../../store/useEventStore';
import {
  COUNTDOWN_FACES, COUNTDOWN_FACE_LABELS, countdownFace, passedEvents, upcomingEvents, type CountdownFace,
} from '../../lib/events/events';
import { countdownKind, type CountdownTargetKind } from '../../lib/dashboard/countdownTarget';
import { parseStoredDate } from '../../lib/agent/dates';
import { readDue } from '../../lib/dueDate';

export function Sheet({ label, title, sub, onClose, width = 520, children }: {
  label: string; title: string; sub?: string; onClose: () => void; width?: number; children: ReactNode;
}) {
  useOverlayDismiss(true, onClose);
  return (
    <Dialog
      open
      onClose={onClose}
      width={width}
      label={label}
      closeOnEscape={false}
      zIndex={Z.modal}
      style={{ gap: 0, padding: 0, gridTemplateColumns: 'minmax(0, 1fr)' }}
    >
      <div style={{ display: 'grid', gap: 'var(--sp-6)', padding: 'var(--pad-sheet)', minWidth: 0 }}>
        <header style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-5)' }}>
          <div style={{ display: 'grid', gap: 'var(--sp-3)', flex: 1, minWidth: 0 }}>
            <h2 style={{ font: 'var(--type-title)', fontSize: 'var(--text-xl)', color: 'var(--fg-1)' }}>{title}</h2>
            {sub && <p style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>{sub}</p>}
          </div>
          <IconButton label="Close" variant="ghost" onClick={onClose}>
            <Icon name="x" size={18} />
          </IconButton>
        </header>
        {children}
      </div>
    </Dialog>
  );
}

export const Label = ({ children }: { children: ReactNode }) => (
  <span style={{ font: 'var(--type-kicker)', color: 'var(--fg-3)', textTransform: 'var(--kicker-transform)' as never }}>
    {children}
  </span>
);

// ─── + Add widget ───────────────────────────────────────────────────────────

/** Android's widget gallery: every block, what it shows, and one tap to add it. */
export function WidgetGallery({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const blocks = useDashboardStore((s) => s.blocks);
  const addBlock = useDashboardStore((s) => s.addBlock);
  const counts = useMemo(() => {
    const c = new Map<BlockKind, number>();
    for (const b of blocks) c.set(b.kind, (c.get(b.kind) ?? 0) + 1);
    return c;
  }, [blocks]);

  return (
    <Sheet
      label="Add a widget"
      title="Add a widget"
      sub="It goes at the end. Drag it where you want it, and pull its corner to resize."
      onClose={onClose}
    >
      <div className="ag-scroll ag-fade" style={{ display: 'grid', gap: 'var(--sp-3)', maxHeight: '60vh', overflowY: 'auto', overscrollBehavior: 'contain' }}>
        {BLOCK_KINDS.map((kind, i) => {
          const spec = BLOCK_SPECS[kind];
          const n = counts.get(kind) ?? 0;
          /* 29-1c4: the samples sit last, under a heading that says what they are. */
          const firstSample = SAMPLE_KINDS.has(kind) && !SAMPLE_KINDS.has(BLOCK_KINDS[i - 1]);
          return (
            <Fragment key={kind}>
            {firstSample && (
              <div style={{ display: 'grid', gap: 2, padding: 'var(--sp-5) var(--sp-2) var(--sp-1)' }}>
                <Label>Coming next</Label>
                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
                  Samples, on pretend data. Each becomes the real widget with its update.
                </span>
              </div>
            )}
            <div
              className="ag-licon-host"
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', padding: 'var(--sp-4)',
                borderRadius: 'var(--r-md)', backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
              }}
            >
              {/* 29-1P5b, idea 80: layered glass, in the widget's job colour. */}
              <LayeredIcon icon={<Icon name={BLOCK_ICONS[kind]} size={20} />} colour={BLOCK_TINTS[kind]} size={44} />
              <div style={{ display: 'grid', gap: 2, flex: 1, minWidth: 0 }}>
                <span style={{ font: 'var(--type-label)', fontSize: 'var(--text-md)', color: 'var(--fg-1)' }}>{spec.title}</span>
                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
                  {spec.blurb}
                  {n > 0 && ` · ${n} on your Dashboard`}
                </span>
              </div>
              <SoftButton icon={<Icon name="plus" size={15} />} onClick={() => { onAdded(addBlock(kind)); onClose(); }}>
                Add
              </SoftButton>
            </div>
            </Fragment>
          );
        })}
      </div>
    </Sheet>
  );
}

// ─── ⚙ one block ────────────────────────────────────────────────────────────

export function BlockSettingsSheet({ blockId, onClose }: { blockId: string; onClose: () => void }) {
  const blocks = useDashboardStore((s) => s.blocks);
  const { resizeBlock, moveBlock, removeBlock, updateSettings } = useDashboardStore.getState();
  const projects = useStore((s) => s.projects);
  const index = blocks.findIndex((b) => b.id === blockId);
  const block = blocks[index];
  const rows = useMemo(() => flattenProjectTree(buildProjectTree(projects)), [projects]);
  if (!block) return null;
  const spec = BLOCK_SPECS[block.kind];

  const sizes: { w: number; h: number }[] = [];
  for (let h = spec.minH; h <= MAX_ROWS; h++) for (let w = spec.minW; w <= GRID_COLUMNS; w++) sizes.push({ w, h });

  return (
    <Sheet label={`${spec.title} settings`} title={spec.title} sub={spec.blurb} onClose={onClose} width={480}>
      <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
        <Label>Size</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
          {sizes.map(({ w, h }) => {
            const on = block.w === w && block.h === h;
            return (
              <button
                key={`${w}x${h}`}
                type="button"
                className="dash-chip"
                aria-pressed={on}
                aria-label={`${w} wide, ${h} tall`}
                onClick={() => resizeBlock(block.id, w, h)}
                style={{ height: 'auto', padding: 'var(--sp-3)', display: 'grid', gap: 4, justifyItems: 'center' }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: 'grid', gridTemplateColumns: `repeat(${GRID_COLUMNS}, 7px)`, gridAutoRows: 7, gap: 2,
                  }}
                >
                  {Array.from({ length: GRID_COLUMNS * MAX_ROWS }, (_, i) => {
                    const c = i % GRID_COLUMNS;
                    const r = Math.floor(i / GRID_COLUMNS);
                    const lit = c < w && r < h;
                    return (
                      <span
                        key={i}
                        style={{ borderRadius: 2, backgroundColor: lit ? (on ? 'var(--hue-lime)' : 'var(--fg-3)') : 'oklch(1 0 0 / 0.06)' }}
                      />
                    );
                  })}
                </span>
                <span style={{ font: 'var(--type-caption)' }}>{w}×{h}</span>
              </button>
            );
          })}
        </div>
      </div>

      {block.kind === 'project-progress' && (
        <>
          <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
            <Label>Measure by</Label>
            <SegmentedControl
              look="soft"
              options={[
                { value: 'tasks', label: 'Tasks' },
                { value: 'hours', label: 'Hours' },
                { value: 'money', label: '₹ Value' },
              ]}
              value={block.settings?.metric ?? 'tasks'}
              onChange={(v) => updateSettings(block.id, { metric: v as ProgressMetric })}
            />
          </div>
          <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
            <Label>Project</Label>
            <div className="ag-scroll ag-fade" role="listbox" aria-label="Project" style={{ display: 'grid', gap: 2, maxHeight: '32vh', overflowY: 'auto' }}>
              {[{ id: undefined, name: 'The busiest one, chosen for you', depth: 0 }, ...rows.map((r) => ({ id: r.project.id, name: r.project.name, depth: r.depth }))].map((row) => {
                const on = (block.settings?.projectId ?? undefined) === row.id;
                return (
                  <button
                    key={row.id ?? 'auto'}
                    type="button"
                    role="option"
                    aria-selected={on}
                    className="dash-row"
                    onClick={() => updateSettings(block.id, { projectId: row.id })}
                    style={{ paddingLeft: `calc(var(--sp-3) + ${row.depth * 18}px)` }}
                  >
                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: on ? 'var(--fg-1)' : undefined }}>
                      {row.name}
                    </span>
                    {on && <Icon name="check" size={16} style={{ color: 'var(--hue-lime)' }} />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {block.kind === 'stack' && <StackPagesSection block={block} />}

      {block.kind === 'quick-add' && <QuickAddListSection block={block} rows={rows} />}

      {/* 29-1c2: a range per block, his call; today is the default and stores nothing. */}
      {block.kind === 'timeline' && (
        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <Label>Show</Label>
          <SegmentedControl
            look="soft"
            options={[
              { value: 'day', label: 'Today' },
              { value: 'three', label: '3 days' },
              { value: 'week', label: 'The week' },
            ]}
            value={timelineRange(block.settings?.range)}
            onChange={(v) => updateSettings(block.id, { range: v === 'day' ? undefined : (v as TimelineRange) })}
          />
        </div>
      )}

      {block.kind === 'countdown' && <CountdownTargetSection block={block} />}
      {block.kind === 'countdown' && <CountdownFaceSection block={block} />}

      {block.kind !== 'one-thing' && <LookSection block={block} />}

      <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
        <Label>Place</Label>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
          <SoftButton icon={<Icon name="arrow-left" size={15} />} disabled={index === 0} onClick={() => moveBlock(block.id, index - 1)}>
            Earlier
          </SoftButton>
          <SoftButton disabled={index === blocks.length - 1} onClick={() => moveBlock(block.id, index + 1)}>
            Later <Icon name="arrow-right" size={15} />
          </SoftButton>
          <span style={{ flex: 1 }} />
          <SoftButton
            icon={<Icon name="trash-2" size={15} />}
            style={{ color: 'var(--status-overrun)' }}
            onClick={() => { removeBlock(block.id); onClose(); }}
          >
            Remove
          </SoftButton>
        </div>
      </div>
    </Sheet>
  );
}

/**
 * 29-1c1: the list the quick-add note's lines become tasks in — the three
 * lists every account has first, then each project's, in the project tree's
 * order. The current one is whatever `quickAddList` resolves, so a block whose
 * list was deleted shows Action Steps ticked, which is where it now files.
 */
function QuickAddListSection({ block, rows }: { block: DashboardBlock; rows: ReturnType<typeof flattenProjectTree> }) {
  const taskLists = useStore((s) => s.taskLists);
  const current = quickAddList(taskLists, block.settings?.listId).id;
  const options = useMemo(() => {
    const own = taskLists.filter((l) => !l.projectId).map((l) => ({ id: l.id, name: l.title, depth: 0 }));
    const inProjects = rows.flatMap((r) =>
      taskLists
        .filter((l) => l.projectId === r.project.id)
        .map((l) => ({ id: l.id, name: `${r.project.name} › ${l.title}`, depth: r.depth })),
    );
    return [...own, ...inProjects];
  }, [taskLists, rows]);

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
      <Label>Lines become tasks in</Label>
      <div className="ag-scroll ag-fade" role="listbox" aria-label="Lines become tasks in" style={{ display: 'grid', gap: 2, maxHeight: '32vh', overflowY: 'auto' }}>
        {options.map((row) => {
          const on = row.id === current;
          return (
            <button
              key={row.id}
              type="button"
              role="option"
              aria-selected={on}
              className="dash-row"
              /* Action Steps is the default: picking it stores nothing. */
              onClick={() => updateSettingsOf(block.id, row.id === 'action' ? undefined : row.id)}
              style={{ paddingLeft: `calc(var(--sp-3) + ${row.depth * 18}px)` }}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: on ? 'var(--fg-1)' : undefined }}>
                {row.name}
              </span>
              {on && <Icon name="check" size={16} style={{ color: 'var(--job-lime)' }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const updateSettingsOf = (id: string, listId: string | undefined) => useDashboardStore.getState().updateSettings(id, { listId });

/** A pick in "Counts down to" clears the other two kinds (`countdownKind`). */
const CLEAR_TARGET: BlockSettings = { eventId: undefined, taskId: undefined, date: undefined, dateName: undefined, dateSince: undefined };

const TARGET_HINTS: Record<CountdownTargetKind, string> = {
  event: 'An event from your events: a trip, a birthday, a race.',
  task: 'A task, to its deadline. Only tasks with a deadline are here.',
  date: 'Any day you pick, with a name if you like: "Exams".',
};

/**
 * 29-2a, 29-2d2: what a Countdown counts to — an event (the soonest coming
 * one, which stores nothing, or one he picks), a task (to its deadline), or a
 * date he names — and the switch that lists what is due before it. The three
 * tabs only show a list; nothing is stored until a row or a date is picked.
 */
function CountdownTargetSection({ block }: { block: DashboardBlock }) {
  const stored = countdownKind(block.settings);
  const [kind, setKind] = useState<CountdownTargetKind>(stored);
  const write = (patch: BlockSettings) => useDashboardStore.getState().updateSettings(block.id, patch);

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
      <Label>Counts down to</Label>
      <SegmentedControl
        look="soft"
        options={[
          { value: 'event', label: 'An event' },
          { value: 'task', label: 'A task' },
          { value: 'date', label: 'A date' },
        ]}
        value={kind}
        onChange={(v) => setKind(v as CountdownTargetKind)}
      />
      <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>{TARGET_HINTS[kind]}</span>
      {kind === 'event' && <CountdownEventList block={block} chosen={stored === 'event'} write={write} />}
      {kind === 'task' && <CountdownTaskList block={block} write={write} />}
      {kind === 'date' && <CountdownDateFields block={block} write={write} />}
      {/* Off is the default: switching it off stores nothing. */}
      <Switch
        checked={!!block.settings?.dueBefore}
        onChange={(on) => write({ dueBefore: on || undefined })}
        label="Show what is due before it"
      />
    </div>
  );
}

function PickRow({ on, children, trail, onPick }: { on: boolean; children: ReactNode; trail?: ReactNode; onPick: () => void }) {
  return (
    <button type="button" role="option" aria-selected={on} className="dash-row" onClick={onPick}>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: on ? 'var(--fg-1)' : undefined }}>
        {children}
      </span>
      {trail}
      {on && <Icon name="check" size={16} style={{ color: 'var(--job-lime)' }} />}
    </button>
  );
}

/** 29-2a: the soonest coming one (stores nothing), or one he picks, coming ones first and then the archive's. */
function CountdownEventList({ block, chosen, write }: { block: DashboardBlock; chosen: boolean; write: (patch: BlockSettings) => void }) {
  const events = useEventStore((s) => s.events);
  const tz = useMemo(() => resolveUserTimeZone(), []);
  const rows = useMemo(() => {
    const now = new Date();
    const own = (list: { event: { id: string; title: string } }[], passed: boolean) =>
      list.map(({ event }) => ({ id: event.id as string | undefined, name: passed ? `${event.title} (passed)` : event.title }));
    return [
      { id: undefined as string | undefined, name: 'The soonest one, chosen for you' },
      ...own(upcomingEvents(events, now, tz), false),
      ...own(passedEvents(events, now, tz), true),
    ];
  }, [events, tz]);
  const current = block.settings?.eventId && events.some((e) => e.id === block.settings?.eventId) ? block.settings.eventId : undefined;

  return (
    <div className="ag-scroll ag-fade" role="listbox" aria-label="Counts down to" style={{ display: 'grid', gap: 2, maxHeight: '32vh', overflowY: 'auto' }}>
      {rows.map((row) => (
        <PickRow key={row.id ?? 'soonest'} on={chosen && row.id === current} onPick={() => write({ ...CLEAR_TARGET, eventId: row.id })}>
          {row.name}
        </PickRow>
      ))}
    </div>
  );
}

/**
 * 29-2d2: a task to count to — open ones with a deadline, ignored work left
 * out; coming ones soonest first, then the overdue ones, latest first. A box
 * narrows them by name.
 */
function CountdownTaskList({ block, write }: { block: DashboardBlock; write: (patch: BlockSettings) => void }) {
  const backlog = useStore((s) => s.backlogTasks);
  const ignored = usePriorityScores().ignored.ids;
  const tz = useMemo(() => resolveUserTimeZone(), []);
  const [query, setQuery] = useState('');
  const rows = useMemo(() => {
    const now = new Date();
    const dated = backlog
      .filter((t) => !t.parent && t.status !== 'completed' && !ignored.has(t.id))
      .map((t) => ({ task: t, at: parseStoredDate(t.deadline, tz)?.getTime() }))
      .filter((r): r is { task: Task; at: number } => r.at !== undefined);
    const coming = dated.filter((r) => r.at > now.getTime()).sort((a, b) => a.at - b.at);
    const overdue = dated.filter((r) => r.at <= now.getTime()).sort((a, b) => b.at - a.at);
    return [...coming, ...overdue].map((r) => ({ task: r.task, due: readDue(r.task.deadline, now, tz) }));
  }, [backlog, ignored, tz]);
  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.task.title.toLowerCase().includes(q)) : rows;
  const current = block.settings?.taskId;

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
      {rows.length > 6 && (
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a task" aria-label="Find a task" />
      )}
      <div className="ag-scroll ag-fade" role="listbox" aria-label="Task to count down to" style={{ display: 'grid', gap: 2, maxHeight: '32vh', overflowY: 'auto' }}>
        {shown.length === 0 && (
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', padding: 'var(--sp-3)' }}>
            <LitLine text={rows.length === 0 ? '**No task has a deadline.** Give one a date first.' : '**No task by that name.**'} />
          </span>
        )}
        {shown.map(({ task, due }) => (
          <PickRow
            key={task.id}
            on={task.id === current}
            onPick={() => write({ ...CLEAR_TARGET, taskId: task.id })}
            trail={(
              <span style={{ font: 'var(--type-caption)', color: due?.overdue ? 'var(--status-overrun)' : 'var(--fg-3)', whiteSpace: 'nowrap' }}>
                {due?.words}
              </span>
            )}
          >
            {task.title}
          </PickRow>
        ))}
      </div>
    </div>
  );
}

/**
 * 29-2d2: a date he picks and the name he gives it (his call). The name waits
 * here until there is a date to keep it with; `dateSince`, when he first
 * picked one, is where the Journey line starts.
 */
function CountdownDateFields({ block, write }: { block: DashboardBlock; write: (patch: BlockSettings) => void }) {
  const settings = block.settings;
  const [name, setName] = useState(settings?.dateName ?? '');
  const named = (text: string) => text.trim() || undefined;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 'var(--sp-3)' }}>
      <Input
        type="date"
        aria-label="Date"
        value={settings?.date ?? ''}
        onChange={(e) => {
          const date = e.target.value;
          if (!date) return;
          write({ ...CLEAR_TARGET, date, dateName: named(name), dateSince: settings?.date ? settings.dateSince : Date.now() });
        }}
      />
      <Input
        value={name}
        aria-label="Name"
        placeholder="Name it, e.g. Exams"
        maxLength={60}
        onChange={(e) => {
          setName(e.target.value);
          if (settings?.date) write({ dateName: named(e.target.value) });
        }}
      />
    </div>
  );
}

const FACE_HINTS: Record<CountdownFace, string> = {
  minimal: 'The number, its name and the date.',
  cover: "The event's cover picture, with the number over it. Give the event a picture in its sheet.",
  shape: 'The number in a shape. Tap the shape to change it.',
  journey: 'A line from the day you set it to the day itself.',
  flap: 'A split-flap airport board. Its tiles flip as the count changes.',
};

/** 29-2b: how the Countdown draws its event — idea 140's four and the split-flap board (27). */
function CountdownFaceSection({ block }: { block: DashboardBlock }) {
  const face = countdownFace(block.settings?.face);
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
      <Label>Style</Label>
      <SegmentedControl
        look="soft"
        options={COUNTDOWN_FACES.map((f) => ({ value: f, label: COUNTDOWN_FACE_LABELS[f] }))}
        value={face}
        /* Minimal is the default: picking it stores nothing. */
        onChange={(v) => useDashboardStore.getState().updateSettings(block.id, { face: v === 'minimal' ? undefined : (v as CountdownFace) })}
      />
      <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>{FACE_HINTS[face]}</span>
    </div>
  );
}

const hh = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
const PAGE_KINDS = BLOCK_KINDS.filter((k) => !NOT_A_PAGE.has(k));

/**
 * Idea 133 (29-1P13): what a Stack holds, and from which hour each page comes
 * up on its own. Two pages cannot start at the same hour; a stepper skips an
 * hour another page has.
 */
function StackPagesSection({ block }: { block: DashboardBlock }) {
  const { updateSettings } = useDashboardStore.getState();
  const pages = stackPages(block);
  const write = (next: StackPage[]) => updateSettings(block.id, { pages: [...next].sort((a, b) => a.from - b.from) });
  const taken = (hour: number, except: number) => pages.some((p, i) => i !== except && p.from === hour);
  const step = (i: number, dir: 1 | -1) => {
    let hour = pages[i].from;
    for (let n = 0; n < 24; n++) {
      hour = (hour + dir + 24) % 24;
      if (!taken(hour, i)) break;
    }
    write(pages.map((p, k) => (k === i ? { ...p, from: hour } : p)));
  };
  const add = () => {
    const last = pages[pages.length - 1]?.from ?? 8;
    let hour = (last + 3) % 24;
    while (taken(hour, -1)) hour = (hour + 1) % 24;
    write([...pages, { kind: 'today', from: hour }]);
  };

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
      <Label>Pages</Label>
      <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
        It turns to each page on its own from that hour. Scroll inside it to see the others.
      </span>
      <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
        {pages.map((page, i) => (
          <div key={`${page.kind}@${page.from}`} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: '0 0 auto' }}>
              <SoftIconButton size="sm" label="Earlier" onClick={() => step(i, -1)}>
                <Icon name="minus" size={14} />
              </SoftIconButton>
              <span aria-label={`From ${hh(page.from)}`} style={{ width: 52, textAlign: 'center', font: 'var(--type-label)', color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums' }}>
                {hh(page.from)}
              </span>
              <SoftIconButton size="sm" label="Later" onClick={() => step(i, 1)}>
                <Icon name="plus" size={14} />
              </SoftIconButton>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <CustomDropdown<BlockKind>
                size="sm"
                ariaLabel={`Page from ${hh(page.from)}`}
                value={page.kind}
                options={PAGE_KINDS.map((k) => ({ value: k, label: BLOCK_SPECS[k].title }))}
                onChange={(kind) => write(pages.map((p, k) => (k === i ? { ...p, kind } : p)))}
              />
            </div>
            <IconButton size="sm" variant="ghost" label="Remove this page" disabled={pages.length <= 1} onClick={() => write(pages.filter((_, k) => k !== i))}>
              <Icon name="x" size={14} />
            </IconButton>
          </div>
        ))}
      </div>
      {pages.length < MAX_STACK_PAGES && (
        <SoftButton icon={<Icon name="plus" size={15} />} style={{ justifySelf: 'start' }} onClick={add}>
          Add a page
        </SoftButton>
      )}
    </div>
  );
}

const LOOK_OPTIONS: { value: BlockLook; label: string }[] = [
  { value: 'glass', label: 'Glass' },
  { value: 'lamp', label: 'Lamp' },
  { value: 'tint', label: 'Tinted' },
  /* "Full colour" wraps in a 480-wide sheet; the line under it says the rest. */
  { value: 'full', label: 'Full' },
];

/**
 * Ideas 81 and 147 (29-1P12): how the block is drawn, and in which of BASE's
 * ten colours. The colour starts as the block's own, by its job; "full
 * colour" is for the one block he wants to shout, so the sheet says so.
 */
function LookSection({ block }: { block: DashboardBlock }) {
  const { updateSettings } = useDashboardStore.getState();
  const { look, colour } = blockLook(block);
  const own = BLOCK_COLOUR[block.kind];
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
      <Label>Look</Label>
      <SegmentedControl
        look="soft"
        options={LOOK_OPTIONS}
        value={look}
        onChange={(v) => updateSettings(block.id, { look: v === 'glass' ? undefined : (v as BlockLook) })}
      />
      {look !== 'glass' && (
        <>
          <div role="radiogroup" aria-label="Colour" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
            {COLOUR_JOBS.map((c) => {
              const on = c === colour;
              return (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={c === own ? `${COLOUR_JOB_INFO[c].name}, its own colour` : COLOUR_JOB_INFO[c].name}
                  title={`${COLOUR_JOB_INFO[c].name}: ${COLOUR_JOB_INFO[c].job}`}
                  onClick={() => updateSettings(block.id, { colour: c === own ? undefined : c })}
                  style={{
                    width: 30, height: 30, borderRadius: '50%', border: 0, padding: 0, cursor: 'pointer',
                    backgroundColor: `var(--job-${c})`,
                    boxShadow: on
                      ? '0 0 0 2px var(--void-1), 0 0 0 3.5px var(--fg-2)'
                      : '0 0 0 2px var(--void-1), 0 0 0 3.5px transparent',
                    transition: 'box-shadow var(--dur-fast) var(--ease-glass)',
                  }}
                />
              );
            })}
          </div>
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
            {look === 'lamp' && 'Near-black, with its colour glowing down from the top. Point at it and the light grows.'}
            {look === 'tint' && 'Glass with a wash of colour, and its number in the colour.'}
            {look === 'full' && 'The whole block in colour. Keep it for the one block you want to shout.'}
            {' '}{COLOUR_JOB_INFO[own].name} is its own colour.
          </span>
        </>
      )}
    </div>
  );
}

// ─── The overdue pile ───────────────────────────────────────────────────────

export function OverdueSheet({ onClose, onOpenTask }: { onClose: () => void; onOpenTask: (task: Task) => void }) {
  const backlog = useStore((s) => s.backlogTasks);
  const lists = useStore((s) => s.taskLists);
  const scores = usePriorityScores();
  const tz = useMemo(() => resolveUserTimeZone(), []);
  const now = new Date(scores.now);
  const pile = useMemo(
    () => overdueTasks(backlog, new Date(scores.now), tz, scores.ignored.ids),
    [backlog, scores, tz],
  );
  const listName = useMemo(() => new Map(lists.map((l) => [l.id, l.title])), [lists]);

  return (
    <Sheet
      label="Overdue tasks"
      title={`${pile.length} overdue`}
      sub="Oldest first. Open one to reschedule it, finish it, or let it go."
      onClose={onClose}
      width={560}
    >
      <div className="ag-scroll ag-fade" style={{ display: 'grid', gap: 2, maxHeight: '62vh', overflowY: 'auto', overscrollBehavior: 'contain' }}>
        {pile.length === 0 && (
          <LitLine as="p" text="**Nothing** is past its deadline." style={{ font: 'var(--type-body)', color: 'var(--fg-3)' }} />
        )}
        {pile.map(({ task, at }) => (
          <button key={task.id} type="button" className="dash-row" onClick={() => { onClose(); onOpenTask(task); }}>
            <span style={{ display: 'grid', gap: 1, flex: 1, minWidth: 0 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--fg-1)' }}>{task.title}</span>
              {task.listId && (
                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>{listName.get(task.listId)}</span>
              )}
            </span>
            <span style={{ font: 'var(--type-caption)', color: 'var(--status-deadline)', whiteSpace: 'nowrap' }}>
              {agoPhrase(at, now)} late
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
