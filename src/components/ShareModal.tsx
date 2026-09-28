/**
 * Share.
 *
 * NO MOCKUP — the design project has no share screen, and it was unreachable
 * from this session as well (`DesignSync list_projects` returned an empty
 * array, exactly as it did for UI-1, UI-2 and UI-4). The sheet is composed
 * from `Dialog`, `Input`, `Button` and `IconButton` and the laws written at
 * the top of each, plus the `Section` shape every screen mockup in
 * `design-system/screens/` re-declares — which is `FieldLabel`, that shape
 * already extracted.
 *
 * What the sheet is FOR has not changed, and neither has a single line of the
 * wiring under it. The public `/s/{shareId}` page (`SharePage.tsx`) already
 * exists by the time this opens; the modal lets the owner copy that link,
 * shorten it into a branded SimpleURL link (optionally on a custom domain like
 * `go.base.co.in`) with an inline QR code, read its click count, and
 * remove it again. The API key and default branded domain still come from the
 * per-user integration settings in Firestore (`lib/integrationSettings.ts`),
 * and every call in `lib/simpleUrl.ts` is made from exactly where it was.
 *
 * Three things about the rebuild worth not re-deriving:
 *
 *   - **The sheet keeps its own closing animation.** All three call sites
 *     mount it conditionally inside an `<AnimatePresence>`, and that only
 *     plays an exit for a Framer `motion` element — which this no longer has.
 *     So the dismissal is deferred by hand: `close()` shuts the sheet, and
 *     `onClose` (the unmount) follows one `--dur-base` later, once `Dialog`
 *     has finished dissolving. Nothing at a call site had to change for it,
 *     which is the point — two of the three are screens still on the old
 *     design and are not this session's to touch.
 *   - **The click swallower survives, and it is load-bearing.** `Dialog`
 *     portals into `<body>`, but React still bubbles events up the
 *     *component* tree — and two of the three call sites render this modal
 *     inside something clickable (`ProjectCard`'s article navigates to the
 *     project). Without the wrapper at the bottom of this file, pressing
 *     anything in the sheet — the scrim included — would also open the
 *     project underneath it and tear the modal down mid-interaction.
 *   - **Access mode reads as one choice, not two buttons.** The two options
 *     are the same pane and only the live one takes the accent tint and ring,
 *     which is the system's own meaning for accent (see `IconButton`'s
 *     `active`). The old sheet gave "View only" indigo and "Outsource"
 *     emerald, so the pair read as two unrelated states rather than one
 *     switch with two positions.
 *
 * Emerald stays rationed: it marks the selected access mode, and a copy that
 * has just landed. The header tile is violet, and "Remove short link" — the
 * one destructive control here — is rose.
 *
 * BUILD-14 made the switch three positions — View only, Client view,
 * Outsource — and added the link's end date. All three are one settings patch
 * (`ShareSettings`, the same three field names on a task, a list and a
 * project), so a call site stores it and re-publishes, and knows nothing about
 * which of them moved.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Dialog, FieldLabel, Icon, IconButton, Input } from '../ui';
import type { IconName } from '../ui';
import type { ShareSettings } from '../lib/publicShare';
import { useAuth } from '../contexts/AuthContext';
import { useOverlayDismiss } from '../lib/useOverlayDismiss';
import { Z } from '../lib/zLayers';
import { loadIntegrationSettings, resolveShortDomain } from '../lib/integrationSettings';
import {
  createShortUrl, getShortUrl, deleteShortUrl, getAnalyticsSummary,
  qrImageUrl, SimpleUrlError, type ShortUrl,
} from '../lib/simpleUrl';

/** URLs are set in mono: they are strings you read character by character. */
const LINK_TEXT: CSSProperties = {
  minWidth: 0,
  font: 'var(--type-numeric)',
  fontSize: 'var(--text-xs)',
  letterSpacing: 'var(--tracking-ui)',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

/** The 46px well every link in this sheet sits in, with its actions beside it. */
function LinkRow({ children, actions }: { children: ReactNode; actions: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          alignItems: 'center',
          height: 46,
          padding: '0 var(--sp-6)',
          borderRadius: 'var(--r-control)',
          backgroundImage: 'var(--glass-well)',
          boxShadow: 'var(--glass-well-shadow), 0 0 0 1px var(--line-faint)',
        }}
      >
        {children}
      </div>
      {actions}
    </div>
  );
}

