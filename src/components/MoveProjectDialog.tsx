/**
 * "Move into…" (BIG-2) — where a project can go, as the tree it would join.
 *
 * Every project is listed in tree order, indented by depth, except the one
 * being moved and everything inside it: a project cannot go inside itself, and
 * the store would refuse it anyway (`lib/projectTree.ts`'s `canMoveInto`).
 * "Top level" is the first row, which is Home. The row it already sits in is
 * ticked and does nothing. One tap moves it and closes; nothing to confirm,
 * because the menu gets it straight back.
 *
 * Mounted only while open — never one per card (CLAUDE.md, "Performance" 2).
 */
import { useMemo } from 'react';
import { Dialog, Icon, IconButton } from '../ui';
import { useStore } from '../store/useStore';
import { buildProjectTree, flattenProjectTree } from '../lib/projectTree';
import { useOverlayDismiss } from '../lib/useOverlayDismiss';
import { Z } from '../lib/zLayers';
import AppIcon from './AppIcon';

interface MoveProjectDialogProps {
  projectId: string;
  onClose: () => void;
}

export default function MoveProjectDialog({ projectId, onClose }: MoveProjectDialogProps) {
  const projects = useStore((s) => s.projects);
  const moveProject = useStore((s) => s.moveProject);
  useOverlayDismiss(true, onClose);

  const { project, currentParent, rows } = useMemo(() => {
    const tree = buildProjectTree(projects);
    const blocked = new Set(tree.subtreeIds(projectId));
    return {
      project: projects.find((p) => p.id === projectId),
      currentParent: tree.parentOf(projectId),
      rows: flattenProjectTree(tree).filter(({ project: p }) => !blocked.has(p.id)),
    };
  }, [projects, projectId]);

  if (!project) return null;

  const pick = (targetId: string | null) => {
    if (targetId !== currentParent) moveProject(projectId, targetId);
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      width={440}
      label={`Move ${project.name} into`}
      closeOnEscape={false}
      zIndex={Z.modal}
      style={{ gap: 0, padding: 0, gridTemplateColumns: 'minmax(0, 1fr)' }}
    >
      <div style={{ display: 'grid', gap: 'var(--sp-6)', padding: 'var(--pad-sheet)', minWidth: 0 }}>
        <header style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-5)' }}>
          <div style={{ display: 'grid', gap: 'var(--sp-3)', flex: 1, minWidth: 0 }}>
            <h2 style={{ font: 'var(--type-title)', fontSize: 'var(--text-xl)', color: 'var(--fg-1)' }}>
              Move into…
            </h2>
            <p style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>
              {project.name} goes with everything inside it.
            </p>
          </div>
          <IconButton label="Close" variant="ghost" onClick={onClose}>
            <Icon name="x" size={18} />
          </IconButton>
        </header>

        <div
          className="ag-scroll ag-fade"
          role="listbox"
          aria-label="Destinations"
          style={{ display: 'grid', gap: 2, maxHeight: '56vh', overflowY: 'auto', overscrollBehavior: 'contain' }}
        >
          <Row
            label="Top level"
            hint="On Home"
            icon={<Icon name="house" size={16} />}
            depth={0}
            current={currentParent === null}
            onPick={() => pick(null)}
          />
          {rows.map(({ project: p, depth }) => (
            <Row
              key={p.id}
              label={p.name}
              icon={<AppIcon icon={p.icon} size={16} />}
              depth={depth + 1}
              current={currentParent === p.id}
              onPick={() => pick(p.id)}
            />
          ))}
        </div>
      </div>
    </Dialog>
  );
}

function Row({ label, hint, icon, depth, current, onPick }: {
  label: string;
  hint?: string;
  icon: React.ReactNode;
  depth: number;
  current: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={current}
      onClick={onPick}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minHeight: 44,
        padding: `0 var(--sp-5) 0 calc(var(--sp-5) + ${depth * 20}px)`,
        border: 0, borderRadius: 'var(--r-md)', cursor: 'pointer', textAlign: 'left',
        background: current ? 'var(--glass-fill-1)' : 'transparent',
        boxShadow: current ? 'var(--glass-rim-1)' : 'none',
        color: 'var(--fg-1)', font: 'var(--type-label)',
        transition: 'var(--t-hover)',
      }}
      onMouseEnter={(e) => { if (!current) e.currentTarget.style.background = 'var(--glass-fill-1)'; }}
      onMouseLeave={(e) => { if (!current) e.currentTarget.style.background = 'transparent'; }}
    >
      <span style={{ display: 'grid', placeItems: 'center', width: 20, flex: '0 0 auto', color: 'var(--fg-3)' }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {hint && <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>{hint}</span>}
      {current && <Icon name="check" size={16} style={{ color: 'var(--job-lime)' }} />}
    </button>
  );
}
