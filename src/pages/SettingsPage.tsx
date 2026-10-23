/**
 * Settings — the first screen rebuilt on Aurora Glass.
 * Mockup: design-system/screens/settings.html
 *
 * The SimpleURL section holds the per-user API key + branded short-link domain
 * (e.g. `go.base.co.in`) used by the Share modal to shorten public share
 * links. Both are stored in Firestore at `users/{uid}/settings/integrations`
 * (see `lib/integrationSettings.ts`) — never in env vars — so the key follows
 * the account, not the deploy.
 *
 * The second section is about the app's own data rather than a third party:
 * Storage (`components/StorageUsageSection.tsx`) reports how much of
 * Firestore's 1 MB per-document budget the synced document is using.
 *
 * THERE WAS A THIRD, 9C TOOK IT, AND 13F PUT THE DOOR BACK
 * --------------------------------------------------------
 * Trash was the tab next to Storage, and the two did belong together — the
 * Storage panel's advice is to delete things, and that was where deleted
 * things went. Item 9C moved it out: item 9 gave Atlas `delete_task`, so
 * things now disappear that nobody in this browser removed, and checking what
 * went is work rather than configuration. It became `/trash`, with its own nav
 * cell on every screen.
 *
 * **Item 13F takes the nav cell back and leaves the screen.** The 2026-09-08
 * `atlas.html` cuts the nav to six, and its one line about the rest is
 * *"Trash and the dashboard moved to Settings."* So the way in is here again —
 * which is also the older settled decision this file's previous comment was
 * arguing against, now back in force. `/trash` keeps its screen, its route and
 * every number on it; only the door changed.
 *
 * **The door is a tab that navigates, and that is deliberate, not a
 * placeholder nobody finished.** Asked directly whether to rebuild the trash
 * list inside Settings, Shreekant's answer was that the drawn Settings screen
 * is coming in a later session and this one should *"just make the
 * functions"*. So this tab is wiring, not design: it carries the live count
 * and goes to the screen that already exists, rather than inventing a second
 * Trash UI that the re-export would immediately replace. When that screen
 * arrives, this is the entry it takes over.
 *
 * The one line at the foot of the Storage panel pointing at `/trash` stays as
 * well — it explains why deleted things are missing from the storage figure,
 * which is a different job from being the way in.
 *
 * WHAT CHANGED IN THE REBUILD
 * ---------------------------
 * The sections used to stack down one long scroll; they are `<Tabs>` now,
 * matching the mockup. That is the one change to how this page is navigated —
 * Storage is a tab away rather than a scroll away.
 *
 * Everything that talks to Firestore, the store or SimpleURL is untouched:
 * `loadIntegrationSettings`, `saveIntegrationSettings` and `runDiagnostics`
 * are called exactly as before. In particular the Test button still renders
 * the FULL ordered `DiagnosticStep[]` report — the mockup reduces that to a
 * single pass/fail dot, which would have thrown away the one thing that tells
 * Shreekant which stage actually broke.
 *
 * This page opts out of the global `FloatingNav` (see its HIDDEN_ROUTES) and
 * draws its own `<MiniNav>`: a vertical rail on a wide window, a floating bar
 * below that. Each remaining screen takes the same opt-in as it migrates.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BlurAcross, Bone, Card, FieldLabel, Icon, IconButton, Input, MiniNav, SoftButton, SoftIconButton, Tabs, Toast, Well, WhiteButton,
  useMedia, WIDE, type IconName,
} from '../ui';
import { RailMark } from '../components/BrandMark';
import { useNavModel } from '../components/navModel';
import { useTrashStore } from '../store/useTrashStore';
import { useArchiveStore } from '../store/useArchiveStore';
import StorageUsageSection from '../components/StorageUsageSection';
import AppInfoSection from '../components/AppInfoSection';
import SpeedSection from '../components/SpeedSection';
import SoundSection from '../components/SoundSection';
import AppearanceSection from '../components/AppearanceSection';
import BirthdaySection from '../components/BirthdaySection';
import LandingSection from '../components/LandingSection';
import ShortcutsSection from '../components/ShortcutsSection';
import ApiKeysCard from '../components/ApiKeysCard';
import AtlasSettingsSection from '../components/AtlasSettingsSection';
import GoogleDiagnosticsCard from '../components/GoogleDiagnosticsCard';
import { useAccountAccess } from '../lib/accountAccess';
import BrownNoiseSection from '../components/BrownNoiseSection';
import { useAuth } from '../contexts/AuthContext';
import { Z } from '../lib/zLayers';
import { useRememberedState } from '../lib/useRememberedState';
import { loadIntegrationSettings, saveIntegrationSettings } from '../lib/integrationSettings';
import { runDiagnostics, DEFAULT_SHORT_DOMAIN, type DiagnosticStep } from '../lib/simpleUrl';

export interface ToastPayload {
  icon: IconName;
  title: string;
  detail?: string;
  tone?: 'accent' | 'review' | 'overrun' | 'neutral';
}

/* `trash` is a door rather than a panel — picking it navigates. See the note
   at the top of this file. */