const NOTE = {
  accent: { fill: 'var(--glass-tint-accent)', ring: 'oklch(0.70 0.15 162 / 0.22)', ink: 'oklch(0.93 0.07 162)' },
  rose:   { fill: 'var(--glass-tint-rose)',   ring: 'oklch(0.70 0.15  20 / 0.22)', ink: 'oklch(0.93 0.07 20)' },
} as const;

/** A tinted consequence to read: what outsourcing means, or why a call failed. */
function Note({ tone, icon, children }: { tone: keyof typeof NOTE; icon: IconName; children: ReactNode }) {
  const t = NOTE[tone];
  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--sp-4)',
        padding: 'var(--sp-5) var(--sp-6)',
        borderRadius: 'var(--r-lg)',
        background: t.fill,
        boxShadow: `var(--glass-rim-1), inset 0 0 0 1px ${t.ring}`,
      }}
    >
      <span style={{ display: 'flex', color: t.ink, flex: '0 0 auto', marginTop: 1 }}>
        <Icon name={icon} size={16} />
      </span>
      <p style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: t.ink, textWrap: 'pretty' }}>
        {children}
      </p>
    </div>
  );
}

/** One position of the access-mode switch. Accent means *this is the live one*. */
function ModeOption({
  icon, title, blurb, on, onClick,
}: { icon: IconName; title: string; blurb: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={{
        display: 'grid',
        gap: 'var(--sp-3)',
        justifyItems: 'start',
        textAlign: 'left',
        padding: 'var(--sp-5)',
        border: 0,
        cursor: 'pointer',
        borderRadius: 'var(--r-lg)',
        background: on ? 'var(--glass-tint-accent)' : 'var(--glass-fill-1)',
        boxShadow: on ? 'var(--glass-rim-2), var(--glow-accent-sm)' : 'var(--glass-rim-1)',
        transition: 'var(--t-hover)',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 'var(--sp-3)',
          font: 'var(--type-label)',
          fontSize: 'var(--text-sm)',
          color: on ? 'oklch(0.93 0.07 162)' : 'var(--fg-1)',
        }}
      >
        <Icon name={icon} size={16} />
        {title}
      </span>
      <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>{blurb}</span>
    </button>
  );
}

interface ShareModalProps {
  publicUrl: string;
  entityType: 'task' | 'list' | 'project';
  currentKeyword?: string;
  currentDomain?: string;
  /** Persist / clear the SimpleURL keyword + domain on the underlying entity. */
  onKeywordChange: (keyword?: string, domain?: string) => void;
  /**
   * The share's access mode and end date, and a setter for a patch of them.
   * When the setter is omitted the sheet offers neither, and the share stays
   * as it is.
   */
  settings?: ShareSettings;
  onSettingsChange?: (patch: ShareSettings) => void;
  onClose: () => void;
}

type Mode = 'view' | 'client' | 'outsource';

/** One patch per position, so a mode can never be half-set. */
const MODE_PATCH: Record<Mode, ShareSettings> = {
  view: { shareAllowContributions: false, shareShowPeople: false },
  client: { shareAllowContributions: false, shareShowPeople: true },
  outsource: { shareAllowContributions: true, shareShowPeople: false },
};

function modeOf(settings: ShareSettings | undefined): Mode {
  if (settings?.shareAllowContributions) return 'outsource';
  if (settings?.shareShowPeople) return 'client';
  return 'view';
}

