/**
 * Jump back in, at the top of Home (29-1P8c, idea 154). His pick, D of
 * `docs/design/home-shape.html` (2026-10-13): small cards with the project's
 * cover and icon, its name, where he was and when — four of them, scrolling
 * sideways when they do not fit. Tap one and the board opens where he left it
 * (`useJumpTo`). With nothing opened yet on this device there is no row at all.
 *
 * Ctrl+K shows the same four before anything is typed
 * (`CommandPaletteHost`), through the same `useJumpRows`.
 */
import { useJumpRows, useJumpTo } from './project/jumpBack';
import type { Project } from '../store/useStore';
import { MiniCover } from './ProjectCover';
import ProjectIcon from './ProjectIcon';

export default function JumpBackRow() {
  const rows = useJumpRows();
  const jumpTo = useJumpTo();
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="jump-back-title" style={{ display: 'grid', gap: 'var(--sp-4)' }}>
      <h2 id="jump-back-title" style={{ font: 'var(--type-label)', fontWeight: 600, color: 'var(--fg-1)' }}>
        Jump back in
      </h2>
      {/* Sideways, with no bar (OPT-10); the padding gives the cards' shadows
          and their hover lift room inside the scroller's clip. */}
      <div
        className="ag-scroll"
        style={{
          display: 'flex', gap: 'var(--sp-4)', overflowX: 'auto',
          margin: 'calc(-1 * var(--sp-3)) calc(-1 * var(--sp-3)) 0', padding: 'var(--sp-3) var(--sp-3) var(--sp-5)',
        }}
      >
        {rows.map(({ spot, project, where, when }) => (
          <JumpCard key={spot.projectId} project={project} where={where} when={when} onClick={() => jumpTo(spot)} />
        ))}
      </div>
    </section>
  );
}

/** One card: the cover and icon, the name, where he was, when. `/design` shows it too. */
export function JumpCard({ project, where, when, onClick }: {
  project: Project; where: string; when: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="ag-jump-card"
      onClick={onClick}
      aria-label={`${project.name}${where ? `, ${where}` : ''}, ${when}`}
    >
      <span style={{ position: 'relative', display: 'block', height: 64 }}>
        <span style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 'var(--r-md) var(--r-md) 0 0' }}>
          <MiniCover project={project} />
        </span>
        <span style={{ position: 'absolute', left: 'var(--sp-4)', bottom: -15 }}>
          <ProjectIcon project={project} size={30} />
        </span>
      </span>
      <span className="ag-jump-card-text">
        <span className="ag-jump-card-name">{project.name}</span>
        {where && <span className="ag-jump-card-where">{where}</span>}
        <span className="ag-jump-card-when">{when}</span>
      </span>
    </button>
  );
}
