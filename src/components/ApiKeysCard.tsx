/**
 * The AI keys, on Settings → Connections (item 13G, second pass; BIG-1).
 *
 * **Shreekant's call, 2026-09-08: *"put the api key info in the settings page
 * below the simpleURL page"*.** They were a button on `/chat`'s instrument bar
 * opening a dialog, which put a credential on the screen you use it from
 * rather than the screen credentials live on — Settings already holds the
 * SimpleURL key, and this now sits directly under it.
 *
 * **BIG-1 made it three sheets in one card.** Gemini, Claude and ChatGPT each
 * have their own keys and their own chosen key, behind one segmented control
 * — a new card per vendor would have stacked three near-identical panes down
 * a screen BIG-9 is going to redraw anyway. Claude and ChatGPT are **bring
 * your own key only** (his call, 2026-09-22): only Gemini has the proxy row,
 * because only Gemini is shared with other accounts. Every rule about what a
 * key may be is `lib/agent/keyRing.ts`, which is pure and tested; this file
 * only draws it.
 *
 * The rows keep UI-33's corrections, which are still right and are argued in
 * the file this came out of: a key row is a **pane** and not a well, because
 * the row IS the control — pressing it chooses which key the next turn spends;
 * the chosen one glows, which `elevation.css` rations to *selected*; and the
 * tick column is always there at 20px so picking a different key does not
 * shuffle every row sideways.
 *
 * BUILD-6 — the proxy row is only offered to an account the proxy will
 * answer: the owner, or one he switched onto his key from the admin screen.
 * Everyone else sees their own keys and nothing else, and with none chosen
 * the first one is what `getActiveApiKey` spends, so that is the row lit.
 */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { BlurAcross, Card, Icon, IconButton, Input, SegmentedControl, WarnLine, WhiteButton } from '../ui';
import { maskKey, useApiKeyStore } from '../lib/agent/apiKeys';
import { chosenKey, detectProvider, keysOf, KEY_PROVIDER_NAMES, type KeyProvider } from '../lib/agent/keyRing';
import { useAccountAccess, useAssistantRoute } from '../lib/accountAccess';

/** What each tab says, and where a key comes from. */
const SHEETS: Record<
  KeyProvider,
  { what: string; placeholder: string; getOne: { href: string; text: string }; note: string }
> = {
  gemini: {
    what: 'Which key Gemini spends. Your own key also lets Gemini answer through Atlas on your laptop, with every tool.',
    placeholder: 'AIza…',
    getOne: { href: 'https://aistudio.google.com/apikey', text: 'aistudio.google.com/apikey' },
    note:
      'A free key allows about 5 requests a minute and 20 a day, and one chat turn spends 3–6 of them — roughly four turns a day per key.',
  },
  anthropic: {
    what: 'Claude answers through Atlas on your laptop, on this key, while the laptop is awake.',
    placeholder: 'sk-ant-…',
    getOne: { href: 'https://console.anthropic.com/settings/keys', text: 'console.anthropic.com' },
    note:
      'A Claude Pro subscription is not an API key: the API is paid for separately, per use, and Atlas shows what each turn cost.',
  },
  openai: {
    what: 'ChatGPT answers through Atlas on your laptop, on this key, while the laptop is awake.',
    placeholder: 'sk-…',
    getOne: { href: 'https://platform.openai.com/api-keys', text: 'platform.openai.com/api-keys' },
    note:
      'A ChatGPT Plus subscription is not an API key: the API is paid for separately, per use, and Atlas shows what each turn cost.',
  },
};

