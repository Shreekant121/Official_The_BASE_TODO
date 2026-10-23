/**
 * The board's selection bar (idea 76, 29-1P6a, BIG-15; his "morph" video):
 * one button that splits into its actions.
 *
 * Pick a task and the bar rises as one pill — how many are picked and how
 * much work that is — then pulls apart into Move ▾, Done and Delete, each
 * springing out from behind it in turn. Clear the picks and they flow back in
 * before the bar sinks away. His call, 2026-10-12: the same floating bar it
 * always was, arriving this way, with **Done** new (it ticks them all) and
 * **Move ▾ one button** in place of the old list picker and its Move: press
 * it for the lists, or hold it and slide to one (idea 75, `MorphMenu`).
 *
 * The parts never leave the layout: the bar keeps its size and only opacity,
 * `translate` and `scale` move (the individual properties, so nothing fights
 * a button's own press `transform`). Nothing runs at rest.
 */
import type { CSSProperties } from 'react';
import { Icon, MorphMenu, SoftButton, type MorphMenuItem } from '../../ui';
import { Z } from '../../lib/zLayers';
import { minutesLabel, workLeftMinutes } from './derive';
import type { Project, Task, TaskList } from '../../store/useStore';

const MONO: CSSProperties = { font: 'var(--type-numeric)', fontVariantNumeric: 'tabular-nums' };

/** Where each action sits behind the pill before it splits off, and the gap between their arrivals. */
const TUCK_PX = 52;
const STAGGER_MS = 45;

interface SelectionBarProps {
  picked: Task[];
  lists: TaskList[];
  projects: Project[];
  onMove: (listId: string) => void;
  onDone: () => void;
  onDelete: () => void;
  onClear: () => void;
}

export function SelectionBar({ picked, lists, projects, onMove, onDone, onDelete, onClear }: SelectionBarProps) {
  const open = picked.length > 0;
  const allDone = open && picked.every((t) => t.status === 'completed');

  /* Out from behind the pill one after another; back in the other way round. */
  const part = (i: number): CSSProperties => ({
    opacity: open ? 1 : 0,
    translate: open ? '0 0' : `${-TUCK_PX * (i + 1)}px 0`,
    scale: open ? '1' : '0.4',
    transition: [
      `translate var(--dur-slow) var(--ease-springy) ${open ? 60 + i * STAGGER_MS : (2 - i) * 30}ms`,
      `scale var(--dur-slow) var(--ease-springy) ${open ? 60 + i * STAGGER_MS : (2 - i) * 30}ms`,
      `opacity var(--dur-fast) var(--ease-glass) ${open ? 60 + i * STAGGER_MS : (2 - i) * 30}ms`,
    ].join(', '),
  });

  /* Every list in the app, under its project's name — the old picker's
     "any project", grouped instead of spelled out on every row. */
  const moveItems: MorphMenuItem[] = [];
  const byProject = new Map<string, TaskList[]>();
  for (const l of lists) {
    const key = l.projectId ?? '';
    byProject.set(key, [...(byProject.get(key) ?? []), l]);
  }
  for (const [projectId, group] of byProject) {
    const project = projects.find((p) => p.id === projectId);
    moveItems.push({ section: project?.name ?? 'Other lists' });
    for (const l of group) {
      moveItems.push({
        value: l.id,
        label: l.title,
        icon: <Icon name="corner-down-right" size={16} />,
        onSelect: () => onMove(l.id),
      });
    }
  }

  return (
    <div
      /* `inert`, not `aria-hidden`: the bar stays mounted so it can split in
         and out, and a hidden container full of focusable buttons is exactly
         the a11y bug `aria-hidden` alone would leave behind. */
      inert={!open}
      style={{
        pointerEvents: open ? 'auto' : 'none',
        display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap',
        justifyContent: 'center',
        minHeight: 60, padding: 'var(--sp-3) var(--sp-4) var(--sp-3) var(--sp-3)',
        borderRadius: 'var(--r-pill)',
        backgroundImage: 'var(--glass-fill-3)',
        backdropFilter: 'var(--glass-bd-lg)',
        WebkitBackdropFilter: 'var(--glass-bd-lg)',
        boxShadow: 'var(--glass-shadow-pane)',
        opacity: open ? 1 : 0,
        transform: open ? 'translateY(0) scale(1)' : 'translateY(14px) scale(0.96)',
        /* Sinks only once its parts have flowed back in. */
        transition: open
          ? 'opacity var(--dur-base) var(--ease-glass), transform var(--dur-base) var(--ease-spring)'
          : 'opacity var(--dur-base) var(--ease-glass) 140ms, transform var(--dur-base) var(--ease-spring) 140ms',
      }}
    >
      {/* The pill the actions split from: the count, the work, and ✕ to let go of them all. */}
      <span
        style={{
          position: 'relative', zIndex: 1,
          display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
          minHeight: 44, padding: '0 var(--sp-3) 0 var(--sp-6)',
          borderRadius: 'var(--r-pill)',
          backgroundImage: 'var(--glass-fill-2)',
          boxShadow: 'var(--glass-rim-2)',
        }}
      >
        <span style={{ display: 'grid', gap: 1 }}>
          <span style={{ ...MONO, fontSize: 'var(--text-sm)', color: 'var(--fg-1)' }}>
            {picked.length} selected
          </span>
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
            {minutesLabel(workLeftMinutes(picked))} of work
          </span>
        </span>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear the selection"
          title="Clear the selection"
          style={{
            display: 'grid', placeItems: 'center', width: 30, height: 30, border: 0,
            borderRadius: 'var(--r-pill)', background: 'transparent', color: 'var(--fg-3)', cursor: 'pointer',
          }}
        >
          <Icon name="x" size={14} />
        </button>
      </span>

      <span style={part(0)}>
        <MorphMenu
          portal
          zIndex={Z.dropdown}
          width={280}
          header={{ title: `Move ${picked.length} task${picked.length === 1 ? '' : 's'}`, meta: 'To any list, in any project' }}
          items={moveItems}
          trigger={(
            <SoftButton size="sm" icon={<Icon name="corner-down-right" size={14} />} aria-label="Move the selected tasks to a list">
              Move
              <Icon name="chevron-down" size={12} />
            </SoftButton>
          )}
        />
      </span>

      {/* Done is lime's job. Every picked task already done, and there is nothing to tick. */}
      <span style={part(1)}>
        <SoftButton
          size="sm"
          disabled={allDone}
          onClick={onDone}
          title="Tick every selected task"
          icon={<Icon name="check" size={14} style={{ color: 'var(--job-lime)' }} />}
        >
          Done
        </SoftButton>
      </span>

      {/* Into the Trash, recoverable: an ordinary press, not a hold (29-1P2). */}
      <span style={part(2)}>
        <SoftButton
          size="sm"
          onClick={onDelete}
          title="Move the selected tasks to the Trash — recoverable for 30 days"
          icon={<Icon name="trash-2" size={14} />}
          style={{ color: 'var(--status-overrun)' }}
        >
          Delete
        </SoftButton>
      </span>
    </div>
  );
}
