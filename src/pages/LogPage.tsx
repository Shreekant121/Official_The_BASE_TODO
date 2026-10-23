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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BlurAcross, Bone, Button, CountChip, Icon, Input, LitLine, litSafe, MiniNav, SegmentedControl, SkeletonRows, SoftButton, StatusPill,
  Toast, useArrival, useMedia, WIDE, type IconName,
} from '../ui';
import { RailMark } from '../components/BrandMark';
import { useNavModel } from '../components/navModel';
import { useAtlasStore } from '../lib/atlas/atlasStore';
import { loadLog, useMemorySource } from '../lib/atlas/memorySource';
import { tabletAtlas } from '../lib/atlas/engine/tabletAtlas';
import {
  AtlasMemoryUnavailable,
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
  /* BIG-4: the laptop when it is awake, the cloud copy when it is asleep.
     BIG-12: with the lid shut a turn Atlas ran on this tablet is reverted
     here, by Atlas in this page; a laptop turn still needs the laptop. */
  const source = useMemorySource();

  const fixture = useMemo(() => devLogFixture(), []);

  const [scope, setScope] = useState<AtlasLogScope>('today');
  const [index, setIndex] = useState<AtlasLogIndex | null>(null);
  /* The range whose days are on screen — `scope` runs ahead of it while a
     switch is loading. What the blur across keys on (29-1P5c). */
  const [landed, setLanded] = useState<AtlasLogScope>('today');
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
        setLanded(scope);
        setLoading(false);
        return;
      }
      if (source === null) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setProblem(null);
      try {
        const next = await loadLog(source, scope, signal);
        setIndex(next);
        setLanded(scope);
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
    [source, fixture, scope],
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

  /* OPT-2: only the drawers that still have a chip. A drawer picked under
     All and absent from Today used to keep filtering with its chip gone, so
     Today read "Nothing in the log matches that" and nothing on screen was
     pressed to undo it. Kept in `drawers`, so going back to All finds the
     chip still pressed. */
  const activeDrawers = useMemo(() => drawers.filter((key) => drawerCounts.has(key)), [drawers, drawerCounts]);

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
              if (activeDrawers.length > 0 && !activeDrawers.includes(key)) return false;
              if (needle === '') return true;
              /* The arguments too (OPT-2): a row's line is drawn from them,
                 so a task named on the row but missing from Atlas's summary
                 was on screen and not findable. */
              const haystack = `${entry.tool} ${entry.summary} ${turn.ask ?? ''} ${JSON.stringify(entry.args ?? {})}`.toLowerCase();
              return haystack.includes(needle);
            }),
          }))
          .filter((turn) => turn.entries.length > 0),
      }))
      .filter((day) => day.turns.length > 0);
  }, [activeDrawers, index, query]);

  const toggleDrawer = (key: string) => {
    setDrawers((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  };

  const onRevert = async (turn: AtlasLogTurn, day: string) => {
    if (fixture !== null || source === null) return;
    if (source.kind === 'laptop' ? baseUrl === null : turn.revertibleHere !== true) return;
    setReverting(turn.id);
    try {
      const result =
        source.kind === 'cloud'
          ? await (await tabletAtlas(source.uid)).revert(turn.id, day)
          : await revertLogTurn(source.baseUrl, turn.id);
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
        title: source.kind === 'laptop' ? 'Could not reach the laptop' : 'Could not put it back',
        detail: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setReverting(null);
    }
  };

  /* The laptop's awake-ness only matters when the laptop is what is being
     read. BIG-4 left `status !== 'awake'` standing for the cloud copy too, so
     with the lid shut a log that had loaded stayed on "Reading the cloud
     copy…" for ever (found at BIG-12). */
  const unavailable =
    fixture === null && ((source?.kind !== 'cloud' && status !== 'awake') || problem !== null || index === null);
  /* 29-1P14d2, idea 116: `/catalog`'s waiting — a day of placeholder turns
     while the probe or the read is on its way, the days fading in over it. */
  const waiting =
    unavailable && index === null && problem === null && status !== 'unconfigured' &&
    (status === 'unknown' || (source !== null && loading));
  const arrived = useRef<HTMLDivElement>(null);
  useArrival(arrived, !unavailable);

  return (
    /* `ag-page ag-page--calm`, which this screen was built without (item 20).
       Every other screen wraps itself in one; this one did not, so the only
       `.ag-page` on the page was `<body>` in index.html and the log inherited
       the DEFAULT backdrop — grid, grain and the emerald pool. `log.html` asks
       for `--calm`, the variant `readme.md` reserves for dense data screens,
       and a wall of timestamped rows is the densest screen in the app.

       Nothing but the pool changes. The wrapper repaints `--surface-page` and
       the same 88px grid over the body's, so the two are indistinguishable
       everywhere except low on the page, which is where the pool sat.

       OPT-2: `h-screen overflow-y-auto`, the scroller every other screen is.
       This was `min-height: 100dvh` and relied on the window to scroll, but
       `<body>` is `overflow: hidden` (index.css), so a long log was cut off
       at the bottom of the screen with no way down. And the backdrop's two
       teal masses are sized to `.ag-page`'s own box: on a box as tall as the
       content they stretched and slid every time Today / 7 days / All
       changed how much there was — "the green light on the side changes".
       One viewport tall, they stay put. */
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
                    /* 29-1P5c, idea 57: shrinks and fades as the page scrolls. */
                    className="ag-tuck-title"
                    style={{
                      font: 'var(--type-display)', fontSize: 'var(--text-2xl)',
                      letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)', margin: 0,
                    }}
                  >
                    Action log
                  </h1>
                </div>
                {/* The soft pressed-in switch and a soft way back, since 29-1P2. */}
                <SegmentedControl
                  size="sm"
                  look="soft"
                  options={SCOPES}
                  value={scope}
                  onChange={(next) => setScope(next as AtlasLogScope)}
                />
                <SoftButton
                  size="sm"
                  icon={<Icon name="sparkles" size={15} />}
                  onClick={() => nav.go('atlas')}
                >
                  Back to Atlas
                </SoftButton>
              </div>

              {index !== null && (
                <>
                  <div
                    style={{
                      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))', gap: 'var(--sp-4)',
                    }}
                  >
                    {/* Each label names its own span (OPT-2). These three do not
                        follow the switch — two are today's and the front door
                        is every act ever, from Atlas — and an unlabelled count
                        that stood still while 7 days and All filled the list
                        read as a page that had not updated. */}
                    <Metric value={String(index.counts.entries)} label="entries today" />
                    <Metric
                      value={String(index.counts.undoable)}
                      label={index.counts.undoable === 1 ? 'change to put back today' : 'changes to put back today'}
                    />
                    {/* The reading that matters, and the mockup says so: acts that
                        cannot be taken back. It is the only tinted number on the
                        screen: violet, Atlas's, since 29-1P2c3 (it was amber). */}
                    <Metric
                      value={String(index.counts.frontDoor)}
                      label="through the front door, ever"
                      tone="var(--job-violet-tag-fg)"
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
                    {(activeDrawers.length > 0 || query.trim() !== '') && (
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

            {/* 29-1P5c, idea 60: a new range blurs across once its days have landed —
                not on the press, while the last range's stay up dimmed. */}
            <BlurAcross value={landed} index={SCOPES.findIndex((one) => one.value === landed)}>
            {waiting ? (
              <LogWaiting />
            ) : unavailable ? (
              <Unavailable
                loading={loading}
                status={status}
                fromCloud={source?.kind === 'cloud'}
                problem={problem}
                onRetry={() => void load()}
              />
            ) : visibleDays.length === 0 ? (
              <Nothing filtered={query.trim() !== '' || activeDrawers.length > 0} typed={query.trim()} scope={scope} />
            ) : (
              /* Dimmed while another scope is on its way (OPT-2): the last
                 scope's days stay up until the new ones land, and at full
                 strength they read as the answer to the switch just pressed. */
              <div
                ref={arrived}
                aria-busy={loading}
                style={{
                  display: 'grid', gap: 'var(--sp-11)', paddingBottom: 'var(--sp-11)',
                  opacity: loading ? 0.5 : 1, transition: 'opacity var(--dur-base) var(--ease-glass)',
                }}
              >
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
                            canRevert={
                              fixture === null &&
                              (source?.kind === 'laptop' || (source?.kind === 'cloud' && turn.revertibleHere === true))
                            }
                            lidShut={source?.kind === 'cloud' && turn.revertibleHere !== true}
                            onRevert={() => void onRevert(turn, day.day)}
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
            </BlurAcross>
          </div>
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
            <MiniNav items={nav.items} value={nav.current} onChange={nav.go} screenLit />
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
  /* A chip with a count since 29-1P2, pressed in while its drawer is
     filtered on — the Trash's kind filters, the same piece. */
  return (
    <CountChip count={count} pressed={on} onClick={onClick} className="ds-soft--sm" style={{ flex: '0 0 auto' }}>
      <span style={{ display: 'flex', color: on ? 'inherit' : 'var(--fg-3)' }}>
        <Icon name={icon} size={15} />
      </span>
      {label}
    </CountChip>
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
  lidShut = false,
  onRevert,
}: {
  turn: AtlasLogTurn;
  timezone: string;
  busy: boolean;
  canRevert: boolean;
  /** A laptop turn read from the cloud copy (BIG-4): the button says why it cannot be pressed. */
  lidShut?: boolean;
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
            backgroundImage: byYou ? 'var(--glass-fill-2)' : 'var(--glass-tint-violet)',
            boxShadow: 'var(--glass-rim-2)',
            color: byYou ? 'var(--fg-3)' : 'var(--job-violet-text)',
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
              {busy ? 'Putting it back…' : lidShut ? 'Revert needs the laptop' : 'Revert this turn'}
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
          <span style={{ display: 'flex', color: 'var(--job-violet)', flex: '0 0 auto' }}>
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
    ? 'var(--job-violet)'
    : !entry.ok
      ? 'var(--fg-3)'
      : entry.wrote
        ? 'var(--job-violet)'
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
        {/* "No undo" is coral since 29-1P2c2: it cannot be taken back, the
            same family as delete, and it must stay louder than a warning
            (which went grey). The rest of the front door's marks, and "wrote",
            are Atlas's: violet since 29-1P2c3. */}
        {entry.frontDoor && !entry.undoable && !undone ? (
          <StatusPill status="overrun" size="sm" dot={false}>
            no undo
          </StatusPill>
        ) : (
          <span
            className="ag-kicker"
            style={{ flex: '0 0 auto', color: entry.wrote && !undone ? 'var(--job-violet-tag-fg)' : 'var(--fg-4)' }}
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

function Nothing({ filtered, typed, scope }: { filtered: boolean; typed: string; scope: AtlasLogScope }) {
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
      {/* 29-1P14c: his approved words, lit. */}
      <LitLine
        text={filtered
          ? typed === '' ? 'Nothing in the log matches that.' : `Nothing in the log matches **“${litSafe(typed)}”**.`
          : scope === 'today'
            ? 'Atlas has not done anything today.'
            : '**Nothing yet.** Every change Atlas makes shows here, with **Revert**.'}
        style={{ font: 'var(--type-body)', fontSize: 'var(--text-md)', color: 'var(--fg-3)' }}
      />
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
          icon: (problem !== null ? 'circle-alert' : 'scroll-text') as IconName,
          title: problem !== null ? 'The laptop is asleep, and the cloud copy did not answer.' : 'Nothing to show yet.',
          detail: problem?.message ?? '',
        }
      : status === 'unconfigured'
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
                title: 'Nothing to show yet.',
                detail: 'Atlas answered, but sent no log.',
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

/** A day of the log on its way: its heading, then turns shaped like `TurnCard`s (29-1P14d2). */
function LogWaiting() {
  return (
    <section role="status" aria-busy="true" aria-label="Reading the log" style={{ display: 'grid', gap: 'var(--sp-6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)' }}>
        <Bone width={96} height={18} radius="var(--r-md)" />
        <span style={{ flex: 1, height: 1, background: 'var(--line-faint)' }} />
        <Bone width={56} height={9} />
      </div>
      <SkeletonRows rows={4} lead="square" sub card label="Reading the log" />
    </section>
  );
}
