/**
 * `/atlas-host` — the program on the laptop, and whether it is answering.
 * Mockup: design-system/screens/atlas-host.html (item 9B).
 *
 * WHAT THIS SCREEN IS FOR
 * -----------------------
 * Atlas is a program on a machine that closes, travels and runs out of
 * battery, reached over a private network. Every other screen in this app can
 * assume its data is there; this one is the answer to "is it there?", and to
 * the two questions immediately behind it — *which brain is in memory*, and
 * *what does changing it cost*. Until now those answers existed only as four
 * lines of copy on `/chat`, which could say the laptop was asleep but had
 * nowhere to say why or what to do about it.
 *
 * EVERY LIVE READING COMES FROM `/health`, AND NOTHING IS KEYED ON AN ITEM
 * -----------------------------------------------------------------------
 * The one rule item 9B set: *"a laptop missing its key must say so rather than
 * promising hands it does not have."* So `stage.tools` is never consulted for
 * what Atlas is *built* to do — it is read as what Atlas can do *right now*,
 * and `mcp.failed[].reason` is printed verbatim beside it, because the reason
 * is the only part anyone can act on. A laptop without the Firebase
 * service-account key reads "cannot reach your tasks" here and says which key.
 *
 * WHAT IS MEASURED HERE RATHER THAN REPORTED
 * ------------------------------------------
 * The round trip. Atlas cannot tell you how far away it is; the client is the
 * only end that knows when the request left, so `probeAtlas` times itself and
 * the store carries the number. It is cleared on a failed probe — a stale
 * "38 ms" beside "Asleep" would read as a live measurement of a machine that
 * did not answer.
 *
 * WHAT IS NEITHER, AND HOW IT IS LABELLED
 * ---------------------------------------
 * Three groups, kept apart on purpose:
 *
 *   1. **Benchmark readings** — tokens per second, cold load, GPU share. Taken
 *      by hand on 2026-09-02 and held in `lib/atlas/hostReadings.ts`; the
 *      screen prints the date every time it prints a number from that file.
 *      Nothing measures these at runtime and nothing pretends to.
 *   2. **Controls no session had built** — the spend ceilings (item 13) and
 *      the Gemini block (DESIGN.md §3.2). Shreekant's call was to draw them
 *      rather than leave gaps, so later items decorate this screen instead of
 *      rebuilding it. Both are real now: the ceilings since item 13A, and the
 *      block since BUILD-12, turned round into Downshift. **No value is
 *      invented for any of them** — an unmetered spend reads "—", not a
 *      plausible number, and a switch the laptop did not report is drawn
 *      off and inert rather than guessed.
 *   3. **What the mockup draws that this machine cannot know.** The laptop's
 *      charger/battery state and Ollama's version number are in
 *      `atlas-host.html` and are not in `/health`; the browser's own battery
 *      API describes the *tablet*, which is the wrong machine. Those two tiles
 *      are replaced by two Atlas does report — what Ollama has, and whether
 *      Atlas can reach the app — rather than filled in with a guess.
 *
 * The mockup's own Awake/Asleep and On-charger switches are labelled *"Demo
 * control. In the product this reflects the host."* — so neither is here. The
 * only control on the hero is a re-probe, which is the real version of that
 * gesture.
 *
 * THE HEADING IS THE TAILNET NAME, NOT "ASUS TUF A16"
 * ----------------------------------------------------
 * `atlas-host.html` heads the hero with the machine's model name. That name is
 * nowhere in `/health` — it is a fact about today's deployment, and DESIGN.md
 * §9 is explicit that moving Atlas to a Raspberry Pi or a VM must be *"a change
 * of address, not a rebuild"*. The host taken out of `baseUrl` is the same
 * identity, is reported rather than assumed, and follows Atlas when it moves.
 *
 * The `ProgressRing` sits inside a `Card`, whose `backdrop-filter` crops the
 * glow its `.prompt.md` asks for room around. Knowingly: the mockup does the
 * same, and so do the app's four existing rings — a lone exception here would
 * read as a mistake rather than as care.
 */
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button, Card, Icon, IconButton, MetaKicker, MiniNav, ProgressRing, Slider,
  StatusPill, Switch, Toast, Well, useMedia, WIDE, type IconName, type StatusName,
} from '../ui';
import { RailMark } from '../components/BrandMark';
import { useNavModel } from '../components/navModel';
import { useAtlasStore } from '../lib/atlas/atlasStore';
import {
  fetchCeilings,
  mcpReport,
  PROBE_TIMEOUT_MS,
  saveCeilings,
  type AtlasCeilings,
  type AtlasHealth,
} from '../lib/atlas/client';
import {
  BENCHMARK_MACHINE, READINGS_TAKEN_ON, UNVERIFIED, readingFor, type HostReading,
} from '../lib/atlas/hostReadings';
import { selectEffectiveModel, useModelStore } from '../lib/agent/modelStore';
import type { ModelOption } from '../lib/agent/models';
import { devHostFixture } from '../lib/devHostFixture';
import { copyHandoff } from '../lib/atlas/handoff';
import { devModelFixture } from '../lib/devModelFixture';
import { Z } from '../lib/zLayers';

/** The source's own column. Wider than Settings' 880 — the model rows need it. */
const COLUMN_PX = 1000;

/** Emerald that stays legible as a glyph on `--glass-tint-accent`. ChatPage's literal. */
const MARK_INK = 'oklch(0.93 0.07 162)';

