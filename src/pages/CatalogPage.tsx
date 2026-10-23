/**
 * The catalog — what Atlas remembers (item 10, `design-system/screens/catalog.html`).
 *
 * WHAT THIS SCREEN IS ACTUALLY LOOKING AT
 * ----------------------------------------
 * A folder of plain Markdown files on Shreekant's laptop, served by Atlas over
 * Tailscale. Not this app's store, not Firestore, not localStorage — nothing
 * on this screen is in the browser except while it is on it. `DESIGN.md` §4.4
 * is the whole design: one note per person, per project, per preference;
 * **nothing loads into a conversation automatically**; the file *names* tell
 * Atlas what exists and it opens only what the question needs.
 *
 * **The header explains that, and it is not decoration.** The single most
 * likely misreading of this screen is that it is a notes app — so the sentence
 * under the title says what the files are for and that they are editable in
 * Notepad, because the thing that makes this memory rather than a database is
 * that he can open one and correct it.
 *
 * THREE THINGS THE MOCKUP DRAWS THAT ARE HONEST HERE AND WERE INVENTED THERE
 * ---------------------------------------------------------------------------
 * `catalog.html` seeds eleven notes with `opens: 31`, `edited: 'you · 19 Aug'`
 * and a `stale` flag each. All three are real numbers now and they come from
 * Atlas rather than from this file:
 *
 * - **`opens` counts what ATLAS opened, never what this screen showed.** The
 *   HTTP route reads a note without counting it, and only the model's
 *   `read_note` increments. That is what makes "Most used" and "Stalest" worth
 *   sorting on: they say which notes are earning their place in the answers,
 *   not which ones Shreekant has been browsing.
 * - **`author` has a third value the mockup has no idea about: `outside`.**
 *   §4.4 invites him to fix a note in Notepad, so Atlas compares the file's
 *   modified time against when it last wrote it. A note he corrected by hand
 *   says so rather than crediting Atlas with his correction.
 * - **The budget is bullet lines across every note**, against §4.4's *"roughly
 *   forty active memories"*. Counting files instead would make the number mean
 *   nothing — one file can hold thirty facts.
 *
 * WHAT HAPPENS WHEN THE LAPTOP IS SHUT, WHICH IS MOST OF THE TIME
 * ---------------------------------------------------------------
 * There is no cached copy and there deliberately is not one. A catalog this
 * app remembered would be a second copy of his memory that could disagree with
 * the real one, on a screen whose entire promise is that the file is the
 * truth. So a closed laptop is an empty state that says which laptop and why,
 * in `/atlas-host`'s dialect — the same three states that screen tells apart,
 * because they have the same three fixes.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import {
  BlurAcross, Button, Icon, IconButton, Input, MetaKicker, MiniNav, MorphMenu, SegmentedControl, SoftButton, StatusPill,
  Toast, useArrival, useMedia, WhiteButton, WIDE, type IconName,
} from '../ui';
import { RailMark } from '../components/BrandMark';
import { MemoryWaiting } from '../components/MemoryWaiting';
import { useNavModel } from '../components/navModel';
import { useAtlasStore } from '../lib/atlas/atlasStore';
import { loadCatalog, loadNote, removeNote, storeNote, useMemorySource } from '../lib/atlas/memorySource';
import {
  AtlasMemoryUnavailable,
  type CatalogIndex,
  type CatalogNote,
  type CatalogNoteHeader,
} from '../lib/atlas/client';
import { devCatalogFixture } from '../lib/devCatalogFixture';
import { Z } from '../lib/zLayers';

/** The mockup's column, and `/trash`'s. */
const COLUMN_PX = 1120;

/** Where the index docks beside the note instead of sliding over it. The mockup's number. */
const DOCKED = '(min-width: 1080px)';

const SORTS = [
  { value: 'used', label: 'Most used' },
  { value: 'name', label: 'Name' },
  { value: 'stale', label: 'Stalest' },
];

type SortId = 'used' | 'name' | 'stale';

/**
 * A glyph per folder, for the group headings in the index.
 *
 * The four §4.4 names plus `notes`, which is where compaction writes what it
 * was about to summarise away. **Unknown folders get `folder`** rather than
 * being dropped: he can make one in Explorer, and the mockup's hardcoded list
 * would have rendered a note in it nowhere at all.
 */
const FOLDER_ICONS: Record<string, IconName> = {
  people: 'users',
  projects: 'folder',
  preferences: 'settings',
  'how-to': 'wrench',
  notes: 'scroll-text',
};

interface ToastPayload {
  icon: IconName;
  title: string;
  detail?: string;
}