/** Today in the browser's own zone, spelled the way the date input writes it. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ShareModal({
  publicUrl, entityType, currentKeyword, currentDomain, onKeywordChange,
  settings, onSettingsChange, onClose,
}: ShareModalProps) {
  const mode = modeOf(settings);
  const expiresOn = settings?.shareExpiresOn ?? '';
  const expiredAlready = expiresOn !== '' && expiresOn < todayIso();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [apiKey, setApiKey] = useState<string | null>(null);
  const [defaultDomain, setDefaultDomain] = useState('smplu.link');
  const [settingsReady, setSettingsReady] = useState(false);

  const [keywordInput, setKeywordInput] = useState('');
  const [domainInput, setDomainInput] = useState(currentDomain ?? '');
  const [short, setShort] = useState<Partial<ShortUrl> | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clicks, setClicks] = useState<number | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  /* The sheet is mounted by its caller only while it is open, so it opens the
     moment it exists and shuts itself before asking to be unmounted. See the
     note at the top of the file. */
  const [open, setOpen] = useState(true);
  /* Guards against a second Escape (or a second backdrop click) during the
     dissolve re-entering `close` — the unmount itself is now driven by the
     sheet's own `onExited` rather than by a timer here. See UI-22. */
  const closingRef = useRef(false);
  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setOpen(false);
  };

  /* Hide the floating nav while open, and close on Escape. Registered against
     a constant `true` rather than `open` so the nav stays tucked away for the
     dissolve too; a second Escape during it is swallowed by the guard in
     `close`. */
  useOverlayDismiss(true, close);

  // Load integration settings + any existing short link.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!user) { setSettingsReady(true); return; }
      const settings = await loadIntegrationSettings(user.uid);
      if (!active) return;
      setApiKey(settings.simpleUrlApiKey?.trim() || null);
      setDefaultDomain(resolveShortDomain(settings));
      if (!currentDomain) setDomainInput(resolveShortDomain(settings));
      setSettingsReady(true);

      if (currentKeyword && settings.simpleUrlApiKey) {
        try {
          const existing = await getShortUrl(settings.simpleUrlApiKey.trim(), currentKeyword, currentDomain);
          if (active) setShort(existing);
        } catch {
          // Keyword may have been deleted server-side — fall back to a link-less state.
          if (active) setShort({ keyword: currentKeyword, domain: currentDomain });
        }
      }
    })();
    return () => { active = false; };
  }, [user, currentKeyword, currentDomain]);

  const copy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(field);
      setTimeout(() => setCopied((c) => (c === field ? null : c)), 1600);
    } catch {
      // clipboard blocked — no-op
    }
  };

  const handleGenerate = async () => {
    if (!apiKey) return;
    setWorking(true);
    setError(null);
    setQrFailed(false);
    try {
      const domain = domainInput.trim() || defaultDomain;
      const result = await createShortUrl(apiKey, {
        url: publicUrl,
        keyword: keywordInput.trim() || undefined,
        domain,
        createQrCode: true,
        description: `BASE ${entityType} share`,
      });
      setShort(result);
      onKeywordChange(result.keyword, result.domain || domain);
    } catch (e) {
      setError(e instanceof SimpleUrlError ? e.full : 'Failed to create short link. Open the browser Console (F12) for details.');
    } finally {
      setWorking(false);
    }
  };

  const handleDelete = async () => {
    if (!apiKey || !short?.keyword) return;
    setWorking(true);
    setError(null);
    try {
      await deleteShortUrl(apiKey, short.keyword, short.domain);
    } catch {
      // Even if the remote delete fails (already gone), drop the local link.
    } finally {
      setShort(null);
      setClicks(null);
      onKeywordChange(undefined, undefined);
      setWorking(false);
    }
  };

  const handleAnalytics = async () => {
    if (!apiKey || !short?.keyword) return;
    setLoadingAnalytics(true);
    try {
      const summary = await getAnalyticsSummary(apiKey, short.keyword, short.domain);
      setClicks(summary.clicks);
    } catch (e) {
      setClicks(null);
      setError(e instanceof SimpleUrlError ? e.full : 'Could not load analytics for this link.');
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const shortLink = short?.shortUrl
    || (short?.keyword ? `https://${short.domain || defaultDomain}/${short.keyword}` : null);
  const qrSrc = short?.keyword ? qrImageUrl(short, short.keyword, short.domain || defaultDomain) : null;

  /** A copy button says so by turning accent and swapping to a tick for 1.6s. */
  const copyTint = (field: string): CSSProperties | undefined =>
    (copied === field ? { color: 'var(--accent)' } : undefined);

  return (
    /* The click swallower. `display: contents` so it adds no box of its own —
       it exists only to catch the portal's events before they reach whatever
       clickable ancestor rendered this modal. See the note at the top. */
    <div style={{ display: 'contents' }} onClick={(e) => e.stopPropagation()}>
      <Dialog
        open={open}
        onClose={close}
        width={520}
        labelledBy="share-title"
        /* Escape is `useOverlayDismiss`'s above, which answers only for the
           topmost overlay. See Dialog's port note 2. */
        closeOnEscape={false}
        zIndex={Z.modalOverModal}
        /* The caller mounts this component only while it is open, so asking
           to be unmounted is what "closed" means here. Driven by the sheet's
           real dissolve rather than a duplicated duration — see UI-22. */
        onExited={onClose}
        style={{ gap: 0, padding: 0, gridTemplateColumns: 'minmax(0, 1fr)' }}
      >
        <div
          className="ag-scroll"
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr)',
            gap: 'var(--sp-8)',
            padding: 'var(--pad-sheet)',
            minWidth: 0,
            boxSizing: 'border-box',
            maxHeight: '84vh',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
          }}
        >
          <header style={{ display: 'grid', gap: 'var(--sp-5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)' }}>
              <span
                aria-hidden="true"
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 44,
                  height: 44,
                  flex: '0 0 auto',
                  borderRadius: '50%',
                  backgroundImage: 'var(--glass-tint-violet)',
                  boxShadow: 'var(--glass-rim-2), var(--glass-cast-1)',
                  color: 'oklch(0.93 0.07 296)',
                }}
              >
                <Icon name="share-2" size={20} />
              </span>
              <h2
                id="share-title"
                style={{
                  flex: 1,
                  minWidth: 0,
                  font: 'var(--type-title)',
                  fontSize: 'var(--text-2xl)',
                  letterSpacing: 'var(--tracking-title)',
                  color: 'var(--fg-1)',
                  textTransform: 'capitalize',
                }}
              >
                Share {entityType}
              </h2>
              <IconButton label="Close" variant="ghost" onClick={close}>
                <Icon name="x" size={18} />
              </IconButton>
            </div>
            <p style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
              A public page that keeps itself up to date as you work.
            </p>
          </header>

          {/* Public link — always available, with or without SimpleURL. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-4)' }}>
            <FieldLabel icon={<Icon name="globe" size={14} />}>Public link</FieldLabel>
            <LinkRow
              actions={
                <IconButton
                  label="Copy public link"
                  onClick={() => void copy(publicUrl, 'public')}
                  style={copyTint('public')}
                >
                  <Icon name={copied === 'public' ? 'check' : 'copy'} size={16} />
                </IconButton>
              }
            >
              <span style={{ ...LINK_TEXT, color: 'var(--fg-2)' }}>{publicUrl}</span>
            </LinkRow>
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
              Anyone with this link can open a live, read-only copy. It follows your changes on its own.
            </span>
          </div>

          {/* Access mode and end date. Only offered where the caller can persist them. */}
          {onSettingsChange && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-4)' }}>
              <FieldLabel icon={<Icon name="users" size={14} />}>Access mode</FieldLabel>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 'var(--sp-4)' }}>
                <ModeOption
                  icon="eye"
                  title="View only"
                  blurb="Progress, dates and money. They change nothing."
                  on={mode === 'view'}
                  onClick={() => onSettingsChange(MODE_PATCH.view)}
                />
                <ModeOption
                  icon="user"
                  title="Client view"
                  blurb="View only, plus who is on each task and the time it took."
                  on={mode === 'client'}
                  onClick={() => onSettingsChange(MODE_PATCH.client)}
                />
                <ModeOption
                  icon="users"
                  title="Outsource"
                  blurb="People can claim tasks and submit them for your approval."
                  on={mode === 'outsource'}
                  onClick={() => onSettingsChange(MODE_PATCH.outsource)}
                />
              </div>
              {mode === 'client' && (
                <Note tone="accent" icon="timer">
                  Your name shows on the tasks assigned to you. While you run a focus session on
                  one, the page shows a live timer, and every task shows the time you logged on it.
                </Note>
              )}
              {mode === 'outsource' && (
                <Note tone="accent" icon="users">
                  Anyone with the link can claim a task with their name and email, then send you a
                  link to the work. You approve it from your app. The ₹ value shows as the payout.
                </Note>
              )}
            </div>
          )}

          {onSettingsChange && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-4)' }}>
              <FieldLabel icon={<Icon name="calendar-x" size={14} />}>Link closes</FieldLabel>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Input
                    type="date"
                    value={expiresOn}
                    min={todayIso()}
                    onChange={(e) => onSettingsChange({ shareExpiresOn: e.target.value || undefined })}
                    aria-label="Last day the link works"
                  />
                </div>
                {expiresOn && (
                  <Button variant="ghost" onClick={() => onSettingsChange({ shareExpiresOn: undefined })}>
                    No end date
                  </Button>
                )}
              </div>
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
                {expiredAlready
                  ? 'This link has closed. Pick a later day to open it again.'
                  : expiresOn
                    ? 'It works to the end of that day, then says it has closed. Your project is untouched.'
                    : 'Open until you remove it.'}
              </span>
            </div>
          )}

          {/* SimpleURL short link. */}
          {!settingsReady ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--sp-4)',
                height: 46,
                padding: '0 var(--sp-6)',
                borderRadius: 'var(--r-control)',
                backgroundImage: 'var(--glass-well)',
                boxShadow: 'var(--glass-well-shadow)',
                color: 'var(--fg-3)',
              }}
            >
              <Icon name="loader-2" size={16} style={{ animation: 'ag-spin 620ms linear infinite' }} />
              <span style={{ font: 'var(--type-label)', fontSize: 'var(--text-sm)' }}>
                Checking your SimpleURL connection…
              </span>
            </div>
          ) : !apiKey ? (
            <div
              style={{
                display: 'grid',
                justifyItems: 'center',
                gap: 'var(--sp-4)',
                padding: 'var(--sp-8) var(--sp-7)',
                borderRadius: 'var(--r-lg)',
                backgroundImage: 'var(--glass-fill-1)',
                boxShadow: 'var(--glass-rim-1)',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  backgroundImage: 'var(--glass-tint-violet)',
                  boxShadow: 'var(--glass-rim-2)',
                  color: 'oklch(0.93 0.07 296)',
                }}
              >
                <Icon name="sparkles" size={18} />
              </span>
              <p style={{ font: 'var(--type-label)', fontSize: 'var(--text-md)', color: 'var(--fg-1)' }}>
                Create a branded short link
              </p>
              <p
                style={{
                  font: 'var(--type-body)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--fg-3)',
                  textAlign: 'center',
                  textWrap: 'pretty',
                }}
              >
                Connect your SimpleURL API key to shorten this link — on{' '}
                <span style={{ color: 'var(--fg-2)' }}>go.base.co.in</span> if you like — with a QR
                code and click analytics.
              </p>
              <Button
                variant="solid"
                iconLeft={<Icon name="settings" size={16} />}
                /* The page is about to change under it, so this one closes
                   outright rather than dissolving over a screen that has
                   already gone. */
                onClick={() => { onClose(); navigate('/settings'); }}
              >
                Open Settings
              </Button>
            </div>
          ) : shortLink ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-7)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-4)' }}>
                <FieldLabel icon={<Icon name="link-2" size={14} />}>Short link</FieldLabel>
                <LinkRow
                  actions={
                    <IconButton
                      label="Copy short link"
                      onClick={() => void copy(shortLink, 'short')}
                      style={copyTint('short')}
                    >
                      <Icon name={copied === 'short' ? 'check' : 'copy'} size={16} />
                    </IconButton>
                  }
                >
                  <a
                    href={shortLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...LINK_TEXT, color: 'var(--fg-1)', textDecoration: 'none' }}
                  >
                    {shortLink}
                  </a>
                </LinkRow>
              </div>

              {qrSrc && !qrFailed && (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-4)' }}>
                  <FieldLabel icon={<Icon name="qr-code" size={14} />}>QR code</FieldLabel>
                  <div style={{ display: 'grid', justifyItems: 'center', gap: 'var(--sp-4)' }}>
                    {/* The frost pane is the system's white surface, and a QR
                        needs a light one to be readable by a camera at all. */}
                    <div
                      style={{
                        padding: 'var(--sp-5)',
                        borderRadius: 'var(--r-lg)',
                        backgroundImage: 'var(--glass-frost)',
                        boxShadow: 'var(--shadow-3)',
                      }}
                    >
                      <img
                        src={qrSrc}
                        alt={`QR code for ${shortLink}`}
                        onError={() => setQrFailed(true)}
                        style={{ display: 'block', width: 160, height: 160, objectFit: 'contain' }}
                      />
                    </div>
                    <a
                      href={qrSrc}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 'var(--sp-3)',
                        font: 'var(--type-caption)',
                        color: 'var(--fg-4)',
                        textDecoration: 'none',
                      }}
                    >
                      <Icon name="external-link" size={13} />
                      Open the QR image
                    </a>
                  </div>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--sp-4)',
                  height: 46,
                  padding: '0 var(--sp-4) 0 var(--sp-6)',
                  borderRadius: 'var(--r-control)',
                  backgroundImage: 'var(--glass-well)',
                  boxShadow: 'var(--glass-well-shadow)',
                }}
              >
                <Icon name="bar-chart-3" size={16} style={{ color: 'var(--fg-4)' }} />
                <span style={{ flex: 1, font: 'var(--type-label)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)' }}>
                  Clicks
                </span>
                {clicks !== null ? (
                  <span
                    style={{
                      font: 'var(--type-numeric)',
                      fontSize: 'var(--text-md)',
                      color: 'var(--fg-1)',
                      fontVariantNumeric: 'tabular-nums',
                      paddingRight: 'var(--sp-3)',
                    }}
                  >
                    {clicks}
                  </span>
                ) : (
                  /* Glass, not ghost: a ghost pill inside a well reads as flat
                     text and nobody presses it. */
                  <Button size="sm" loading={loadingAnalytics} onClick={() => void handleAnalytics()}>
                    View
                  </Button>
                )}
              </div>

              {error && <Note tone="rose" icon="circle-alert">{error}</Note>}

              <Button
                variant="tint"
                tone="rose"
                block
                loading={working}
                iconLeft={<Icon name="trash-2" size={16} />}
                onClick={() => void handleDelete()}
              >
                Remove short link
              </Button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-5)' }}>
              <FieldLabel icon={<Icon name="link-2" size={14} />}>Create short link</FieldLabel>

              <Input
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value.replace(/\s+/g, '-'))}
                placeholder="custom-keyword (optional)"
                aria-label="Custom keyword"
                spellCheck={false}
              />

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-3)' }}>
                <Input
                  value={domainInput}
                  onChange={(e) => setDomainInput(e.target.value.trim())}
                  placeholder={defaultDomain}
                  aria-label="Branded domain"
                  spellCheck={false}
                  iconLeft={<Icon name="globe" size={16} />}
                />
                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
                  The domain has to be verified in your SimpleURL dashboard already. Leave it as it is
                  to use <span style={{ color: 'var(--fg-3)' }}>{defaultDomain}</span>.
                </span>
              </div>

              {error && <Note tone="rose" icon="circle-alert">{error}</Note>}

              <Button
                variant="solid"
                size="lg"
                block
                loading={working}
                iconLeft={<Icon name="link-2" size={18} />}
                onClick={() => void handleGenerate()}
              >
                Generate short link + QR
              </Button>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
