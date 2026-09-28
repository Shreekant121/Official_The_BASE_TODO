/**
 * `/trash` — thirty days of deletions, and what each one takes back with it.
 * Mockup: design-system/screens/trash.html (item 9C).
 *
 * WHY IT LEFT SETTINGS
 * --------------------
 * `TrashSection` was a tab on Settings, and the comment at the top of it said
 * why: *"somewhere you go when something has gone wrong, not somewhere you
 * work."* That was true while the only thing that could delete was a person
 * pressing a button they had to mean. Item 9 gave Atlas `delete_task`, so
 * things now disappear that Shreekant did not personally remove, and the place
 * you check what went is somewhere you work. Hence a destination.
 *
 * **Nothing about the Trash model moved with it.** `useTrashStore`,
 * `lib/trashModel.ts`, `lib/trash.ts` and `lib/trashSync.ts` are untouched;
 * `trashModel.test.ts` did not need an edit. Every number on this screen is
 * read or derived from a `TrashEntry` that was already being written.
 *
 * WHAT THE MOCKUP DRAWS THAT NOTHING RECORDS
 * ------------------------------------------
 * `trash.html` puts a small sparkle on every row Atlas deleted, counts those
 * rows in a tile, and opens an amber "Atlas made this call on its own" band
 * under the contested ones. **The app records none of that.** A `TrashEntry`
 * has no author field, both delete paths — the UI's and the agent's — go
 * through the same `useStore` action, and `useSnapshotStore` (which does know
 * a turn happened) is in-memory only and gone by the next reload. So it cannot
 * be read, and it cannot be worked out after the fact either.
 *
 * Shreekant's call, asked before anything was written: **drop it, and spend
 * the tile on something true.** So there is no sparkle, and the fourth metric
 * is `trashBytes` — how much the trash is holding — which is real, is the
 * thing Settings → Storage sends people here to think about, and cannot be
 * mistaken for a fact about who did what. Drawing it greyed as "not built"
 * (the treatment `/atlas-host` gives its spend tiles) was the alternative and
 * was rejected: a spend readout has item 13 behind it, and this has no session
 * behind it at all, so the pill would have named nothing.
 *
 * The mockup's other five kinds — notes, contacts, skills — are items 10, 21
 * and 12. Nothing special was needed for them: the kind chips are built from
 * what the trash actually holds and a kind with no entries draws no chip, so
 * they appear on their own the day something puts one there.
 *
 * WHAT IS DERIVED, AND WHY IT IS DERIVED RATHER THAN STORED
 * ---------------------------------------------------------
 * The mockup's `why` string ("Reverted with its turn") and its `detail` block
 * are literals in a demo. The honest version of both is the *consequence*, and
 * the app can compute that exactly: `planRestore` is the same pure function
 * the real restore runs, so calling it against today's state answers "where
 * will this land" before you press anything — including the case that
 * surprises people, where a task's list is gone and it will come back in
 * Action Steps instead. It runs only for an open row, because it clones three
 * store slices per call and a trash can hold two hundred entries.
 *
 * THE COUNTDOWN CLOCK IS PINNED AT MOUNT
 * --------------------------------------
 * Carried over from `TrashSection`: one `Date.now()` for the whole screen, so
 * every "8d" on it is counted from the same instant and none tick over
 * mid-scroll. The sort reads the same pinned instant, so the order cannot
 * disagree with the numbers it is ordering.
 */
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Button, Icon, IconButton, Input, MetaKicker, MiniNav, MorphMenu, SegmentedControl, Toast, Well,
  useMedia, WIDE, type IconName,
} from '../ui';
import { RailMark } from '../components/BrandMark';
import { useNavModel } from '../components/navModel';
import { useTrashStore } from '../store/useTrashStore';
import { useStore, DEFAULT_LISTS } from '../store/useStore';
import { emptyTrash, restoreFromTrash } from '../lib/trash';
import { formatBytes } from '../lib/syncDocSize';
import { Z } from '../lib/zLayers';
import {
  daysLeft,
  expiresAt,
  formatDeletedAt,
  planRestore,
  trashBytes,
  TRASH_RETENTION_MS,
  type TrashEntry,
} from '../lib/trashModel';