/** A selectable row: the proxy, or one stored key. */
function KeyRow({
  active,
  icon,
  title,
  detail,
  mono = false,
  onSelect,
  trailing,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  detail: string;
  mono?: boolean;
  onSelect: () => void;
  trailing?: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-5)',
        padding: 'var(--sp-5) var(--sp-5) var(--sp-5) var(--sp-6)',
        borderRadius: 'var(--r-lg)',
        /* Chosen = lime since 29-1P2c1 (it was emerald, "chosen = live"), and
           it emits, which is what `elevation.css` allows a selected object to
           do. Every other row is neutral glass. */
        backgroundImage: active ? 'var(--glass-tint-lime)' : 'var(--glass-fill-1)',
        boxShadow: active ? 'var(--glass-rim-2), var(--job-lime-shine)' : 'var(--glass-rim-1)',
        transition: 'var(--t-hover)',
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--sp-5)',
          flex: 1,
          minWidth: 0,
          border: 0,
          padding: 0,
          background: 'transparent',
          textAlign: 'left',
          color: 'inherit',
          borderRadius: 'var(--r-sm)',
          cursor: 'pointer',
        }}
        aria-pressed={active}
      >
        <span
          aria-hidden="true"
          style={{ display: 'flex', flex: '0 0 auto', color: active ? 'var(--job-lime)' : 'var(--fg-3)' }}
        >
          {icon}
        </span>
        <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
          <span
            style={{
              font: 'var(--type-label)',
              color: 'var(--fg-1)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </span>
          <span
            style={{
              font: mono ? 'var(--type-kicker)' : 'var(--type-caption)',
              letterSpacing: mono ? 'var(--tracking-kicker)' : undefined,
              color: 'var(--fg-3)',
              textWrap: 'pretty',
            }}
          >
            {detail}
          </span>
        </span>
      </button>
      {trailing}
      {/* Always present, transparent when this is not the chosen key: a tick
          that appears and disappears shifts every row's text by its width. */}
      <span
        aria-hidden="true"
        style={{
          display: 'flex', width: 20, justifyContent: 'center', flex: '0 0 auto',
          color: active ? 'var(--job-lime)' : 'transparent',
        }}
      >
        <Icon name="check" size={18} />
      </span>
    </div>
  );
}