/** `2026-09-04T…` → `4 Sep`. The mockup's density, in this app's format. */
function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function describeAuthor(note: CatalogNoteHeader): string {
  const when = shortDate(note.updatedAt);
  if (note.author === 'outside') return `edited by hand · ${when}`;
  return `edited ${note.author === 'you' ? 'here' : 'by Atlas'} · ${when}`;
}

function describeLastOpened(note: CatalogNoteHeader): string {
  if (note.lastOpenedAt === null) return 'never opened';
  return `opened ${note.opens}× · last ${shortDate(note.lastOpenedAt)}`;
}

export default function CatalogPage() {
  const nav = useNavModel();
  const wide = useMedia(WIDE);
  const docked = useMedia(DOCKED);

  const status = useAtlasStore((s) => s.status);
  const probe = useAtlasStore((s) => s.probe);
  /* BIG-4: the laptop when it is awake, the cloud copy when it is asleep. */
  const source = useMemorySource();
  /* With the cloud copy on, the files on the laptop are a backup and this
     screen is where a note is edited (his call, 2026-09-29). */
  const cloudOn = useAtlasStore((s) => s.health?.memory?.cloud?.on === true) || source?.kind === 'cloud';

  const [index, setIndex] = useState<CatalogIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<{ message: string; tooOld: boolean } | null>(null);

  const [currentPath, setCurrentPath] = useState<string | null>(null);
  /**
   * The last note fetched, **with the path it was fetched for**.
   *
   * Keyed rather than cleared, so nothing has to reach into an effect to blank
   * it: `note` below simply does not recognise a body belonging to a file that
   * is no longer selected. That is also what stops the previous note being
   * shown for a frame while the next one is in flight.
   */
  const [fetched, setFetched] = useState<CatalogNote | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortId>('used');
  const [staleOnly, setStaleOnly] = useState(false);
  const [listOpen, setListOpen] = useState(false);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastPayload | null>(null);

  const fixture = useMemo(() => devCatalogFixture(), []);
  /* 29-1P15b, idea 94: "Remembered" under a reply opens the note it saved,
     as `/catalog?note=people/rahul.md`. Read when the list lands; a note
     that is not in it falls back to the first, as before. */
  const [params] = useSearchParams();
  const asked = params.get('note');

  /* 29-1P14d2, idea 116: while the probe or the read is on its way, the
     screen waits in the shape of what is coming, and the notes fade in over
     it. A failure, a shut lid with no cloud copy and no Atlas at all still
     say so in words (`Unavailable`). */
  const waiting =
    problem === null && status !== 'unconfigured' && (status === 'unknown' || (source !== null && loading));
  const arrived = useRef<HTMLDivElement>(null);
  useArrival(arrived, index !== null);

  useEffect(() => {
    void probe();
  }, [probe]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(timer);
  }, [toast]);

  /* Leaving a note mid-edit must not carry the draft to the next one. Done
     where the selection changes rather than in an effect on it: an effect
     would be a second render for something the click already knows. */
  const selectNote = useCallback((path: string | null) => {
    setCurrentPath(path);
    setEditing(false);
  }, []);

  const load = useCallback(async () => {
    if (fixture !== null) {
      setIndex(fixture.index);
      setCurrentPath(
        (cur) => cur ?? (fixture.index.notes.some((n) => n.path === asked) ? asked : null) ?? fixture.index.notes[0]?.path ?? null,
      );
      setLoading(false);
      return;
    }
    if (source === null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await loadCatalog(source);
      setIndex(next);
      setProblem(null);
      // Pick the first note only when nothing is chosen, so a reload after a
      // save does not throw him back to the top of the list.
      setCurrentPath((cur) =>
        cur !== null && next.notes.some((n) => n.path === cur)
          ? cur
          : next.notes.some((n) => n.path === asked)
            ? asked
            : next.notes[0]?.path ?? null,
      );
    } catch (err) {
      setIndex(null);
      setProblem(
        err instanceof AtlasMemoryUnavailable
          ? { message: err.message, tooOld: err.tooOld }
          : { message: err instanceof Error ? err.message : String(err), tooOld: false },
      );
    } finally {
      setLoading(false);
    }
  }, [source, fixture, asked]);

  /*
   * `load` sets state before its first await, so it is deferred out of the
   * effect body rather than called from it. React's own guidance and the rule
   * that enforces it: an effect synchronises with something outside React, and
   * a setState inside one is a second render for something the first already
   * knew. The microtask costs nothing and the screen's first paint is the
   * loading state either way.
   */
  useEffect(() => {
    let live = true;
    void Promise.resolve().then(() => {
      if (live) void load();
    });
    return () => {
      live = false;
    };
  }, [load]);

  /* The note's body, fetched only for the one being looked at — the same rule
     the model follows, for the same reason. */
  useEffect(() => {
    if (currentPath === null || fixture !== null || source === null) return;

    const controller = new AbortController();
    void (async () => {
      try {
        setFetched(await loadNote(source, currentPath, controller.signal));
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setFetched(null);
      }
    })();
    return () => controller.abort();
  }, [source, currentPath, fixture]);

  const note: CatalogNote | null =
    currentPath === null
      ? null
      : fixture !== null
        ? (fixture.bodies[currentPath] ?? null)
        : fetched !== null && fetched.path === currentPath
          ? fetched
          : null;

  const notes = useMemo(() => index?.notes ?? [], [index]);
  const memories = index?.memories ?? 0;
  const budget = index?.budget ?? 40;
  const staleCount = notes.filter((n) => n.stale).length;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    /* Name, folder and trigger — not the body, which is not loaded. That is
       not a shortcut: the index is exactly what Atlas itself searches by name
       before it opens anything, so this screen filters on the same thing. */
    const matched = notes.filter(
      (n) =>
        (!staleOnly || n.stale) &&
        (needle === '' || `${n.path} ${n.trigger}`.toLowerCase().includes(needle)),
    );
    const sorted = [...matched];
    if (sort === 'name') sorted.sort((a, b) => a.path.localeCompare(b.path));
    else if (sort === 'stale') sorted.sort((a, b) => a.opens - b.opens);
    else sorted.sort((a, b) => b.opens - a.opens);
    return sorted;
  }, [notes, query, sort, staleOnly]);

  const folders = useMemo(() => {
    const seen: string[] = [];
    for (const n of visible) if (!seen.includes(n.folder)) seen.push(n.folder);
    return seen;
  }, [visible]);

  const readOnly = fixture !== null;

  async function commitSave() {
    if (note === null || source === null || readOnly) return;
    setSaving(true);
    try {
      const saved = await storeNote(source, { path: note.path, body: draft });
      setFetched(saved);
      setEditing(false);
      setToast({
        icon: 'check',
        title: 'Saved',
        detail:
          source.kind === 'cloud'
            ? `${saved.path} — in the cloud copy. Atlas takes it when the laptop wakes.`
            : `${saved.path} — plain text, on the laptop.`,
      });
      await load();
    } catch (err) {
      setToast({
        icon: 'circle-alert',
        title: 'Could not save',
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  }

  async function commitDelete() {
    if (note === null || source === null || readOnly) return;
    const gone = note;
    try {
      await removeNote(source, gone.path);
      selectNote(null);
      setFetched(null);
      setToast({
        icon: 'trash-2',
        title: `Deleted ${gone.name}`,
        detail: `${gone.memories} ${gone.memories === 1 ? 'memory' : 'memories'} went with it. Notes have no Trash.`,
      });
      await load();
    } catch (err) {
      setToast({
        icon: 'circle-alert',
        title: 'Could not delete',
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const showList = docked || listOpen;

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
            <MiniNav orientation="vertical" items={nav.items} value={nav.current} onChange={nav.go} screenLit lead={<RailMark />} />
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
            <header style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--sp-7)', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 'var(--sp-3)', flex: 1, minWidth: 260 }}>
                <MetaKicker>What Atlas remembers</MetaKicker>
                <h1
                  /* 29-1P5c, idea 57: shrinks and fades as the page scrolls. */
                  className="ag-tuck-title"
                  style={{
                    font: 'var(--type-display)', fontSize: 'var(--text-2xl)',
                    letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)', margin: 0,
                  }}
                >
                  The catalog
                </h1>
                <p
                  style={{
                    font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)',
                    margin: 0, maxWidth: '62ch', textWrap: 'pretty',
                  }}
                >
                  {cloudOn
                    ? 'Plain text, kept in the cloud and backed up on your laptop. Nothing loads on its own — the file names tell Atlas what exists, and it opens only what the question needs. Edit any of them here, even with the laptop shut.'
                    : 'Plain text files on your laptop. Nothing loads on its own — the file names tell Atlas what exists, and it opens only what the question needs. Edit any of them in Notepad.'}
                </p>
                {index !== null && index.root !== '' && (
                  <MetaKicker tone="var(--fg-4)">{index.root}</MetaKicker>
                )}
              </div>

              {index !== null && (
                <Budget
                  used={memories}
                  budget={budget}
                  stale={staleCount}
                  onShowStale={() => {
                    setStaleOnly((cur) => !cur);
                    setSort('stale');
                    if (!docked) setListOpen(true);
                  }}
                />
              )}
            </header>

            {index === null && waiting ? (
              <MemoryWaiting docked={docked} label="Reading the catalog" />
            ) : index === null ? (
              <Unavailable
                loading={loading}
                status={status}
                fromCloud={source?.kind === 'cloud'}
                problem={problem}
                onRetry={() => {
                  void probe();
                  void load();
                }}
              />
            ) : notes.length === 0 ? (
              <EmptyCatalog />
            ) : (
              <div
                ref={arrived}
                style={{
                  display: 'grid',
                  gridTemplateColumns: docked ? '300px minmax(0,1fr)' : 'minmax(0,1fr)',
                  gap: 'var(--sp-7)',
                  alignItems: 'start',
                }}
              >
                {showList && (
                  <NoteIndex
                    docked={docked}
                    count={notes.length}
                    folders={folders}
                    visible={visible}
                    current={currentPath}
                    query={query}
                    setQuery={setQuery}
                    sort={sort}
                    setSort={setSort}
                    staleOnly={staleOnly}
                    clearStale={() => setStaleOnly(false)}
                    onClose={() => setListOpen(false)}
                    onPick={(path) => {
                      selectNote(path);
                      if (!docked) setListOpen(false);
                    }}
                  />
                )}

                <NotePane
                  note={note}
                  docked={docked}
                  editing={editing}
                  draft={draft}
                  saving={saving}
                  readOnly={readOnly}
                  setDraft={setDraft}
                  onOpenList={() => setListOpen(true)}
                  onStartEdit={() => {
                    if (note === null) return;
                    setDraft(note.body);
                    setEditing(true);
                  }}
                  onCancel={() => setEditing(false)}
                  onSave={() => void commitSave()}
                  onDelete={() => void commitDelete()}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {showList && !docked && (
        <button
          type="button"
          aria-label="Close the file list"
          onClick={() => setListOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: Z.nav - 1, border: 0, cursor: 'default',
            background: 'oklch(0.05 0 0 / 0.5)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
          }}
        />
      )}

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            style={{
              position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--sp-13) + var(--safe-b))',
              display: 'grid', placeItems: 'center', zIndex: Z.toast, pointerEvents: 'none',
            }}
          >
            <span style={{ pointerEvents: 'auto' }}>
              <Toast
                icon={<Icon name={toast.icon} size={16} />}
                title={toast.title}
                detail={toast.detail}
                onDismiss={() => setToast(null)}
              />
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {!wide && (
        <div
          style={{
            position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--sp-5) + var(--safe-b))',
            display: 'grid', placeItems: 'center', zIndex: Z.nav, pointerEvents: 'none',
          }}
        >
          <span style={{ pointerEvents: 'auto' }}>
            <MiniNav items={nav.items} value={nav.current} onChange={nav.go} screenLit />
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The memory budget (§4.4's forty).
 *
 * **A reading, not a warning.** The mockup's own comment says so and it is the
 * right call: forty is where the context cost starts eating the answer on a
 * small model, and the honest thing is to show the number and name what could
 * go. Nothing here blocks a write, and Atlas does not enforce it either.
 */
function Budget({
  used,
  budget,
  stale,
  onShowStale,
}: {
  used: number;
  budget: number;
  stale: number;
  onShowStale: () => void;
}) {
  const pct = Math.min(100, budget === 0 ? 0 : (used / budget) * 100);
  const tight = used >= budget - 4;

  return (
    <div
      style={{
        display: 'grid', gap: 'var(--sp-5)', padding: 'var(--sp-6) var(--sp-7)',
        borderRadius: 'var(--r-card)', minWidth: 260,
        backgroundImage: 'var(--glass-fill-2)', boxShadow: 'var(--glass-rim-2), var(--glass-cast-1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--sp-4)' }}>
        <span style={{ display: 'grid', gap: 'var(--sp-2)', flex: 1, minWidth: 0 }}>
          <MetaKicker>Active memories</MetaKicker>
          <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-2)' }}>
            <span
              style={{
                font: 'var(--type-metric)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-3xl)',
                letterSpacing: 'var(--tracking-display)',
                color: tight ? 'var(--status-warn)' : 'var(--fg-1)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {used}
            </span>
            {/* Tight is a warning: grey with its icon (29-1P2c2). */}
            {tight && <Icon name="triangle-alert" size={16} style={{ color: 'var(--status-warn)', alignSelf: 'center' }} />}
            <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>
              / {budget}
            </span>
          </span>
        </span>
        {stale > 0 && (
          <Button size="sm" variant="ghost" iconLeft={<Icon name="wind" size={14} />} onClick={onShowStale}>
            {stale} stale
          </Button>
        )}
      </div>

      <div
        style={{
          position: 'relative', height: 8, borderRadius: 'var(--r-pill)',
          backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)', overflow: 'hidden',
        }}
      >
        <span
          style={{
            position: 'absolute', inset: '0 auto 0 0', width: `${pct}%`, borderRadius: 'var(--r-pill)',
            /* A meter, lime like every meter; grey once it is tight (29-1P2c2:
               emerald is only for running now, and a warning is quiet). */
            background: tight
              ? 'linear-gradient(90deg, oklch(0.82 0.006 260 / 0.4), var(--status-warn))'
              : 'linear-gradient(90deg, oklch(0.84 0.17 130 / 0.5), var(--job-lime))',
            boxShadow: tight ? 'none' : 'var(--job-lime-shine)',
            transition: 'width var(--dur-base) var(--ease-glass)',
          }}
        />
      </div>

      <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
        {tight
          ? 'Near the ceiling. Five hundred stale facts crowd out the actual question.'
          : 'Room to write. Notes are loaded by name, never all at once.'}
      </span>
    </div>
  );
}

function NoteIndex({
  docked,
  count,
  folders,
  visible,
  current,
  query,
  setQuery,
  sort,
  setSort,
  staleOnly,
  clearStale,
  onClose,
  onPick,
}: {
  docked: boolean;
  count: number;
  folders: string[];
  visible: CatalogNoteHeader[];
  current: string | null;
  query: string;
  setQuery: (value: string) => void;
  sort: SortId;
  setSort: (value: SortId) => void;
  staleOnly: boolean;
  clearStale: () => void;
  onClose: () => void;
  onPick: (path: string) => void;
}) {
  const drawer: React.CSSProperties = docked
    ? { display: 'grid', gridTemplateRows: 'auto auto auto minmax(0,1fr)', gap: 'var(--sp-5)', minHeight: 0 }
    : {
        position: 'fixed', top: 'calc(var(--sp-7) + var(--safe-t))', left: 'calc(var(--sp-7) + var(--safe-l))', bottom: 'calc(var(--sp-7) + var(--safe-b))', width: 328,
        zIndex: Z.nav, display: 'grid', gridTemplateRows: 'auto auto auto minmax(0,1fr)', gap: 'var(--sp-5)',
        minHeight: 0, padding: 'var(--sp-7)', boxSizing: 'border-box', borderRadius: 'var(--r-sheet)',
        backgroundColor: 'oklch(0.145 0.004 260 / 0.96)', backgroundImage: 'var(--glass-fill-1)',
        border: '1px solid oklch(1 0 0 / 0.10)',
        backdropFilter: 'var(--glass-bd-xl)', WebkitBackdropFilter: 'var(--glass-bd-xl)',
        boxShadow: 'var(--glass-cast-3), var(--glass-inner-1)',
      };

  return (
    <div style={drawer}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
        <MetaKicker tone="var(--fg-3)">{count} files</MetaKicker>
        <span style={{ flex: 1 }} />
        {!docked && (
          <IconButton label="Close the file list" variant="ghost" onClick={onClose}>
            <Icon name="x" size={18} />
          </IconButton>
        )}
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search names and triggers"
        aria-label="Search the catalog"
        iconLeft={<Icon name="search" size={16} />}
      />

      {/* The soft pressed-in switch since 29-1P2, as every view switch. */}
      <SegmentedControl
        size="sm"
        look="soft"
        options={SORTS}
        value={sort}
        onChange={(value) => setSort(value as SortId)}
        style={{ width: '100%' }}
      />

      <div
        className="ag-scroll ag-fade"
        style={{
          overflowY: 'auto', overscrollBehavior: 'contain',
          display: 'grid', gap: 'var(--sp-6)', alignContent: 'start',
          /* Docked, the index is a column beside the note rather than a sheet,
             so it needs a height to scroll inside. The mockup's grid gives it
             one from the page; this app's page scrolls as a whole. */
          maxHeight: docked ? '58vh' : undefined,
        }}
      >
        {/* 29-1P5c, idea 60: a new order blurs across. */}
        <BlurAcross value={sort} index={SORTS.findIndex((one) => one.value === sort)} style={{ display: 'grid', gap: 'var(--sp-6)', alignContent: 'start' }}>
        {folders.map((folder) => {
          const inFolder = visible.filter((n) => n.folder === folder);
          if (inFolder.length === 0) return null;
          return (
            <div key={folder} style={{ display: 'grid', gap: 'var(--sp-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', padding: '0 var(--sp-5)' }}>
                <span style={{ display: 'flex', color: 'var(--fg-4)' }}>
                  <Icon name={FOLDER_ICONS[folder] ?? 'folder'} size={13} />
                </span>
                <MetaKicker>{folder}/</MetaKicker>
                <span style={{ flex: 1 }} />
                <MetaKicker>{inFolder.reduce((total, n) => total + n.memories, 0)}</MetaKicker>
              </div>
              {inFolder.map((n) => (
                <FileRow key={n.path} note={n} on={n.path === current} onPick={() => onPick(n.path)} />
              ))}
            </div>
          );
        })}

        {visible.length === 0 && (
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', padding: 'var(--sp-5)' }}>
            No file matches that.
          </span>
        )}
        </BlurAcross>
      </div>

      {staleOnly && (
        <Button size="sm" variant="ghost" iconLeft={<Icon name="x" size={14} />} onClick={clearStale}>
          Showing stale only
        </Button>
      )}
    </div>
  );
}

function FileRow({ note, on, onPick }: { note: CatalogNoteHeader; on: boolean; onPick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onPick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr) auto', alignItems: 'center',
        gap: 'var(--sp-4)', width: '100%', minHeight: 52, padding: '0 var(--sp-5)',
        border: 0, cursor: 'pointer', textAlign: 'left', borderRadius: 'var(--r-pill)',
        backgroundImage: on ? 'var(--glass-fill-2)' : hover ? 'var(--glass-fill-1)' : 'none',
        boxShadow: on ? 'var(--glass-rim-2), var(--glass-cast-1)' : 'none',
        transition: 'var(--t-hover)',
      }}
    >
      <span
        style={{
          display: 'flex', flex: '0 0 auto',
          color: note.stale ? 'var(--fg-4)' : on ? 'var(--job-lime)' : 'var(--fg-3)',
        }}
      >
        <Icon name="file-text" size={15} />
      </span>
      <span style={{ display: 'grid', gap: 1, minWidth: 0 }}>
        <span
          style={{
            font: 'var(--type-numeric)', fontSize: 'var(--text-sm)', color: on ? 'var(--fg-1)' : 'var(--fg-2)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {note.name}
        </span>
        <span
          style={{
            font: 'var(--type-caption)', color: 'var(--fg-4)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {note.memories} {note.memories === 1 ? 'memory' : 'memories'} · opened {note.opens}×
        </span>
      </span>
      {note.stale && <MetaKicker>stale</MetaKicker>}
    </button>
  );
}

function NotePane({
  note,
  docked,
  editing,
  draft,
  saving,
  readOnly,
  setDraft,
  onOpenList,
  onStartEdit,
  onCancel,
  onSave,
  onDelete,
}: {
  note: CatalogNote | null;
  docked: boolean;
  editing: boolean;
  draft: string;
  saving: boolean;
  readOnly: boolean;
  setDraft: (value: string) => void;
  onOpenList: () => void;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => void;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) textarea.current?.focus();
  }, [editing]);

  if (note === null) {
    return (
      <section
        style={{
          display: 'grid', placeItems: 'center', gap: 'var(--sp-5)', minHeight: 280,
          borderRadius: 'var(--r-card-lg)', backgroundImage: 'var(--glass-fill-1)',
          boxShadow: 'var(--glass-rim-1)', padding: 'var(--pad-card)',
        }}
      >
        <span
          style={{
            display: 'grid', placeItems: 'center', width: 48, height: 48, borderRadius: '50%',
            backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)', color: 'var(--fg-4)',
          }}
        >
          <Icon name="book-open" size={22} />
        </span>
        <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>
          Pick a file to read it.
        </span>
      </section>
    );
  }

  return (
    <section
      style={{
        display: 'grid', gridTemplateRows: 'auto auto minmax(0,1fr)', minHeight: 0,
        borderRadius: 'var(--r-card-lg)', backgroundImage: 'var(--glass-fill-2)',
        backdropFilter: 'var(--glass-bd-md)', WebkitBackdropFilter: 'var(--glass-bd-md)',
        boxShadow: 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-2)',
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-5)', flexWrap: 'wrap',
          padding: 'var(--pad-card) var(--pad-card) var(--sp-6)',
        }}
      >
        {!docked && (
          <IconButton label="All files" variant="ghost" onClick={onOpenList}>
            <Icon name="panel-left" size={18} />
          </IconButton>
        )}

        <span
          style={{
            display: 'grid', placeItems: 'center', width: 38, height: 38, flex: '0 0 auto',
            borderRadius: '50%', backgroundImage: 'var(--glass-fill-2)', boxShadow: 'var(--glass-rim-2)',
            color: note.stale ? 'var(--fg-4)' : 'var(--fg-3)',
          }}
        >
          <Icon name="file-text" size={18} />
        </span>

        <div style={{ display: 'grid', gap: 'var(--sp-3)', flex: 1, minWidth: 200 }}>
          <h2
            style={{
              font: 'var(--type-numeric)', fontSize: 'var(--text-lg)', color: 'var(--fg-1)',
              margin: 0, wordBreak: 'break-all',
            }}
          >
            {note.path}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
            <StatusPill status={note.stale ? 'archived' : 'done'} size="sm" dot={false}>
              {note.memories} {note.memories === 1 ? 'memory' : 'memories'}
            </StatusPill>
            <MetaKicker>{note.bytes} bytes</MetaKicker>
            <MetaKicker>{describeAuthor(note)}</MetaKicker>
            <MetaKicker>{describeLastOpened(note)}</MetaKicker>
          </div>
        </div>

        {!readOnly && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flex: '0 0 auto' }}>
            {editing ? (
              <>
                <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
                  Cancel
                </Button>
                {/* A form's Save is solid white since 29-1P2; Edit is soft. */}
                <WhiteButton
                  size="sm"
                  icon={<Icon name="check" size={14} />}
                  onClick={onSave}
                  disabled={saving}
                  aria-busy={saving || undefined}
                >
                  {saving ? 'Saving…' : 'Save'}
                </WhiteButton>
              </>
            ) : (
              <SoftButton size="sm" icon={<Icon name="pencil" size={14} />} onClick={onStartEdit}>
                Edit
              </SoftButton>
            )}

            {/* The destructive action confirms inside the object that offered
                it — the row collapses and a confirm strip grows in its slot.
                No second dialog; `MorphMenu`'s own law. */}
            <MorphMenu
              align="end"
              width={272}
              header={{ title: note.name, meta: `${note.memories} memories · ${note.bytes} bytes` }}
              trigger={
                <IconButton label="Note actions" variant="ghost">
                  <Icon name="ellipsis" size={18} />
                </IconButton>
              }
              items={[
                { section: 'This file' },
                {
                  value: 'path',
                  label: 'Copy its path',
                  icon: <Icon name="link" size={16} />,
                  flash: 'Copied',
                  flashIcon: <Icon name="check" size={16} />,
                  onSelect: () => {
                    void navigator.clipboard?.writeText(note.path).catch(() => {});
                  },
                },
                { divider: true },
                { section: 'Careful', tone: 'danger' },
                {
                  value: 'delete',
                  label: 'Delete this note',
                  icon: <Icon name="trash-2" size={16} />,
                  tone: 'danger',
                  confirm: {
                    label: `Delete ${note.name}?`,
                    hint: `${note.memories} ${note.memories === 1 ? 'memory goes' : 'memories go'} with it, and notes have no Trash.`,
                    action: 'Delete',
                    onConfirm: onDelete,
                  },
                },
              ]}
            />
          </div>
        )}
      </header>

      {/* When this note gets loaded. §4.4's rule, made visible. */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', margin: '0 var(--pad-card)',
          padding: 'var(--sp-4) var(--sp-6)', borderRadius: 'var(--r-lg)',
          backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
        }}
      >
        <span style={{ display: 'flex', flex: '0 0 auto', color: note.stale ? 'var(--fg-4)' : 'var(--job-violet)' }}>
          <Icon name={note.stale ? 'wind' : 'key-round'} size={15} />
        </span>
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
          {note.trigger === ''
            ? 'No trigger line. Atlas sees only this file’s name when deciding whether to open it.'
            : note.trigger}
        </span>
      </div>

      <div style={{ padding: 'var(--sp-6) var(--pad-card) var(--pad-card)' }}>
        {editing ? (
          <textarea
            ref={textarea}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label={`Contents of ${note.name}`}
            style={{
              width: '100%', minHeight: 320, boxSizing: 'border-box', border: 0, resize: 'vertical',
              padding: 'var(--sp-6)', borderRadius: 'var(--r-sm)', outline: 'none',
              backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
              color: 'var(--fg-1)', font: 'var(--type-numeric)', fontSize: 'var(--text-sm)',
              lineHeight: 'var(--leading-relaxed)',
            }}
          />
        ) : (
          <pre
            style={{
              margin: 0, padding: 'var(--sp-6)', borderRadius: 'var(--r-sm)',
              backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
              font: 'var(--type-numeric)', fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-relaxed)',
              color: 'var(--fg-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}
          >
            {note.body}
          </pre>
        )}
      </div>
    </section>
  );
}

