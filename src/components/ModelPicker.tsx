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
 */
import { Fragment, forwardRef, useRef, useState } from 'react';
import { Icon, IconButton } from '../ui';
import { PickerButton, PickerHeading, PickerList, PickerOption } from './pickers';
import { PortalDropdown } from './PortalDropdown';
import { selectEffectiveModel, useModelStore } from '../lib/agent/modelStore';
import type { ModelOption } from '../lib/agent/models';

/** Wider than the trigger, and hung off its right edge — see `PortalDropdown`'s `align`. */
const PANEL_PX = 340;

/**
 * ITEM 9D — THE TRIGGER IS A TINTED PILL, AND THE COLOUR IS THE READOUT
 * ----------------------------------------------------------------------
 * `screens/atlas.html` draws this control and comments its own reason:
 * *"emerald when the answer came from the house, cyan when it left it — the
 * colour IS the privacy readout."* That is the one thing a name alone cannot
 * say at a glance, and it is the whole argument for this control looking
 * different from the six task-field pickers, which stay wells.
 *
 * **Three departures from the mockup, all for the app's own consistency.**
 * It keeps `PickerButton` rather than becoming a bespoke `<button>`, so the
 * focus ring, the ellipsis and the chevron stay the ones every picker has. It
 * keeps `laptop`/`globe` rather than taking the mockup's `cpu`/`cloud`,
 * because the panel's two headings already wear those glyphs and swapping only
 * the trigger would make one control speak two vocabularies — 9C's call about
 * the trash chips, for the same reason. And it keeps its `title`, which is how
 * the harness opens it.
 *
 * **The glow is inside `readme.md`'s ration, not an exception to it.** Emission
 * is for what is *live, selected, running or overrun*; this pill is a live
 * selection, and it is the only thing on the instrument bar that is either.
 */
const TRIGGER_TINT = {
  local: {
    backgroundImage: 'var(--glass-tint-accent)',
    boxShadow: 'var(--glass-rim-2), var(--glow-accent-sm)',
  },
  hosted: {
    backgroundImage: 'var(--glass-tint-cyan)',
    boxShadow: 'var(--glass-rim-2), var(--glow-cyan-md)',
  },
} as const;

/**
 * The glyph's ink on the emerald tint. `--accent` itself is too dark to read
 * against `--glass-tint-accent` — the same lifted emerald `ChatPage`'s mark
 * uses, and for the same reason.
 */
const MODEL_INK = 'oklch(0.93 0.07 162)';

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
      <span aria-hidden="true" style={{ display: 'flex', flex: '0 0 auto', paddingTop: 2, color: 'var(--status-review)' }}>
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

/**
 * ITEM 13G, second pass — `row` puts this at the foot of the chat list.
 *
 * Shreekant's call, 2026-09-08: *"put the model picker below the chats with a
 * small icon and text just like others"*. It used to be a tinted pill on the
 * header's instrument bar; that bar is gone, and which model answers is a
 * standing fact about the conversation rather than something set per turn — so
 * it belongs beside the conversations, not above the transcript.
 *
 * The row shape is `AtlasNavPanel`'s `SubRow`, which is the "others" he means:
 * a glyph, a name, and a line of note under it. The panel it opens, and every
 * word in that panel, is unchanged — only the trigger has two shapes now.
 */
