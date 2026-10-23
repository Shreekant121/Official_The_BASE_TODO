/**
 * Who answers this — one picker over both hosted and local models (item 6).
 *
 * **One list, not two.** Google's models and the ones running on his laptop
 * sit in the same popover under two headings, because the question the user is
 * answering is "who answers this", not "which vendor". The app has no
 * hosted/local switch anywhere else and does not gain one here.
 *
 * **It names no models.** Both groups are fetched — `lib/agent/modelStore.ts`
 * asks Google's models endpoint, and Atlas for Ollama's `/api/tags` — so this
 * file cannot go stale when a preview is retired or a model is pulled, and
 * there is no list in the source to keep in step with reality.
 *
 * **It is the app's own picker**, not a `<select>` and not a new kind of
 * control: `PickerButton` for the trigger, `PortalDropdown` for the panel,
 * `PickerHeading`/`PickerOption` for the contents — the same three parts as
 * the six task-field editors and New Session's three. The trigger is `sm`
 * (38px) because it sits in a header row beside the key button, which is where
 * `pickers.tsx` says that height belongs.
 *
 * THE TWO GROUPS FAIL INDEPENDENTLY, AND THE PANEL IS BUILT AROUND THAT
 * ---------------------------------------------------------------------
 * This is the fact that shapes everything below. Hosted needs a key and the
 * network; local needs a daemon on this machine. Either can be empty while the
 * other is perfect, and the fix for one is nothing like the fix for the other
 * — so **each group carries its own count, its own explanation and its own
 * "try again"**, in its own heading and its own rows. There is no panel-level
 * error line and no panel-level refresh, because neither could say anything
 * true about both halves at once.
 *
 * The first version had exactly that, and it was the thing that went wrong in
 * use: an empty hosted group read *"No hosted models came back"* in grey,
 * centred, with the only refresh control at the foot of the panel labelled as
 * though it were about Ollama. That sentence names no cause, offers no fix,
 * and is equally true of four different problems. A `Problem` row now says
 * which one it is and carries the button that retries it.
 *
 * WHY THE LOCAL GROUP CARRIES A SENTENCE THE HOSTED ONE DOES NOT
 * --------------------------------------------------------------
 * **Item 8 replaced this sentence rather than deleting it, and what it used to
 * say is worth knowing.** It said local models were desktop-only, permanently:
 * *"Ollama listens on `localhost`, and this app is served from Vercel, so from
 * the tablet `localhost` is the tablet and there is nothing there — not a bug
 * waiting to be fixed."* Atlas fixed it. The models are on the laptop, Atlas
 * is on the laptop with them, and the tablet reaches it over Tailscale. The
 * local group is now the same list on every device.
 *
 * What is left to say is a different limitation with the same shape: **the
 * laptop has to be awake.** A closed lid empties this group, and the fix is a
 * lid rather than a config file, so the line states the dependency instead of
 * a boundary.
 *
 * **It is one line when the models are there, and the whole story when they
 * are not.** The first version printed four lines of caveat above a working
 * list — `OLLAMA_ORIGINS` and all — which made the least useful thing in the
 * panel its visual centre, worth two and a half rows of models. The detail is
 * diagnosis: it belongs in the empty state, where somebody is actually asking
 * why.
 *
 * OPT-8 — ONE PICKER PER SIDE, AND THEY LIVE IN SETTINGS
 * ------------------------------------------------------
 * His words: *"there is a Ai model selector … shift it to settings and in
 * settings allow me to select a default local Ai model and a Default Cloud Ai
 * model"*. So this is drawn twice on Settings → Atlas, `side="local"` with the
 * laptop's group and `side="cloud"` with Gemini's and Claude-and-ChatGPT's, and
 * a pick sets that side's default without moving the chat's Local | Cloud
 * switch (`chat/ModelSideSwitch.tsx`). The row trigger at the foot of the chat
 * list, and the tinted pill before it, are gone. "One list, not two" above was
 * the old picker's rule; his call replaced it.
 */
import { Fragment, useRef, useState } from 'react';
import { Icon, IconButton } from '../ui';
import { PickerButton, PickerHeading, PickerList, PickerOption } from './pickers';
import { PortalDropdown } from './PortalDropdown';
import { catalogueOf, useModelStore } from '../lib/agent/modelStore';
import { defaultOf, type ModelOption, type ModelSide } from '../lib/agent/models';

