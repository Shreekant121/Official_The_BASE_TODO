/**
 * Aurora Glass — NotificationCard
 *
 * RECONCILED (UI-25) against
 * `design-system/components/feedback/NotificationCard.{jsx,d.ts,prompt.md}`.
 * The file this replaces was a UI-7 reconstruction made when the design
 * project was unreachable; the handoff bundle arrived in UI-21 and this is
 * the diff being paid off.
 *
 * TAKEN FROM THE SOURCE — the material, which is where a reconstruction
 * guesses and where it was wrong
 * ---------------------------------------------------------------------
 * - **The card is a rung heavier than it was.** `--glass-bd-md` (28px), not
 *   `--glass-bd-sm`. The old note argued a feed of twelve cards should not
 *   stack twelve 28px blurs; the source spends them anyway, and the screen
 *   it ships on never holds twelve.
 * - **It responds to hover and to being open.** Fill lifts `--glass-fill-2`
 *   to `--glass-fill-3`, and the shadow climbs a three-step ladder —
 *   `rim-2, cast-1` at rest, `rim-2, cast-2` hovered, `rim-3, inner-1,
 *   cast-3` open. Ours was one flat surface in all three states.
 * - **The shell has no padding.** The head button is full-bleed and carries
 *   `--sp-5 --sp-6` itself with a 68px floor, which is what lets the whole
 *   row light up rather than a box inset from it.
 * - **The expanded half is indented to the title**, not to the card edge:
 *   `--sp-6 + 38px + --sp-5` clears the icon disc exactly.
 * - **`tone` colours only the icon.** `prompt.md`: *"Tinting the whole card
 *   makes a list of notifications look like a warning wall."* The disc is
 *   neutral `--glass-fill-2` glass and the glyph alone carries the hue — we
 *   were tinting the disc with `--glass-tint-*` as well.
 * - **The expansion is `--dur-morph`/`--ease-morph`**, and there is **no
 *   opacity fade** over it. `prompt.md` is explicit: *"the height genuinely
 *   morphs rather than snapping. Don't replace it with a fade."* Ours faded
 *   the revealed content in on top of the morph.
 *
 * KEPT — production structure the prototype has none of and does not need
 * ---------------------------------------------------------------------
 * 1. **The head is a `<button>` only when there is something to expand
 *    into.** The source makes it one unconditionally, so a card with no
 *    body, no children and no actions ships a control that announces
 *    `aria-expanded` and does nothing when pressed.
 * 2. `aria-controls` on to the body region, and controlled/uncontrolled
 *    both working, the way `Switch` and `MorphMenu` already do.
 * 3. **`body` is clamped in place, not restated below.** `ag-clamp-2` shut,
 *    whole open — the card stops cutting its summary off rather than
 *    printing it twice. The source agrees (*"Collapsed shows one truncated
 *    line of `body`; open shows all of it"*) and only differs on where the
 *    full copy lives; IMPROVEMENTS.md settles that in favour of ours.
 * 4. **`badge` and `children` are additive slots the source has no answer
 *    for.** Our records carry a sync status the mockup's fixture does not
 *    (`StatusPill`, beside the title) and an expanded detail region. Both
 *    are documented divergences, not half-renames.
 * 5. `ag-condense` on arrival — the system's pane-arrival law. The source
 *    component has no entrance because its screen never mounts one late;
 *    ours mounts into a live feed beside Cards that all condense. The two
 *    banners that fly in on their own spring opt out with
 *    `style={{ animation: 'none' }}`.
 * 6. **`outlineOffset: -2px` on the full-bleed head.** `overflow: hidden` is
 *    the source's, and the global `:focus-visible` ring sits at `+2px`
 *    offset — outside the clip. Drawing it inside is what keeps the card
 *    keyboard-visible with the source's material intact.
 *
 * RENAMED TOWARD THE SOURCE — deliberately, and completely
 * ---------------------------------------------------------------------
 * `detail` to `body`, `meta` to `time`, `expanded` to `open`,
 * `defaultExpanded` to `defaultOpen`, `onExpandedChange` to `onToggle`.
 * Same roles, source names.
 *
 * **`onDismiss`/`dismissLabel` are gone.** The source has no dismiss in the
 * head at all — `notifications.html:524` puts Dismiss in `actions`, as a
 * `<Button size="sm" variant="ghost">`. That is the component's whole
 * premise: a Toast disappears so it can only confirm, this persists and
 * expands so it can carry a decision, and a decision belongs in the
 * expanded row. It is also the safer shape here, because in this app
 * dismissing *cancels the real Google Calendar alert* behind the row — an
 * always-visible close glyph one mis-click from the title is the wrong
 * control for that, and behind the expand the card has already said what it
 * is and when it fires.
 *
 * TONES
 * ---------------------------------------------------------------------
 * The source's `.d.ts` names four (`neutral | accent | review | overrun`)
 * and its hue table maps them onto `--status-*`. Its own
 * `screens/notifications.html:76-85` then passes **`queued` and `done`**,
 * which that table has no entry for, so the prototype silently drops both
 * to `--fg-3`. Both are real tokens (`--status-queued`, `--status-done`),
 * so the table is extended by exactly those two — which is what makes the
 * component and the screen, the two halves of UI-25, agree. Nothing else
 * was invented: our old hue-named set (`cyan`/`violet`/`amber`/`rose`) is
 * retired in favour of the source's semantic names.
 */