type TabId = 'connections' | 'atlas' | 'noise' | 'storage' | 'app' | 'archive' | 'trash' | 'admin';
/** The sections in their tabs' order, for which way a switch slides. */
const SECTION_ORDER: TabId[] = ['connections', 'atlas', 'noise', 'storage', 'app'];
type TestState = 'idle' | 'testing' | 'ok' | 'fail';

/**
 * Maps a diagnostic step's status onto a glyph and the token that carries it.
 * 29-1P2c2: a passed check is lime (done, ticked), a failed one coral, a
 * warning grey with its triangle; emerald is only for what is running now.
 */
const STEP_LOOK: Record<DiagnosticStep['status'], { icon: IconName; color: string }> = {
  ok:   { icon: 'check',          color: 'var(--job-lime)' },
  fail: { icon: 'x',              color: 'var(--status-overrun)' },
  warn: { icon: 'triangle-alert', color: 'var(--status-warn)' },
  skip: { icon: 'circle-dot',     color: 'var(--fg-4)' },
};

/* ------------------------------------------------------------------ */
/* Connections                                                         */

function ConnectionsPanel({ onToast }: { onToast: (t: ToastPayload) => void }) {
  const { user } = useAuth();

  const [apiKey, setApiKey] = useState('');
  const [domain, setDomain] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<TestState>('idle');
  const [steps, setSteps] = useState<DiagnosticStep[]>([]);
  /*
   * What Firestore last handed back, so the Save row can tell an untouched
   * form from an edited one. The mockup starts from nothing and can read
   * "dirty" straight off the fields being non-empty; here they arrive full
   * on every visit, so that test would call a pristine form dirty and offer
   * to re-save what is already stored.
   */
  const [baseline, setBaseline] = useState({ apiKey: '', domain: '' });

  useEffect(() => {
    let active = true;
    (async () => {
      if (!user) return;
      const settings = await loadIntegrationSettings(user.uid, true);
      if (!active) return;
      const next = { apiKey: settings.simpleUrlApiKey ?? '', domain: settings.simpleUrlDomain ?? '' };
      setApiKey(next.apiKey);
      setDomain(next.domain);
      setBaseline(next);
      setLoaded(true);
    })();
    return () => { active = false; };
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setSaved(false);
    try {
      await saveIntegrationSettings(user.uid, {
        simpleUrlApiKey: apiKey.trim() || undefined,
        simpleUrlDomain: domain.trim() || undefined,
      });
      setBaseline({ apiKey, domain });
      setSaved(true);
      onToast({
        icon: 'check',
        title: 'Integration saved',
        detail: 'Shared views now use these credentials.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTest('testing');
    setSteps([]);
    const result = await runDiagnostics(apiKey.trim(), domain.trim());
    setSteps(result.steps);
    setTest(result.ok ? 'ok' : 'fail');
    onToast(
      result.ok
        ? { icon: 'circle-check', title: 'SimpleURL reachable', detail: 'Short links and QR codes are available.' }
        : { icon: 'triangle-alert', title: 'Connection failed', detail: 'See the checks below for which stage stopped.', tone: 'overrun' },
    );
  };

  const live = test === 'ok';
  /* Live stays emerald (the header tile says why); not connected is a quiet
     warning, grey, and rejected is coral (29-1P2c2). */
  const dot = live ? 'var(--accent)' : test === 'fail' ? 'var(--status-overrun)' : 'var(--status-warn)';
  const status = live ? 'Key verified' : test === 'fail' ? 'Key rejected' : 'Not connected';
  const dirty = apiKey !== baseline.apiKey || domain !== baseline.domain;

  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--sp-7)' }}>

        {/* Identity row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
          <span
            aria-hidden="true"
            style={{
              display: 'grid', placeItems: 'center', width: 44, height: 44, flex: '0 0 auto',
              borderRadius: '50%',
              /* Emerald only once the key is actually live — the design
                 system rations the accent to mean exactly that. */
              backgroundImage: live ? 'var(--glass-tint-accent)' : 'var(--glass-fill-2)',
              boxShadow: live ? 'var(--glass-rim-2), var(--glow-accent-sm)' : 'var(--glass-rim-2)',
              color: live ? 'oklch(0.93 0.07 162)' : 'var(--fg-2)',
              transition: 'var(--t-hover)',
            }}
          >
            <Icon name="link" size={20} />
          </span>
          <div style={{ display: 'grid', gap: 2, minWidth: 0, flex: 1 }}>
            <h2 style={{ font: 'var(--type-title)', letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)' }}>
              SimpleURL
            </h2>
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
              Short links, QR codes and click counts for shared views.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flex: '0 0 auto' }}>
            <span
              style={{
                width: 7, height: 7, borderRadius: '50%', background: dot,
                /* Steady, not pulsing — see StatusPill.tsx for why no status dot loops. */
                boxShadow: live ? 'var(--glow-accent-sm)' : 'none',
              }}
            />
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>{status}</span>
          </div>
        </div>

        {!loaded ? (
          /* 29-1P14d2, idea 116: the two fields on their way, not a spinner. */
          <div role="status" aria-busy="true" aria-label="Loading the SimpleURL settings" style={{ display: 'grid', gap: 'var(--sp-7)' }}>
            {[0, 1].map((i) => (
              <div key={i} style={{ display: 'grid', gap: 'var(--sp-4)' }}>
                <Bone width={i === 0 ? 64 : 96} height={10} delay={i * 90} />
                <Bone height={40} radius="var(--r-md)" delay={i * 90} />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* API key */}
            <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
              <FieldLabel
                icon={<Icon name="key-round" size={14} />}
                hint={
                  <a
                    href="https://simpleurl.tech/dashboard/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ font: 'var(--type-caption)' }}
                  >
                    SimpleURL dashboard ↗
                  </a>
                }
              >
                API key
              </FieldLabel>

              <div style={{ display: 'flex', gap: 'var(--sp-3)', alignItems: 'center' }}>
                <span style={{ flex: 1, minWidth: 0, position: 'relative', display: 'flex' }}>
                  <Input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => { setApiKey(e.target.value); setTest('idle'); setSteps([]); setSaved(false); }}
                    placeholder="sk_live_…"
                    invalid={test === 'fail'}
                    style={{ paddingRight: 52 }}
                    aria-label="SimpleURL API key"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <span style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)' }}>
                    <IconButton
                      label={showKey ? 'Hide key' : 'Show key'}
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowKey((v) => !v)}
                    >
                      <Icon name={showKey ? 'eye-off' : 'eye'} size={16} />
                    </IconButton>
                  </span>
                </span>
                <SoftButton
                  disabled={!apiKey.trim() || test === 'testing'}
                  aria-busy={test === 'testing' || undefined}
                  onClick={handleTest}
                  style={{ flex: '0 0 auto' }}
                >
                  {test === 'testing' ? 'Testing…' : 'Test'}
                </SoftButton>
              </div>

              {/*
                * The full ordered report, not a pass/fail dot. Each step names
                * the stage and what it found, which is the only thing that
                * makes a failure actionable for someone who is not going to
                * read a network tab.
                */}
              {steps.length > 0 && (
                <Well pad="var(--sp-5)" style={{ display: 'grid', gap: 'var(--sp-4)' }}>
                  <span
                    style={{
                      font: 'var(--type-label)',
                      color: test === 'ok' ? 'var(--job-lime-text)' : 'var(--status-overrun)',
                    }}
                  >
                    {test === 'ok' ? 'All checks passed — you’re connected.' : 'Something went wrong — see below.'}
                  </span>
                  {steps.map((s, i) => {
                    const look = STEP_LOOK[s.status];
                    return (
                      <div key={`${s.label}-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)' }}>
                        <span style={{ display: 'flex', flex: '0 0 auto', marginTop: 2, color: look.color }}>
                          <Icon name={look.icon} size={14} />
                        </span>
                        <div style={{ minWidth: 0, display: 'grid', gap: 1 }}>
                          <span style={{ font: 'var(--type-label)', color: 'var(--fg-2)' }}>{s.label}</span>
                          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>{s.detail}</span>
                        </div>
                      </div>
                    );
                  })}
                </Well>
              )}
            </div>

            {/* Branded domain */}
            <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
              <FieldLabel icon={<Icon name="globe" size={14} />}>Branded domain</FieldLabel>
              <Input
                value={domain}
                onChange={(e) => { setDomain(e.target.value.trim()); setSaved(false); }}
                placeholder={`${DEFAULT_SHORT_DOMAIN} (default)`}
                aria-label="Branded domain"
                autoComplete="off"
                spellCheck={false}
              />
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
                Use your own domain (e.g. <span style={{ color: 'var(--fg-2)' }}>go.base.co.in</span>) for short
                links. Add and verify it in your SimpleURL dashboard first — they give you a DNS record to add. Leave
                it empty to use <span style={{ color: 'var(--fg-2)' }}>{DEFAULT_SHORT_DOMAIN}</span>.
              </span>
            </div>

            <div style={{ height: 1, background: 'var(--line-faint)' }} />

            {/* The mockup's three states, not two. A form that has not been
                touched has nothing to write, so it says so and the button is
                out — pressing Save on a pristine form used to re-send the
                stored values and report "Saved", which reads as though
                something had changed. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', flex: 1, minWidth: 180 }}>
                {saved
                  ? 'Saved. Shared views now use these credentials.'
                  : dirty
                    ? 'Unsaved changes — press Save.'
                    : 'Nothing to save yet.'}
              </span>
              {/* The card's confirm: solid white (29-1P2), not gel — gel is
                  a screen's one main action, never a form's Save. */}
              <WhiteButton
                disabled={!dirty || saved || saving}
                aria-busy={saving || undefined}
                icon={<Icon name="check" size={16} />}
                onClick={handleSave}
              >
                {saved ? 'Saved' : saving ? 'Saving…' : 'Save'}
              </WhiteButton>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

export default function SettingsPage() {
  const navigate = useNavigate();
  const wide = useMedia(WIDE);
  const nav = useNavModel();
  /* Remembered (2026-09-15). 'trash' (and 'admin') is never stored - it navigates away
     rather than selecting, per the note by the Tabs below - so it can
     never come back as the tab to restore. */
  const [tab, setTab] = useRememberedState<TabId>('base.settings.tab', 'connections');
  const trashCount = useTrashStore((s) => s.entries.length);
  const archiveCount = useArchiveStore((s) => s.entries.length);
  /* BUILD-6 — his account only. A courtesy, not the lock; see AdminPage. */
  const showAdmin = useAccountAccess((s) => s.owner || s.unverifiedOwner);
  const [toast, setToast] = useState<ToastPayload | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [toast]);

  const subtitle: Record<TabId, string> = {
    connections: 'Integrations and connected services',
    atlas: 'Which models answer, and how Atlas sounds',
    storage: 'What the account record holds',
    noise: 'The sound that plays while you work',
    app: 'This copy of BASE, and how it reaches you',
    archive: 'Put away on purpose, kept for good',
    trash: 'Thirty days of deletions',
    admin: 'Every account, and what it may spend',
  };

  return (
    /*
     * `ag-page` rather than the old flat `bg-[#050505]`: this screen is the
     * first to let the grid backdrop through, which is what the glass panes
     * above it refract.
     */
    <div className="ag-page h-screen overflow-y-auto">
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
          <div style={{ width: '100%', maxWidth: 880, margin: '0 auto', display: 'grid', gap: 'var(--sp-8)' }}>

            <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
              <SoftIconButton label="Back" onClick={() => navigate(-1)}>
                <Icon name="arrow-left" size={18} />
              </SoftIconButton>
              <span
                aria-hidden="true"
                style={{
                  display: 'grid', placeItems: 'center', width: 44, height: 44, flex: '0 0 auto',
                  borderRadius: '50%', backgroundImage: 'var(--glass-fill-2)',
                  boxShadow: 'var(--glass-rim-2)', color: 'var(--fg-2)',
                }}
              >
                <Icon name="settings" size={20} />
              </span>
              <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                <h1
                  /* 29-1P5c, idea 57: shrinks and fades as the page scrolls. */
                  className="ag-tuck-title"
                  style={{
                    font: 'var(--type-title)', fontSize: 'var(--text-xl)',
                    letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)',
                  }}
                >
                  Settings
                </h1>
                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>{subtitle[tab]}</span>
              </div>
            </header>

            {/* ITEM 13F. Trash is reached from Settings again, and reaching
                it means going to `/trash` — the tab is never selected, so
                `tab` never becomes 'trash' and no panel is needed for it. */}
            <Tabs
              value={tab}
              onChange={(v) => {
                if (v === 'trash') { navigate('/trash'); return; }
                if (v === 'archive') { navigate('/archive'); return; }
                if (v === 'admin') { navigate('/admin'); return; }
                setTab(v as TabId);
              }}
              tabs={[
                { value: 'connections', label: 'Connections' },
                /* OPT-8 — the model defaults and the voice, moved off the chat. */
                { value: 'atlas', label: 'Atlas' },
                { value: 'noise', label: 'Brown noise' },
                { value: 'storage', label: 'Storage' },
                { value: 'app', label: 'App' },
                /* BUILD-11 — a door like Trash, beside it. BIG-9 redraws
                   Settings and takes `Archive.dc.html`'s "Kept & deleted"
                   pane with it; until then this is wiring, as Trash's is. */
                { value: 'archive', label: 'Archive', count: archiveCount > 0 ? archiveCount : undefined },
                { value: 'trash', label: 'Trash', count: trashCount > 0 ? trashCount : undefined },
                /* A door like Trash, and only drawn for him. */
                ...(showAdmin ? [{ value: 'admin', label: 'Admin' }] : []),
              ]}
            />

            {/* 29-1P5c, idea 60: a tab switch blurs the old section away and the
                new one into focus, sliding the way you went. */}
            <BlurAcross value={tab} index={SECTION_ORDER.indexOf(tab)}>
              {tab === 'connections' && (
                <>
                  <ConnectionsPanel onToast={setToast} />
                  {/* ITEM 13G, second pass — the AI keys, moved off `/chat`'s
                      header at Shreekant's request; Gemini, Claude and ChatGPT
                      since BIG-1. Under SimpleURL because that is where he
                      asked for it and because the two are the same kind of
                      thing: a credential this app spends on your behalf. */}
                  <ApiKeysCard />
                  {/* OPT-8 — moved from the foot of Notifications, his words:
                      *"Take diagnostics in the notification page and put it
                      into settings page."* It is the Google connection's log,
                      so it sits with the connections. */}
                  <div style={{ marginTop: 'var(--sp-7)' }}><GoogleDiagnosticsCard /></div>
                </>
              )}
              {tab === 'atlas' && <AtlasSettingsSection />}
              {/* Its own section rather than rows under App, because every
                  control in it is an audition: you pick a cutoff by dragging
                  until it sounds right, which needs the sound running. */}
              {tab === 'noise' && <BrownNoiseSection />}
              {tab === 'storage' && <StorageUsageSection />}
              {/* APP-3 — which version is running, whether it works offline,
                  and the one test notification that proves the service worker
                  can be pushed to. Kept apart from Connections because none of
                  it is a third party: it is the app describing itself. */}
              {tab === 'app' && <AppInfoSection onToast={setToast} />}
              {/* BIG-6 — which screen BASE opens on, until BIG-9 redraws Settings. */}
              {tab === 'app' && <div style={{ marginTop: 'var(--sp-7)' }}><LandingSection /></div>}
              {/* 29-1P1 — the dark tint (idea 63), above Speed: it follows him to
                  the other device, and Speed's switches do not. */}
              {tab === 'app' && <div style={{ marginTop: 'var(--sp-7)' }}><AppearanceSection /></div>}
              {/* 29-1P14b — his birthday, for the Dashboard's greeting (idea 109); both devices, like the tint. */}
              {tab === 'app' && <div style={{ marginTop: 'var(--sp-7)' }}><BirthdaySection /></div>}
              {/* OPT-11 — the keyboard button that was on Home's header. */}
              {tab === 'app' && <div style={{ marginTop: 'var(--sp-7)' }}><SoundSection /></div>}
              {tab === 'app' && <div style={{ marginTop: 'var(--sp-7)' }}><ShortcutsSection /></div>}
              {tab === 'app' && <div style={{ marginTop: 'var(--sp-7)' }}><SpeedSection /></div>}
            </BlurAcross>
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
            <MiniNav items={nav.items} value={nav.current} onChange={nav.go} screenLit />
          </span>
        </div>
      )}
    </div>
  );
}
