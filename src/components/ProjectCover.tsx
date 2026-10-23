/**
 * A project's cover when it has no photo: the style he chose for it
 * (idea 149, 29-1P8a) — six of them, per project, his call.
 * `lib/projectCover.ts` is what each looks like; this only draws it.
 *
 * It draws INTO a box its caller owns (the card's 12:7 frame, the sheet's
 * preview), filling it, like `<CoverImage>`. Style F, "none", draws nothing:
 * the card leaves its cover box out instead (`ProjectCard`).
 *
 * Every style is still: drawn once from the seed, no loop, no filter, no
 * backdrop blur — a wall of them costs what a wall of photos does. B's
 * frost is `LayeredIcon`'s blurred copy, not a backdrop-filter.
 *
 * Colours are written into `style` (`fill`, `background-image`), never as
 * SVG attributes: an attribute cannot read a CSS variable, and "My tint"
 * is CSS variables.
 */
import { useMemo, type CSSProperties } from 'react';
import { CoverImage, LayeredIcon } from '../ui';
import { useStore, type Project } from '../store/useStore';
import { splitParked } from '../lib/backburner';
import { buildProjectTree } from '../lib/projectTree';
import {
  COVER_H, COVER_W, auroraSpot, coverInks, coverWord, dotGrid, ink, meshSpots, resolveCover, stripeSpec, wavePaths,
  type CoverInks, type ResolvedCover,
} from '../lib/projectCover';
import AppIcon from './AppIcon';

export type CoverSubject = Pick<Project, 'id' | 'name' | 'icon' | 'imageUrl' | 'cover'>;

/** The darkening at a cover's foot, so the card's glass edge and the icon tile sit on calm ground. */
const FOOT = 'linear-gradient(180deg, transparent 55%, oklch(0.13 0.005 260 / 0.55))';

/** The style's cover. The caller draws his photo instead when there is one (a photo always wins). */
export function MadeCover({ project, style }: { project: CoverSubject; style?: ResolvedCover }) {
  const cover = style ?? resolveCover(project.id, project.cover);
  const inks = coverInks(cover.seed, cover.colours);
  switch (cover.kind) {
    case 'none': return null;
    case 'icon': return <IconCover icon={project.icon} inks={inks} />;
    case 'name': return <NameCover name={project.name} inks={inks} />;
    case 'glimpse': return <GlimpseCover projectId={project.id} />;
    case 'aurora': return <AuroraCover seed={cover.seed} inks={inks} />;
    default: return <PatternCover cover={cover} inks={inks} />;
  }
}

/**
 * A cover in a small box (29-1P8c): a tile of a folder card's cover (idea
 * 153) and a Jump back in card (154). His photo cropped to fill, with no
 * blurred backdrop at this size; a pattern, aurora or name as on the card
 * (all scale with the box); the icon at a size a tile can hold; and the two
 * that cannot shrink — a glimpse of the lists, and no cover at all — as the
 * mesh in the project's own colours, so every tile has its colour.
 */
export function MiniCover({ project }: { project: CoverSubject }) {
  if (project.imageUrl) return <CoverImage src={project.imageUrl} fit="crop" />;
  const cover = resolveCover(project.id, project.cover);
  const inks = coverInks(cover.seed, cover.colours);
  switch (cover.kind) {
    case 'icon': return <IconCover icon={project.icon} inks={inks} size={36} />;
    case 'name': return <NameCover name={project.name} inks={inks} />;
    case 'aurora': return <AuroraCover seed={cover.seed} inks={inks} />;
    case 'none':
    case 'glimpse': return <Mesh seed={cover.seed} inks={inks} />;
    default: return <PatternCover cover={cover} inks={inks} />;
  }
}