interface ToastPayload {
  icon: IconName;
  title: string;
  detail?: string;
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */

/**
 * A settings section: a mono kicker and one idea in it.
 *
 * The mockup's own rule, kept: *"Never two — the moment a card carries two
 * decisions it becomes a control panel, which is what this screen is trying
 * not to be."* `notBuilt` is the second thing this screen needed that the
 * mockup did not: a panel whose controls are drawn and inert, saying which
 * session makes them real.
 */
function Panel({
  kicker, title, hint, right, tone, notBuilt, children,
}: {
  kicker: string;
  title: string;
  hint?: string;
  right?: React.ReactNode;
  tone?: 'warn';
  notBuilt?: string;
  children?: React.ReactNode;
}) {
  return (
    <Card
      style={{
        display: 'grid',
        gap: 'var(--sp-6)',
        ...(tone === 'warn'
          ? { backgroundImage: 'var(--glass-tint-amber)', boxShadow: 'var(--glass-rim-2), var(--glass-cast-2)' }
          : {}),
      }}
    >
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 'var(--sp-2)', flex: 1, minWidth: 180 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
            <MetaKicker>{kicker}</MetaKicker>
            {notBuilt !== undefined && (
              <StatusPill status="archived" size="sm" dot={false}>
                not built
              </StatusPill>
            )}
          </div>
          <h2
            style={{
              font: 'var(--type-title)', letterSpacing: 'var(--tracking-title)',
              color: 'var(--fg-1)', margin: 0,
            }}
          >
            {title}
          </h2>
          {hint !== undefined && (
            <p
              style={{
                font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)',
                margin: 0, maxWidth: '58ch', textWrap: 'pretty',
              }}
            >
              {hint}
            </p>
          )}
          {notBuilt !== undefined && (
            <p
              style={{
                font: 'var(--type-caption)', color: 'var(--status-review)',
                margin: 0, maxWidth: '58ch', textWrap: 'pretty',
              }}
            >
              {notBuilt}
            </p>
          )}
        </div>
        {right}
      </header>
      {children}
    </Card>
  );
}

/**
 * A labelled row inside a panel.
 *
 * The mockup's rule again: the explanation sits under the title, never a
 * switch with no consequence stated.
 */
function Row({
  icon, title, hint, control, tone,
}: {
  icon: IconName;
  title: string;
  hint: string;
  control: React.ReactNode;
  tone?: string;
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap',
        padding: 'var(--sp-5) var(--sp-6)', borderRadius: 'var(--r-lg)',
        backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'grid', placeItems: 'center', width: 34, height: 34, flex: '0 0 auto',
          borderRadius: '50%', backgroundImage: 'var(--glass-fill-2)',
          boxShadow: 'var(--glass-rim-2)', color: tone ?? 'var(--fg-3)',
        }}
      >
        <Icon name={icon} size={16} />
      </span>
      <div style={{ display: 'grid', gap: 2, flex: 1, minWidth: 200 }}>
        <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)' }}>{title}</span>
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>{hint}</span>
      </div>
      <span style={{ flex: '0 0 auto' }}>{control}</span>
    </div>
  );
}

