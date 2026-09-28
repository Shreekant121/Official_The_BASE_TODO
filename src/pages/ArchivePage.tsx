/**
 * `/archive` — what was put away on purpose, kept for good (BUILD-11).
 * Design: design-system/screens/Archive.dc.html, section 02.
 *
 * **A shelf, not a bin.** The design's own contrast with `/trash`, and the
 * reason this screen shares none of that one's furniture: the Trash is one
 * flat pane with a clock on every row; the Archive has no clock and no pane —
 * tiles standing on a ledge, grouped by the quarter they were put away in (or
 * by project), projects wide and tasks narrow. Nothing on it counts down.
 *
 * Everything on a tile is read from the `ArchiveEntry` the archive kept, and
 * `lib/archiveModel.ts` says what each line means. Two things the design
 * draws are not here, on purpose:
 * - **"6h 40m logged".** Nothing in the app records hours worked on a
 *   project, so the tile prints the span it was active instead
 *   (`activeSpan`) rather than a number it would have to invent.
 * - **The quoted note** ("Contract ended. Invoices closed."). The confirm the
 *   design draws has no field to write one in, so nothing would ever fill it.
 *
 * **Put back is the undo.** It runs the Trash's own `planRestore`, lifts the
 * tile off the shelf, and says where the thing went. A project goes back to
 * Home with its tasks; nothing re-enters today's queue.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Icon, Input, MetaKicker, MiniNav, SegmentedControl, Toast, useMedia, useMotion, WIDE, type IconName,
} from '../ui';
import { RailMark } from '../components/BrandMark';
import { useNavModel } from '../components/navModel';
import { useArchiveStore } from '../store/useArchiveStore';
import { DEFAULT_LISTS } from '../store/useStore';
import { putBackFromArchive } from '../lib/archive';
import { Z } from '../lib/zLayers';
import {
  activeSpan,
  describeArchive,
  describeHeld,
  describeTask,
  formatArchivedAt,
  originOf,
  projectCounts,
  shelvesOf,
  type ArchiveEntry,
  type ShelfMode,
} from '../lib/archiveModel';

/** The design's column. */
const COLUMN_PX = 1120;

/** Enough dots to read "mostly done" at a glance without a 200-task project becoming a carpet. */
const MAX_DOTS = 48;

const MODES = [
  { value: 'when', label: 'By when' },
  { value: 'project', label: 'By project' },
];

interface ToastPayload {
  icon: IconName;
  title: string;
  detail?: string;
}

const kicker = {
  font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
  textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'],
} as const;

