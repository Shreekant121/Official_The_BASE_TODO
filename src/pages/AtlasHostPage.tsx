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
 *      the Gemini block (DESIGN.md §3.2). Both were built (13A, BUILD-12's
 *      Downshift) and both were removed with the AI spending (OPT-4,
 *      2026-10-06), his call. The panel that held Downshift keeps its rows
 *      about what leaves the laptop.
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
 * The share of the model on the graphics card was a ring until 29-1P14d2:
 * every progress ring left in BASE is replaced by its number (his call), so
 * it reads "100%" in lime when it all fits and in the warning grey when not.
 *
 * WAITING (29-1P14d2, idea 116)
 * -----------------------------
 * Until the first probe lands the status is `unknown`, and this screen used
 * to draw it as asleep — the lid-shut panel and "the laptop is not
 * answering" for a beat before finding it awake. It waits in the shape of
 * what is coming now: the pill, the line and the four tiles as placeholders,
 * model cards on their way, and the real ones fade in over them.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bone, Button, Card, Icon, IconButton, MetaKicker, MiniNav, SkeletonRows, SoftButton,
  StatusPill, Toast, useArrival, Well, useMedia, WIDE, type IconName, type StatusName,
} from '../ui';
import { RailMark } from '../components/BrandMark';
import { useNavModel } from '../components/navModel';
import { useAtlasStore } from '../lib/atlas/atlasStore';
import { mcpReport, PROBE_TIMEOUT_MS, type AtlasHealth } from '../lib/atlas/client';
import {
  READINGS_TAKEN_ON, readingFor, type HostReading,
} from '../lib/atlas/hostReadings';
import { selectEffectiveModel, useModelStore } from '../lib/agent/modelStore';
import type { ModelOption } from '../lib/agent/models';
import { devHostFixture } from '../lib/devHostFixture';
import { copyHandoff } from '../lib/atlas/handoff';
import { devModelFixture } from '../lib/devModelFixture';
import { Z } from '../lib/zLayers';

/** The source's own column. Wider than Settings' 880 — the model rows need it. */
const COLUMN_PX = 1000;

/** Atlas's violet, legible as a glyph on `--glass-tint-violet` (29-1P2c3; it was emerald). */
const MARK_INK = 'var(--job-violet-text)';

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
 * not to be."*
 */
