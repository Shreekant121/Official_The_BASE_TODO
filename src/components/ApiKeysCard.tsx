/**
 * The Gemini keys, on Settings (item 13G, second pass).
 *
 * **Shreekant's call, 2026-09-08: *"put the api key info in the settings page
 * below the simpleURL page"*.** They were a button on `/chat`'s instrument bar
 * opening a dialog, which put a credential on the screen you use it from
 * rather than the screen credentials live on — Settings already holds the
 * SimpleURL key, and this now sits directly under it.
 *
 * **Nothing about what it does has changed.** `addKey`, `removeKey` and
 * `selectKey` are the same three calls on `useApiKeyStore`, the validation is
 * the same one that returns a reason, and every word of copy came across
 * unedited. What went is the `Dialog` wrapper and its close button: a card on
 * a page has nothing to dismiss.
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
import { Button, Card, Icon, IconButton, Input } from '../ui';
import { maskKey, useApiKeyStore } from '../lib/agent/apiKeys';
import { useAccountAccess, useAssistantRoute } from '../lib/accountAccess';

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
        /* Chosen = live = emerald, and it emits, which is what `elevation.css`
           allows a selected object to do. Every other row is neutral glass. */
        backgroundImage: active ? 'var(--glass-tint-accent)' : 'var(--glass-fill-1)',
        boxShadow: active ? 'var(--glass-rim-2), var(--glow-accent-sm)' : 'var(--glass-rim-1)',
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
          style={{ display: 'flex', flex: '0 0 auto', color: active ? 'var(--accent)' : 'var(--fg-3)' }}
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
          color: active ? 'var(--accent)' : 'transparent',
        }}
      >
        <Icon name="check" size={18} />
      </span>
    </div>
  );
}

export default function ApiKeysCard() {
  const { keys, activeId, addKey, removeKey, selectKey } = useApiKeyStore();
  const route = useAssistantRoute();
  const owner = useAccountAccess((s) => s.owner);
  const proxyOffered = route === 'owner-key';
  /* Mirrors `getActiveApiKey`: without the proxy, "none chosen" is the first key. */
  const litId = activeId ?? (proxyOffered ? null : keys[0]?.id ?? null);
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    const failure = addKey(label, value);
    setError(failure);
    if (!failure) {
      setLabel('');
      setValue('');
    }
  };

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
              Gemini API keys
            </h2>
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
              Which key the assistant spends when Gemini is answering.
            </span>
          </div>
        </div>

        <p
          style={{
            font: 'var(--type-body)', fontSize: 'var(--text-sm)',
            color: 'var(--fg-3)', textWrap: 'pretty',
          }}
        >
          Stored in this browser and, when signed in, also synced to your account so it can be remembered
          across sessions. A selected key calls Gemini directly
          {proxyOffered
            ? '; with none selected the request goes through the server proxy.'
            : ', and this account needs one of its own for the assistant to answer.'}
        </p>

        {route === 'off' && (
          <p style={{ font: 'var(--type-caption)', color: 'var(--status-review)', textWrap: 'pretty' }}>
            The assistant is switched off for this account. Keys can still be added here, and are used once it is
            switched on.
          </p>
        )}

      <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
        {proxyOffered && (
          <KeyRow
            active={litId === null}
            icon={<Icon name="server" size={18} />}
            title={owner ? 'Server proxy' : 'Shared key'}
            detail={
              owner
                ? 'Uses GEMINI_API_KEY on the deployment. Needs no key here.'
                : 'Switched on for this account by the admin. Needs no key here.'
            }
            onSelect={() => selectKey(null)}
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
            onSelect={() => selectKey(entry.id)}
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
          placeholder="AIza…"
          autoComplete="off"
          aria-label="Gemini API key"
          invalid={error !== null}
        />
        {error && (
          <span style={{ font: 'var(--type-caption)', color: 'var(--status-overrun)' }}>{error}</span>
        )}
        <Button
          variant="tint"
          block
          disabled={value.trim() === ''}
          iconLeft={<Icon name="plus" size={16} />}
          onClick={handleAdd}
        >
          Add key
        </Button>
      </div>

      <p style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
        A free key allows about 5 requests a minute and 20 a day, and one chat turn spends 3–6 of them —
        roughly four turns a day per key. Get one at{' '}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
          aistudio.google.com/apikey
        </a>
        .
      </p>
      </div>
    </Card>
  );
}