/** "8 mo ago" — the project tile's second clock-free fact: how long it has sat there. */
function ago(ms: number, now: number): string {
  const days = Math.floor((now - ms) / (24 * 60 * 60 * 1000));
  if (days < 1) return 'today';
  if (days < 30) return `${days} d ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return `${Math.floor(days / 365)} yr ago`;
}

/** The glass ledge every shelf's tiles stand on. */
function Ledge({ height = 14 }: { height?: number }) {
  return (
    <div
      aria-hidden="true"
      style={{
        height, borderRadius: '3px 3px 12px 12px',
        backgroundImage: 'var(--glass-fill-3)',
        backdropFilter: 'var(--glass-bd-md)', WebkitBackdropFilter: 'var(--glass-bd-md)',
        boxShadow: 'var(--glass-rim-3), var(--glass-inner-1), var(--glass-cast-3)',
      }}
    />
  );
}

function PutBack({ onClick, raised }: { onClick: () => void; raised: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)', height: 40,
        padding: '0 var(--sp-5)', border: 0, borderRadius: 'var(--r-pill)', cursor: 'pointer',
        font: 'var(--type-label)', transition: 'var(--t-hover)', flex: '0 0 auto',
        ...(raised
          ? { backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)', color: 'var(--fg-1)' }
          : { background: 'transparent', boxShadow: 'inset 0 0 0 1px var(--line-soft)', color: 'var(--fg-2)' }),
      }}
    >
      <Icon name="archive-restore" size={15} />
      Put back
    </button>
  );
}

function ProjectTile({ entry, now, onPutBack }: { entry: ArchiveEntry; now: number; onPutBack: () => void }) {
  const project = entry.projects[0];
  const { done, open } = projectCounts(entry);
  const span = activeSpan(entry);
  const lists = entry.taskLists.length;
  const shownDone = Math.min(done, MAX_DOTS);
  const shownOpen = Math.min(open, MAX_DOTS - shownDone);
  return (
    <div
      style={{
        display: 'grid', gap: 'var(--sp-4)', alignContent: 'start', minHeight: 228,
        padding: 'var(--sp-6) var(--sp-6) var(--sp-5)', boxSizing: 'border-box',
        borderRadius: 'var(--r-card) var(--r-card) 6px 6px',
        backgroundImage: 'var(--glass-fill-2)',
        backdropFilter: 'var(--glass-bd-md)', WebkitBackdropFilter: 'var(--glass-bd-md)',
        boxShadow: 'var(--glass-rim-2), var(--glass-inner-1), 0 10px 18px -12px oklch(0 0 0 / 0.8)',
        height: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)' }}>
        <span style={{ ...kicker, color: 'var(--fg-4)', display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
          {project?.icon && <span aria-hidden="true" style={{ textTransform: 'none' }}>{project.icon}</span>}
          Project
        </span>
        <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>
          {formatArchivedAt(entry.archivedAt)} · {ago(entry.archivedAt, now)}
        </span>
      </div>
      <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
        <span style={{ font: 'var(--type-title)', letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)', textWrap: 'pretty' }}>
          {entry.title || 'Untitled project'}
        </span>
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
          {describeHeld(entry)}{span ? ` · active ${span}` : ''}
        </span>
      </div>
      {done + open > 0 && (
        <div
          aria-label={`${done} done, ${open} open`}
          role="img"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxWidth: 260 }}
        >
          {Array.from({ length: shownDone }, (_, i) => (
            <span key={`d${i}`} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--fg-3)' }} />
          ))}
          {Array.from({ length: shownOpen }, (_, i) => (
            <span key={`o${i}`} style={{ width: 6, height: 6, borderRadius: '50%', boxShadow: 'inset 0 0 0 1px var(--line-strong)' }} />
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', marginTop: 'auto', paddingTop: 'var(--sp-2)', flexWrap: 'wrap' }}>
        <span style={{ flex: 1, minWidth: 0, font: 'var(--type-numeric)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)', fontVariantNumeric: 'tabular-nums' }}>
          {lists} list{lists === 1 ? '' : 's'}
        </span>
        <PutBack raised onClick={onPutBack} />
      </div>
    </div>
  );
}

function TaskTile({ entry, onPutBack }: { entry: ArchiveEntry; onPutBack: () => void }) {
  const { from, list } = originOf(entry);
  return (
    <div
      style={{
        display: 'grid', gap: 'var(--sp-3)', alignContent: 'start', minHeight: 176, boxSizing: 'border-box',
        padding: 'var(--sp-5) var(--sp-5) var(--sp-4)',
        borderRadius: 'var(--r-lg) var(--r-lg) 6px 6px',
        backgroundImage: 'var(--glass-fill-1)',
        backdropFilter: 'var(--glass-bd-sm)', WebkitBackdropFilter: 'var(--glass-bd-sm)',
        boxShadow: 'var(--glass-rim-1), 0 8px 14px -10px oklch(0 0 0 / 0.8)',
        height: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-3)' }}>
        <span style={{ ...kicker, color: 'var(--fg-4)' }}>Task</span>
        <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>
          {formatArchivedAt(entry.archivedAt)}
        </span>
      </div>
      <span style={{ font: 'var(--type-body)', color: 'var(--fg-1)', textWrap: 'pretty', overflowWrap: 'anywhere' }}>
        {entry.title || 'Untitled task'}
      </span>
      <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
        {from === list ? `from ${list}` : `from ${from} · ${list}`}
      </span>
      <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-4)' }}>
        {describeTask(entry.backlogTasks[0])}
      </span>
      <span style={{ justifySelf: 'start', marginTop: 'auto' }}>
        <PutBack raised={false} onClick={onPutBack} />
      </span>
    </div>
  );
}

/** The carved slots of an empty shelf — furniture, where the Trash has a bin icon and a line. */
function EmptyShelf() {
  const slot = (height: number, radius: string, opacity = 1) => (
    <div
      style={{
        height, opacity, borderRadius: `${radius} ${radius} 6px 6px`,
        backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
      }}
    />
  );
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-8)', paddingTop: 'var(--sp-6)' }}>
      <div style={{ display: 'grid', maxWidth: 640, width: '100%', justifySelf: 'center' }}>
        <div
          aria-hidden="true"
          style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr', gap: 'var(--sp-4)', alignItems: 'end', padding: '0 var(--sp-3)' }}
        >
          {slot(150, 'var(--r-card)')}
          {slot(110, 'var(--r-lg)')}
          {slot(124, 'var(--r-lg)')}
          {slot(96, 'var(--r-card)', 0.6)}
        </div>
        <Ledge />
      </div>
      <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--sp-3)', textAlign: 'center' }}>
        <span style={{ font: 'var(--type-title)', letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)' }}>
          The shelf is empty.
        </span>
        <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)', maxWidth: '42ch', textWrap: 'pretty' }}>
          Archive a finished project to keep it without seeing it.
        </span>
        <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap', justifyContent: 'center', marginTop: 'var(--sp-3)' }}>
          {['Project menu · Archive project', 'Task menu · Archive task'].map((hint) => (
            <span
              key={hint}
              style={{
                display: 'inline-flex', alignItems: 'center', height: 32, padding: '0 var(--sp-4)',
                borderRadius: 'var(--r-pill)', boxShadow: 'inset 0 0 0 1px var(--line-soft)',
                font: 'var(--type-caption)', color: 'var(--fg-3)',
              }}
            >
              {hint}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ArchivePage() {
  const wide = useMedia(WIDE);
  const nav = useNavModel();
  const navigate = useNavigate();
  const motionTokens = useMotion();
  const entries = useArchiveStore((s) => s.entries);

  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<ShelfMode>('when');
  const [toast, setToast] = useState<ToastPayload | null>(null);
  // One instant for every "8 mo ago" on the screen, so none tick over mid-read.
  const [now] = useState(() => Date.now());

  const shelves = useMemo(() => shelvesOf(entries, mode, query), [entries, mode, query]);

  const handlePutBack = (entry: ArchiveEntry) => {
    const result = putBackFromArchive(entry.id);
    if (!result) return;
    const rerouted = result.reroutedTaskIds.length;
    const { from, list } = originOf(entry);
    setToast({
      icon: 'archive-restore',
      title: `${entry.title || 'Untitled'} is back`,
      detail: rerouted > 0
        ? `${rerouted} task${rerouted === 1 ? '' : 's'} went to ${DEFAULT_LISTS[0].title} — the list ${rerouted === 1 ? 'it was' : 'they were'} in no longer exists.`
        : entry.kind === 'project'
          ? 'On Home with its tasks. Nothing re-queued.'
          : `In ${from === list ? list : `${from} · ${list}`}.`,
    });
  };

  return (
    <div className="ag-page ag-page--calm h-screen overflow-y-auto">
      <div style={{ display: 'flex', minHeight: '100%', alignItems: 'stretch' }}>
        {wide && (
          <div
            style={{
              position: 'sticky', top: 0, alignSelf: 'flex-start', flex: '0 0 auto',
              padding: 'var(--sp-9) 0 var(--sp-9) var(--sp-7)',
            }}
          >
            <MiniNav orientation="vertical" items={nav.items} value={nav.current} onChange={nav.go} lead={<RailMark />} />
          </div>
        )}

        <div
          style={{
            flex: 1, minWidth: 0, boxSizing: 'border-box',
            padding: wide
              ? 'var(--sp-9) var(--gutter-page) var(--sp-13)'
              : 'var(--sp-8) var(--gutter-page-sm) 128px',
          }}
        >
          <div style={{ width: '100%', maxWidth: COLUMN_PX, margin: '0 auto', display: 'grid', gap: 'var(--sp-9)' }}>

            <header style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--sp-6)', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 'var(--sp-3)', flex: 1, minWidth: 260 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
                  <button
                    type="button"
                    onClick={() => navigate('/settings')}
                    style={{ border: 0, padding: 0, background: 'none', cursor: 'pointer', font: 'inherit', color: 'var(--fg-3)' }}
                  >
                    Settings
                  </button>
                  <Icon name="chevron-right" size={14} />
                  <span style={{ color: 'var(--fg-2)' }}>Archive</span>
                </span>
                <h1
                  style={{
                    font: 'var(--type-display)', fontSize: 'var(--text-2xl)',
                    letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)', margin: 0,
                  }}
                >
                  Archive
                </h1>
                <p
                  style={{
                    font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)',
                    margin: 0, maxWidth: '56ch', textWrap: 'pretty',
                  }}
                >
                  Put away on purpose. Kept for good. Nothing here expires.
                </p>
              </div>
              {entries.length > 0 && (
                <SegmentedControl size="sm" options={MODES} value={mode} onChange={(v) => setMode(v as ShelfMode)} />
              )}
            </header>

            <div
              style={{
                display: 'grid', gap: 'var(--sp-9)',
                padding: wide ? 'var(--sp-9) var(--sp-9) var(--sp-11)' : 'var(--sp-7) var(--sp-5) var(--sp-9)',
                borderRadius: 'var(--r-card-lg)',
                boxShadow: 'inset 0 0 0 1px var(--line-faint)',
                background: 'oklch(0 0 0 / 0.18)',
              }}
            >
              {entries.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 240px', minWidth: 200, maxWidth: 340 }}>
                    <Input
                      size="sm"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search the shelf"
                      aria-label="Search the archive"
                      iconLeft={<Icon name="search" size={16} />}
                    />
                  </div>
                  <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)', fontVariantNumeric: 'tabular-nums' }}>
                    {describeArchive(entries)} · never purged
                  </span>
                  <span
                    style={{
                      flex: '1 1 280px', display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
                      justifyContent: wide ? 'flex-end' : 'flex-start',
                      font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty',
                    }}
                  >
                    <Icon name="eye-off" size={14} />
                    Hidden from boards, counts, queues, search and Atlas.
                  </span>
                </div>
              )}

              {entries.length === 0 ? (
                <EmptyShelf />
              ) : shelves.length === 0 ? (
                <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--sp-3)', padding: 'var(--sp-10) 0', textAlign: 'center' }}>
                  <span style={{ font: 'var(--type-label)', color: 'var(--fg-2)' }}>Nothing on the shelf matches that.</span>
                  <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>Try a project name or a month.</span>
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 'var(--sp-11)' }}>
                  {shelves.map((shelf) => (
                    <section key={shelf.key} aria-label={shelf.label} style={{ display: 'grid', gap: 'var(--sp-5)' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
                        <MetaKicker tone="var(--fg-1)">{shelf.label}</MetaKicker>
                        <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-4)' }}>{shelf.sub}</span>
                      </div>
                      <div>
                        <div
                          style={{
                            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                            gap: 'var(--sp-4)', alignItems: 'end', padding: '0 var(--sp-3)',
                          }}
                        >
                          <AnimatePresence initial={false}>
                            {shelf.entries.map((entry) => (
                              <motion.div
                                key={entry.id}
                                data-archive-entry={entry.id}
                                layout
                                exit={{ opacity: 0, y: -14 }}
                                transition={{ duration: motionTokens.dur.slow, ease: motionTokens.ease.glass }}
                                style={{ gridColumn: entry.kind === 'project' ? 'span 2' : undefined, alignSelf: 'stretch', display: 'grid', alignItems: 'end' }}
                              >
                                {entry.kind === 'project'
                                  ? <ProjectTile entry={entry} now={now} onPutBack={() => handlePutBack(entry)} />
                                  : <TaskTile entry={entry} onPutBack={() => handlePutBack(entry)} />}
                              </motion.div>
                            ))}
                          </AnimatePresence>
                        </div>
                        <Ledge />
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {toast && (
        <div
          style={{
            position: 'fixed', left: 0, right: 0,
            bottom: wide ? 'calc(var(--sp-9) + var(--safe-b))' : 'calc(var(--sp-13) + var(--safe-b))',
            display: 'grid', placeItems: 'center',
            zIndex: Z.toast, pointerEvents: 'none',
          }}
        >
          <span style={{ pointerEvents: 'auto' }}>
            <Toast
              icon={<Icon name={toast.icon} size={16} />}
              title={toast.title}
              detail={toast.detail}
              tone="neutral"
              onDismiss={() => setToast(null)}
            />
          </span>
        </div>
      )}

      {!wide && (
        <div
          style={{
            position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--sp-5) + var(--safe-b))',
            display: 'grid', placeItems: 'center',
            zIndex: Z.nav, pointerEvents: 'none',
          }}
        >
          <span style={{ pointerEvents: 'auto' }}>
            <MiniNav items={nav.items} value={nav.current} onChange={nav.go} />
          </span>
        </div>
      )}
    </div>
  );
}
