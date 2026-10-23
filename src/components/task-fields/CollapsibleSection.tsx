/**
 * A pane that folds — the Score screen's `Section`, moved here at OPT-5 so the
 * task sheet's Optional section is the same shape and not a second one.
 *
 * **`Section` takes the source's material and keeps our body.** Surfaces,
 * insets, the 38px `--r-sm` glyph tile, the rotating `chevron-down` and the
 * outstanding-count badge are `screens/scoring.html`'s; the closed/open shadow
 * ladder is `--glass-rim-1, --glass-cast-1` → `--glass-shadow-pane`. What did
 * NOT come across is `{open && …}`: the source unmounts a closed section, and
 * several of our field editors hold real uncommitted state inside them — a link
 * draft in `LinksEditor`, an in-flight rename in `SubtaskTree` — which
 * unmounting would throw away. The body stays mounted, morphs on
 * `grid-template-rows: 0fr → 1fr` and goes `visibility: hidden` on a delay so
 * its fields are not invisible tab stops. That is production structure
 * guarding a real bug, which is the half of the reconciliation rule we keep.
 *
 * `blur={false}` drops the pane's own backdrop blur. The task sheet passes it:
 * the sheet is already a near-solid pane with a blur of its own, so a second
 * one under this section shows nothing and still costs the tablet a layer.
 */
import type { ReactNode } from 'react';
import { Icon, StatusPill, type IconName } from '../../ui';

interface CollapsibleSectionProps {
  icon: IconName;
  title: string;
  hint: string;
  /** Draws an amber "N needed" badge in the header. */
  need?: number;
  /** A reading in the header, right of the title — the app's own addition. */
  right?: ReactNode;
  open: boolean;
  onToggle: () => void;
  blur?: boolean;
  children: ReactNode;
}

export function CollapsibleSection({
  icon, title, hint, need = 0, right, open, onToggle, blur = true, children,
}: CollapsibleSectionProps) {
  return (
    <div
      style={{
        borderRadius: 'var(--r-card)',
        backgroundImage: 'var(--glass-fill-1)',
        ...(blur && { WebkitBackdropFilter: 'var(--glass-bd-sm)', backdropFilter: 'var(--glass-bd-sm)' }),
        boxShadow: open ? 'var(--glass-shadow-pane)' : 'var(--glass-rim-1), var(--glass-cast-1)',
        transition: 'box-shadow var(--dur-base) var(--ease-glass)',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', width: '100%',
          padding: 'var(--sp-6) var(--pad-card)', border: 0, background: 'transparent',
          cursor: 'pointer', textAlign: 'left', borderRadius: 'var(--r-card)', color: 'inherit',
        }}
      >
        {/* Neutral, never tinted — UI-25's correction to `NotificationCard`'s
            disc, which matters more in a column of these. */}
        <span
          aria-hidden="true"
          style={{
            display: 'grid', placeItems: 'center', width: 38, height: 38, flex: '0 0 auto',
            borderRadius: 'var(--r-sm)',
            backgroundImage: open ? 'var(--glass-fill-3)' : 'var(--glass-fill-1)',
            boxShadow: 'var(--glass-rim-1)',
            color: open ? 'var(--fg-1)' : 'var(--fg-3)',
            transition: 'var(--t-hover)',
          }}
        >
          <Icon name={icon} size={17} />
        </span>
        <div style={{ display: 'grid', gap: 2, flex: 1, minWidth: 0 }}>
          <span style={{ font: 'var(--type-title)', fontSize: 'var(--text-md)', color: 'var(--fg-1)' }}>
            {title}
          </span>
          <span
            style={{
              font: 'var(--type-caption)', color: 'var(--fg-4)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {hint}
          </span>
        </div>
        {right}
        {need > 0 && <StatusPill status="review" size="sm" dot={false}>{need} needed</StatusPill>}
        <span
          style={{
            display: 'flex', color: 'var(--fg-3)', flex: '0 0 auto',
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform var(--dur-base) var(--ease-glass)',
          }}
        >
          <Icon name="chevron-down" size={18} />
        </span>
      </button>

      {/* Mounted whether open or shut — see the note at the top of this file. */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: open ? '1fr' : '0fr',
          transition: 'grid-template-rows var(--dur-base) var(--ease-glass)',
        }}
      >
        <div
          style={{
            overflow: 'hidden', minHeight: 0,
            visibility: open ? 'visible' : 'hidden',
            transition: `visibility 0s linear ${open ? '0s' : 'var(--dur-base)'}`,
          }}
        >
          <div
            style={{
              display: 'grid', gap: 'var(--gap-stack)',
              padding: '0 var(--pad-card) var(--pad-card)',
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
