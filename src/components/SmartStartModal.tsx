/**
 * Smart Start.
 * Mockup: the `SmartStartDialog` function in `design-system/screens/home.html`.
 *
 * Rebuilt on Aurora Glass. Three things changed shape for the user:
 *
 *   - **The queue is inspectable before it starts.** It used to be one line —
 *     "4 tasks queued · ≈2h of work" — and nothing else. That line is now the
 *     head of a disclosure, and opening it lists what was picked, in the order
 *     it will be worked, with the project it came from and what it costs. The
 *     mockup's own note is the reason: the queue is the whole promise of the
 *     button, and pressing it replaces today's session, so it has to be
 *     readable first.
 *   - **The hours field is an instrument, not a form field.** 36px mono in a
 *     78px well, as the mockup has it. It is no longer `type="number"`: a
 *     spinner set at metric scale puts the browser's own arrows in the middle
 *     of the sheet. It takes digits and one dot instead, capped at four
 *     characters — the mockup's own sanitiser.
 *   - **Held-back rows lost their private 224px scroller.** The sheet scrolls;
 *     a second scroll area nested inside it was one too many.
 *
 * Unchanged underneath, and load-bearing: `buildSmartQueue` runs ONCE per
 * change of input, and the array it produced is what `onStart` hands to Home —
 * never the hours it was built from. `heldBack` and the per-task "Schedule
 * anyway" override (which skips both the prerequisite and the hour budget) are
 * exactly as they were, including naming the overrun in minutes rather than
 * leaving the total to look like a miscalculation.
 *
 * Two deliberate departures from the mockup:
 *   - **The held-back list opens closed.** The mockup has it open, against two
 *     rows of fake data. A real backlog can hold back a dozen, which would
 *     push Start below the fold every time the sheet opens.
 *   - **"Schedule anyway" is a toggle, not a one-way door.** The mockup moves
 *     an overridden row out of the list; here it stays and reads "Scheduled",
 *     because a row that vanishes as you click it cannot be un-clicked.
 *     `lib/smartStart.ts` records the same decision from the data side.
 *
 * The project name on a queued row is the one thing this sheet reads from the
 * store that it did not before. It is display-only — it fills the column the
 * mockup has — and touches neither the queue nor Home's contract. A task whose
 * list has no project falls back to the list's own title, which is what every
 * other "where does this live" caption in the app shows.
 *
 * `Dialog` is still the derived stand-in described at the top of
 * `src/ui/overlay/Dialog.tsx`; the design project was unreachable from this
 * session too (`DesignSync list_projects` returned an empty array again).
 * Reconciling it is UI-21.
 */
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Dialog, FieldLabel, Icon, IconButton } from '../ui';
import type { IconName } from '../ui';
import { getListTitle, taskEstimatedMinutes, useStore, type Task } from '../store/useStore';
import { useOverlayDismiss } from '../lib/useOverlayDismiss';
import { Z } from '../lib/zLayers';
import { buildSmartQueue } from '../lib/smartStart';
import { usePriorityScores } from '../store/usePriorityScores';

const QUICK_PICKS = [1, 2, 4, 8];

/** Digits and at most one dot — the field is set in mono at metric scale, so it cannot be a spinner. */
const sanitizeHours = (raw: string) => {
  const kept = raw.replace(/[^0-9.]/g, '').slice(0, 4);
  const dot = kept.indexOf('.');
  return dot === -1 ? kept : kept.slice(0, dot + 1) + kept.slice(dot + 1).replace(/\./g, '');
};

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * A 52px head that opens a block in place. Both of the sheet's lists use it:
 * what the hours bought, and what they could not buy. The contents mount
 * rather than animate their height — panes in this system arrive by
 * condensing, and `ag-condense` is that law's own keyframe.
 */
function Disclosure({
  icon,
  label,
  note,
  open,
  onToggle,
  children,
}: {
  icon: IconName;
  label: ReactNode;
  note?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        borderRadius: 'var(--r-lg)',
        backgroundImage: 'var(--glass-fill-1)',
        boxShadow: 'var(--glass-rim-1)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-4)',
          width: '100%',
          height: 52,
          padding: '0 var(--sp-6)',
          border: 0,
          background: 'transparent',
          cursor: 'pointer',
          color: 'var(--fg-1)',
          textAlign: 'left',
        }}
      >
        <Icon name={icon} size={16} />
        <span style={{ font: 'var(--type-label)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap' }}>{label}</span>
        {note}
        <span style={{ flex: 1 }} />
        <span
          style={{
            display: 'flex',
            color: 'var(--fg-3)',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform var(--dur-base) var(--ease-glass)',
          }}
        >
          <Icon name="chevron-down" size={16} />
        </span>
      </button>
      {open && children}
    </div>
  );
}