/**
 * A catalog with no notes in it yet.
 *
 * **Nothing is seeded and no example is drawn.** The mockup's eleven notes are
 * a demonstration; writing any of them here would put facts about Rahul Mehta
 * into Shreekant's memory that nobody told Atlas, in the one place the whole
 * design promises he can trust what he reads. Atlas writes the first note when
 * he tells it something worth keeping.
 */
function EmptyCatalog() {
  return (
    <section
      style={{
        display: 'grid', justifyItems: 'center', gap: 'var(--sp-5)', textAlign: 'center',
        padding: 'var(--sp-13) var(--pad-card)', borderRadius: 'var(--r-card-lg)',
        backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
      }}
    >
      <span
        style={{
          display: 'grid', placeItems: 'center', width: 48, height: 48, borderRadius: '50%',
          backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)', color: 'var(--fg-4)',
        }}
      >
        <Icon name="book-open" size={22} />
      </span>
      <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-md)', color: 'var(--fg-2)' }}>
        Atlas has not written anything down yet.
      </span>
      <span
        style={{
          font: 'var(--type-caption)', color: 'var(--fg-3)', maxWidth: '52ch', textWrap: 'pretty',
        }}
      >
        Tell it something that will still matter next week — how you like a job done, a fact about
        someone you work with, where a project stands — and it writes a note. They appear here as
        files you can read and correct.
      </span>
    </section>
  );
}