/** The mockup's column. Same as `/atlas-host`, and wider than Settings' 880. */
const COLUMN_PX = 1000;

const RETENTION_DAYS = Math.round(TRASH_RETENTION_MS / (24 * 60 * 60 * 1000));

/**
 * Amber below this. The mockup's threshold is a week and it is the better one:
 * `TrashSection` used ten days, which coloured a third of a full trash at rest
 * and so told you nothing. Seven is "this weekend or never".
 */
const SOON_DAYS = 7;

/**
 * The three kinds `cascadeDelete` can produce. Glyphs match the ones the row
 * already wore on Settings, so a person who used the old panel recognises
 * these — `trash.html` draws `list-checks` for a task and `folder` for a list,
 * which would have swapped two of the three.
 */
const KIND_META: Record<TrashEntry['kind'], { icon: IconName; label: string; plural: string }> = {
  project: { icon: 'folder', label: 'Project', plural: 'Projects' },
  list: { icon: 'list', label: 'List', plural: 'Lists' },
  task: { icon: 'square-check-big', label: 'Task', plural: 'Tasks' },
};

const KIND_ORDER: Array<TrashEntry['kind']> = ['task', 'list', 'project'];

const SORTS = [
  { value: 'soon', label: 'Going soonest' },
  { value: 'new', label: 'Newest' },
];

type SortId = 'soon' | 'new';