function Panel({
  kicker, title, hint, right, tone, children,
}: {
  kicker: string;
  title: string;
  hint?: string;
  right?: React.ReactNode;
  tone?: 'warn';
  children?: React.ReactNode;
}) {
  return (
    <Card
      style={{
        display: 'grid',
        gap: 'var(--sp-6)',
        /* A warning panel is quiet since 29-1P2c2: grey glass, its icon the signal. */
        ...(tone === 'warn'
          ? { backgroundImage: 'var(--glass-tint-warn)', boxShadow: 'var(--glass-rim-2), var(--glass-cast-2)' }
          : {}),
      }}
    >
      <header style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
        <div style={{ display: 'grid', gap: 'var(--sp-2)', flex: 1, minWidth: 180 }}>
          <MetaKicker>{kicker}</MetaKicker>
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
        backgroundImage: selected ? 'var(--glass-tint-lime)' : 'var(--glass-fill-1)',
        boxShadow: selected ? 'var(--glass-rim-2), var(--job-lime-shine)' : 'var(--glass-rim-1)',
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
              boxShadow: 'var(--glass-rim-2)', color: selected ? 'var(--job-lime-text)' : 'var(--fg-3)',
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
          <StatusPill status="atlas" size="sm">resident</StatusPill>
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
                        color: unproven ? 'var(--status-warn)' : 'var(--fg-3)',
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
      tone: awake ? 'var(--job-violet)' : 'var(--fg-4)',
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
          /* Broken: coral (29-1P2c2). */
          : 'var(--status-overrun)',
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
      tone: !awake ? 'var(--fg-4)' : toolsUp ? 'var(--job-violet)' : 'var(--status-overrun)',
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
  const modelsLoading = useModelStore((s) => s.loading);
  const select = useModelStore((s) => s.select);
  const refreshModels = useModelStore((s) => s.refresh);
  const setCatalogue = useModelStore((s) => s.setCatalogue);
  /* The same selector `/chat`'s header reads, so the two screens can never
     disagree about which model answers next. It returns an entry out of the
     lists rather than a fresh object, which is what keeps it a safe selector. */
  const chosen = useModelStore(selectEffectiveModel);

  const [toast, setToast] = useState<ToastPayload | null>(null);
  const [checking, setChecking] = useState(false);

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
  const waiting = status === 'unknown';
  /* The models are asked for after the probe, so an awake laptop has none
     listed for a beat; that beat is a wait too, not "listed no models". */
  const modelsWaiting = local.length === 0 && (waiting || (awake && modelsLoading));
  const tilesArrived = useRef<HTMLDivElement>(null);
  useArrival(tilesArrived, !waiting);
  const modelsArrived = useRef<HTMLDivElement>(null);
  useArrival(modelsArrived, !modelsWaiting);

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
  /* BIG-1: Gemini, Claude or ChatGPT — a cloud model, which may well be running
     through this laptop now, but not on it and not for free. */
  const onCloud = chosen.provider !== 'ollama';
  const ringReading = awake ? readingFor(resident[0] ?? '') : null;

  const pill: { status: StatusName; label: string; line: string } = unconfigured
    ? {
        status: 'archived',
        label: 'No host',
        line: 'Nothing points this app at an Atlas. Set VITE_ATLAS_URL on the deployment, or the mutineer_atlas_url key on this device.',
      }
    : awake
      ? {
          status: 'atlas',
          label: 'Awake',
          line: 'Reachable from this device over Tailscale.',
        }
      : {
          status: 'archived',
          label: 'Asleep',
          line: 'The laptop lid is shut, or it is off the tailnet. Atlas answers from this device instead.',
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
              {/* Soft since 29-1P2, as the log's way back. */}
              <SoftButton
                size="sm"
                icon={<Icon name="sparkles" size={15} />}
                onClick={() => navigate('/chat')}
              >
                Back to Atlas
              </SoftButton>
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
                    backgroundImage: awake ? 'var(--glass-tint-violet)' : 'var(--glass-fill-1)',
                    boxShadow: awake ? 'var(--glass-rim-2), var(--job-violet-shine-md)' : 'var(--glass-rim-1)',
                    color: awake ? MARK_INK : 'var(--fg-4)',
                  }}
                >
                  <Icon name={awake || waiting ? 'server' : 'moon'} size={26} />
                  {awake && (
                    <span
                      style={{
                        position: 'absolute', inset: -6, borderRadius: '50%',
                        border: '1px solid var(--job-violet-line)',
                        /* Still, not rippling: a loop that never ends redraws the
                           whole screen every frame (StatusPill.tsx says more). */
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
                    {waiting ? (
                      <Bone width={72} height={22} />
                    ) : (
                      <StatusPill status={pill.status} size="sm">{pill.label}</StatusPill>
                    )}
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
                    {waiting ? <Bone width="64%" height={11} style={{ marginTop: 'var(--sp-2)' }} /> : pill.line}
                  </p>
                </div>
              </div>

              {!unconfigured && (
                <div
                  ref={tilesArrived}
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
                  {waiting ? Array.from({ length: 4 }, (_, i) => (
                    <div
                      key={i}
                      role="status"
                      aria-busy="true"
                      aria-label="Asking the laptop"
                      style={{
                        display: 'grid', gap: 'var(--sp-4)', alignContent: 'start',
                        padding: 'var(--sp-5) var(--sp-6)', borderRadius: 'var(--r-lg)',
                        backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
                      }}
                    >
                      <Bone width="48%" height={9} delay={i * 90} />
                      <Bone width="62%" height={16} radius="var(--r-md)" delay={i * 90} />
                      <Bone width="86%" height={8} delay={i * 90} />
                    </div>
                  )) : heroTiles(awake, host, health, roundTripMs).map((tile) => (
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
            {!awake && !unconfigured && !waiting && (
              <Panel
                tone="warn"
                kicker="Lid shut"
                title="Atlas is answering from this device"
                hint="Everything Atlas does on the laptop, run here on a cloud model — your tasks, notes, skills, the log with Revert, and the tray. The one thing missing is the laptop's own local model. What it writes, the laptop takes in when it wakes."
                right={
                  <span
                    aria-hidden="true"
                    style={{
                      display: 'grid', placeItems: 'center', width: 40, height: 40,
                      borderRadius: '50%', backgroundImage: 'var(--glass-fill-2)',
                      boxShadow: 'var(--glass-rim-2)', color: 'var(--status-warn)',
                    }}
                  >
                    <Icon name="wifi-off" size={18} />
                  </span>
                }
              >
                {/*
                  The mockup puts two switches here — "use the basic assistant"
                  and "wake the host when the lid opens". Neither is a setting:
                  the switch to Atlas on this device is automatic (`ChatPage`
                  routes on `atlasStatus`, with nothing to turn off; the basic
                  assistant is retired since BIG-12), and nothing anywhere can
                  wake a sleeping laptop over a network it is not on. Stated as
                  behaviour rather than drawn as a control that would do
                  nothing.
                */}
                <Row
                  icon="git-branch"
                  title="The switch happens on its own"
                  hint="Every conversation asks the laptop first, and runs Atlas here when it does not answer. There is nothing to turn on."
                  control={<MetaKicker tone="var(--status-warn)">automatic</MetaKicker>}
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
                    <span
                      style={{
                        font: 'var(--type-numeric)', fontSize: 'var(--text-2xl)', fontVariantNumeric: 'tabular-nums',
                        color: ringReading.onGpu === 100 ? 'var(--job-lime-text)' : 'var(--status-warn)',
                      }}
                    >
                      {ringReading.onGpu}%
                    </span>
                    <MetaKicker tone="var(--fg-4)">on the card</MetaKicker>
                  </div>
                ) : undefined
              }
            >
              {modelsWaiting ? (
                <SkeletonRows rows={3} lead="square" sub card rowHeight={72} label="Listing the laptop's models" />
              ) : local.length === 0 ? (
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
                <div ref={modelsArrived} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
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
                          select(option);
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

              {onCloud && local.length > 0 && (
                <MetaKicker icon="sparkles" tone="var(--status-warn)">
                  your chat is on {chosen.label} — pick one here to answer on the laptop
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

            {/* ── What leaves the laptop ──────────────────────────────────
                9B drew this as "Off-site — Escalation to Gemini" and BUILD-12
                turned its switch into Downshift. The switch went with the AI
                spending (OPT-4, 2026-10-06, his call); the rows below are not
                about money and stay. */}
            <Panel kicker="Off-site" title="What leaves the laptop">
              {/* BIG-1: the keys live in Settings now and travel with each
                  message. What this row can still say truthfully is whether
                  this laptop's Atlas is new enough to take them, and whether
                  it has a Gemini key of its own to fall back on. */}
              <Row
                icon="key-round"
                title="Cloud keys"
                hint={
                  health?.hosted?.keysFromRequest === true
                    ? `Gemini, Claude and ChatGPT run here on the keys in Settings → Connections, sent with each message and never kept on the laptop.${
                        health.gemini.configured ? " A Gemini key in Atlas's .env is used when Settings has none." : ''
                      }`
                    : "This Atlas is older than Claude and ChatGPT support, and runs a cloud model only on a Gemini key in its own .env. Restart it on the laptop to pick up the new build."
                }
                control={
                  <MetaKicker tone={health?.hosted?.keysFromRequest === true ? 'var(--job-lime)' : 'var(--fg-4)'}>
                    {health === null ? 'not known' : health.hosted?.keysFromRequest === true ? 'from Settings' : 'older Atlas'}
                  </MetaKicker>
                }
              />
              <Row
                icon="lock"
                title="Mail never leaves the laptop"
                hint="The rule is settled and there is no mailbox to apply it to yet. Item 22 (step 35) connects Gmail, and the action log will record whatever goes upstream."
                tone="var(--job-violet)"
                control={<MetaKicker tone="var(--fg-4)">no mailbox yet</MetaKicker>}
              />
              {/* BIG-4: Atlas's memory also lives in his account's cloud, so
                  the tablet reads it with the lid shut. Drawn only by an Atlas
                  that reports it; the failure is printed verbatim, 9B's rule. */}
              {health?.memory?.cloud !== undefined && (
                <Row
                  icon="refresh-cw"
                  title="A copy for the tablet"
                  hint={
                    !health.memory.cloud.on
                      ? `Atlas's notes, chats and skills stay on the laptop only. ${health.memory.cloud.reason ?? ''}`.trim()
                      : health.memory.cloud.lastError !== null
                        ? `Could not update the cloud copy: ${health.memory.cloud.lastError} Atlas keeps trying, and nothing is lost meanwhile.`
                        : "Notes, chats, skills, the log and what is waiting for you are copied to your account, so the tablet can read them with the lid shut. The files on the laptop are a backup; edit notes in the app."
                  }
                  control={
                    <MetaKicker
                      tone={
                        health.memory.cloud.on && health.memory.cloud.lastError === null ? 'var(--job-lime)' : 'var(--fg-4)'
                      }
                    >
                      {!health.memory.cloud.on
                        ? 'off'
                        : health.memory.cloud.lastError !== null
                          ? 'retrying'
                          : health.memory.cloud.pending > 0
                            ? `${health.memory.cloud.pending} to send`
                            : health.memory.cloud.ready
                              ? 'in step'
                              : 'catching up'}
                    </MetaKicker>
                  }
                />
              )}
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
            <MiniNav items={nav.items} value={nav.current} onChange={nav.go} screenLit />
          </span>
        </div>
      )}
    </div>
  );
}