export default function ModelPicker({ row = false }: { row?: boolean } = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const hosted = useModelStore((s) => s.hosted);
  const local = useModelStore((s) => s.local);
  const hostedWithoutChat = useModelStore((s) => s.hostedWithoutChat);
  const localWithoutTools = useModelStore((s) => s.localWithoutTools);
  const hostedError = useModelStore((s) => s.hostedError);
  const localError = useModelStore((s) => s.localError);
  const loading = useModelStore((s) => s.loading);
  const select = useModelStore((s) => s.select);
  const refresh = useModelStore((s) => s.refresh);
  const active = useModelStore(selectEffectiveModel);

  const isLocal = active.provider === 'ollama';
  const retry = () => { void refresh(); };
  const pick = (option: ModelOption) => { select(option.key); setIsOpen(false); };

  /*
   * ── Which group is drawn first ────────────────────────────────────────
   *
   * The one the current model is in, so the panel always opens on the ticked
   * row. That is not a flourish; the lists are wildly different lengths.
   * Google returns thirty-odd models and Ollama returns three, so with a fixed
   * order one device or the other opens this panel onto a wall of rows that
   * are not the answer, and has to scroll to find the model it is already
   * using. Measured with only four hosted rows in the fixture, the local group
   * was already past the fold.
   *
   * It also keeps the tablet from opening on a complaint it can never act on:
   * there, the active model is hosted, so the working list comes first and the
   * "no local models, and here is why" row sits underneath it rather than at
   * the top of every visit. In practice this is stable per device — the
   * desktop always leads with local, the tablet always with hosted — so it
   * reorders in principle and never in front of anyone.
   */
  const groups = isLocal ? ['local', 'hosted'] : ['hosted', 'local'];

  const hostedGroup = (
    <Fragment key="hosted">
      <PickerHeading
        icon={<Icon name="globe" size={14} />}
        trailing={<Count n={hosted.length} loading={loading} />}
      >
        Hosted
      </PickerHeading>

      {hosted.length > 0 ? (
        <Group models={hosted} active={active.key} onPick={pick} />
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
          <Group models={local} active={active.key} onPick={pick} />
        </>
      ) : loading ? (
        <Note>Asking your laptop…</Note>
      ) : (
        /* The empty state is where the whole story belongs: this is the moment
           somebody is actually asking why the list is empty. */
        <Problem onRetry={retry}>
          {localError ?? 'Your laptop is answering but has no model that can use tools.'} These
          models run on your laptop and reach this screen through Atlas, so they are listed only
          while the laptop is awake, on your network, and running Atlas. Gemini keeps working
          either way.
        </Problem>
      )}
    </Fragment>
  );

  return (
    <>
      {row ? (
        <ModelRow
          ref={triggerRef}
          open={isOpen}
          local={isLocal}
          label={active.label}
          onClick={() => setIsOpen((v) => !v)}
        />
      ) : (
        <PickerButton
          ref={triggerRef}
          open={isOpen}
          glyph={
            <Icon
              name={isLocal ? 'laptop' : 'globe'}
              size={16}
              style={{ color: isLocal ? MODEL_INK : 'var(--fg-1)' }}
            />
          }
          /* The harness opens this by its `title`; the label is whichever model
             is answering and changes with what is installed. */
          title="Choose which model answers"
          aria-label="Choose which model answers"
          onClick={() => setIsOpen((v) => !v)}
          style={{ flex: '0 1 auto', maxWidth: 220, ...TRIGGER_TINT[isLocal ? 'local' : 'hosted'] }}
        >
          {active.label}
        </PickerButton>
      )}

      <PortalDropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        triggerRef={triggerRef}
        width={PANEL_PX}
        align={row ? 'left' : 'right'}
      >
        <PickerList maxHeight="min(60vh, 420px)">
          {groups.map((name) => (name === 'hosted' ? hostedGroup : localGroup))}
        </PickerList>
      </PortalDropdown>
    </>
  );
}


/**
 * The row form of the trigger — `AtlasNavPanel`'s `SubRow`, near enough that
 * the two read as one kind of thing when they are three inches apart.
 *
 * The glyph carries the one fact worth colour here: emerald for a model on the
 * laptop, plain for a hosted one. `readme.md` rations the accent to what is
 * live, and "this is running on your own machine, free" is the live fact.
 */
const ModelRow = forwardRef<HTMLButtonElement, {
  open: boolean;
  local: boolean;
  label: string;
  onClick: () => void;
}>(function ModelRow({ open, local, label, onClick }, ref) {
  const [hover, setHover] = useState(false);
  const lit = open || hover;

  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-expanded={open}
      title="Choose which model answers"
      aria-label="Choose which model answers"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', width: '100%', minWidth: 0,
        minHeight: 42, padding: '0 var(--sp-4)', border: 0, cursor: 'pointer', textAlign: 'left',
        borderRadius: 'var(--r-sm)',
        backgroundImage: lit ? 'var(--glass-fill-2)' : 'none',
        boxShadow: lit ? 'var(--glass-rim-2), var(--glass-cast-1)' : 'none',
        transition:
          'box-shadow var(--dur-base) var(--ease-glass),'
          + ' background-image var(--dur-fast) var(--ease-glass)',
      }}
    >
      <span
        aria-hidden="true"
        style={{ display: 'flex', flex: '0 0 auto', color: local ? MODEL_INK : 'var(--fg-3)' }}
      >
        <Icon name={local ? 'laptop' : 'globe'} size={16} />
      </span>
      <span style={{ display: 'grid', gap: 0, minWidth: 0, flex: 1 }}>
        <span
          style={{
            font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-1)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {label}
        </span>
        <span
          style={{
            font: 'var(--type-caption)', color: 'var(--fg-4)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {local ? 'On your laptop' : 'Hosted by Google'}
        </span>
      </span>
      <span
        aria-hidden="true"
        style={{
          display: 'flex', flex: '0 0 auto', color: 'var(--fg-4)',
          transform: open ? 'rotate(180deg)' : undefined,
          transition: 'transform var(--dur-base) var(--ease-morph)',
        }}
      >
        <Icon name="chevron-down" size={14} />
      </span>
    </button>
  );
});