interface ToastPayload {
  icon: IconName;
  title: string;
  detail?: string;
  tone?: 'accent' | 'review' | 'overrun' | 'neutral';
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The exact instant, for the mono block on an open row. Spelled out rather
 * than left to `toLocaleString()`'s default, which prints seconds nobody needs
 * and changes shape between locales. This is the one place on the screen where
 * the precise time is the point, so it is the one worth pinning.
 */
function stamp(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** The day the sweep takes it — day and month, matching `formatDeletedAt`. */
function goesOn(entry: TrashEntry): string {
  return new Date(expiresAt(entry)).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Where the thing was, from the ancestors snapshotted at delete time — NOT
 * from today's store, which is the point of snapshotting them: the project a
 * deleted list belonged to may itself have been deleted since.
 *
 * A project entry has no ancestors and needs none; it was top level.
 */
function whereItWas(entry: TrashEntry): string {
  const { project, list } = entry.ancestors;
  const parts = [project?.name, list?.title].filter((p): p is string => Boolean(p));
  if (parts.length > 0) return parts.join(' · ');
  return entry.kind === 'project' ? 'Top level' : 'No longer traceable';
}

/**
 * What it took with it, as countable things rather than as a category.
 *
 * `describeEntryContents` in `trashModel.ts` is the terser version and is
 * still what the agent's `list_trash` prints; this one adds the two facts a
 * row on a screen can afford and a tool result cannot — deadlines, and cut
 * references — because both are things people are surprised to get back.
 *
 * **An entry does not count itself.** That is `describeEntryContents`'s own
 * rule, widened by one case: *"'1 task' next to a row already labelled Task is
 * noise, not information."* — and "1 list" beside a row labelled List reads
 * exactly as badly. The panel on Settings never showed that, because a list
 * entry there only ever printed its tasks. A task's *steps* are worth saying,
 * though: they came with it, and `remove_subtask` cannot put one back.
 */
function tookWithIt(entry: TrashEntry): string[] {
  const parts: string[] = [];

  if (entry.kind === 'task') {
    const steps = entry.backlogTasks[0]?.subtasks?.length ?? 0;
    if (steps > 0) parts.push(plural(steps, 'step'));
  } else {
    // A list entry's own list is in `taskLists`; a project's lists are not it.
    const lists = entry.kind === 'list' ? entry.taskLists.length - 1 : entry.taskLists.length;
    if (lists > 0) parts.push(plural(lists, 'list'));
    if (entry.backlogTasks.length > 0) parts.push(plural(entry.backlogTasks.length, 'task'));
  }

  const deadlines = entry.backlogTasks.filter((t) => Boolean(t.deadline)).length;
  if (deadlines > 0) parts.push(`${deadlines} with a deadline`);

  const refs = entry.backrefs.dependsOn.length + entry.backrefs.sharedListIds.length;
  if (refs > 0) parts.push(plural(refs, 'link elsewhere'));

  return parts;
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */

/** One of the four figures across the top. Mono numeral, mono label under it. */
function Metric({ value, unit, label, tone }: { value: string; unit?: string; label: string; tone?: string }) {
  return (
    <div
      style={{
        display: 'grid', gap: 'var(--sp-2)', minWidth: 0,
        padding: 'var(--sp-6) var(--sp-7)', borderRadius: 'var(--r-card)',
        backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
        animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)', minWidth: 0 }}>
        <span
          style={{
            font: 'var(--type-metric)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-3xl)',
            letterSpacing: 'var(--tracking-display)', color: tone ?? 'var(--fg-1)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {value}
        </span>
        {unit !== undefined && (
          <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>{unit}</span>
        )}
      </span>
      <MetaKicker tone="var(--fg-4)">{label}</MetaKicker>
    </div>
  );
}

/**
 * The countdown on a row. A ring would be decoration at this size — the
 * mockup's own note, and it is right: the number and the actual date is what
 * anybody deciding whether to act needs.
 */
function Countdown({ entry, now }: { entry: TrashEntry; now: number }) {
  const left = daysLeft(entry, now);
  const soon = left <= SOON_DAYS;
  const ink = soon ? 'var(--status-review)' : 'var(--fg-2)';
  return (
    <span style={{ display: 'grid', gap: 1, justifyItems: 'end', flex: '0 0 auto' }}>
      <span
        style={{
          font: 'var(--type-numeric)', fontSize: 'var(--text-md)',
          color: ink, fontVariantNumeric: 'tabular-nums',
        }}
      >
        {left === 0 ? 'today' : `${left}d`}
      </span>
      <MetaKicker tone={soon ? 'var(--status-review)' : 'var(--fg-4)'}>goes {goesOn(entry)}</MetaKicker>
    </span>
  );
}

/**
 * One deleted thing.
 *
 * `onPreview` is a function rather than a computed prop so the restore plan is
 * only worked out for a row somebody opened — see the note at the top of the
 * file about `planRestore`'s cost.
 */
function TrashRow({
  entry, now, first, onRestore, onPurge, onPreview,
}: {
  entry: TrashEntry;
  now: number;
  /** Rows are separated by a rule ABOVE each one, so the first carries none. */
  first: boolean;
  onRestore: () => void;
  onPurge: () => void;
  onPreview: (entry: TrashEntry) => RestorePreview;
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const meta = KIND_META[entry.kind];
  const soon = daysLeft(entry, now) <= SOON_DAYS;
  const took = tookWithIt(entry);
  const preview = open ? onPreview(entry) : null;

  return (
    <motion.div layout exit={{ opacity: 0, height: 0 }} style={{ borderTop: first ? 'none' : '1px solid var(--line-faint)' }}>
      <div
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap', minHeight: 68,
          padding: 'var(--sp-4) var(--sp-6)',
          background: hover ? 'oklch(1 0 0 / 0.035)' : 'transparent',
          transition: 'background var(--dur-fast) var(--ease-glass)',
        }}
      >
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          /* Without this the button's name is the row title, which reads as a
             link to the thing — and it is not; the thing is deleted. */
          aria-label={`What comes back with ${entry.title || 'Untitled'}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flex: 1, minWidth: 220,
            border: 0, background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: 'grid', placeItems: 'center', width: 32, height: 32, flex: '0 0 auto',
              borderRadius: '50%', backgroundImage: 'var(--glass-fill-1)',
              boxShadow: 'var(--glass-rim-1)', color: 'var(--fg-4)',
            }}
          >
            <Icon name={meta.icon} size={15} />
          </span>

          <span style={{ display: 'grid', gap: 2, flex: 1, minWidth: 0 }}>
            <span
              style={{
                font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-1)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {entry.title || 'Untitled'}
            </span>
            <span
              style={{
                font: 'var(--type-caption)', color: 'var(--fg-4)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {[meta.label, whereItWas(entry), `deleted ${formatDeletedAt(entry.deletedAt)}`, ...took].join(' · ')}
            </span>
          </span>
        </button>

        <Countdown entry={entry} now={now} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flex: '0 0 auto' }}>
          <Button
            size="sm"
            variant={soon ? 'frost' : 'ghost'}
            iconLeft={<Icon name="undo-2" size={14} />}
            onClick={onRestore}
          >
            Restore
          </Button>
          <MorphMenu
            align="end"
            width={288}
            /* The list container is `overflow: hidden` — that is what rounds
               its corners over the rows inside it — so an `absolute` panel is
               clipped to whatever is left of the card below this row, which on
               the last row is nothing at all. Same fix, same two props, as
               `ListColumn`, `ListTable` and session's `TaskRow`. */
            portal
            zIndex={Z.dropdown}
            header={{ title: entry.title || 'Untitled', meta: whereItWas(entry) }}
            trigger={
              <IconButton label={`Actions for ${entry.title || 'Untitled'}`} variant="ghost" size="sm">
                <Icon name="ellipsis" size={16} />
              </IconButton>
            }
            items={[
              { section: 'This item' },
              {
                value: 'what',
                label: open ? 'Hide what comes back' : 'What comes back',
                icon: <Icon name="info" size={16} />,
                onSelect: () => setOpen(!open),
              },
              { divider: true },
              { section: 'Careful', tone: 'danger' },
              {
                value: 'purge',
                label: 'Delete it now, for good',
                icon: <Icon name="trash-2" size={16} />,
                tone: 'danger',
                confirm: {
                  label: `Delete “${entry.title || 'Untitled'}” for good?`,
                  hint: `It skips its remaining ${plural(daysLeft(entry, now), 'day')}. Nothing brings it back after this.`,
                  action: 'Delete for good',
                  onConfirm: onPurge,
                },
              },
            ]}
          />
        </div>
      </div>

      {/* 0fr → 1fr, the design system's expander. Height is never measured. */}
      <div
        style={{
          display: 'grid', gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows var(--dur-morph) var(--ease-morph)',
        }}
      >
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <div
            style={{
              display: 'grid', gap: 'var(--sp-5)',
              padding: '0 var(--sp-6) var(--sp-6) calc(var(--sp-6) + 52px)',
            }}
          >
            <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
              <MetaKicker tone="var(--fg-3)">What comes back</MetaKicker>
              <span
                style={{
                  font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-1)',
                  maxWidth: '62ch', textWrap: 'pretty',
                }}
              >
                {preview?.comesBack}
              </span>
            </div>

            {preview !== null && preview.rerouted > 0 && (
              <div
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)',
                  padding: 'var(--sp-5) var(--sp-6)', borderRadius: 'var(--r-lg)',
                  backgroundImage: 'var(--glass-tint-amber)', boxShadow: 'var(--glass-rim-1)',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ display: 'flex', color: 'var(--status-review)', flex: '0 0 auto', marginTop: 2 }}
                >
                  <Icon name="triangle-alert" size={15} />
                </span>
                <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)', textWrap: 'pretty' }}>
                  {plural(preview.rerouted, 'task')} will land in {DEFAULT_LISTS[0].title} instead — the list{' '}
                  {preview.rerouted === 1 ? 'it was' : 'they were'} in no longer exists and cannot be rebuilt.
                </span>
              </div>
            )}

            <Well pad="var(--sp-4) var(--sp-6)" style={{ borderRadius: 'var(--r-sm)', display: 'grid', gap: 2 }}>
              <span
                style={{
                  font: 'var(--type-numeric)', fontSize: 'var(--text-xs)',
                  color: 'var(--fg-2)', lineHeight: 'var(--leading-relaxed)', wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {entry.id}
                {'\n'}deleted {stamp(entry.deletedAt)}
                {'\n'}goes for good {stamp(expiresAt(entry))}
              </span>
            </Well>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */

interface RestorePreview {
  comesBack: string;
  rerouted: number;
}

export default function TrashPage() {
  const wide = useMedia(WIDE);
  const nav = useNavModel();
  const entries = useTrashStore((s) => s.entries);
  const removeEntry = useTrashStore((s) => s.remove);

  const [query, setQuery] = useState('');
  const [kinds, setKinds] = useState<Array<TrashEntry['kind']>>([]);
  const [sort, setSort] = useState<SortId>('soon');
  const [toast, setToast] = useState<ToastPayload | null>(null);

  // One instant for every countdown on the screen. See the file header.
  const [now] = useState(() => Date.now());

  const bytes = useMemo(() => trashBytes(entries), [entries]);

  const soonCount = entries.filter((e) => daysLeft(e, now) <= SOON_DAYS).length;

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    const matched = entries.filter((entry) => {
      if (kinds.length > 0 && !kinds.includes(entry.kind)) return false;
      if (q === '') return true;
      return `${entry.title} ${whereItWas(entry)} ${KIND_META[entry.kind].label}`.toLowerCase().includes(q);
    });
    return matched.slice().sort((a, b) => (sort === 'soon' ? a.deletedAt - b.deletedAt : b.deletedAt - a.deletedAt));
  }, [entries, kinds, q, sort]);

  /*
   * The real restore, run as a question rather than as an instruction. Reads
   * the store at call time rather than subscribing to it: this is asked from
   * inside an open row's render and the answer is about what would happen if
   * you pressed the button next to it, not about keeping a live count.
   */
  const previewRestore = (entry: TrashEntry): RestorePreview => {
    const { projects, taskLists, backlogTasks } = useStore.getState();
    const result = planRestore({ projects, taskLists, backlogTasks }, entry, DEFAULT_LISTS[0]);

    const parts: string[] = [];
    if (entry.projects.length > 0) parts.push(plural(entry.projects.length, 'project'));
    if (entry.taskLists.length > 0) parts.push(plural(entry.taskLists.length, 'list'));
    if (entry.backlogTasks.length > 0) parts.push(plural(entry.backlogTasks.length, 'task'));

    const refs = entry.backrefs.dependsOn.length + entry.backrefs.sharedListIds.length;
    const refLine = refs > 0
      ? ` ${plural(refs, 'reference')} cut from tasks that survived ${refs === 1 ? 'is' : 'are'} sewn back on, where the other end still exists.`
      : '';

    const where = whereItWas(entry);
    const home = entry.kind === 'project' ? '' : ` into ${where}`;
    const comesBack = parts.length === 0
      ? 'Nothing — this entry is empty. Restoring it only clears the row.'
      : `${parts.join(', ')}, back${home} exactly as ${entry.backlogTasks.length === 1 && parts.length === 1 ? 'it was' : 'they were'}.${refLine}`;

    return { comesBack, rerouted: result.reroutedTaskIds.length };
  };

  const handleRestore = (entry: TrashEntry) => {
    const result = restoreFromTrash(entry.id);
    if (!result) return;
    const rerouted = result.reroutedTaskIds.length;
    setToast({
      icon: 'undo-2',
      title: `Restored “${entry.title || 'Untitled'}”`,
      detail: rerouted > 0
        ? `${plural(rerouted, 'task')} went to ${DEFAULT_LISTS[0].title} — the list they were in no longer exists.`
        : `${KIND_META[entry.kind].label} put back where it came from.`,
    });
  };

  /*
   * The single-row purge (Shreekant's call — the mockup draws it and the store
   * already had the action; the only way to destroy one thing early before
   * this was Empty Trash, which took the other nine restores with it).
   *
   * `useTrashStore.remove` and nothing else: there is deliberately no cleanup
   * to do. The share document and the Calendar reminder for anything in here
   * were cancelled at delete time — `lib/trash.ts` says so, and a public link
   * outliving its deletion by thirty days would be a leak, not a Trash.
   */
  const handlePurge = (entry: TrashEntry) => {
    removeEntry(entry.id);
    setToast({
      icon: 'trash-2',
      title: 'Gone for good',
      detail: `“${entry.title || 'Untitled'}” cannot be brought back.`,
      tone: 'neutral',
    });
  };

  const handleEmpty = () => {
    const count = entries.length;
    emptyTrash();
    setToast({
      icon: 'trash-2',
      title: 'Trash emptied',
      detail: `${plural(count, 'item')} removed for good.`,
      tone: 'neutral',
    });
  };

  const toggleKind = (kind: TrashEntry['kind']) =>
    setKinds((cur) => (cur.includes(kind) ? cur.filter((k) => k !== kind) : [...cur, kind]));

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

            <header style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 'var(--sp-3)', flex: 1, minWidth: 260 }}>
                <MetaKicker>Deleted, not gone</MetaKicker>
                <h1
                  style={{
                    font: 'var(--type-display)', fontSize: 'var(--text-2xl)',
                    letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)', margin: 0,
                  }}
                >
                  Trash
                </h1>
                <p
                  style={{
                    font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)',
                    margin: 0, maxWidth: '62ch', textWrap: 'pretty',
                  }}
                >
                  Atlas can delete things now, so deleting has to be survivable. Everything waits here for{' '}
                  {RETENTION_DAYS} days, with what it took with it, and goes back exactly as it was.
                </p>
              </div>
              {entries.length > 0 && (
                <SegmentedControl size="sm" options={SORTS} value={sort} onChange={(v) => setSort(v as SortId)} />
              )}
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))', gap: 'var(--sp-4)' }}>
              <Metric value={String(entries.length)} label="in the trash" />
              <Metric
                value={String(soonCount)}
                label="going within a week"
                tone={soonCount > 0 ? 'var(--status-review)' : undefined}
              />
              {/* The tile that would have counted Atlas's own deletions. See
                  the file header for why it counts bytes instead. */}
              <Metric value={formatBytes(bytes).split(' ')[0]} unit={formatBytes(bytes).split(' ')[1]} label="kept aside" />
              <Metric value={String(RETENTION_DAYS)} unit="days" label="before anything goes" />
            </div>

            {entries.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 240px', minWidth: 200, maxWidth: 320 }}>
                  <Input
                    size="sm"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search the trash"
                    aria-label="Search the trash"
                    iconLeft={<Icon name="search" size={16} />}
                  />
                </div>
                {/* Built from what is actually in there, so the three kinds
                    `cascadeDelete` can produce are the three that can appear —
                    and the mockup's notes, contacts and skills turn up on
                    their own when items 10, 21 and 12 put one here. */}
                {KIND_ORDER.map((kind) => {
                  const count = entries.filter((e) => e.kind === kind).length;
                  if (count === 0) return null;
                  const on = kinds.includes(kind);
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => toggleKind(kind)}
                      aria-pressed={on}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)', height: 38, flex: '0 0 auto',
                        padding: '0 var(--sp-5)', border: 0, cursor: 'pointer', borderRadius: 'var(--r-pill)',
                        backgroundImage: on ? 'var(--glass-fill-solid)' : 'var(--glass-fill-1)',
                        boxShadow: on ? 'var(--glass-rim-3), var(--glass-cast-1)' : 'var(--glass-rim-1)',
                        /* WHITE on a pressed chip, not the mockup's
                           `--fg-on-light`. `trash.html` pairs `--fg-on-light`
                           (oklch 0.13 — near black) with `--glass-fill-solid`,
                           which is NOT solid: it is 14–30% white, so over this
                           page it lands mid-grey and near-black text on it is
                           barely legible. `--fg-on-light` belongs with
                           `--glass-frost`, which really is a light surface —
                           that is the pairing `Button`'s frost variant uses.
                           `SegmentedControl` is the app's own answer for "this
                           pill is selected", it uses the same
                           `--glass-fill-solid` + `--glass-rim-3, --glass-cast-1`
                           this chip does, and its selected label is white. It
                           is four inches up this same screen; the two must not
                           disagree. */
                        color: on ? 'oklch(1 0 0)' : 'var(--fg-2)',
                        font: 'var(--type-label)', transition: 'var(--t-hover)',
                      }}
                    >
                      {KIND_META[kind].plural}
                      <span
                        style={{
                          font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
                          opacity: on ? 0.6 : 1, color: on ? 'inherit' : 'var(--fg-4)',
                        }}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
                {(kinds.length > 0 || q !== '') && (
                  <Button
                    size="sm"
                    variant="ghost"
                    iconLeft={<Icon name="x" size={14} />}
                    onClick={() => { setKinds([]); setQuery(''); }}
                  >
                    Clear
                  </Button>
                )}
              </div>
            )}

            <div
              style={{
                borderRadius: 'var(--r-card)',
                backgroundImage: 'var(--glass-fill-2)',
                backdropFilter: 'var(--glass-bd-md)', WebkitBackdropFilter: 'var(--glass-bd-md)',
                boxShadow: 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-2)',
                overflow: 'hidden',
                animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
              }}
            >
              {entries.length === 0 ? (
                <div
                  style={{
                    display: 'grid', justifyItems: 'center', gap: 'var(--sp-4)',
                    padding: 'var(--sp-12) var(--sp-7)', textAlign: 'center',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'grid', placeItems: 'center', width: 48, height: 48, borderRadius: '50%',
                      backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)', color: 'var(--fg-4)',
                    }}
                  >
                    <Icon name="trash-2" size={22} />
                  </span>
                  <span style={{ font: 'var(--type-label)', color: 'var(--fg-2)' }}>Nothing in the trash.</span>
                  <span
                    style={{
                      font: 'var(--type-caption)', color: 'var(--fg-4)',
                      maxWidth: '40ch', textWrap: 'pretty',
                    }}
                  >
                    Anything you or Atlas deletes lands here first, with a Restore button next to it, until its{' '}
                    {RETENTION_DAYS} days are up.
                  </span>
                </div>
              ) : visible.length === 0 ? (
                <div
                  style={{
                    display: 'grid', justifyItems: 'center', gap: 'var(--sp-4)',
                    padding: 'var(--sp-11) var(--sp-7)', textAlign: 'center',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'grid', placeItems: 'center', width: 44, height: 44, borderRadius: '50%',
                      backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)', color: 'var(--fg-4)',
                    }}
                  >
                    <Icon name="search-x" size={20} />
                  </span>
                  <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', maxWidth: '32ch', textWrap: 'pretty' }}>
                    Nothing in the trash matches that.
                  </span>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {visible.map((entry, i) => (
                    <TrashRow
                      key={entry.id}
                      entry={entry}
                      now={now}
                      first={i === 0}
                      onRestore={() => handleRestore(entry)}
                      onPurge={() => handlePurge(entry)}
                      onPreview={previewRestore}
                    />
                  ))}
                </AnimatePresence>
              )}
            </div>

            {/*
              * The five facts, each one something that has surprised somebody.
              * Four are `TrashSection`'s, which had earned their place; the
              * fifth is the one the mockup's own footnote is reaching for —
              * what happens to the things that had left this device.
              */}
            <div
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-5)', flexWrap: 'wrap',
                padding: 'var(--sp-6) var(--sp-6)', borderRadius: 'var(--r-lg)',
                backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
              }}
            >
              <div style={{ display: 'grid', gap: 'var(--sp-3)', flex: 1, minWidth: 260 }}>
                {([
                  ['corner-down-left', 'Restoring rebuilds the project or list around an item.'],
                  ['calendar-x', 'It does not return to today’s queue — pick it again there.'],
                  ['link-2', 'Its share link and calendar reminder are rebuilt on the way back.'],
                  ['git-branch', 'Subtasks are not covered. Deleting one of those is immediate.'],
                  ['database', 'The trash is kept apart from the 1 MB record on Settings → Storage.'],
                ] as Array<[IconName, string]>).map(([icon, line]) => (
                  <div key={line} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
                    <span aria-hidden="true" style={{ display: 'flex', color: 'var(--fg-4)', flex: '0 0 auto' }}>
                      <Icon name={icon} size={14} />
                    </span>
                    <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>{line}</span>
                  </div>
                ))}
              </div>

              {entries.length > 0 && (
                <MorphMenu
                  align="end"
                  width={288}
                  header={{ title: 'Empty the trash', meta: plural(entries.length, 'item') }}
                  trigger={
                    <Button size="sm" variant="ghost" iconLeft={<Icon name="trash-2" size={14} />}>
                      Empty the trash
                    </Button>
                  }
                  items={[
                    { section: 'Careful', tone: 'danger' },
                    {
                      value: 'empty',
                      label: 'Empty it now',
                      icon: <Icon name="trash-2" size={16} />,
                      tone: 'danger',
                      confirm: {
                        label: `Remove all ${plural(entries.length, 'item')}?`,
                        hint: 'They skip their remaining days. Nothing brings any of it back.',
                        action: 'Empty it',
                        onConfirm: handleEmpty,
                      },
                    },
                  ]}
                />
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
              tone={toast.tone}
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