/** The same block with nothing to disclose — no queue, so no chevron to press. */
function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-4)',
        height: 52,
        padding: '0 var(--sp-6)',
        borderRadius: 'var(--r-lg)',
        backgroundImage: 'var(--glass-fill-1)',
        boxShadow: 'var(--glass-rim-1)',
        color: 'var(--fg-3)',
        font: 'var(--type-body)',
        fontSize: 'var(--text-sm)',
      }}
    >
      <Icon name="list-checks" size={16} />
      {children}
    </div>
  );
}

interface SmartStartModalProps {
  isOpen: boolean;
  onClose: () => void;
  backlogTasks: Task[];
  /** How many tasks are already in today's queue — starting replaces all of them. */
  currentQueueCount: number;
  /**
   * Receives the queue the preview was showing, rather than the hours it was
   * built from: building it a second time on the way out is both wasted work
   * and a chance for what starts to differ from what was previewed (the
   * priority score reads the clock, and the overrides live in here).
   */
  onStart: (queue: Task[]) => void;
}

export default function SmartStartModal({ isOpen, onClose, backlogTasks, currentQueueCount, onStart }: SmartStartModalProps) {
  const { projects, taskLists } = useStore();

  const [hours, setHours] = useState('2');
  /** Held-back tasks the user pressed "Schedule anyway" on. */
  const [overrides, setOverrides] = useState<ReadonlySet<string>>(() => new Set());
  const [showQueue, setShowQueue] = useState(false);
  const [showHeldBack, setShowHeldBack] = useState(false);
  const [hoursFocused, setHoursFocused] = useState(false);

  // Reset everything back to a sensible default each time the modal opens.
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setHours('2');
      setOverrides(new Set());
      setShowQueue(false);
      setShowHeldBack(false);
    }
  }

  // While open, register as an overlay so the floating bottom nav tucks away
  // (same mechanism Task Detail / Share modals use), and close on Escape.
  useOverlayDismiss(isOpen, onClose);

  const parsedHours = parseFloat(hours);
  const isValid = Number.isFinite(parsedHours) && parsedHours > 0;
  const scores = usePriorityScores();

  // Built once per change of input and reused by both the preview and Start —
  // see `onStart`.
  const result = useMemo(
    () => (isValid
      ? buildSmartQueue(parsedHours, backlogTasks, { overrides, scores })
      : { queue: [], heldBack: [] }),
    [isValid, parsedHours, backlogTasks, overrides, scores],
  );

  const queuedIds = useMemo(() => new Set(result.queue.map((t) => t.id)), [result]);
  const plannedMinutes = result.queue.reduce((sum, t) => sum + taskEstimatedMinutes(t), 0);
  // Only an override can put the queue over the budget, and when it does the
  // total on its own reads like a miscalculation — so say by how much.
  const overrunMinutes = isValid ? Math.max(0, Math.round(plannedMinutes - parsedHours * 60)) : 0;

  /** Where a queued task lives: its project, or its list when it has no project. */
  const contextOf = (task: Task) => {
    const list = taskLists.find((l) => l.id === task.listId);
    const project = list?.projectId ? projects.find((p) => p.id === list.projectId) : undefined;
    return project?.name ?? getListTitle(taskLists, task.listId, task.listName);
  };

  const toggleOverride = (taskId: string) => {
    setOverrides((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const handleStart = () => {
    if (!isValid || result.queue.length === 0) return;
    onStart(result.queue);
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      width={520}
      labelledBy="smart-start-title"
      /* Escape is `useOverlayDismiss`'s above, which answers only for the
         topmost overlay. See Dialog's port note 2. */
      closeOnEscape={false}
      zIndex={Z.panel}
      style={{ gap: 0, padding: 0, gridTemplateColumns: 'minmax(0, 1fr)' }}
    >
      <div
        className="ag-scroll"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: 'var(--sp-8)',
          padding: 'var(--pad-sheet)',
          minWidth: 0,
          boxSizing: 'border-box',
          maxHeight: '86vh',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
      >
        <header style={{ display: 'grid', gap: 'var(--sp-5)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)' }}>
            {/* Emerald is rationed to mean *live*, and this is the sheet that
                starts the session — the one place on it the colour is earned. */}
            <span
              aria-hidden="true"
              style={{
                display: 'grid',
                placeItems: 'center',
                width: 44,
                height: 44,
                flex: '0 0 auto',
                borderRadius: '50%',
                backgroundImage: 'var(--glass-tint-accent)',
                boxShadow: 'var(--glass-rim-2), var(--glow-accent-sm)',
                color: 'oklch(0.93 0.07 162)',
              }}
            >
              <Icon name="zap" size={20} />
            </span>
            <h2
              id="smart-start-title"
              style={{
                flex: 1,
                minWidth: 0,
                font: 'var(--type-title)',
                fontSize: 'var(--text-2xl)',
                letterSpacing: 'var(--tracking-title)',
                color: 'var(--fg-1)',
              }}
            >
              Smart Start
            </h2>
            <IconButton label="Close" variant="ghost" onClick={onClose}>
              <Icon name="x" size={18} />
            </IconButton>
          </div>
          <p style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
            How long have you got? Highest-priority tasks are pulled until the time is full.
          </p>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-4)' }}>
          <FieldLabel icon={<Icon name="clock" size={14} />}>Hours available</FieldLabel>

          {/* The number is the instrument here, so it is set at metric scale in
              mono inside a deep well — not a 15px form field. The well lights
              up on focus the way every other field in the system does, and the
              inner element opts out of the global ring, which would otherwise
              draw a hard rectangle inside these corners. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-5)',
              height: 78,
              padding: '0 var(--sp-7)',
              borderRadius: 'var(--r-lg)',
              backgroundImage: 'var(--glass-well)',
              boxShadow: hoursFocused
                ? 'var(--glass-well-shadow), 0 0 0 1px var(--accent-hairline), 0 0 20px -6px oklch(0.70 0.15 162 / 0.5)'
                : 'var(--glass-well-shadow), 0 0 0 1px var(--line-faint)',
              transition: 'box-shadow var(--dur-base) var(--ease-glass)',
            }}
          >
            <input
              autoFocus
              className="ag-field"
              data-ag-field=""
              value={hours}
              onChange={(e) => setHours(sanitizeHours(e.target.value))}
              onFocus={() => setHoursFocused(true)}
              onBlur={() => setHoursFocused(false)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleStart(); }}
              inputMode="decimal"
              placeholder="2"
              aria-label="Hours available"
              style={{
                flex: 1,
                minWidth: 0,
                border: 0,
                background: 'transparent',
                outline: 'none',
                boxShadow: 'none',
                color: 'var(--fg-1)',
                font: 'var(--type-metric)',
                fontFamily: 'var(--font-mono)',
                fontSize: 'var(--text-3xl)',
                fontVariantNumeric: 'tabular-nums',
              }}
            />
            <span style={{ font: 'var(--type-label)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>hours</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gap: 'var(--sp-3)',
              marginTop: 'var(--sp-2)',
            }}
          >
            {QUICK_PICKS.map((h) => {
              const on = parsedHours === h;
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHours(String(h))}
                  aria-pressed={on}
                  style={{
                    height: 44,
                    border: 0,
                    cursor: 'pointer',
                    borderRadius: 'var(--r-control)',
                    background: on ? 'var(--glass-tint-accent)' : 'var(--glass-fill-1)',
                    boxShadow: on ? 'var(--glass-rim-2), var(--glow-accent-sm)' : 'var(--glass-rim-1)',
                    color: on ? 'oklch(0.93 0.07 162)' : 'var(--fg-3)',
                    font: 'var(--type-numeric)',
                    fontSize: 'var(--text-sm)',
                    transition: 'var(--t-hover)',
                  }}
                >
                  {h}h
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          {/* What the hours bought. Expands in place — the queue is the whole
              promise, so it must be inspectable before starting. */}
          {result.queue.length === 0 ? (
            <EmptyRow>
              {isValid ? 'No available tasks to schedule yet.' : 'Set the hours you have to build a queue.'}
            </EmptyRow>
          ) : (
            <Disclosure
              icon="list-checks"
              open={showQueue}
              onToggle={() => setShowQueue((v) => !v)}
              label={`${result.queue.length} ${result.queue.length === 1 ? 'task' : 'tasks'} queued`}
              note={
                <>
                  <span
                    style={{
                      font: 'var(--type-numeric)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--fg-3)',
                      fontVariantNumeric: 'tabular-nums',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatMinutes(plannedMinutes)} of work
                  </span>
                  {overrunMinutes > 0 && (
                    <span
                      style={{
                        font: 'var(--type-numeric)',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--hue-amber)',
                        fontVariantNumeric: 'tabular-nums',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatMinutes(overrunMinutes)} over
                    </span>
                  )}
                </>
              }
            >
              <div
                style={{
                  display: 'grid',
                  padding: '0 var(--sp-6) var(--sp-5)',
                  animation: 'var(--kf-condense) var(--dur-base) var(--ease-morph) both',
                }}
              >
                {result.queue.map((task, i) => (
                  <div
                    key={task.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--sp-4)',
                      padding: 'var(--sp-4) 0',
                      borderTop: '1px solid var(--line-faint)',
                    }}
                  >
                    <span
                      style={{
                        font: 'var(--type-numeric)',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--fg-4)',
                        fontVariantNumeric: 'tabular-nums',
                        width: 16,
                        flex: '0 0 auto',
                      }}
                    >
                      {i + 1}
                    </span>
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        font: 'var(--type-body)',
                        fontSize: 'var(--text-sm)',
                        color: 'var(--fg-1)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {task.title}
                    </span>
                    <span
                      style={{
                        font: 'var(--type-caption)',
                        color: 'var(--fg-4)',
                        flex: '0 1 auto',
                        minWidth: 0,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {contextOf(task)}
                    </span>
                    <span
                      style={{
                        font: 'var(--type-numeric)',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--fg-3)',
                        fontVariantNumeric: 'tabular-nums',
                        flex: '0 0 auto',
                      }}
                    >
                      {formatMinutes(taskEstimatedMinutes(task))}
                    </span>
                  </div>
                ))}
              </div>
            </Disclosure>
          )}

          {/* Held back: blocked tasks, with the blocker named. Overriding is
              allowed — it is the user's call, not the system's. */}
          {result.heldBack.length > 0 && (
            <Disclosure
              icon="git-branch"
              open={showHeldBack}
              onToggle={() => setShowHeldBack((v) => !v)}
              label={`${result.heldBack.length} held back`}
              note={
                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>
                  waiting on unfinished work
                </span>
              }
            >
              <div
                style={{
                  display: 'grid',
                  gap: 'var(--sp-4)',
                  padding: '0 var(--sp-6) var(--sp-6)',
                  animation: 'var(--kf-condense) var(--dur-base) var(--ease-morph) both',
                }}
              >
                {result.heldBack.map(({ task, blockers }) => {
                  const scheduled = queuedIds.has(task.id);
                  const blockerNames = blockers.map((b) => b.title).join(', ');
                  return (
                    <div
                      key={task.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--sp-5)',
                        paddingTop: 'var(--sp-4)',
                        borderTop: '1px solid var(--line-faint)',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}>
                        <span
                          style={{
                            font: 'var(--type-body)',
                            fontSize: 'var(--text-sm)',
                            color: 'var(--fg-1)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {task.title}
                        </span>
                        <span
                          title={`Waiting on: ${blockerNames}`}
                          style={{
                            font: 'var(--type-caption)',
                            color: 'var(--fg-4)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          Waiting on: {blockerNames}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant={scheduled ? 'tint' : 'glass'}
                        iconLeft={<Icon name={scheduled ? 'check' : 'zap'} size={14} />}
                        onClick={() => toggleOverride(task.id)}
                        title={scheduled
                          ? 'Take it back out of the queue'
                          : 'Schedule it even though it is waiting on something'}
                        style={{ flex: '0 0 auto' }}
                      >
                        {scheduled ? 'Scheduled' : 'Schedule anyway'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </Disclosure>
          )}
        </div>

        {/* Starting overwrites today's queue — say so before it happens.
            Amber, not rose: this is a consequence to read, not a failure. */}
        {currentQueueCount > 0 && (
          <div
            style={{
              display: 'flex',
              gap: 'var(--sp-4)',
              padding: 'var(--sp-5) var(--sp-6)',
              borderRadius: 'var(--r-lg)',
              background: 'var(--glass-tint-amber)',
              boxShadow: 'var(--glass-rim-1), inset 0 0 0 1px oklch(0.72 0.14 82 / 0.22)',
            }}
          >
            <span style={{ display: 'flex', color: 'var(--hue-amber)', flex: '0 0 auto', marginTop: 1 }}>
              <Icon name="triangle-alert" size={16} />
            </span>
            <p style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'oklch(0.95 0.07 82)', textWrap: 'pretty' }}>
              Today&apos;s session already has {currentQueueCount} task{currentQueueCount !== 1 ? 's' : ''} in it.
              Starting replaces {currentQueueCount !== 1 ? 'them' : 'it'}.
            </p>
          </div>
        )}

        <Button
          variant="gel"
          size="lg"
          block
          disabled={!isValid || result.queue.length === 0}
          iconLeft={<Icon name="zap" size={18} />}
          onClick={handleStart}
        >
          {currentQueueCount > 0 ? 'Replace & Start Focusing' : 'Start Focusing'}
        </Button>
      </div>
    </Dialog>
  );
}
