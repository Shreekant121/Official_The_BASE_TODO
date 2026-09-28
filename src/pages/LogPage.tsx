/**
 * The action log — everything Atlas has done (item 13, `design-system/screens/log.html`).
 *
 * WHAT THIS SCREEN IS FOR, IN THE DESIGN'S OWN WORDS
 * ---------------------------------------------------
 * DESIGN.md §5.3: *"the difference between full autonomous email handling
 * being liberating and being terrifying is entirely whether you can read what
 * it did afterwards."* This is that reading. Everything Atlas has ever done,
 * timestamped, and anything reversible reversible from here.
 *
 * TURNS ARE THE UNIT, AND THAT IS THE REVERT CONTRACT
 * ----------------------------------------------------
 * One thing Shreekant asked for, everything it caused, one button. The mockup
 * draws it that way and the reason is not layout: a turn that created a task,
 * set its deadline and queued it made three changes he never separated in his
 * head, and three buttons would ask him to.
 *
 * THE ROWS ARE RENDERED FROM THE RAW CALL, NOT FROM A SENTENCE ATLAS WROTE
 * -------------------------------------------------------------------------
 * Atlas logs `{tool, args, ok, summary, data}` — an `AgentToolCall` in all but
 * name — and this screen runs it through `describeToolCall`, the same function
 * the chat transcript uses for its chips. So *"Updated 'Call the CA' · deadline
 * → Thu 6pm"* is derived here from what actually happened, and a tool that
 * changes its wording keeps working on both screens at once. The alternative —
 * Atlas composing a row for the app to print — would have put this app's
 * vocabulary inside Atlas and left two places to keep in step.
 *
 * `summary` is still shown, in the expanded panel, because it is the sentence
 * the *model* read on its next turn and that is worth being able to check.
 *
 * WHAT THE MOCKUP DRAWS THAT IS NOT HERE, AND WHY
 * ------------------------------------------------
 * `log.html` has a `Mail` filter chip and seeds five mail rows. There is no
 * mail until item 22, so the filter row is built from the **drawers that
 * actually appear in the log** rather than from a fixed list of four: Tasks
 * and Sharing today, Mail when it exists, a CRM's own drawer if one is ever
 * plugged in. Hardcoding the mockup's four would have shown Shreekant a Mail
 * filter that matches nothing, and would have hidden any drawer nobody
 * remembered to add.
 *
 * WHEN THE LAPTOP IS SHUT
 * ------------------------
 * There is no cached copy, deliberately, for `/catalog`'s reason: a log this
 * app remembered would be a second record that could disagree with the real
 * one, on the screen whose whole promise is that it says what happened. A
 * closed lid is an empty state naming which of the three things is wrong.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Button, Icon, Input, MiniNav, SegmentedControl, StatusPill, Toast, useMedia, WIDE, type IconName,
} from '../ui';
import { RailMark } from '../components/BrandMark';
import { useNavModel } from '../components/navModel';
import { useAtlasStore } from '../lib/atlas/atlasStore';
import {
  AtlasMemoryUnavailable,
  fetchLog,
  revertLogTurn,
  type AtlasLogEntry,
  type AtlasLogIndex,
  type AtlasLogScope,
  type AtlasLogTurn,
} from '../lib/atlas/client';
import { CHIP_ICON_NAMES, describeToolCall, type ToolChip } from '../lib/agent/toolChip';
import { resolveUserTimeZone } from '../lib/agent/dates';
import { devLogFixture } from '../lib/devLogFixture';
import { relativeWhen } from '../lib/atlas/relativeWhen';
import { Z } from '../lib/zLayers';

/** The mockup's column — `log.html` caps its content at 1000. */
const COLUMN_PX = 1000;

const SCOPES: { value: AtlasLogScope; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: '7 days' },
  { value: 'all', label: 'All' },
];

/**
 * A glyph per drawer, for the filter row.
 *
 * The keys are drawer names, which come from whichever MCP server declared
 * them — so an unknown one gets `folder` rather than being dropped. That is
 * `/catalog`'s rule about folders, and it matters more here: a drawer nobody
 * anticipated is exactly what plugging in a second server looks like.
 */
const DRAWER_ICONS: Record<string, IconName> = {
  tasks: 'list-checks',
  queue: 'zap',
  sharing: 'link-2',
  web: 'globe',
  memory: 'book-open',
  skills: 'wrench',
  mail: 'mail',
  system: 'cpu',
};

