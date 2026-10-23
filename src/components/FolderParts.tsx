/**
 * Projects inside projects look like folders (29-1P8c, idea 153). His picks,
 * 2026-10-13 (`docs/design/home-shape.html`): **C, the cover is made of what
 * is inside**, and **a tap unfolds them here** rather than opening it, the way
 * an Android or iOS home-screen folder does.
 *
 * `FolderTiles` is that cover: up to four tiles of the projects inside, their
 * own covers (`MiniCover`) with their names, "+N" in the fourth past four.
 * `FolderTray` is the row that unfolds under the card: every project inside as
 * a small card, then one tile that opens the folder itself — the only way into
 * its own lists once a tap unfolds instead of opening.
 *
 * The tray spans the grid's width and sits straight after its folder in the
 * DOM. The grid packs densely (`ProjectGrid`), so the cards after the folder
 * in its row fill back in beside it and the tray lands under the whole row,
 * at any width, with nothing measured.
 */
import { motion } from 'framer-motion';
import { useDndMonitor } from '@dnd-kit/core';
import { Icon, useMotion } from '../ui';
import type { Project } from '../store/useStore';
import { useOpenProject } from './project/openProject';
import { MiniCover } from './ProjectCover';

/** Four tiles show; past four the fourth says how many more. */
const TILES = 4;

/** The name on a tile, over its cover's foot. */
const TILE_NAME = 'linear-gradient(180deg, transparent 40%, oklch(0.1 0.005 260 / 0.7))';

export function FolderTiles({ projects }: { projects: readonly Project[] }) {
  const n = projects.length;
  const shown = n > TILES ? projects.slice(0, TILES - 1) : projects.slice(0, TILES);
  const more = n - shown.length;
  /* One fills the cover; two side by side; three with the first tall; four as two by two. */
  const columns = n === 1 ? '1fr' : '1fr 1fr';
  const rows = n <= 2 ? '1fr' : '1fr 1fr';
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute', inset: 0,
        display: 'grid', gridTemplateColumns: columns, gridTemplateRows: rows, gap: 6,
        /* Below the pill row, and above the icon tile on the cover's foot. */
        padding: 'calc(var(--sp-5) + 36px) var(--sp-5) 38px',
        backgroundColor: 'var(--void-1)', backgroundImage: 'var(--glass-well)',
      }}
    >
      {shown.map((p, i) => (
        <span
          key={p.id}
          style={{
            position: 'relative', minWidth: 0, overflow: 'hidden', borderRadius: 'var(--r-sm)',
            boxShadow: 'var(--glass-rim-1)',
            ...(n === 3 && i === 0 ? { gridRow: 'span 2' } : {}),
          }}
        >
          <MiniCover project={p} />
          <span
            style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', minWidth: 0,
              padding: '0 var(--sp-3) var(--sp-2)', backgroundImage: TILE_NAME,
              font: 'var(--type-caption)', fontWeight: 600, color: 'var(--fg-1)',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
          </span>
        </span>
      ))}
      {more > 0 && (
        <span
          style={{
            display: 'grid', placeItems: 'center', borderRadius: 'var(--r-sm)',
            backgroundImage: 'var(--glass-fill-2)', boxShadow: 'var(--glass-rim-1)',
            font: 'var(--type-numeric)', fontSize: 'var(--text-md)', color: 'var(--fg-2)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          +{more}
        </span>
      )}
    </div>
  );
}

interface FolderTrayProps {
  folder: Project;
  inside: readonly Project[];
  /** How many lists the folder has of its own, for the open tile's second line. */
  ownLists: number;
  onClose: () => void;
}

export function FolderTray({ folder, inside, ownLists, onClose }: FolderTrayProps) {
  const openProject = useOpenProject();
  const m = useMotion();
  /* A drag arranges the grid by where cards are drawn; the tray folds away first. */
  useDndMonitor({ onDragStart: onClose });
  const go = (id: string) => { onClose(); openProject(id); };
  const tile = (i: number) => ({
    initial: { opacity: 0, y: -12, scale: 0.94 },
    animate: { opacity: 1, y: 0, scale: 1 },
    transition: { duration: m.dur.slow, ease: m.ease.springy, delay: i * 0.04 },
  });

  return (
    <motion.div
      role="group"
      aria-label={`Inside ${folder.name}`}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: m.dur.fast } }}
      transition={{ duration: m.dur.base, ease: m.ease.glass }}
      style={{
        gridColumn: '1 / -1', marginTop: -8,
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 'var(--sp-4)',
        padding: 'var(--sp-5)', borderRadius: 'var(--r-lg)',
        backgroundImage: 'var(--glass-fill-2)',
        boxShadow: 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-2)',
      }}
    >
      {inside.map((p, i) => (
        <motion.button key={p.id} type="button" className="ag-folder-tile" onClick={() => go(p.id)} {...tile(i)}>
          <span style={{ position: 'relative', display: 'block', height: 52, overflow: 'hidden' }}>
            <MiniCover project={p} />
          </span>
          <span className="ag-folder-tile-name">{p.name}</span>
        </motion.button>
      ))}
      <motion.button
        type="button"
        className="ag-folder-tile"
        data-open=""
        onClick={() => go(folder.id)}
        {...tile(inside.length)}
      >
        <Icon name="arrow-right" size={18} />
        <span className="ag-folder-tile-name">Open {folder.name}</span>
        <span className="ag-folder-tile-sub">
          {ownLists === 0 ? 'the project itself' : `its own ${ownLists === 1 ? 'list' : `${ownLists} lists`}`}
        </span>
      </motion.button>
    </motion.div>
  );
}
