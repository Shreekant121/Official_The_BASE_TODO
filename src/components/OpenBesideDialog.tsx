/**
 * "Open beside…" (BIG-5) — which project goes next to this one.
 *
 * Every project in tree order, indented by depth, the way "Move into…" lists
 * them, less the one it would sit beside: the same board twice is one board.
 * One tap opens the pair; the ✕ on either board closes it again.
 *
 * Mounted only while open — never one per card (CLAUDE.md, "Performance" 2).
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, Icon, IconButton } from '../ui';
import { useStore } from '../store/useStore';
import { buildProjectTree, flattenProjectTree } from '../lib/projectTree';
import { splitPath } from '../lib/splitView';
import { useOverlayDismiss } from '../lib/useOverlayDismiss';
import { Z } from '../lib/zLayers';
import AppIcon from './AppIcon';

interface OpenBesideDialogProps {
  projectId: string;
  onClose: () => void;
}

export default function OpenBesideDialog({ projectId, onClose }: OpenBesideDialogProps) {
  const projects = useStore((s) => s.projects);
  const navigate = useNavigate();
  useOverlayDismiss(true, onClose);

  const { project, rows } = useMemo(() => ({
    project: projects.find((p) => p.id === projectId),
    rows: flattenProjectTree(buildProjectTree(projects)).filter(({ project: p }) => p.id !== projectId),
  }), [projects, projectId]);

  if (!project) return null;

  const pick = (besideId: string) => {
    onClose();
    navigate(splitPath(projectId, besideId));
  };

  return (
    <Dialog
      open
      onClose={onClose}
      width={440}
      label={`Open a project beside ${project.name}`}
      closeOnEscape={false}
      zIndex={Z.modal}
      style={{ gap: 0, padding: 0, gridTemplateColumns: 'minmax(0, 1fr)' }}
    >
      <div style={{ display: 'grid', gap: 'var(--sp-6)', padding: 'var(--pad-sheet)', minWidth: 0 }}>
        <header style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-5)' }}>
          <div style={{ display: 'grid', gap: 'var(--sp-3)', flex: 1, minWidth: 0 }}>
            <h2 style={{ font: 'var(--type-title)', fontSize: 'var(--text-xl)', color: 'var(--fg-1)' }}>
              Open beside…
            </h2>
            <p style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>
              Which board goes next to {project.name}.
            </p>
          </div>
          <IconButton label="Close" variant="ghost" onClick={onClose}>
            <Icon name="x" size={18} />
          </IconButton>
        </header>

        {rows.length === 0 ? (
          <p style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-4)' }}>
            There is no other project to open yet.
          </p>
        ) : (
          <div
            className="ag-scroll ag-fade"
            role="listbox"
            aria-label="Projects"
            style={{ display: 'grid', gap: 2, maxHeight: '56vh', overflowY: 'auto', overscrollBehavior: 'contain' }}
          >
            {rows.map(({ project: p, depth }) => (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => pick(p.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minHeight: 44,
                  padding: `0 var(--sp-5) 0 calc(var(--sp-5) + ${depth * 20}px)`,
                  border: 0, borderRadius: 'var(--r-md)', cursor: 'pointer', textAlign: 'left',
                  background: 'transparent', color: 'var(--fg-1)', font: 'var(--type-label)',
                  transition: 'var(--t-hover)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--glass-fill-1)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{ display: 'grid', placeItems: 'center', width: 20, flex: '0 0 auto', color: 'var(--fg-3)' }}>
                  <AppIcon icon={p.icon} size={16} />
                </span>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </span>
                <Icon name="panel-right-open" size={16} style={{ color: 'var(--fg-4)' }} />
              </button>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