function PatternCover({ cover, inks }: { cover: ResolvedCover; inks: CoverInks }) {
  const { seed } = cover;
  switch (cover.pattern) {
    case 'waves': return <Waves seed={seed} inks={inks} />;
    case 'stripes': return <Stripes seed={seed} inks={inks} />;
    case 'dots': return <Dots seed={seed} inks={inks} />;
    default: return <Mesh seed={seed} inks={inks} />;
  }
}

function Mesh({ seed, inks }: { seed: number; inks: CoverInks }) {
  const [a, b, c] = meshSpots(seed);
  return (
    <div aria-hidden="true" className="ag-gcover">
      <div
        style={{
          backgroundColor: ink(inks, 0.2, 0.4),
          backgroundImage: [
            `radial-gradient(70% 90% at ${a.x}% ${a.y}%, ${ink(inks, 0.72, 1)}, transparent 70%)`,
            `radial-gradient(65% 85% at ${b.x}% ${b.y}%, ${ink(inks, 0.62, 0.94, true)}, transparent 70%)`,
            `radial-gradient(60% 70% at ${c.x}% ${c.y}%, ${ink(inks, 0.35, 0.8)}, transparent 75%)`,
          ].join(', '),
        }}
      />
      <div style={{ backgroundImage: FOOT }} />
    </div>
  );
}

function Waves({ seed, inks }: { seed: number; inks: CoverInks }) {
  const paths = useMemo(() => wavePaths(seed), [seed]);
  return (
    <div aria-hidden="true" className="ag-gcover">
      <svg viewBox={`0 0 ${COVER_W} ${COVER_H}`} preserveAspectRatio="none">
        <rect width={COVER_W} height={COVER_H} style={{ fill: ink(inks, 0.24, 0.5) }} />
        {paths.map((d, i) => (
          <path key={i} d={d} style={{ fill: ink(inks, 0.66 - i * 0.1, 1 - i * 0.12, i % 2 === 1, 0.92) }} />
        ))}
      </svg>
    </div>
  );
}

function Stripes({ seed, inks }: { seed: number; inks: CoverInks }) {
  const { angle, width: w } = stripeSpec(seed);
  return (
    <div aria-hidden="true" className="ag-gcover">
      <div
        style={{
          backgroundImage: `repeating-linear-gradient(${angle}deg, ${ink(inks, 0.7, 1)} 0 ${w}px, ${ink(inks, 0.52, 0.94, true)} ${w}px ${w * 2}px, ${ink(inks, 0.28, 0.6)} ${w * 2}px ${w * 3}px)`,
        }}
      />
      <div style={{ backgroundImage: 'linear-gradient(180deg, oklch(0.13 0.005 260 / 0.1), oklch(0.13 0.005 260 / 0.6))' }} />
    </div>
  );
}

function Dots({ seed, inks }: { seed: number; inks: CoverInks }) {
  const dots = useMemo(() => dotGrid(seed), [seed]);
  return (
    <div aria-hidden="true" className="ag-gcover">
      <svg viewBox={`0 0 ${COVER_W} ${COVER_H}`} preserveAspectRatio="xMidYMid slice">
        <rect width={COVER_W} height={COVER_H} style={{ fill: ink(inks, 0.17, 0.3) }} />
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={d.r} style={{ fill: ink(inks, d.l, 1, d.far) }} />
        ))}
      </svg>
    </div>
  );
}

function AuroraCover({ seed, inks }: { seed: number; inks: CoverInks }) {
  const { x, y } = auroraSpot(seed);
  return (
    <div aria-hidden="true" className="ag-gcover">
      <div
        style={{
          backgroundColor: ink(inks, 0.15, 0.15),
          backgroundImage: [
            `radial-gradient(70% 90% at ${x}% ${y}%, ${ink(inks, 0.45, 0.7, false, 0.55)}, transparent 70%)`,
            `radial-gradient(60% 80% at ${100 - x}% 100%, ${ink(inks, 0.4, 0.66, true, 0.35)}, transparent 70%)`,
            'linear-gradient(oklch(1 0 0 / 0.04) 1px, transparent 1px)',
            'linear-gradient(90deg, oklch(1 0 0 / 0.04) 1px, transparent 1px)',
          ].join(', '),
          backgroundSize: 'auto, auto, 24px 24px, 24px 24px',
        }}
      />
    </div>
  );
}