/** Wider than the trigger when the trigger is narrow; see `PortalDropdown`. */
const PANEL_PX = 340;

/**
 * The size beside a local model, or the id beside a hosted one whose id is not
 * simply its name slugified (`parseGeminiModels` decides that). Capped and
 * ellipsised rather than left to size itself: `PickerOption`'s `meta` column
 * does not shrink, so a long id would push the row past the panel it is in.
 */
function Meta({ children }: { children: string }) {
  return (
    <span
      style={{
        display: 'block', maxWidth: 132,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

/** How many are in this group, in the heading. `…` while it is still being asked. */
function Count({ n, loading }: { n: number; loading: boolean }) {
  return (
    <span style={{ color: 'var(--fg-4)', fontVariantNumeric: 'tabular-nums' }}>
      {loading ? '…' : n}
    </span>
  );
}

/**
 * A group that came back empty, said as a row rather than as a caption.
 *
 * Left-aligned on the rows' own inset so it reads as part of the list, amber
 * because this is "needs a decision" and not "something is on fire" — the same
 * call `DependencyPicker` made for an incomplete prerequisite — and carrying
 * the retry itself, because the panel-level one was three groups away from the
 * problem it fixed.
 */
function Problem({ children, onRetry }: { children: React.ReactNode; onRetry?: () => void }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)',
        padding: 'var(--sp-4) var(--sp-4) var(--sp-5)',
      }}
    >
      <span aria-hidden="true" style={{ display: 'flex', flex: '0 0 auto', paddingTop: 2, color: 'var(--status-overrun)' }}>
        <Icon name="circle-alert" size={14} />
      </span>
      <span style={{ flex: 1, minWidth: 0, font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
        {children}
      </span>
      {onRetry && (
        <IconButton label="Try again" title="Try again" variant="ghost" size="sm" onClick={onRetry}>
          <Icon name="refresh-cw" size={14} />
        </IconButton>
      )}
    </div>
  );
}

/** The standing note under a group heading. One line; the long version is in `Problem`. */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        padding: 'var(--sp-3) var(--sp-4) var(--sp-4)',
        font: 'var(--type-caption)',
        color: 'var(--fg-4)',
        textWrap: 'pretty',
      }}
    >
      {children}
    </p>
  );
}

function Group({
  models,
  active,
  onPick,
}: {
  models: ModelOption[];
  active: string;
  onPick: (option: ModelOption) => void;
}) {
  return (
    <>
      {models.map((option) => (
        <PickerOption
          key={option.key}
          selected={option.key === active}
          onClick={() => onPick(option)}
          meta={option.detail !== '' ? <Meta>{option.detail}</Meta> : undefined}
        >
          {option.label}
        </PickerOption>
      ))}
    </>
  );
}