/** One reading in a trough: the number, then what it is. */
function Reading({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <Well pad="var(--sp-4) var(--sp-5)" style={{ borderRadius: 'var(--r-sm)', display: 'grid', gap: 2 }}>
      <span
        style={{
          font: 'var(--type-numeric)', fontSize: 'var(--text-md)',
          color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
        {unit !== undefined && <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--fg-3)' }}> {unit}</span>}
      </span>
      <MetaKicker tone="var(--fg-4)">{label}</MetaKicker>
    </Well>
  );
}

/**
 * One model on the laptop.
 *
 * Three states that must not blur together: **selected** is Shreekant's choice
 * and lives in this browser (`modelStore`); **resident** is what Ollama has in
 * memory and comes from `/health`; and **has readings** is whether the
 * benchmark ever measured it. A model pulled since 2 September has no readings
 * and says so — the alternative is inventing numbers for it, which is the one
 * thing this screen exists not to do.
 */
function ModelCard({
  option, reading, resident, selected, numCtx, onSelect,
}: {
  option: ModelOption;
  reading: HostReading | null;
  resident: boolean;
  selected: boolean;
  numCtx: number | null;
  onSelect: () => void;
}) {
  const [open, setOpen] = useState(false);

  /* What Atlas will actually run at: it asks for its configured window and
     Ollama clamps to what the model declares, silently (DESIGN.md §2.4). */
  const window =
    reading === null || numCtx === null ? null : Math.min(numCtx, reading.maxContext);

  return (
    <div
      style={{
        display: 'grid', gap: 'var(--sp-5)', padding: 'var(--sp-6)',
        borderRadius: 'var(--r-lg)',
        backgroundImage: selected ? 'var(--glass-tint-accent)' : 'var(--glass-fill-1)',
        boxShadow: selected ? 'var(--glass-rim-2), var(--glow-accent-sm)' : 'var(--glass-rim-1)',
        transition: 'var(--t-hover)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flex: 1, minWidth: 200,
            border: 0, background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: 'grid', placeItems: 'center', width: 34, height: 34, flex: '0 0 auto',
              borderRadius: '50%', backgroundImage: 'var(--glass-fill-2)',
              boxShadow: 'var(--glass-rim-2)', color: selected ? MARK_INK : 'var(--fg-3)',
            }}
          >
            <Icon name="cpu" size={16} />
          </span>
          <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
            <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-md)', color: 'var(--fg-1)' }}>
              {option.label}
            </span>
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
              {reading === null
                ? `${option.detail} · no readings taken`
                : `${reading.inVram} in memory · ${reading.onGpu}% on the card${
                    window === null ? '' : ` · ${window.toLocaleString()} token window`
                  }`}
            </span>
          </span>
        </button>

        {resident ? (
          <StatusPill status="running" size="sm">resident</StatusPill>
        ) : (
          <StatusPill status="archived" size="sm" dot={false}>on disk</StatusPill>
        )}

        {reading !== null && (
          <IconButton
            label={open ? 'Hide readings' : 'Readings'}
            title={`Readings, measured ${READINGS_TAKEN_ON}`}
            variant="ghost"
            size="sm"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <Icon
              name="chevron-down"
              size={15}
              style={{
                transform: open ? 'rotate(180deg)' : 'none',
                transition: 'transform var(--dur-base) var(--ease-morph)',
              }}
            />
          </IconButton>
        )}
      </div>

      {/* The 0fr → 1fr grid morph, which is how every expander in this app
          opens without measuring a height in JavaScript. */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: open && reading !== null ? '1fr' : '0fr',
          transition: 'grid-template-rows var(--dur-morph) var(--ease-morph)',
        }}
      >
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          {reading !== null && (
            <div style={{ display: 'grid', gap: 'var(--sp-5)', paddingTop: 'var(--sp-2)' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))',
                  gap: 'var(--sp-4)',
                }}
              >
                <Reading label="on charger" value={reading.chargerTps.toFixed(1)} unit="tok/s" />
                <Reading label="on battery" value={reading.batteryTps.toFixed(1)} unit="tok/s" />
                <Reading label="cold load" value={reading.coldLoad} />
                <Reading label="on disk" value={reading.onDisk} />
              </div>

              <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
                {reading.capabilities.map((capability) => {
                  const unproven = reading.unverified?.includes(capability) ?? false;
                  return (
                    <span
                      key={capability}
                      style={{
                        display: 'inline-flex', alignItems: 'center', height: 26,
                        padding: '0 var(--sp-4)', borderRadius: 'var(--r-pill)',
                        backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
                        font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
                        textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'],
                        color: unproven ? 'var(--status-review)' : 'var(--fg-3)',
                      }}
                    >
                      {/* Capitalised by hand since V3-9: V3 drops the kicker's
                          capitals, and the readings spell these in lower case. */}
                      {capability.charAt(0).toUpperCase() + capability.slice(1)}
                      {unproven ? ' · unverified' : ''}
                    </span>
                  );
                })}
              </div>

              <p
                style={{
                  font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)',
                  margin: 0, maxWidth: '62ch', textWrap: 'pretty',
                }}
              >
                {reading.note}
              </p>
              <MetaKicker icon="hourglass" tone="var(--fg-4)">
                measured {READINGS_TAKEN_ON}
              </MetaKicker>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The four readings across the hero.
 *
 * Two are the mockup's own — the tailnet and the round trip. Two replace
 * tiles it draws that this machine cannot know: the laptop's power state and
 * Ollama's version. What went in their place is what Atlas *does* report and
 * what actually changes a day: whether Ollama answered, and whether Atlas can
 * reach the app's data.
 */
function heroTiles(
  awake: boolean,
  host: string | null,
  health: AtlasHealth | null,
  roundTripMs: number | null,
): { key: string; icon: IconName; value: string; hint: string; tone: string }[] {
  const mcp = health === null ? { connected: [], failed: [] } : mcpReport(health);
  const toolsUp = health?.stage.tools ?? false;
  const failure = mcp.failed[0];

  return [
    {
      key: 'tailscale',
      icon: 'shield-check',
      value: awake ? host ?? 'reachable' : 'unreachable',
      hint: awake
        ? 'private network · no open ports'
        : `no answer within ${(PROBE_TIMEOUT_MS / 1000).toFixed(1)}s`,
      tone: awake ? 'var(--accent)' : 'var(--fg-4)',
    },
    {
      key: 'round trip',
      icon: 'activity',
      value: roundTripMs === null ? '—' : `${roundTripMs} ms`,
      hint: 'this device → the host',
      tone: roundTripMs === null ? 'var(--fg-4)' : 'var(--fg-1)',
    },
    /*
     * The last two are readings ABOUT the host, so a sleeping host has none of
     * them — not a bad one. "Ollama: not reachable" beside "Asleep" reads as a
     * second, separate fault, and "no hands" reads as a fixable one; both are
     * just the first line said twice. So they go blank and say what they are
     * waiting for.
     */
    {
      key: 'ollama',
      icon: 'hard-drive',
      value: !awake
        ? '—'
        : health?.ollama.reachable
          ? `${health.ollama.models} model${health.ollama.models === 1 ? '' : 's'}`
          : 'not reachable',
      hint: !awake
        ? 'the engine the local models run in'
        : health?.ollama.reachable
          ? 'one model resident at a time'
          : health?.ollama.error ?? 'Atlas is up and the model engine beneath it is not',
      tone: !awake
        ? 'var(--fg-4)'
        : health?.ollama.reachable
          ? 'var(--fg-1)'
          : 'var(--status-review)',
    },
    {
      key: 'tools',
      icon: 'wrench',
      /* `stage.tools` read as "right now", never as a build stage. An Atlas
         that is up with no MCP server can talk and cannot act, and the reason
         underneath is the only half anybody can fix. */
      value: !awake ? '—' : toolsUp ? `${mcp.connected.length} connected` : 'no hands',
      hint: !awake
        ? 'whether Atlas can reach your tasks'
        : toolsUp
          ? mcp.connected.join(', ') || 'Atlas can read and change your tasks'
          : failure
            ? `${failure.name}: ${failure.reason}`
            : 'Atlas is answering and no MCP server connected',
      tone: !awake ? 'var(--fg-4)' : toolsUp ? 'var(--accent)' : 'var(--status-review)',
    },
  ];
}

/* ------------------------------------------------------------------ */

export default function AtlasHostPage() {
  const navigate = useNavigate();
  const wide = useMedia(WIDE);
  const nav = useNavModel();

  const status = useAtlasStore((s) => s.status);
  const baseUrl = useAtlasStore((s) => s.baseUrl);
  const health = useAtlasStore((s) => s.health);
  const roundTripMs = useAtlasStore((s) => s.roundTripMs);
  const probe = useAtlasStore((s) => s.probe);
  const setSnapshot = useAtlasStore((s) => s.setSnapshot);

  const local = useModelStore((s) => s.local);
  const select = useModelStore((s) => s.select);
  const refreshModels = useModelStore((s) => s.refresh);
  const setCatalogue = useModelStore((s) => s.setCatalogue);
  /* The same selector `/chat`'s header reads, so the two screens can never
     disagree about which model answers next. It returns an entry out of the
     lists rather than a fresh object, which is what keeps it a safe selector. */
  const chosen = useModelStore(selectEffectiveModel);

  const [toast, setToast] = useState<ToastPayload | null>(null);
  const [checking, setChecking] = useState(false);

  /*
   * ITEM 13A — THE TWO SPENDING CEILINGS AND THE METER (DESIGN.md §3.4).
   *
   * Held here rather than read off `health.spend`, even though `/health`
   * carries every field of it, because this screen **writes** them: a slider
   * whose value came from a poll would snap back to the old number between the
   * drag and the next poll landing. `/health` is how *other* screens learn the
   * ceilings; this is the screen that sets them.
   *
   * `null` covers three states that mean the same thing here — a sleeping
   * laptop, an Atlas too old to have ceilings (404), and one that could not
   * open its data directory (503). The panel keeps 9B's "not built" treatment
   * for all three rather than drawing a slider parked on an invented number.
   */
  const [fetchedCeilings, setCeilings] = useState<AtlasCeilings | null>(null);

  /*
   * **Derived at render rather than cleared in the effect**, which is not a
   * style preference: a laptop that went to sleep has to stop this panel
   * showing last week's total *this* render, and an effect that reacts to it
   * paints the stale figure once before correcting itself. It is also what
   * `react-hooks/set-state-in-effect` is pointing at — a `setState` in an
   * effect body is a second render doing what one render could have done.
   */
  const ceilings = baseUrl === null || status !== 'awake' ? null : fetchedCeilings;

  useEffect(() => {
    if (baseUrl === null || status !== 'awake') return;
    const controller = new AbortController();
    void fetchCeilings(baseUrl, controller.signal)
      .then(setCeilings)
      .catch(() => setCeilings(null));
    return () => controller.abort();
  }, [baseUrl, status]);

  /**
   * Moves a slider and writes it through.
   *
   * Optimistic, for the reason every control on a tailnet has to be: waiting
   * for the laptop to answer before the thumb moves feels broken. A failed
   * write re-reads rather than leaving the slider showing a number nothing
   * agreed to, and says so — this is the screen where the money lives, and a
   * ceiling he believes he set and did not is the one wrong outcome here.
   */
  const moveCeiling = useCallback(
    (next: { monthlyRupees?: number; perTurnRupees?: number }) => {
      if (baseUrl === null) return;
      setCeilings((current) => (current === null ? current : { ...current, ceilings: { ...current.ceilings, ...next } }));
      void saveCeilings(baseUrl, next)
        .then(setCeilings)
        .catch(() => {
          setToast({
            icon: 'triangle-alert',
            title: 'Not saved',
            detail: 'The laptop did not take that. Showing what it actually holds.',
          });
          void fetchCeilings(baseUrl).then(setCeilings).catch(() => setCeilings(null));
        });
    },
    [baseUrl],
  );

  /*
   * BUILD-12: Downshift, written through the same route as the ceilings and
   * for the same reason they are held here. Optimistic, and a failed write
   * re-reads rather than leaving the switch showing a setting nothing agreed
   * to. **Then a fresh probe**, because `/chat` and the side panel route on
   * `health.spend.downshift`: without it a Gemini pick would keep running in
   * this browser until the next poll.
   */
  const flipDownshift = useCallback(
    (on: boolean) => {
      if (baseUrl === null) return;
      setCeilings((current) => (current === null ? current : { ...current, downshift: on }));
      void saveCeilings(baseUrl, { downshift: on })
        .then((saved) => {
          setCeilings(saved);
          void probe();
          setToast(
            on
              ? { icon: 'laptop', title: 'Downshift is on', detail: 'Nothing runs on a paid model. A Gemini pick runs on the laptop instead.' }
              : { icon: 'sparkles', title: 'Downshift is off', detail: 'A Gemini pick runs on Gemini again.' },
          );
        })
        .catch(() => {
          setToast({
            icon: 'triangle-alert',
            title: 'Not saved',
            detail: 'The laptop did not take that. Showing what it actually holds.',
          });
          void fetchCeilings(baseUrl).then(setCeilings).catch(() => setCeilings(null));
        });
    },
    [baseUrl, probe],
  );

  /* BUILD-12: this screen has no chat open, so its Copy takes the one he
     last touched — the one he has just given up on. Each chat carries its
     own button in `/chat`'s header. */
  const [copying, setCopying] = useState(false);
  const copyLatestHandoff = () => {
    if (baseUrl === null) return;
    setCopying(true);
    void copyHandoff(baseUrl, null)
      .then((title) =>
        setToast({ icon: 'copy', title: 'Hand-off prompt copied', detail: `From “${title}”. Paste it into any other AI chat.` }),
      )
      .catch((err: unknown) =>
        setToast({ icon: 'triangle-alert', title: 'Not copied', detail: err instanceof Error ? err.message : String(err) }),
      )
      .finally(() => setCopying(false));
  };

  /*
   * Ask the laptop, then list its models. Same order and the same reason as
   * `/chat`: the local list *comes from* Atlas, so a probe that has not landed
   * would have this screen announce a sleeping laptop a beat before finding
   * out that it is awake.
   *
   * `devHostFixture` and `devModelFixture` are the harness's way in, guarded
   * and proved out of `dist/` by `scripts/check-shots-bypass.mjs`. Every fact
   * on this screen arrives over a network the harness blocks, so without them
   * there is exactly one photographable state and it is the empty one.
   */
  useEffect(() => {
    if (import.meta.env.DEV) {
      const host = devHostFixture(window.location.search);
      const models = devModelFixture(window.location.search);
      if (host || models) {
        if (host) setSnapshot(host);
        if (models) setCatalogue(models);
        return;
      }
    }
    void probe().then(() => refreshModels());
  }, [probe, refreshModels, setSnapshot, setCatalogue]);

  const recheck = () => {
    setChecking(true);
    void probe()
      .then(() => refreshModels())
      .finally(() => setChecking(false));
  };

  const awake = status === 'awake';
  const unconfigured = status === 'unconfigured';

  /* The tailnet name, which is the identity Atlas keeps when it moves
     machines. `URL` throws on a malformed override, and a bad value in
     localStorage must not blank the screen that would explain it. */
  let host: string | null = null;
  if (baseUrl !== null) {
    try {
      host = new URL(baseUrl).hostname.split('.')[0] ?? null;
    } catch {
      host = baseUrl;
    }
  }

  const resident = health?.ollama.loaded ?? [];
  const onGemini = chosen.provider === 'gemini';
  const ringReading = awake ? readingFor(resident[0] ?? '') : null;

  const pill: { status: StatusName; label: string; line: string } = unconfigured
    ? {
        status: 'archived',
        label: 'No host',
        line: 'Nothing points this app at an Atlas. Set VITE_ATLAS_URL on the deployment, or the mutineer_atlas_url key on this device.',
      }
    : awake
      ? {
          status: 'running',
          label: 'Awake',
          line: 'Reachable from this device over Tailscale.',
        }
      : {
          status: 'archived',
          label: 'Asleep',
          line: 'The laptop lid is shut, or it is off the tailnet. You are talking to the basic assistant.',
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
          <div
            style={{
              width: '100%', maxWidth: COLUMN_PX, margin: '0 auto',
              display: 'grid', gap: 'var(--sp-8)',
            }}
          >
            <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
              <div style={{ display: 'grid', gap: 'var(--sp-2)', flex: 1, minWidth: 220 }}>
                <MetaKicker>The program on your laptop</MetaKicker>
                <h1
                  style={{
                    font: 'var(--type-display)', fontSize: 'var(--text-2xl)',
                    letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)', margin: 0,
                  }}
                >
                  Atlas host
                </h1>
              </div>
              <IconButton
                label="Check again"
                title="Ask the laptop again"
                variant="ghost"
                disabled={checking}
                onClick={recheck}
              >
                <Icon
                  name="refresh-cw"
                  size={18}
                  style={checking ? { animation: 'ag-spin 900ms linear infinite' } : undefined}
                />
              </IconButton>
              <Button
                size="sm"
                variant="glass"
                iconLeft={<Icon name="sparkles" size={15} />}
                onClick={() => navigate('/chat')}
              >
                Back to Atlas
              </Button>
            </header>

            {/* ── The connection. One hero card, because "is Atlas reachable"
                   is the only question this screen answers before any other. ── */}
            <section
              style={{
                display: 'grid', gap: 'var(--sp-8)', padding: 'var(--pad-card-lg)',
                borderRadius: 'var(--r-card-lg)',
                backgroundImage: 'var(--glass-fill-2)',
                backdropFilter: 'var(--glass-bd-lg-refract)',
                WebkitBackdropFilter: 'var(--glass-bd-lg)',
                boxShadow: awake
                  ? 'var(--glass-rim-3), var(--glass-inner-1), var(--glass-cast-3)'
                  : 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-2)',
                animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-7)', flexWrap: 'wrap' }}>
                <span
                  aria-hidden="true"
                  style={{
                    position: 'relative', display: 'grid', placeItems: 'center',
                    width: 64, height: 64, flex: '0 0 auto', borderRadius: '50%',
                    backgroundImage: awake ? 'var(--glass-tint-accent)' : 'var(--glass-fill-1)',
                    boxShadow: awake ? 'var(--glass-rim-2), var(--glow-accent-md)' : 'var(--glass-rim-1)',
                    color: awake ? MARK_INK : 'var(--fg-4)',
                  }}
                >
                  <Icon name={awake ? 'server' : 'moon'} size={26} />
                  {awake && (
                    <span
                      style={{
                        position: 'absolute', inset: -6, borderRadius: '50%',
                        border: '1px solid var(--accent-hairline)',
                        animation: 'var(--kf-ripple) 2800ms var(--ease-glass) infinite',
                      }}
                    />
                  )}
                </span>

                <div style={{ display: 'grid', gap: 'var(--sp-3)', flex: 1, minWidth: 240 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
                    <h2
                      style={{
                        font: 'var(--type-title)', fontSize: 'var(--text-xl)',
                        letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)', margin: 0,
                      }}
                    >
                      {host ?? 'Atlas'}
                    </h2>
                    <StatusPill status={pill.status} size="sm">{pill.label}</StatusPill>
                    {health !== null && (
                      <MetaKicker tone="var(--fg-4)">atlas {health.version}</MetaKicker>
                    )}
                  </div>
                  <p
                    style={{
                      font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)',
                      margin: 0, maxWidth: '52ch', textWrap: 'pretty',
                    }}
                  >
                    {pill.line}
                  </p>
                </div>
              </div>

              {!unconfigured && (
                <div
                  style={{
                    display: 'grid',
                    /* 150 rather than the mockup's 180: at 180 the fourth tile
                       wrapped onto a row of its own at 820 wide, which reads as
                       a tile that failed rather than as a fourth reading. There
                       are four items and `auto-fit` collapses empty tracks, so a
                       wide window still lays out four and not five. */
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: 'var(--sp-4)',
                  }}
                >
                  {heroTiles(awake, host, health, roundTripMs).map((tile) => (
                    <div
                      key={tile.key}
                      style={{
                        display: 'grid', gap: 'var(--sp-2)',
                        padding: 'var(--sp-5) var(--sp-6)', borderRadius: 'var(--r-lg)',
                        backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
                        <span aria-hidden="true" style={{ display: 'flex', color: tile.tone, flex: '0 0 auto' }}>
                          <Icon name={tile.icon} size={14} />
                        </span>
                        <MetaKicker tone="var(--fg-4)">{tile.key}</MetaKicker>
                      </span>
                      <span
                        style={{
                          font: 'var(--type-numeric)', fontSize: 'var(--text-md)',
                          color: tile.tone, fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {tile.value}
                      </span>
                      <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
                        {tile.hint}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
                {/* What Atlas ASKS for. Each model row shows what it actually
                    gets, which is this clamped to that model's declared ceiling —
                    silently, by Ollama (DESIGN.md §2.4). */}
                {health !== null && (
                  <MetaKicker icon="layers" tone="var(--fg-4)">
                    context window · {health.numCtx.toLocaleString()} tokens
                  </MetaKicker>
                )}
                <span style={{ flex: 1 }} />
                <span
                  style={{
                    font: 'var(--type-caption)', color: 'var(--fg-4)',
                    maxWidth: '48ch', textWrap: 'pretty',
                  }}
                >
                  Public tunnels are refused by design. Only your own devices can reach this host.
                </span>
              </div>
            </section>

            {/* ── The fallback, when there is nothing to fall back from ── */}
            {!awake && !unconfigured && (
              <Panel
                tone="warn"
                kicker="Fallback"
                title="You are talking to the basic assistant"
                hint="The in-browser Gemini agent still adds a task and reads your backlog. It cannot reach anything that lives on the host, and it never queues work silently — a request either lands now or is refused now."
                right={
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'grid', placeItems: 'center', width: 40, height: 40,
                      borderRadius: '50%', backgroundImage: 'var(--glass-fill-2)',
                      boxShadow: 'var(--glass-rim-2)', color: 'var(--status-review)',
                    }}
                  >
                    <Icon name="wifi-off" size={18} />
                  </span>
                }
              >
                {/*
                  The mockup puts two switches here — "use the basic assistant"
                  and "wake the host when the lid opens". Neither is a setting:
                  the fallback is automatic and unconditional (`ChatPage`
                  routes on `atlasStatus`, with nothing to turn off), and
                  nothing anywhere can wake a sleeping laptop over a network it
                  is not on. Stated as behaviour rather than drawn as a control
                  that would do nothing.
                */}
                <Row
                  icon="git-branch"
                  title="The switch happens on its own"
                  hint="Every conversation probes the host first and routes to whichever assistant answered. There is nothing to turn on."
                  control={<MetaKicker tone="var(--status-review)">automatic</MetaKicker>}
                />
              </Panel>
            )}

            {/* ── Model residency ── */}
            <Panel
              kicker="The brain"
              title="Model residency"
              hint="One model sits in memory at a time on this machine, and a swap costs a cold load. The main model never changes on its own — only you change it, here or in the chat's picker."
              right={
                ringReading !== null ? (
                  <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--sp-2)' }}>
                    <ProgressRing
                      value={ringReading.onGpu}
                      max={100}
                      size={72}
                      thickness={7}
                      tone={ringReading.onGpu === 100 ? 'accent' : 'amber'}
                    />
                    <MetaKicker tone="var(--fg-4)">on the card</MetaKicker>
                  </div>
                ) : undefined
              }
            >
              {local.length === 0 ? (
                <Well style={{ display: 'grid', gap: 'var(--sp-3)' }}>
                  <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)' }}>
                    {unconfigured
                      ? 'No Atlas host is configured, so there is no laptop to ask.'
                      : awake
                        ? 'Atlas is up but listed no models with tool support. A model that cannot call a tool answers every request by describing what it would do, so the picker leaves it out.'
                        : 'The laptop is not answering, so its models cannot be listed.'}
                  </span>
                  <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
                    The list comes from Ollama on the host — there is no second place to read it from.
                  </span>
                </Well>
              ) : (
                <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
                  {local.map((option) => {
                    const reading = readingFor(option.id);
                    return (
                      <ModelCard
                        key={option.key}
                        option={option}
                        reading={reading}
                        resident={resident.includes(option.id)}
                        selected={chosen.key === option.key}
                        numCtx={health?.numCtx ?? null}
                        onSelect={() => {
                          if (chosen.key === option.key) return;
                          select(option.key);
                          setToast({
                            icon: 'cpu',
                            title: `${option.label} selected`,
                            detail:
                              reading === null
                                ? 'It loads on your next turn, evicting the model in memory.'
                                : `It loads on your next turn — a cold load takes ${reading.coldLoad} and evicts the model in memory.`,
                          });
                        }}
                      />
                    );
                  })}
                </div>
              )}

              {onGemini && local.length > 0 && (
                <MetaKicker icon="sparkles" tone="var(--status-review)">
                  your chat is on {chosen.label} — pick one here to move it to the laptop
                </MetaKicker>
              )}

              <p
                style={{
                  font: 'var(--type-caption)', color: 'var(--fg-4)', margin: 0,
                  maxWidth: '68ch', textWrap: 'pretty',
                }}
              >
                A failed swap retries twice, then Atlas carries on with the model already loaded
                rather than failing your turn, and says which one answered. Sub-agents share the
                resident model — they buy clean context, not speed.
              </p>
            </Panel>

            {/* ── Downshift (BUILD-12) ─────────────────────────────────
                9B drew this as "Off-site — Escalation to Gemini": a block
                switch, a decompose-instead rule and a Copy button, all inert.
                It turned round because the queue makes the cloud model prime
                (BIG-1): with nothing to escalate *to*, the switch is his
                "do not spend money, push it down" instead. **The decompose
                row is gone, his call (2026-09-24)** — teaching the local
                model to break a problem up is its own piece of work and
                would need its own benchmark, and a row promising it would be
                a claim nothing keeps.

                The switch reads `ceilings.downshift`, which only an Atlas
                built at BUILD-12 sends; an older one, or a sleeping laptop,
                draws it off and inert rather than guessed. */}
            <Panel
              kicker="Downshift"
              title="Keep it on the laptop"
              hint="On, nothing runs on a paid cloud model. Anything that would have gone to Gemini runs on the laptop's own model instead, and the chat says so each time. When the laptop is asleep, the basic assistant still answers."
              right={
                <Switch
                  checked={ceilings?.downshift ?? false}
                  disabled={ceilings?.downshift === undefined}
                  onChange={flipDownshift}
                  label={ceilings?.downshift === undefined ? 'Unavailable' : ceilings.downshift ? 'On' : 'Off'}
                />
              }
            >
              {ceilings !== null && ceilings.downshift === undefined && (
                <p style={{ font: 'var(--type-caption)', color: 'var(--status-review)', margin: 0, textWrap: 'pretty' }}>
                  This Atlas is older than Downshift. Restart it on the laptop to pick up the new build.
                </p>
              )}
              <Row
                icon="key-round"
                title="Atlas's own cloud key"
                hint={
                  health?.gemini.configured ?? false
                    ? "Set in Atlas's .env on the laptop, so Atlas can run Gemini when asked — unless Downshift is on."
                    : "None is set in Atlas's .env, so Atlas cannot run a cloud model at all yet. The keys in Settings belong to the basic assistant in this browser."
                }
                control={
                  <MetaKicker tone={health?.gemini.configured ?? false ? 'var(--accent)' : 'var(--fg-4)'}>
                    {health === null ? 'not known' : health.gemini.configured ? 'configured' : 'no key'}
                  </MetaKicker>
                }
              />
              <Row
                icon="lock"
                title="Mail never leaves the laptop"
                hint="The rule is settled and there is no mailbox to apply it to yet. Item 22 (step 35) connects Gmail, and the action log will record whatever goes upstream."
                tone="var(--accent)"
                control={<MetaKicker tone="var(--fg-4)">no mailbox yet</MetaKicker>}
              />
              <Row
                icon="copy"
                title="Hand-off prompt"
                hint="Copies your most recent Atlas chat, with every question, what Atlas tried and what came back, ready to paste into any other AI. Each chat also has its own Copy button at the top."
                control={
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!awake || copying}
                    onClick={copyLatestHandoff}
                    iconLeft={<Icon name="copy" size={14} />}
                  >
                    Copy
                  </Button>
                }
              />
            </Panel>

            {/* ── Money — real since item 13A (DESIGN.md §3.4) ────────────
                9B drew this panel under the "not built" treatment because
                nothing was counting and nothing was capped, and its own note
                said a slider parked on an invented number is worse than an em
                dash. Both halves are settled now: the ledger counts every
                hosted turn and the two ceilings stop them.

                **The em-dash rule did not go away with the "not built" pill.**
                A sleeping laptop, an Atlas too old to have ceilings, and one
                that could not open its data directory all still read "—" here
                — `ceilings === null` — because "nothing is being counted" is
                not the same claim as "nothing has been spent". */}
            <Panel
              kicker="Money"
              title="Spend"
              hint="Local turns are free. Only escalated turns cost anything, and three multipliers — Atlas choosing its own brain, loops, and helpers — are why the ceilings exist."
              notBuilt={
                ceilings === null
                  ? 'Nothing is being counted right now — the laptop is not answering, or Atlas could not open the folder it keeps this in. That is not the same as nothing having been spent, so this reads “—”.'
                  : undefined
              }
            >
              <Well pad="var(--sp-7)" style={{ display: 'grid', gap: 'var(--sp-4)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
                  <span style={{ display: 'grid', gap: 'var(--sp-2)', flex: 1, minWidth: 160 }}>
                    <MetaKicker icon="indian-rupee" tone="var(--fg-4)">this month</MetaKicker>
                    <span
                      style={{
                        font: 'var(--type-metric)', fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-3xl)', letterSpacing: 'var(--tracking-display)',
                        color: ceilings === null ? 'var(--fg-4)' : 'var(--fg-1)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {ceilings === null ? '₹—' : `₹${ceilings.month.rupees.toFixed(2)}`}
                    </span>
                  </span>
                  {ceilings !== null && (
                    <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>
                      of ₹{ceilings.ceilings.monthlyRupees} ·{' '}
                      {Math.round((ceilings.month.rupees / ceilings.ceilings.monthlyRupees) * 100)}%
                    </span>
                  )}
                </div>

                {/* The bar, drawn only against a real total. `Math.min` caps
                    the fill and not the reading: he can be over his ceiling —
                    every turn past it took a tap — and the number above says
                    so even when the bar has nowhere left to go. */}
                {ceilings !== null && (
                  <div
                    style={{
                      position: 'relative', height: 8, borderRadius: 'var(--r-pill)',
                      backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
                      overflow: 'hidden',
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute', inset: '0 auto 0 0',
                        width: `${Math.min(100, (ceilings.month.rupees / ceilings.ceilings.monthlyRupees) * 100)}%`,
                        borderRadius: 'var(--r-pill)',
                        background: 'linear-gradient(90deg, oklch(0.70 0.15 162 / 0.5), var(--accent))',
                        boxShadow: '0 0 14px -2px oklch(0.70 0.15 162 / 0.6)',
                        transition: 'width var(--dur-base) var(--ease-glass)',
                      }}
                    />
                  </div>
                )}

                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
                  {ceilings === null
                    ? 'No turn has been metered. The $300 Google credit is half expired and is not part of the plan.'
                    : ceilings.month.turns === 0
                      ? 'No turn has gone to a hosted model this month. Everything on your laptop is free. The $300 Google credit is half expired and is not part of the plan.'
                      : /* The unpriced count is said out loud rather than folded
                           in, because it changes what the total *means*: a month
                           with one of these in it has spent at least this, not
                           exactly this. `agent/pricing.ts`'s rule. */
                        `${ceilings.month.turns} escalated ${ceilings.month.turns === 1 ? 'turn' : 'turns'} this month.` +
                        (ceilings.month.unpriced > 0
                          ? ` ${ceilings.month.unpriced} of them ran on a model with no recorded price, so the total is at least this and not exactly this.`
                          : '') +
                        ' The $300 Google credit is half expired and is not part of the plan.'}
                </span>
              </Well>

              {/* The two sliders. Both write the same settings Atlas hands the
                  chat page — the per-turn one is drawn there too, in the tuning
                  popover, and it is **one setting on two screens** rather than
                  two. A value per screen would be two ceilings that disagree,
                  with whichever he happened to be looking at winning by
                  accident. */}
              <div
                style={{
                  display: 'grid', gap: 'var(--sp-6)',
                  padding: 'var(--sp-6) var(--sp-6) var(--sp-7)', borderRadius: 'var(--r-lg)',
                  backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-4)' }}>
                  <span style={{ font: 'var(--type-label)', color: 'var(--fg-2)', flex: '0 0 auto' }}>
                    Monthly ceiling
                  </span>
                  <span style={{ flex: 1 }} />
                  <span
                    style={{
                      font: 'var(--type-numeric)', fontSize: 'var(--text-md)',
                      color: ceilings === null ? 'var(--fg-4)' : 'var(--fg-1)',
                    }}
                  >
                    {ceilings === null ? 'not set' : `₹${ceilings.ceilings.monthlyRupees}`}
                  </span>
                </div>
                <Slider
                  min={ceilings?.bounds.monthly.min ?? 100}
                  max={ceilings?.bounds.monthly.max ?? 2000}
                  step={50}
                  value={ceilings?.ceilings.monthlyRupees ?? 500}
                  disabled={ceilings === null}
                  onValueChange={(rupees) => moveCeiling({ monthlyRupees: rupees })}
                  showValue={false}
                  label="Monthly ceiling in rupees"
                  valueText={`${ceilings?.ceilings.monthlyRupees ?? 500} rupees`}
                />
                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
                  At the ceiling every hosted turn asks for a tap before it runs. It is not a stop —
                  being asked beats having Atlas quietly decline.
                </span>

                <div style={{ height: 1, background: 'var(--line-faint)' }} />

                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-4)' }}>
                  <span style={{ font: 'var(--type-label)', color: 'var(--fg-2)', flex: '0 0 auto' }}>
                    Stop a turn at
                  </span>
                  <span style={{ flex: 1 }} />
                  <span
                    style={{
                      font: 'var(--type-numeric)', fontSize: 'var(--text-md)',
                      color: ceilings === null ? 'var(--fg-4)' : 'var(--fg-1)',
                    }}
                  >
                    {ceilings === null ? 'not set' : `₹${ceilings.ceilings.perTurnRupees}`}
                  </span>
                </div>
                <Slider
                  min={ceilings?.bounds.perTurn.min ?? 1}
                  max={ceilings?.bounds.perTurn.max ?? 20}
                  step={1}
                  value={ceilings?.ceilings.perTurnRupees ?? 5}
                  disabled={ceilings === null}
                  onValueChange={(rupees) => moveCeiling({ perTurnRupees: rupees })}
                  showValue={false}
                  label="Per-turn ceiling in rupees"
                  valueText={`${ceilings?.ceilings.perTurnRupees ?? 5} rupees`}
                />
                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
                  At the ceiling Atlas stops, says what it was doing, and offers to continue. Each
                  tap buys another turn's worth. Helpers count against the same number.
                </span>
              </div>
            </Panel>

            {/* ── What is still unproven, recorded on the screen rather than
                   in a document. §12 exists because a list of assumptions
                   nobody sees becomes a list of facts. ── */}
            <Panel
              kicker="Unverified"
              title="Not yet proven on this machine"
              hint={`Benchmarked ${READINGS_TAKEN_ON} on ${BENCHMARK_MACHINE}. These three were not.`}
            >
              <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
                {UNVERIFIED.map((entry) => (
                  <div
                    key={entry.question}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)',
                      padding: 'var(--sp-5) var(--sp-6)', borderRadius: 'var(--r-lg)',
                      backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{ display: 'flex', color: 'var(--fg-4)', flex: '0 0 auto', marginTop: 2 }}
                    >
                      <Icon name={entry.icon} size={16} />
                    </span>
                    <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                      <span
                        style={{
                          font: 'var(--type-body)', fontSize: 'var(--text-sm)',
                          color: 'var(--fg-1)', textWrap: 'pretty',
                        }}
                      >
                        {entry.question}
                      </span>
                      <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
                        {entry.why}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </Panel>

            <p
              style={{
                font: 'var(--type-caption)', color: 'var(--fg-4)', textAlign: 'center',
                maxWidth: '56ch', margin: '0 auto', textWrap: 'pretty',
              }}
            >
              Atlas does not assume it is on this laptop. Moving it to a Raspberry Pi or a cheap VM
              later is a change of address, not a rebuild.
            </p>
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