import { useId, useState } from 'react';
import type { CSSProperties, HTMLAttributes, MouseEvent, ReactNode } from 'react';

/* Tone names are status names, and the hue comes from the status token —
   there is no second colour table in this component. */
const TONE = {
  neutral: 'var(--fg-3)',
  accent:  'var(--accent)',
  queued:  'var(--status-queued)',
  review:  'var(--status-review)',
  done:    'var(--status-done)',
  overrun: 'var(--status-overrun)',
} as const;

export type NotificationTone = keyof typeof TONE;

/** Clears the 38px icon disc so the expanded half lines up with the title. */
const BODY_INDENT = 'calc(var(--sp-6) + 38px + var(--sp-5))';

/* `title` is Omitted for the same reason Toast omits it — the native
   attribute is a tooltip string and this one is the headline node.
   `onToggle` has to go the same way: React declares one on every element for
   `<details>` and the popover API, typed `ToggleEventHandler`, and the
   source's name for this callback collides with it head-on. */
export interface NotificationCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'onToggle'> {
  /** Leading glyph, 16-18px. Sits in a neutral glass disc; `tone` hues it. */
  icon?: ReactNode;
  /** Tints the icon only — the card stays neutral. */
  tone?: NotificationTone;
  title: ReactNode;
  /** Clamped to two lines when shut, shown whole when open. */
  body?: ReactNode;
  /** Right-aligned mono value — a relative timestamp (`2m`, `1h`), a count. */
  time?: ReactNode;
  /** Rendered beside the title. Usually a `<StatusPill size="sm">`. Ours. */
  badge?: ReactNode;
  /** The expanded detail region, above `actions`. Ours. */
  children?: ReactNode;
  /** Buttons revealed in the expanded state — the decision this card carries. */
  actions?: ReactNode;
  /** Controlled expansion. Omit to let the card keep its own. */
  open?: boolean;
  defaultOpen?: boolean;
  onToggle?: (open: boolean) => void;
}