export default function ApiKeysCard() {
  const ring = useApiKeyStore();
  const { addKey, removeKey, selectKey } = ring;
  const route = useAssistantRoute();
  const owner = useAccountAccess((s) => s.owner);
  const [provider, setProvider] = useState<KeyProvider>('gemini');
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sheet = SHEETS[provider];
  const name = KEY_PROVIDER_NAMES[provider];
  const keys = keysOf(ring, provider);
  const proxyOffered = provider === 'gemini' && route === 'owner-key';
  /* Mirrors `getActiveApiKey` for Gemini, `atlasKeyOf` for the other two:
     with none chosen the first key is the one spent, except where the proxy
     is offered, where none chosen means the proxy. */
  const litId = chosenKey(ring, provider)?.id ?? (proxyOffered ? null : keys[0]?.id ?? null);

  const handleAdd = () => {
    const failure = addKey(label, value, provider);
    setError(failure);
    if (!failure) {
      setLabel('');
      setValue('');
    }
  };

  /* A key pasted under the wrong tab is caught on Add; this names the right
     tab while he is still looking at the field, and offers to move there. */
  const looksLike = detectProvider(value);
  const misfiled = looksLike !== null && looksLike !== provider && value.trim().length >= 20 ? looksLike : null;

  /* The accent means the same thing it means on the SimpleURL card above: a
     credential of your own is actually live. With none chosen the proxy is
     answering, which is a working state and not a lit one. */
  const live = litId !== null && route !== 'off';

  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--sp-7)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)' }}>
          <span
            aria-hidden="true"
            style={{
              display: 'grid', placeItems: 'center', width: 44, height: 44, flex: '0 0 auto',
              borderRadius: '50%',
              backgroundImage: live ? 'var(--glass-tint-accent)' : 'var(--glass-fill-2)',
              boxShadow: live ? 'var(--glass-rim-2), var(--glow-accent-sm)' : 'var(--glass-rim-2)',
              color: live ? 'oklch(0.93 0.07 162)' : 'var(--fg-2)',
              transition: 'var(--t-hover)',
            }}
          >
            <Icon name="key-round" size={20} />
          </span>
          <div style={{ display: 'grid', gap: 2, minWidth: 0, flex: 1 }}>
            <h2 style={{ font: 'var(--type-title)', letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)' }}>
              AI keys
            </h2>
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
              Gemini, Claude and ChatGPT — which key each one spends.
            </span>
          </div>
        </div>

        {/* The soft pressed-in switch since 29-1P2, as every view switch. */}
        <SegmentedControl
          look="soft"
          aria-label="Which AI's keys"
          options={(['gemini', 'anthropic', 'openai'] as const).map((p) => ({
            value: p,
            label: `${KEY_PROVIDER_NAMES[p]}${keysOf(ring, p).length > 0 ? ` · ${keysOf(ring, p).length}` : ''}`,
          }))}
          value={provider}
          onChange={(next) => {
            setProvider(next as KeyProvider);
            setError(null);
          }}
          style={{ width: '100%' }}
        />

        {/* 29-1P5c, idea 60: another provider's keys blur across. */}
        <BlurAcross value={provider} index={['gemini', 'anthropic', 'openai'].indexOf(provider)} style={{ display: 'grid', gap: 'var(--sp-7)' }}>
        <p
          style={{
            font: 'var(--type-body)', fontSize: 'var(--text-sm)',
            color: 'var(--fg-3)', textWrap: 'pretty',
          }}
        >
          {sheet.what} Stored in this browser and, when signed in, synced to your account.
          {provider === 'gemini' &&
            (proxyOffered
              ? ' With none selected, Atlas on this device uses the app\'s own Gemini key.'
              : ' This account needs one of its own for the assistant to answer.')}
        </p>

        {route === 'off' && provider === 'gemini' && (
          <WarnLine>
            The assistant is switched off for this account. Keys can still be added here, and are used once it is
            switched on.
          </WarnLine>
        )}

        <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
          {proxyOffered && (
            <KeyRow
              active={litId === null}
              icon={<Icon name="server" size={18} />}
              title={owner ? 'Server proxy' : 'Shared key'}
              detail={
                owner
                  ? 'Uses GEMINI_API_KEY on the deployment. Needs no key here, but Atlas cannot use it.'
                  : 'Switched on for this account by the admin. Needs no key here.'
              }
              onSelect={() => selectKey(null, 'gemini')}
            />
          )}

          {keys.map((entry) => (
            <KeyRow
              key={entry.id}
              active={entry.id === litId && route !== 'off'}
              icon={<Icon name="key-round" size={18} />}
              title={entry.label}
              detail={maskKey(entry.key)}
              mono
              onSelect={() => selectKey(entry.id, provider)}
              trailing={
                <IconButton
                  label={`Remove ${entry.label}`}
                  title={`Remove ${entry.label}`}
                  variant="ghost"
                  size="sm"
                  onClick={() => removeKey(entry.id)}
                >
                  <Icon name="trash-2" size={15} />
                </IconButton>
              }
            />
          ))}

          {keys.length === 0 && !proxyOffered && (
            <p style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', padding: '0 var(--sp-2)' }}>
              No {name} key yet.
            </p>
          )}
        </div>

        {/* The source's own divider, and it does the work `FieldLabel` used to:
            the two fields below are self-describing, and a kicker over them
            only repeats the button underneath. */}
        <div aria-hidden="true" style={{ height: 1, background: 'var(--line-faint)' }} />

        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Name it — “personal”, “the paid one”"
            aria-label="Key name"
          />
          <Input
            type="password"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
            placeholder={sheet.placeholder}
            autoComplete="off"
            aria-label={`${name} API key`}
            invalid={error !== null}
          />
          {misfiled !== null && error === null && (
            <WarnLine as="span">
              That looks like a {KEY_PROVIDER_NAMES[misfiled]} key.{' '}
              <button
                type="button"
                onClick={() => setProvider(misfiled)}
                style={{
                  border: 0, padding: 0, background: 'transparent', cursor: 'pointer',
                  font: 'inherit', color: 'var(--accent)', textDecoration: 'underline',
                }}
              >
                Add it under {KEY_PROVIDER_NAMES[misfiled]}
              </button>
            </WarnLine>
          )}
          {error && (
            <span style={{ font: 'var(--type-caption)', color: 'var(--status-overrun)' }}>{error}</span>
          )}
          {/* The form's yes: solid white since 29-1P2. */}
          <WhiteButton
            block
            disabled={value.trim() === ''}
            icon={<Icon name="plus" size={16} />}
            onClick={handleAdd}
          >
            Add {name} key
          </WhiteButton>
        </div>

        <p style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
          {sheet.note} Get one at{' '}
          <a href={sheet.getOne.href} target="_blank" rel="noreferrer">
            {sheet.getOne.text}
          </a>
          .
        </p>
        </BlurAcross>
      </div>
    </Card>
  );
}