function IconCover({ icon, inks, size = 112 }: { icon?: string; inks: CoverInks; size?: number }) {
  return (
    <div aria-hidden="true" className="ag-gcover">
      <div
        style={{
          backgroundColor: ink(inks, 0.16, 0.25),
          backgroundImage: `radial-gradient(55% 75% at 50% 50%, ${ink(inks, 0.42, 0.75, false, 0.7)}, transparent 70%)`,
        }}
      />
      <div className="ag-gcover-icon">
        <LayeredIcon size={size} colour={ink(inks, 0.68, 1)} icon={<AppIcon icon={icon} size={Math.round(size * 0.43)} />} />
      </div>
    </div>
  );
}

function NameCover({ name, inks }: { name: string; inks: CoverInks }) {
  const word: CSSProperties = {
    backgroundImage: `linear-gradient(100deg, ${ink(inks, 0.75, 1)}, ${ink(inks, 0.6, 0.94, true)})`,
  };
  return (
    <div aria-hidden="true" className="ag-gcover">
      <div style={{ backgroundColor: ink(inks, 0.16, 0.2) }} />
      <div className="ag-gcover-name"><span style={word}>{coverWord(name)}</span></div>
    </div>
  );
}

const GLIMPSE_LISTS = 3;
const GLIMPSE_ROWS = 5;

/**
 * D: the project's own lists as small columns, one bar per task, done ones
 * ticked. Its own lists first (the board's, so not its parked Backburner);
 * a mega project with none of its own shows the lists inside it. It reads
 * the store, so it moves as he works — only cards wearing this style pay
 * for that subscription.
 */
function GlimpseCover({ projectId }: { projectId: string }) {
  const taskLists = useStore((s) => s.taskLists);
  const backlog = useStore((s) => s.backlogTasks);
  const projects = useStore((s) => s.projects);
  const columns = useMemo(() => {
    const byOrder = (a: { order?: number }, b: { order?: number }) => (a.order ?? 0) - (b.order ?? 0);
    let lists = splitParked(taskLists.filter((l) => l.projectId === projectId)).board;
    if (lists.length === 0) {
      const inside = new Set(buildProjectTree(projects).childrenOf(projectId).map((p) => p.id));
      lists = splitParked(taskLists.filter((l) => !!l.projectId && inside.has(l.projectId))).board;
    }
    return [...lists].sort(byOrder).slice(0, GLIMPSE_LISTS).map((list) => ({
      id: list.id,
      title: list.title,
      rows: backlog
        .filter((t) => !t.parent && t.listId === list.id)
        .sort(byOrder)
        .slice(0, GLIMPSE_ROWS)
        .map((t) => ({ id: t.id, done: t.status === 'completed', width: 40 + (hashLen(t.title) % 45) })),
    }));
  }, [taskLists, backlog, projects, projectId]);

  return (
    <div aria-hidden="true" className="ag-gcover">
      <div style={{ backgroundColor: 'oklch(0.145 0.005 260)' }} />
      <div className="ag-gcover-glimpse">
        {columns.length === 0
          ? [0, 1, 2].map((i) => <div key={i} className="ag-gcover-col" data-slot="">+</div>)
          : columns.map((col) => (
            <div key={col.id} className="ag-gcover-col">
              <span>{col.title}</span>
              {col.rows.map((row) => (
                <div key={row.id} className="ag-gcover-row" data-done={row.done ? '' : undefined}>
                  <i />
                  <b style={{ width: `${row.width}%` }} />
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}

/** A bar's length from its title, so the same task always draws the same bar. */
function hashLen(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