/**
 * No catalog to show, in the three states that have three different fixes.
 *
 * `/atlas-host`'s dialect, deliberately: a laptop that is shut, an app with no
 * Atlas configured at all, and an Atlas that is up but whose memory would not
 * open. The third prints Atlas's own reason verbatim — 9B's rule, because the
 * reason is the only half anybody can act on.
 */
function Unavailable({
  loading,
  status,
  fromCloud,
  problem,
  onRetry,
}: {
  loading: boolean;
  status: string;
  /** Reading the cloud copy because the laptop is asleep (BIG-4). */
  fromCloud: boolean;
  problem: { message: string; tooOld: boolean } | null;
  onRetry: () => void;
}) {
  const body =
    fromCloud
      ? {
          icon: (problem !== null ? 'circle-alert' : 'book-open') as IconName,
          title: problem !== null ? 'The laptop is asleep, and the cloud copy did not answer.' : 'Nothing to show yet.',
          detail: problem?.message ?? '',
        }
      : status === 'unconfigured'
      ? {
          icon: 'server' as IconName,
          title: 'No Atlas is configured.',
          detail:
            'The catalog lives on your laptop, so this app needs to know where Atlas is before it can show you anything. That address is VITE_ATLAS_URL.',
        }
      : status === 'asleep'
        ? {
            icon: 'moon' as IconName,
            title: 'The laptop is asleep.',
            detail:
              'Your notes are on it, not in this browser — deliberately, so there is only ever one copy and it is the one you can open in Notepad. Open the laptop and they are here.',
          }
        : problem?.tooOld === true
          ? {
              icon: 'circle-alert' as IconName,
              title: 'This Atlas is older than the catalog.',
              detail: 'The laptop is awake but running a build from before it could remember anything. Restart Atlas on it.',
            }
          : problem !== null
            ? {
                icon: 'circle-alert' as IconName,
                title: 'Atlas could not open its memory.',
                detail: problem.message,
              }
            : {
                icon: 'book-open' as IconName,
                title: 'Nothing to show yet.',
                detail: 'Atlas answered, but sent no catalog.',
              };

  return (
    <section
      style={{
        display: 'grid', justifyItems: 'center', gap: 'var(--sp-5)', textAlign: 'center',
        padding: 'var(--sp-13) var(--pad-card)', borderRadius: 'var(--r-card-lg)',
        backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
      }}
    >
      <span
        style={{
          display: 'grid', placeItems: 'center', width: 48, height: 48, borderRadius: '50%',
          backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)', color: 'var(--fg-4)',
        }}
      >
        <Icon name={body.icon} size={22} />
      </span>
      <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-md)', color: 'var(--fg-2)' }}>{body.title}</span>
      {body.detail !== '' && (
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', maxWidth: '54ch', textWrap: 'pretty' }}>
          {body.detail}
        </span>
      )}
      {!loading && (
        <SoftButton size="sm" icon={<Icon name="refresh-cw" size={14} />} onClick={onRetry}>
          Try again
        </SoftButton>
      )}
    </section>
  );
}