/** The default model of one side, chosen in Settings → Atlas (OPT-8). */
export default function ModelPicker({ side }: { side: ModelSide }) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const hosted = useModelStore((s) => s.hosted);
  const local = useModelStore((s) => s.local);
  const hostedWithoutChat = useModelStore((s) => s.hostedWithoutChat);
  const localWithoutTools = useModelStore((s) => s.localWithoutTools);
  const hostedError = useModelStore((s) => s.hostedError);
  const localError = useModelStore((s) => s.localError);
  const cloud = useModelStore((s) => s.cloud);
  const cloudError = useModelStore((s) => s.cloudError);
  const loading = useModelStore((s) => s.loading);
  const chooseDefault = useModelStore((s) => s.chooseDefault);
  const refresh = useModelStore((s) => s.refresh);
  /* A safe selector: it returns an entry out of the lists (or `null`), never
     a fresh object — `selectEffectiveModel`'s reasoning. */
  const active = useModelStore((s) => defaultOf(catalogueOf(s), s.choice, side));

  const retry = () => { void refresh(); };
  const pick = (option: ModelOption) => { chooseDefault(side, option.key); setIsOpen(false); };
  const activeKey = active?.key ?? '';

  const hostedGroup = (
    <Fragment key="hosted">
      <PickerHeading
        icon={<Icon name="globe" size={14} />}
        trailing={<Count n={hosted.length} loading={loading} />}
      >
        Gemini
      </PickerHeading>

      {hosted.length > 0 ? (
        <Group models={hosted} active={activeKey} onPick={pick} />
      ) : loading ? (
        <Note>Asking Google…</Note>
      ) : (
        /* Four different problems used to share one sentence. Each of these
           is a different next step, so each gets its own. */
        <Problem onRetry={retry}>
          {hostedError ??
            (hostedWithoutChat > 0
              ? `Google returned ${hostedWithoutChat} model${hostedWithoutChat === 1 ? '' : 's'}, and none of them can hold a conversation — they are image, speech or embedding models. Check that this key is for the Gemini API.`
              : 'Google’s reply carried no models at all. The key may be new, restricted, or for a different API.')}
        </Problem>
      )}
    </Fragment>
  );

  const localGroup = (
    <Fragment key="local">
      <PickerHeading
        icon={<Icon name="laptop" size={14} />}
        trailing={
          <>
            <Count n={local.length} loading={loading} />
            <IconButton
              label="Look for local models again"
              title="Look for local models again"
              variant="ghost"
              size="sm"
              onClick={retry}
            >
              <Icon name="refresh-cw" size={14} />
            </IconButton>
          </>
        }
      >
        On your laptop
      </PickerHeading>

      {local.length > 0 ? (
        <>
          {/* One line, above the rows. The dependency still has to be stated
              where the models are listed, but with three of them sitting
              underneath it does not need explaining, only stating. */}
          <Note>
            Running on your laptop, free — on any device, while the laptop is awake.
            {localWithoutTools > 0 && (
              <>
                {' '}
                {localWithoutTools} more {localWithoutTools === 1 ? 'is' : 'are'} installed but
                cannot use tools, so {localWithoutTools === 1 ? 'it is' : 'they are'} not listed.
              </>
            )}
          </Note>
          <Group models={local} active={activeKey} onPick={pick} />
        </>
      ) : loading ? (
        <Note>Asking your laptop…</Note>
      ) : (
        /* The empty state is where the whole story belongs: this is the moment
           somebody is actually asking why the list is empty. */
        <Problem onRetry={retry}>
          {localError ?? 'Your laptop is answering but has no model that can use tools.'} These
          models run on your laptop and reach this screen through Atlas, so they are listed only
          while the laptop is awake, on your network, and running Atlas. Cloud keeps working
          either way.
        </Problem>
      )}
    </Fragment>
  );

  /*
   * BIG-1: Claude and ChatGPT, on his own keys, answered through the laptop.
   *
   * Their list is the laptop's, so like the local group it empties when the
   * lid closes — that is the rule (laptop only, his call), and the note says
   * so rather than apologising for it. With no Claude or ChatGPT key in the
   * sheet there is nothing to ask for, and the group says where keys go.
   */
  const cloudGroup = (
    <Fragment key="cloud">
      <PickerHeading
        icon={<Icon name="sparkles" size={14} />}
        trailing={<Count n={cloud.length} loading={loading} />}
      >
        Claude and ChatGPT
      </PickerHeading>

      {cloud.length > 0 ? (
        <>
          <Note>Through your laptop, on your own keys — while the laptop is awake.</Note>
          <Group models={cloud} active={activeKey} onPick={pick} />
        </>
      ) : loading ? (
        <Note>Asking your laptop…</Note>
      ) : cloudError !== null ? (
        <Problem onRetry={retry}>{cloudError}</Problem>
      ) : (
        <Note>Add a Claude or ChatGPT key in Settings → Connections to list their models here.</Note>
      )}
    </Fragment>
  );

  const label = side === 'local' ? 'Choose the default local model' : 'Choose the default cloud model';

  return (
    <>
      <PickerButton
        ref={triggerRef}
        open={isOpen}
        glyph={<Icon name={side === 'local' ? 'laptop' : 'globe'} size={16} />}
        /* The harness opens these by their `title`. */
        title={label}
        aria-label={label}
        onClick={() => setIsOpen((v) => !v)}
        style={{ width: '100%' }}
      >
        {active?.label ?? (loading ? 'Looking…' : side === 'local' ? 'No local model listed' : 'No cloud model listed')}
      </PickerButton>

      <PortalDropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onOpen={() => setIsOpen(true)}
        triggerRef={triggerRef}
        width={PANEL_PX}
        align="left"
      >
        <PickerList maxHeight="min(60vh, 420px)">
          {side === 'local' ? localGroup : [hostedGroup, cloudGroup]}
        </PickerList>
      </PortalDropdown>
    </>
  );
}