export function NotificationCard({
  icon,
  tone = 'neutral',
  title,
  body,
  time,
  badge,
  children,
  actions,
  open,
  defaultOpen = false,
  onToggle,
  className = '',
  style,
  ...rest
}: NotificationCardProps) {
  const [internal, setInternal] = useState(defaultOpen);
  const [hover, setHover] = useState(false);
  const isOpen = open !== undefined ? open : internal;
  const bodyId = useId();
  const hue = TONE[tone] ?? TONE.neutral;

  /* Note 1 — a body counts, because un-clamping it IS the expansion. */
  const expandable = body != null || children != null || actions != null;

  const toggle = () => {
    if (!expandable) return;
    if (open === undefined) setInternal(!isOpen);
    onToggle?.(!isOpen);
  };

  const shell: CSSProperties = {
    position: 'relative',
    display: 'grid',
    borderRadius: 'var(--r-card)',
    backgroundImage: hover || isOpen ? 'var(--glass-fill-3)' : 'var(--glass-fill-2)',
    backdropFilter: 'var(--glass-bd-md)',
    WebkitBackdropFilter: 'var(--glass-bd-md)',
    boxShadow: isOpen
      ? 'var(--glass-rim-3), var(--glass-inner-1), var(--glass-cast-3)'
      : hover
        ? 'var(--glass-rim-2), var(--glass-cast-2)'
        : 'var(--glass-rim-2), var(--glass-cast-1)',
    overflow: 'hidden',
    animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
    transition: 'background var(--dur-base) var(--ease-glass), box-shadow var(--dur-base) var(--ease-glass)',
    ...style,
  };

  const headStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--sp-5)',
    width: '100%',
    minHeight: 68,
    minWidth: 0,
    padding: 'var(--sp-5) var(--sp-6)',
    border: 0,
    background: 'transparent',
    textAlign: 'left',
    color: 'inherit',
    cursor: expandable ? 'pointer' : 'default',
    /* Note 6 — the shell clips, so the ring is drawn inside it. */
    outlineOffset: -2,
  };

  const head = (
    <>
      {icon && (
        <span
          aria-hidden="true"
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 38,
            height: 38,
            flex: '0 0 auto',
            borderRadius: 'var(--r-circle)',
            backgroundImage: 'var(--glass-fill-2)',
            boxShadow: 'var(--glass-rim-2)',
            color: hue,
          }}
        >
          {icon}
        </span>
      )}

      <span style={{ flex: 1, minWidth: 0, display: 'grid', gap: 2 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap', minWidth: 0 }}>
          <span
            style={{
              font: 'var(--type-label)',
              color: 'var(--fg-1)',
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </span>
          {badge}
        </span>
        {body != null && (
          /* Note 3 — clamped shut, whole open. The card does not restate its
             own summary lower down, it stops cutting it off. */
          <span
            className={isOpen ? undefined : 'ag-clamp-2'}
            style={{
              font: 'var(--type-caption)',
              color: 'var(--fg-4)',
              textWrap: 'pretty',
              overflowWrap: 'anywhere',
            }}
          >
            {body}
          </span>
        )}
      </span>

      {time != null && (
        <span
          style={{
            flex: '0 0 auto',
            font: 'var(--type-kicker)',
            letterSpacing: 'var(--tracking-kicker)',
            color: 'var(--fg-4)',
            fontVariantNumeric: 'tabular-nums',
            whiteSpace: 'nowrap',
          }}
        >
          {time}
        </span>
      )}

      {expandable && (
        <span
          aria-hidden="true"
          style={{
            display: 'flex',
            flex: '0 0 auto',
            color: 'var(--fg-4)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform var(--dur-base) var(--ease-morph)',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16">
            <path
              d="M4 6.5 8 10.5 12 6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
    </>
  );

  return (
    <div
      role="group"
      className={className}
      style={shell}
      {...rest}
      onMouseEnter={(e: MouseEvent<HTMLDivElement>) => { rest.onMouseEnter?.(e); setHover(true); }}
      onMouseLeave={(e: MouseEvent<HTMLDivElement>) => { rest.onMouseLeave?.(e); setHover(false); }}
    >
      {expandable ? (
        <button type="button" onClick={toggle} aria-expanded={isOpen} aria-controls={bodyId} style={headStyle}>
          {head}
        </button>
      ) : (
        <div style={headStyle}>{head}</div>
      )}

      {expandable && (children != null || actions != null) && (
        <div
          id={bodyId}
          style={{
            display: 'grid',
            gridTemplateRows: isOpen ? '1fr' : '0fr',
            transition: 'grid-template-rows var(--dur-morph) var(--ease-morph)',
          }}
        >
          <div style={{ overflow: 'hidden', minHeight: 0 }}>
            <div
              style={{
                display: 'grid',
                gap: 'var(--sp-5)',
                padding: '0 var(--sp-6) var(--sp-6)',
                paddingLeft: icon ? BODY_INDENT : 'var(--sp-6)',
              }}
            >
              {children}
              {actions && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
                  {actions}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