function drawerLabel(key: string): string {
  if (key === 'system') return 'System';
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** `2026-09-04T14:22:04+05:30` → `14:22:04`. The mockup's ruler column. */
function clockOf(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  return at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function shortClockOf(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '—';
  return at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * `Today`, `Yesterday`, or `Tue 2 Sep`.
 *
 * `today` is Atlas's answer, not this browser's: the log rolls over at
 * midnight in Shreekant's zone on the laptop, and a tablet in another zone
 * that decided for itself which section was "today" would disagree with the
 * file names.
 */
function dayHeading(day: string, today: string): { title: string; date: string } {
  const parsed = new Date(`${day}T00:00:00`);
  const date = Number.isNaN(parsed.getTime())
    ? day
    : parsed.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  if (day === today) return { title: 'Today', date };

  const yesterday = new Date(`${today}T00:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
  if (day === yesterdayKey) return { title: 'Yesterday', date };

  return { title: date, date: '' };
}

/** Rupees, or an em dash for a turn whose cost nobody measured. */
function rupees(value: number | null): string {
  return value === null ? '—' : `₹${value.toFixed(2)}`;
}

interface ToastPayload {
  icon: IconName;
  title: string;
  detail?: string;
}

export default function LogPage() {
  const nav = useNavModel();
  const wide = useMedia(WIDE);

  const status = useAtlasStore((s) => s.status);
  const baseUrl = useAtlasStore((s) => s.baseUrl);
  const probe = useAtlasStore((s) => s.probe);

  const fixture = useMemo(() => devLogFixture(), []);

  const [scope, setScope] = useState<AtlasLogScope>('today');
  const [index, setIndex] = useState<AtlasLogIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<{ message: string; tooOld: boolean } | null>(null);
  const [query, setQuery] = useState('');
  const [drawers, setDrawers] = useState<string[]>([]);
  const [reverting, setReverting] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastPayload | null>(null);

  const timezone = useMemo(() => resolveUserTimeZone(), []);

  useEffect(() => {
    void probe();
  }, [probe]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (fixture !== null) {
        setIndex(fixture);
        setLoading(false);
        return;
      }
      if (baseUrl === null || status !== 'awake') {
        setLoading(false);
        return;
      }

      setLoading(true);
      setProblem(null);
      try {
        const next = await fetchLog(baseUrl, scope, signal);
        setIndex(next);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setProblem(
          err instanceof AtlasMemoryUnavailable
            ? { message: err.message, tooOld: err.tooOld }
            : { message: err instanceof Error ? err.message : String(err), tooOld: false },
        );
        setIndex(null);
      } finally {
        setLoading(false);
      }
    },
    [baseUrl, fixture, scope, status],
  );

  /*
   * `load` sets state before its first await, so it is deferred out of the
   * effect body rather than called from it — `/catalog` does the same and
   * carries the reasoning: an effect synchronises with something outside
   * React, and a setState inside one is a second render for something the
   * first already knew. The abort still belongs to the effect, so a scope
   * change mid-flight does not land a stale day on the screen.
   */
  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) void load(controller.signal);
    });
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (toast === null) return;
    const timer = setTimeout(() => setToast(null), 5200);
    return () => clearTimeout(timer);
  }, [toast]);

  /*
   * Every drawer that actually appears, in the order the log first mentions
   * it. See the header: a fixed list would show a Mail filter that matches
   * nothing and hide a drawer nobody thought of.
   */
  const drawerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const day of index?.days ?? []) {
      for (const turn of day.turns) {
        for (const entry of turn.entries) {
          const key = entry.drawer ?? 'system';
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
    }
    return counts;
  }, [index]);

  const visibleDays = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (index?.days ?? [])
      .map((day) => ({
        ...day,
        turns: day.turns
          .map((turn) => ({
            ...turn,
            entries: turn.entries.filter((entry) => {
              const key = entry.drawer ?? 'system';
              if (drawers.length > 0 && !drawers.includes(key)) return false;
              if (needle === '') return true;
              const haystack = `${entry.tool} ${entry.summary} ${turn.ask ?? ''}`.toLowerCase();
              return haystack.includes(needle);
            }),
          }))
          .filter((turn) => turn.entries.length > 0),
      }))
      .filter((day) => day.turns.length > 0);
  }, [drawers, index, query]);

  const toggleDrawer = (key: string) => {
    setDrawers((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  const onRevert = async (turn: AtlasLogTurn) => {
    if (baseUrl === null || fixture !== null) return;
    setReverting(turn.id);
    try {
      const result = await revertLogTurn(baseUrl, turn.id);
      /*
       * The whole index is refetched rather than the returned turn spliced in.
       * A revert writes to Firestore through the laptop, and the entries it
       * marked undone are only half of what changed — the counts at the top
       * move too. One fetch is cheaper than keeping four derived numbers in
       * step by hand.
       */
      await load();
      setToast({
        icon: result.ok ? 'undo-2' : 'circle-alert',
        title: result.ok ? 'Turn reverted' : 'Nothing was put back',
        detail: result.summary,
      });
    } catch (err) {
      setToast({
        icon: 'circle-alert',
        title: 'Could not reach the laptop',
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setReverting(null);
    }
  };

  const unavailable = fixture === null && (status !== 'awake' || problem !== null || index === null);

  return (
    /* `ag-page ag-page--calm`, which this screen was built without (item 20).
       Every other screen wraps itself in one; this one did not, so the only
       `.ag-page` on the page was `<body>` in index.html and the log inherited
       the DEFAULT backdrop — grid, grain and the emerald pool. `log.html` asks
       for `--calm`, the variant `readme.md` reserves for dense data screens,
       and a wall of timestamped rows is the densest screen in the app.

       Nothing but the pool changes. The wrapper repaints `--surface-page` and
       the same 88px grid over the body's, so the two are indistinguishable
       everywhere except low on the page, which is where the pool sat. */
    <div
      className="ag-page ag-page--calm"
      style={{ display: 'flex', minHeight: '100dvh', alignItems: 'stretch' }}
    >
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
          flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
          padding: wide ? 'var(--sp-9) var(--gutter-page) var(--sp-8)' : 'var(--sp-8) var(--gutter-page-sm) 116px',
        }}
      >
        <div style={{ width: '100%', maxWidth: COLUMN_PX, margin: '0 auto', display: 'grid', gap: 'var(--sp-7)' }}>
          <header style={{ display: 'grid', gap: 'var(--sp-7)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 'var(--sp-2)', flex: 1, minWidth: 220 }}>
                <span className="ag-kicker" style={{ color: 'var(--fg-3)' }}>
                  Everything Atlas has done
                </span>
                <h1
                  style={{
                    font: 'var(--type-display)', fontSize: 'var(--text-2xl)',
                    letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)', margin: 0,
                  }}
                >
                  Action log
                </h1>
              </div>
              <SegmentedControl
                size="sm"
                options={SCOPES}
                value={scope}
                onChange={(next) => setScope(next as AtlasLogScope)}
              />
              <Button
                size="sm"
                variant="glass"
                iconLeft={<Icon name="sparkles" size={15} />}
                onClick={() => nav.go('atlas')}
              >
                Back to Atlas
              </Button>
            </div>

            {index !== null && (
              <>
                <div
                  style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))', gap: 'var(--sp-4)',
                  }}
                >
                  <Metric value={String(index.counts.entries)} label="entries today" />
                  <Metric
                    value={String(index.counts.undoable)}
                    label={index.counts.undoable === 1 ? 'change you can put back' : 'changes you can put back'}
                    tone="var(--accent)"
                  />
                  <Metric value={`₹${index.counts.spent.toFixed(2)}`} label="spent today" />
                  {/* The reading that matters, and the mockup says so: acts that
                      cannot be taken back. It is the only tinted-amber number on
                      the screen. */}
                  <Metric
                    value={String(index.counts.frontDoor)}
                    label="through the front door"
                    tone="var(--status-review)"
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 240px', minWidth: 200, maxWidth: 340 }}>
                    <Input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search the log"
                      aria-label="Search the log"
                      iconLeft={<Icon name="search" size={16} />}
                    />
                  </div>
                  {[...drawerCounts.entries()].map(([key, count]) => (
                    <FilterChip
                      key={key}
                      label={drawerLabel(key)}
                      icon={DRAWER_ICONS[key] ?? 'folder'}
                      count={count}
                      on={drawers.includes(key)}
                      onClick={() => toggleDrawer(key)}
                    />
                  ))}
                  {(drawers.length > 0 || query.trim() !== '') && (
                    <Button
                      size="sm"
                      variant="ghost"
                      iconLeft={<Icon name="x" size={14} />}
                      onClick={() => {
                        setDrawers([]);
                        setQuery('');
                      }}
                    >
                      Clear
                    </Button>
                  )}
                </div>
              </>
            )}
          </header>

          {unavailable ? (
            <Unavailable loading={loading} status={status} problem={problem} onRetry={() => void load()} />
          ) : visibleDays.length === 0 ? (
            <Nothing filtered={query.trim() !== '' || drawers.length > 0} scope={scope} />
          ) : (
            <div style={{ display: 'grid', gap: 'var(--sp-11)', paddingBottom: 'var(--sp-11)' }}>
              {visibleDays.map((day) => {
                const heading = dayHeading(day.day, index?.today ?? day.day);
                const entries = day.turns.reduce((total, turn) => total + turn.entries.length, 0);
                return (
                  <section key={day.day} style={{ display: 'grid', gap: 'var(--sp-6)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)' }}>
                      <h2
                        style={{
                          font: 'var(--type-title)', letterSpacing: 'var(--tracking-title)',
                          color: 'var(--fg-1)', margin: 0, flex: '0 0 auto',
                        }}
                      >
                        {heading.title}
                      </h2>
                      {heading.date !== '' && (
                        <span className="ag-kicker" style={{ flex: '0 0 auto', color: 'var(--fg-4)' }}>
                          {heading.date}
                        </span>
                      )}
                      <span style={{ flex: 1, height: 1, background: 'var(--line-faint)' }} />
                      <span className="ag-kicker" style={{ flex: '0 0 auto', color: 'var(--fg-4)' }}>
                        {entries} {entries === 1 ? 'entry' : 'entries'}
                      </span>
                    </div>
                    <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
                      {day.turns.map((turn) => (
                        <TurnCard
                          key={turn.id}
                          turn={turn}
                          timezone={timezone}
                          busy={reverting === turn.id}
                          canRevert={fixture === null}
                          onRevert={() => void onRevert(turn)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}

              <p
                style={{
                  font: 'var(--type-caption)', color: 'var(--fg-4)', textAlign: 'center',
                  maxWidth: '58ch', margin: '0 auto', textWrap: 'pretty',
                }}
              >
                The log keeps everything. Reads are recorded and cannot be undone because nothing changed; published
                links are recorded and cannot be undone because they left. Atlas keeps what it needs to put a change
                back for {index?.undoRetentionDays ?? 30} days, the same as the Trash.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Below `WIDE` the rail is gone and `/log` is in `FloatingNav`'s
          `HIDDEN_ROUTES`, so this screen has to draw its own bar or a tablet
          has no way off it. `/catalog` and `/skills` do exactly this. */}
      {!wide && (
        <div
          style={{
            position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--sp-5) + var(--safe-b))',
            display: 'grid', placeItems: 'center', zIndex: Z.nav, pointerEvents: 'none',
          }}
        >
          <span style={{ pointerEvents: 'auto' }}>
            <MiniNav items={nav.items} value={nav.current} onChange={nav.go} />
          </span>
        </div>
      )}

      <AnimatePresence>
        {toast !== null && (
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
    </div>
  );
}

/**
 * One reading. The design system's answer to "this screen needs visual weight"
 * — a large mono numeral and a kicker, never a chart.
 */
function Metric({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <div
      style={{
        display: 'grid', gap: 'var(--sp-2)', padding: 'var(--sp-6) var(--sp-7)',
        borderRadius: 'var(--r-card)', minWidth: 0,
        backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
      }}
    >
      <span
        style={{
          font: 'var(--type-metric)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-3xl)',
          letterSpacing: 'var(--tracking-display)', color: tone ?? 'var(--fg-1)', fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
      <span className="ag-kicker" style={{ color: 'var(--fg-4)' }}>
        {label}
      </span>
    </div>
  );
}

function FilterChip({
  label,
  icon,
  count,
  on,
  onClick,
}: {
  label: string;
  icon: IconName;
  count: number;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)', height: 38, flex: '0 0 auto',
        padding: '0 var(--sp-5)', border: 0, cursor: 'pointer', borderRadius: 'var(--r-pill)',
        backgroundImage: on ? 'var(--glass-fill-solid)' : 'var(--glass-fill-1)',
        boxShadow: on ? 'var(--glass-rim-3), var(--glass-cast-1)' : 'var(--glass-rim-1)',
        color: on ? 'var(--fg-on-light)' : 'var(--fg-2)', font: 'var(--type-label)',
        transition: 'var(--t-hover)',
      }}
    >
      <span style={{ display: 'flex', opacity: on ? 0.7 : 1, color: on ? 'inherit' : 'var(--fg-3)' }}>
        <Icon name={icon} size={15} />
      </span>
      {label}
      <span
        className="ag-kicker"
        style={{ color: on ? 'var(--fg-on-light)' : 'var(--fg-4)', opacity: on ? 0.6 : 1, fontVariantNumeric: 'tabular-nums' }}
      >
        {count}
      </span>
    </button>
  );
}

/**
 * A turn: what was asked, everything it caused, one revert.
 *
 * The card **is** the revert unit, exactly as the changes container is inside
 * the Atlas transcript — the same contract has to look the same in both
 * places, or the button means two different things on two screens.
 */
function TurnCard({
  turn,
  timezone,
  busy,
  canRevert,
  onRevert,
}: {
  turn: AtlasLogTurn;
  timezone: string;
  busy: boolean;
  canRevert: boolean;
  onRevert: () => void;
}) {
  const undoable = turn.entries.filter((entry) => entry.undoable).length;
  /* BUILD-3: a project or list delete passes the front door and can still be
     put back, so the lock footer is for an entry Revert genuinely cannot reach
     — one that passed the door with nothing to undo it by. */
  const frontDoor = turn.entries.some((entry) => entry.frontDoor && !entry.undoable && entry.undoneAt === null);
  const byYou = turn.actor === 'you';
  const reverted = turn.revertedAt !== null;

  return (
    <div
      style={{
        borderRadius: 'var(--r-card)',
        backgroundImage: reverted ? 'var(--glass-fill-1)' : 'var(--glass-fill-2)',
        backdropFilter: 'var(--glass-bd-md)', WebkitBackdropFilter: 'var(--glass-bd-md)',
        boxShadow: reverted ? 'var(--glass-rim-1), var(--glass-cast-1)' : 'var(--glass-rim-2), var(--glass-cast-2)',
        transition: 'var(--t-hover)',
      }}
    >
      <header
        style={{
          display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-5)', flexWrap: 'wrap',
          padding: 'var(--sp-6) var(--sp-6) var(--sp-5)',
        }}
      >
        <span
          style={{
            display: 'grid', placeItems: 'center', width: 30, height: 30, marginTop: 1, flex: '0 0 auto',
            borderRadius: '50%',
            backgroundImage: byYou ? 'var(--glass-fill-2)' : 'var(--glass-tint-accent)',
            boxShadow: 'var(--glass-rim-2)',
            color: byYou ? 'var(--fg-3)' : 'oklch(0.93 0.07 162)',
          }}
        >
          <Icon name={byYou ? 'user' : 'sparkles'} size={15} />
        </span>

        <div style={{ display: 'grid', gap: 'var(--sp-2)', flex: 1, minWidth: 200 }}>
          <p
            style={{
              font: 'var(--type-body)', fontSize: 'var(--text-sm)',
              color: turn.ask === null ? 'var(--fg-2)' : 'var(--fg-1)',
              margin: 0, textWrap: 'pretty', maxWidth: '68ch',
            }}
          >
            {turn.ask === null ? 'You tapped something through the front door.' : `“${turn.ask}”`}
          </p>
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
            <span className="ag-kicker" style={{ color: 'var(--fg-4)' }}>
              {shortClockOf(turn.at)}
            </span>
            {turn.model !== null && (
              <span className="ag-kicker" style={{ color: 'var(--fg-4)' }}>
                {turn.model}
              </span>
            )}
            <span className="ag-kicker" style={{ color: 'var(--fg-4)' }}>
              {rupees(turn.costRupees)}
            </span>
            {turn.conversationTitle !== null && (
              <span className="ag-kicker" style={{ color: 'var(--fg-3)' }}>
                {turn.conversationTitle}
              </span>
            )}
          </span>
        </div>

        {undoable > 0 &&
          (reverted ? (
            <span className="ag-kicker" style={{ marginTop: 'var(--sp-3)', color: 'var(--fg-4)' }}>
              Reverted
            </span>
          ) : (
            /* `disabled` under the fixture rather than hidden. The button is
               the point of this screen and needs a baseline, and a control
               that cannot be pressed cannot lie — which is 9B's treatment for
               exactly this, one screen over. */
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || !canRevert}
              iconLeft={<Icon name="undo-2" size={14} />}
              onClick={onRevert}
            >
              {busy ? 'Putting it back…' : 'Revert this turn'}
            </Button>
          ))}
      </header>

      <div>
        {turn.entries.map((entry, position) => (
          <Row key={entry.id} entry={entry} timezone={timezone} first={position === 0} />
        ))}
      </div>

      {frontDoor && (
        <footer
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
            padding: 'var(--sp-4) var(--sp-6)', borderTop: '1px solid var(--line-faint)',
          }}
        >
          <span style={{ display: 'flex', color: 'var(--status-review)', flex: '0 0 auto' }}>
            <Icon name="lock" size={14} />
          </span>
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
            This turn passed the front door. Revert cannot reach it — the log records it, it does not recall it.
          </span>
        </footer>
      )}
    </div>
  );
}

/**
 * One line of the log.
 *
 * The time is mono and fixed-width so the column reads as a ruler, and the row
 * opens in place to show the exact call — "read what it did afterwards" is the
 * whole point of §5.3, and a row that only shows a paraphrase is not that.
 */
function Row({ entry, timezone, first }: { entry: AtlasLogEntry; timezone: string; first: boolean }) {
  const [open, setOpen] = useState(false);

  /*
   * The same function the chat transcript's chips use. See the header: the
   * sentence is derived from the recorded call, so one tool reworded stays
   * right on both screens at once.
   */
  /*
   * ITEM 13D — THE DURATION STOPS BEING A HARD-CODED ZERO.
   *
   * This line used to read `durationMs: 0`, which was the app's half of the
   * log throwing away a number Atlas had already measured. Every call in the
   * log claimed to have taken no time, so nothing anywhere held a distribution
   * of how long tool calls actually take — which is precisely what item 14
   * needs in order to say whether batching helped.
   *
   * `?? 0` is for entries written before Atlas started recording it. It keeps
   * the old zero for those and only for those, and the panel below tells the
   * two apart rather than printing "0 ms" over a call nobody timed.
   */
  const chip: ToolChip = useMemo(
    () =>
      describeToolCall(
        { name: entry.tool, args: entry.args, ok: entry.ok, summary: entry.summary, data: entry.data, durationMs: entry.durationMs ?? 0 },
        timezone,
      ),
    [entry, timezone],
  );

  const undone = entry.undoneAt !== null;
  const tone = entry.frontDoor
    ? 'var(--status-review)'
    : !entry.ok
      ? 'var(--fg-3)'
      : entry.wrote
        ? 'var(--accent)'
        : 'var(--fg-3)';

  return (
    <div style={{ borderTop: first ? 'none' : '1px solid var(--line-faint)' }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          display: 'grid', gridTemplateColumns: 'auto auto minmax(0,1fr) auto auto',
          alignItems: 'center', gap: 'var(--sp-5)', width: '100%', minHeight: 56,
          padding: 'var(--sp-4) var(--sp-6)', border: 0, cursor: 'pointer', textAlign: 'left',
          background: 'transparent', opacity: undone ? 0.5 : 1,
          transition: 'opacity var(--dur-base) var(--ease-glass)',
        }}
      >
        <span
          style={{
            font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-4)',
            fontVariantNumeric: 'tabular-nums', flex: '0 0 auto',
          }}
        >
          {clockOf(entry.at)}
        </span>

        {/* The action's own glyph, from the table the chat transcript's chips
            use — a deletion has to look like one here too. An entry that has
            been put back wears `undo-2` instead, which is the same glyph a
            spent changes container wears one screen over. */}
        <span style={{ display: 'flex', color: undone ? 'var(--fg-4)' : tone, flex: '0 0 auto' }}>
          <Icon name={undone ? 'undo-2' : (CHIP_ICON_NAMES[chip.icon] as IconName)} size={16} />
        </span>

        <span style={{ display: 'grid', gap: 1, minWidth: 0 }}>
          <span
            style={{
              font: 'var(--type-body)', fontSize: 'var(--text-sm)',
              color: undone ? 'var(--fg-3)' : 'var(--fg-1)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              textDecoration: undone ? 'line-through' : 'none', textDecorationColor: 'var(--fg-4)',
            }}
          >
            <span style={{ color: 'var(--fg-3)' }}>{chip.verb}</span>
            {chip.subject !== undefined && ` · ${chip.subject}`}
          </span>
          <span
            style={{
              font: 'var(--type-caption)', color: 'var(--fg-4)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {chip.detail ?? entry.summary}
          </span>
        </span>

        {/* Three states, three treatments, and the difference between them is
            the safety rule: something that left the house, something that
            changed data here, and something that only looked. */}
        {entry.frontDoor && !entry.undoable && !undone ? (
          <StatusPill status="review" size="sm" dot={false}>
            no undo
          </StatusPill>
        ) : (
          <span
            className="ag-kicker"
            style={{ flex: '0 0 auto', color: entry.wrote && !undone ? 'var(--accent)' : 'var(--fg-4)' }}
          >
            {undone ? 'undone' : entry.wrote ? 'wrote' : 'read'}
          </span>
        )}

        <span
          style={{
            display: 'flex', color: 'var(--fg-4)', flex: '0 0 auto',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform var(--dur-base) var(--ease-morph)',
          }}
        >
          <Icon name="chevron-down" size={15} />
        </span>
      </button>

      {open && (
        <div style={{ padding: '0 var(--sp-6) var(--sp-6) calc(var(--sp-6) + 62px)', display: 'grid', gap: 'var(--sp-4)' }}>
          <pre
            className="ag-scroll"
            style={{
              margin: 0, padding: 'var(--sp-5) var(--sp-6)', borderRadius: 'var(--r-sm)',
              backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
              font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-2)',
              overflowX: 'auto', whiteSpace: 'pre',
            }}
          >
            {`${entry.tool}(${JSON.stringify(entry.args, null, 2)})\n→ ${entry.summary}` +
              (entry.durationMs === undefined ? '' : `\n  ${entry.durationMs} ms`)}
          </pre>
          {/* Why it cannot be put back, when it cannot. Written at the time by
              Atlas rather than guessed here — the reasons are different and
              only some of them are anybody's fault. */}
          {entry.noUndoReason !== null && (
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
              {entry.noUndoReason}
            </span>
          )}
          {entry.undoneAt !== null && (
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
              Put back {relativeWhen(entry.undoneAt)}.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Nothing({ filtered, scope }: { filtered: boolean; scope: AtlasLogScope }) {
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
        <Icon name={filtered ? 'search-x' : 'scroll-text'} size={22} />
      </span>
      <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-md)', color: 'var(--fg-2)' }}>
        {filtered
          ? 'Nothing in the log matches that.'
          : scope === 'today'
            ? 'Atlas has not done anything today.'
            : 'Nothing in the log yet.'}
      </span>
      {!filtered && (
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', maxWidth: '48ch', textWrap: 'pretty' }}>
          Every action Atlas takes lands here the moment it happens — including the ones it only looked at.
        </span>
      )}
    </section>
  );
}

/**
 * The three states this screen has when there is nothing to draw.
 *
 * `/catalog`'s dialect exactly, because they are the same three facts with the
 * same three fixes, and the third prints Atlas's own reason verbatim — 9B's
 * rule, since the reason is the only half anybody can act on.
 */
function Unavailable({
  loading,
  status,
  problem,
  onRetry,
}: {
  loading: boolean;
  status: string;
  problem: { message: string; tooOld: boolean } | null;
  onRetry: () => void;
}) {
  const body =
    status === 'unconfigured'
      ? {
          icon: 'server' as IconName,
          title: 'No Atlas is configured.',
          detail:
            'The log is written on your laptop, so this app needs to know where Atlas is before it can show you anything. That address is VITE_ATLAS_URL.',
        }
      : status === 'asleep'
        ? {
            icon: 'moon' as IconName,
            title: 'The laptop is asleep.',
            detail:
              'The record of what Atlas did is on it, not in this browser — deliberately, so there is only ever one copy. Open the laptop and it is here.',
          }
        : problem?.tooOld === true
          ? {
              icon: 'circle-alert' as IconName,
              title: 'This Atlas is older than the action log.',
              detail: 'The laptop is awake but running a build from before it kept one. Restart Atlas on it.',
            }
          : problem !== null
            ? {
                icon: 'circle-alert' as IconName,
                title: 'Atlas could not open its log.',
                detail: problem.message,
              }
            : {
                icon: 'scroll-text' as IconName,
                title: loading ? 'Reading the laptop…' : 'Nothing to show yet.',
                detail: loading ? '' : 'Atlas answered, but sent no log.',
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
        <Button size="sm" variant="glass" iconLeft={<Icon name="refresh-cw" size={14} />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </section>
  );
}
