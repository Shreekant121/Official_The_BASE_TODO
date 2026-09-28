import React from 'react';
import { Icon } from '../core/Icon';

/* BottomBar — a floating glass bar at the bottom of the screen that
   grows upward into a sheet. One surface: only width, height and radius
   change, anchored to the bottom edge, so the eye tracks one object.
   Press dims it; tap, Enter or a drag up opens; tap the grabber, Esc,
   a press outside or a drag down closes.

   peek      node shown in the collapsed bar
   children  sheet content
   open / onOpenChange   optional control
   width / height        sheet size (collapsed is width − 24 × 56)      */

export function BottomBar({ peek, children, open, onOpenChange, width = 340, height = 320, label = 'Now playing', style, ...rest }) {
  const [inner, setInner] = React.useState(false);
  const isOpen = open !== undefined ? open : inner;
  const [down, setDown] = React.useState(false);
  const ref = React.useRef(null);
  const drag = React.useRef(null);
  const set = (v) => { if (open === undefined) setInner(v); if (onOpenChange) onOpenChange(v); };

  React.useEffect(() => {
    if (!isOpen) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) set(false); };
    const key = (e) => { if (e.key === 'Escape') set(false); };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [isOpen]);

  const E = 'var(--ease-glass)';
  const D = '360ms';
  const w = isOpen ? width : width - 24;
  const h = isOpen ? height : 56;

  const onDown = (e) => { drag.current = { y: e.clientY, moved: false }; setDown(true); };
  const onMove = (e) => {
    if (!drag.current) return;
    const dy = e.clientY - drag.current.y;
    if (Math.abs(dy) > 28 && !drag.current.moved) { drag.current.moved = true; set(dy < 0); setDown(false); }
  };
  const onUp = (e) => {
    const d = drag.current; drag.current = null; setDown(false);
    if (d && !d.moved && !isOpen) set(true);
  };

  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      aria-expanded={isOpen}
      tabIndex={0}
      onKeyDown={(e) => { if (!isOpen && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); set(true); } }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={() => { drag.current = null; setDown(false); }}
      style={Object.assign({
        position: 'relative', width: w, height: h, borderRadius: isOpen ? 30 : 28, overflow: 'hidden', outline: 'none',
        touchAction: 'none', cursor: isOpen ? 'default' : 'pointer',
        backgroundImage: 'var(--glass-fill-3)', backdropFilter: 'var(--glass-bd-lg)', WebkitBackdropFilter: 'var(--glass-bd-lg)',
        boxShadow: 'var(--glass-shadow-thick)',
        opacity: down && !isOpen ? 0.82 : 1,
        transform: down && !isOpen ? 'scale(0.98)' : 'scale(1)',
        transition: ['width', 'height', 'border-radius'].map((p) => p + ' ' + D + ' ' + E).join(', ')
          + ', transform var(--dur-fast) ' + E + ', opacity var(--dur-fast) ' + E,
      }, style)}
      {...rest}
    >
      {/* grabber */}
      <button
        type="button"
        aria-label={isOpen ? 'Collapse' : 'Expand'}
        onPointerDown={(e) => { if (isOpen) e.stopPropagation(); }}
        onClick={(e) => { e.stopPropagation(); set(!isOpen); }}
        style={{
          position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 2,
          width: 64, height: 18, border: 0, padding: 0, background: 'transparent', cursor: 'pointer',
          display: 'grid', placeItems: 'center',
        }}>
        <span style={{ width: 28, height: 3, borderRadius: 2, background: 'oklch(1 0 0 / 0.28)' }} />
      </button>

      {/* collapsed */}
      <div aria-hidden={isOpen} style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: 56, padding: '6px 18px 0',
        display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
        opacity: isOpen ? 0 : 1, pointerEvents: isOpen ? 'none' : 'auto',
        transition: 'opacity ' + (isOpen ? '120ms ' + E : '220ms ' + E + ' 200ms'),
      }}>{peek}</div>

      {/* sheet */}
      <div aria-hidden={!isOpen} style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: height, padding: '28px 22px 22px',
        display: 'grid', alignContent: 'start', gap: 'var(--sp-4)',
        opacity: isOpen ? 1 : 0, transform: isOpen ? 'translateY(0)' : 'translateY(6px)',
        visibility: isOpen ? 'visible' : 'hidden', pointerEvents: isOpen ? 'auto' : 'none',
        transition: isOpen
          ? 'opacity 240ms ' + E + ' 160ms, transform 320ms ' + E + ' 120ms, visibility 0s'
          : 'opacity 120ms ' + E + ', transform 160ms ' + E + ', visibility 0s linear 160ms',
      }}>{children}</div>
    </div>
  );
}
