import React from 'react';

/* Anchored popover menu. Opens with a short fade and 4px drop from
   the trigger's side — no scaling, blur or shape morphing.

   Three things the menu carries beyond a plain popover, because a
   context menu on a card has to survive covering the card:
     header   — the object being acted on, restated inside the menu.
     section  — items grouped by intent, mono kicker labels.
     confirm  — a destructive item arms IN PLACE: the row collapses and
                a confirm strip grows in its slot. No second dialog. */
export function MorphMenu({
  trigger,
  items = [],
  align = 'start',
  width = 240,
  header = null,
  open,
  onOpenChange,
  className = '',
  style,
  ...rest
}) {
  const [internal, setInternal] = React.useState(false);
  const isOpen = open !== undefined ? open : internal;
  const wrapRef = React.useRef(null);
  const panelRef = React.useRef(null);
  const triggerRef = React.useRef(null);
  const itemRefs = React.useRef([]);
  const [armed, setArmed] = React.useState(null);
  const [flashed, setFlashed] = React.useState(null);
  /* Flip up when there is no room below — the panel grows again when a
     confirm arms, so this is re-measured on that too. */
  const [flip, setFlip] = React.useState(false);

  const setOpen = (v) => {
    if (!v) setArmed(null);
    if (open === undefined) setInternal(v);
    if (onOpenChange) onOpenChange(v);
  };

  /* Indices of real rows, in DOM order — what the arrow keys walk. */
  const rowIndices = items.reduce((acc, it, i) => {
    if (!it.divider && !it.section) acc.push(i);
    return acc;
  }, []);

  const focusRow = (n) => {
    const i = rowIndices[(n + rowIndices.length) % rowIndices.length];
    const el = itemRefs.current[i];
    /* preventScroll: opening a menu must never yank the page. */
    if (el) el.focus({ preventScroll: true });
  };

  React.useEffect(() => {
    if (!isOpen) { setFlip(false); return; }
    const panel = panelRef.current;
    const wrap = wrapRef.current;
    if (panel && wrap) {
      const box = wrap.getBoundingClientRect();
      const h = panel.scrollHeight;
      setFlip(window.innerHeight - box.bottom - 16 < h && box.top - 16 > h);
    }
    /* Focus lands after the morph has begun, so the panel is already
       readable when the ring appears on the first row. */
    const t = setTimeout(() => focusRow(0), 90);
    const away = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => { clearTimeout(t); document.removeEventListener('pointerdown', away); };
  }, [isOpen, armed]);

  const onKeyDown = (e) => {
    if (!isOpen) return;
    const here = rowIndices.indexOf(itemRefs.current.indexOf(document.activeElement));
    if (e.key === 'Escape') {
      e.stopPropagation();
      /* Escape backs out one step at a time: disarm first, then close. */
      if (armed !== null) setArmed(null); else { setOpen(false); if (triggerRef.current) { const b = triggerRef.current.querySelector('button'); if (b) b.focus(); } }
    } else if (e.key === 'ArrowDown') { e.preventDefault(); focusRow(here + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusRow(here - 1); }
    else if (e.key === 'Home') { e.preventDefault(); focusRow(0); }
    else if (e.key === 'End') { e.preventDefault(); focusRow(rowIndices.length - 1); }
  };

  const pick = (it, i) => {
    if (it.confirm) { setArmed(armed === i ? null : i); return; }
    if (it.flash) {
      setFlashed(i);
      setTimeout(() => setFlashed(null), 1400);
      if (it.onSelect) it.onSelect();
      return;                     /* flash items report in place, menu stays */
    }
    setOpen(false);
    if (it.onSelect) it.onSelect();
  };

  const triggerNode = React.isValidElement(trigger)
    ? React.cloneElement(trigger, { 'aria-haspopup': 'menu', 'aria-expanded': isOpen })
    : trigger;

  return (
    <div ref={wrapRef} className={className} onKeyDown={onKeyDown} style={{ position: 'relative', display: 'inline-flex', ...style }} {...rest}>
      {/* The trigger recedes as the panel takes over — one object, not two. */}
      <span
        ref={triggerRef}
        onClick={() => setOpen(!isOpen)}
        style={{
          display: 'inline-flex',
          opacity: isOpen ? 0.7 : 1,
          transition: 'opacity var(--dur-fast) var(--ease-glass)',
        }}
      >
        {triggerNode}
      </span>

      <div
        ref={panelRef}
        role="menu"
        aria-hidden={!isOpen}
        style={{
          position: 'absolute',
          top: flip ? 'auto' : 'calc(100% + var(--sp-3))',
          bottom: flip ? 'calc(100% + var(--sp-3))' : 'auto',
          left: align === 'start' ? 0 : 'auto',
          right: align === 'end' ? 0 : 'auto',
          width,
          zIndex: 60,
          padding: 'var(--sp-3)',
          display: 'grid',
          gap: 2,
          borderRadius: 'var(--r-lg)',
          /* Near-opaque on purpose. A menu sits ON TOP of the content it
             acts on — at card translucency the two texts overlap and
             neither is readable. The gradient and rim keep it glass; the
             base coat makes it legible. */
          backgroundColor: 'oklch(0.145 0.004 260 / 0.97)',
          backgroundImage: 'var(--glass-fill-1)',
          border: '1px solid oklch(1 0 0 / 0.10)',
          backdropFilter: 'var(--glass-bd-lg)',
          WebkitBackdropFilter: 'var(--glass-bd-lg)',
          boxShadow: 'var(--glass-cast-3), var(--glass-inner-1)',
          transformOrigin: (flip ? 'bottom ' : 'top ') + (align === 'end' ? 'right' : 'left'),
          transform: isOpen ? 'translateY(0)' : 'translateY(' + (flip ? '4px' : '-4px') + ')',
          opacity: isOpen ? 1 : 0,
          /* Closed panels must leave the a11y tree, not just go
             transparent: a transparent-but-focusable menu puts dead tab
             stops in the page. visibility does that, and its items are
             also removed from the tab order below. */
          visibility: isOpen ? 'visible' : 'hidden',
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'transform var(--dur-base) var(--ease-glass), opacity var(--dur-base) var(--ease-glass), visibility 0s linear ' + (isOpen ? '0s' : 'var(--dur-base)'),
        }}
      >
        {header && <MenuHeader header={header} open={isOpen} />}

        {items.map((it, i) => {
          if (it.divider) {
            return <span key={'d' + i} role="separator" style={{ height: 1, margin: 'var(--sp-2) var(--sp-3)', background: 'var(--line-soft)' }} />;
          }
          if (it.section) {
            return (
              <span
                key={'s' + i}
                aria-hidden="true"
                style={{
                  display: 'block',
                  padding: i === 0 ? '0 var(--sp-4) var(--sp-2)' : 'var(--sp-5) var(--sp-4) var(--sp-2)',
                  font: 'var(--type-kicker)',
                  letterSpacing: 'var(--tracking-kicker)',
                  textTransform: 'uppercase',
                  color: it.tone === 'danger' ? 'oklch(0.70 0.15 20 / 0.78)' : 'var(--fg-3)',
                  opacity: isOpen ? 1 : 0,
                  transition: `opacity var(--dur-base) var(--ease-glass) 0ms`,
                }}
              >
                {it.section}
              </span>
            );
          }
          return (
            <MenuRow
              key={it.value || i}
              item={it}
              index={i}
              open={isOpen}
              armed={armed === i}
              flashing={flashed === i}
              dimmed={armed !== null && armed !== i}
              innerRef={(el) => { itemRefs.current[i] = el; }}
              onPick={() => pick(it, i)}
              onCancel={() => setArmed(null)}
              onConfirm={() => { setArmed(null); setOpen(false); if (it.confirm && it.confirm.onConfirm) it.confirm.onConfirm(); }}
            />
          );
        })}
      </div>
    </div>
  );
}

/* The object being acted on, restated. A card menu covers the card it
   belongs to — without this the user is choosing "Delete" against no
   subject at all. */
function MenuHeader({ header, open }) {
  const h = React.isValidElement(header) ? null : header;
  return (
    <div
      style={{
        display: 'grid',
        gap: 'var(--sp-1)',
        padding: 'var(--sp-4) var(--sp-4) var(--sp-5)',
        margin: '0 0 var(--sp-2)',
        borderBottom: '1px solid var(--line-soft)',
        opacity: open ? 1 : 0,
        transition: 'opacity var(--dur-base) var(--ease-glass)',
      }}
    >
      {h ? (
        <React.Fragment>
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minWidth: 0 }}>
            {h.badge}
            <span style={{ flex: 1, minWidth: 0, font: 'var(--type-body)', fontWeight: 'var(--weight-medium)', color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.title}</span>
            {h.right}
          </span>
          {h.meta && <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', fontVariantNumeric: 'tabular-nums' }}>{h.meta}</span>}
        </React.Fragment>
      ) : header}
    </div>
  );
}

function MenuRow({ item, index, open, armed, flashing, dimmed, innerRef, onPick, onCancel, onConfirm }) {
  const [hover, setHover] = React.useState(false);
  const danger = item.tone === 'danger';
  const label = flashing && item.flash ? item.flash : item.label;

  return (
    <div style={{ display: 'grid' }}>
      {/* The row itself collapses to nothing when armed, so the confirm
          strip below occupies exactly its slot. */}
      <div style={{ display: 'grid', gridTemplateRows: armed ? '0fr' : '1fr', transition: 'grid-template-rows var(--dur-base) var(--ease-glass)' }}>
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          <button
            ref={innerRef}
            type="button"
            role="menuitem"
            tabIndex={open && !armed ? 0 : -1}
            onClick={onPick}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-5)',
              width: '100%',
              minHeight: 48,
              padding: '0 var(--sp-4)',
              border: 0,
              textAlign: 'left',
              borderRadius: 'var(--r-sm)',
              background: hover ? (danger ? 'var(--glass-tint-rose)' : 'oklch(1 0 0 / 0.10)') : 'transparent',
              color: danger ? 'var(--status-overrun)' : hover || flashing ? 'var(--fg-1)' : 'var(--fg-2)',
              font: 'var(--type-body)',
              cursor: 'pointer',
              opacity: open ? (dimmed ? 0.34 : 1) : 0,
                            transition: `opacity var(--dur-base) var(--ease-glass) 0ms, background var(--dur-fast) var(--ease-glass), color var(--dur-fast) var(--ease-glass)`,
            }}
          >
            {item.icon && (
              <span style={{ display: 'flex', flex: '0 0 auto', color: danger ? 'inherit' : flashing ? 'var(--accent)' : hover ? 'var(--accent)' : 'var(--fg-3)', transition: 'color var(--dur-fast) var(--ease-glass)' }}>
                {flashing && item.flashIcon ? item.flashIcon : item.icon}
              </span>
            )}
            <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
            {item.meta && !flashing && (
              <span style={{ display: 'flex', alignItems: 'center', font: 'var(--type-caption)', color: 'var(--fg-3)', fontVariantNumeric: 'tabular-nums' }}>{item.meta}</span>
            )}
            {item.shortcut && !flashing && (
              <span style={{ font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)', color: 'var(--fg-4)' }}>{item.shortcut}</span>
            )}
          </button>
        </div>
      </div>

      {item.confirm && (
        <div style={{ display: 'grid', gridTemplateRows: armed ? '1fr' : '0fr', transition: 'grid-template-rows var(--dur-base) var(--ease-glass)' }}>
          <div style={{ overflow: 'hidden', minHeight: 0 }}>
            <div
              style={{
                display: 'grid',
                gap: 'var(--sp-4)',
                padding: 'var(--sp-4)',
                borderRadius: 'var(--r-sm)',
                backgroundImage: 'var(--glass-tint-rose)',
                boxShadow: 'var(--glass-rim-1)',
                opacity: armed ? 1 : 0,
                transition: 'opacity var(--dur-fast) var(--ease-glass)',
              }}
            >
              <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)' }}>{item.confirm.label}</span>
              {item.confirm.hint && <span style={{ font: 'var(--type-caption)', color: 'var(--fg-2)' }}>{item.confirm.hint}</span>}
              <div style={{ position: 'relative', display: 'block' }}>
                <div style={{
                  position: 'relative', zIndex: 2,
                  display: 'flex', gap: 'var(--sp-3)',
                  opacity: armed ? 1 : 0,
                  transition: 'opacity var(--dur-base) var(--ease-glass)',
                }}>
                  <button
                    type="button"
                    tabIndex={armed ? 0 : -1}
                    onClick={onCancel}
                    style={{ flex: 1, minHeight: 38, border: 0, borderRadius: 'var(--r-pill)', backgroundImage: 'var(--glass-fill-2)', boxShadow: 'var(--glass-rim-1)', color: 'var(--fg-1)', font: 'var(--type-label)', cursor: 'pointer' }}
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    tabIndex={armed ? 0 : -1}
                    onClick={onConfirm}
                    style={{ flex: 1, minHeight: 38, border: 0, borderRadius: 'var(--r-pill)', background: 'var(--status-overrun)', color: 'var(--fg-on-light)', font: 'var(--type-label)', cursor: 'pointer' }}
                  >
                    {item.confirm.action || 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
