import React from 'react';

/* A trigger pill that becomes the controls it was hiding.
   The trigger's glass widens to the cluster's width with a soft top
   highlight, then the controls surface out of it, drifting from
   touching to their resting gaps while the shared glass fades. Close
   runs it backwards. No filters, no blur, no overshoot.

   GooSplit keeps its name for compatibility: a control pair that
   fades into the slot it replaces. */

function useSize(ref, watch) {
  const [s, setS] = React.useState({ w: 0, h: 0 });
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const n = { w: Math.round(r.width), h: Math.round(r.height) };
      setS((p) => (p.w === n.w && p.h === n.h ? p : n));
    };
    measure();
    const raf = requestAnimationFrame(measure);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    if (typeof ResizeObserver !== 'function') {
      window.addEventListener('resize', measure);
      return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measure); };
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, watch);
  return s;
}

export function MorphCluster({
  trigger,
  open,
  onOpenChange,
  align = 'start',
  gap = 'var(--sp-3)',
  tone,
  filter,
  label,
  className = '',
  style,
  children,
  ...rest
}) {
  const [internal, setInternal] = React.useState(false);
  const isOpen = open !== undefined ? open : internal;
  const wrapRef = React.useRef(null);
  const triggerRef = React.useRef(null);
  const contentRef = React.useRef(null);
  const kids = React.Children.toArray(children);
  const t = useSize(triggerRef, [kids.length]);
  const c = useSize(contentRef, [kids.length]);
  const [gp, setGp] = React.useState(0);

  /* idle → stretch → open → gather → idle
     stretch: the trigger's glass widens to the cluster's width and brightens
     open:    the controls surface in place, drifting apart from touching
     gather:  controls draw back together and fade into the glass           */
  const [phase, setPhase] = React.useState(isOpen ? 'open' : 'idle');
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) { first.current = false; return undefined; }
    setPhase(isOpen ? 'stretch' : 'gather');
    const id = setTimeout(() => setPhase(isOpen ? 'open' : 'idle'), isOpen ? 200 : 180);
    return () => clearTimeout(id);
  }, [isOpen]);

  React.useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el || el.children.length < 2) return;
    const x0 = el.children[0].getBoundingClientRect(), x1 = el.children[1].getBoundingClientRect();
    setGp(Math.max(0, Math.round(x1.left - x0.right)));
  }, [c.w, kids.length]);

  const setOpen = (v) => {
    if (open === undefined) setInternal(v);
    if (onOpenChange) onOpenChange(v);
  };

  React.useEffect(() => {
    if (!isOpen) return undefined;
    const away = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key); };
  }, [isOpen]);

  const E = 'var(--ease-glass)';
  const side = align === 'end' ? { right: 0 } : { left: 0 };
  const wide = phase !== 'idle';
  const showKids = phase === 'open';
  const glassOn = phase === 'stretch' || phase === 'gather';
  const mid = (kids.length - 1) / 2;
  const accent = tone === 'accent';

  const triggerNode = React.isValidElement(trigger)
    ? React.cloneElement(trigger, {
      'aria-expanded': isOpen,
      onClick: (e) => { if (trigger.props.onClick) trigger.props.onClick(e); setOpen(true); },
    })
    : trigger;

  return (
    <span
      ref={wrapRef}
      className={className}
      data-ag-open={isOpen ? 'true' : 'false'}
      style={Object.assign({
        position: 'relative',
        display: 'inline-block',
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
        width: t.w && c.w ? (wide ? c.w : t.w) : undefined,
        minHeight: c.h || undefined,
        transition: 'width 240ms ' + E,
      }, style)}
      {...rest}
    >
      {/* the shared glass the trigger stretches into */}
      <span aria-hidden="true" style={Object.assign({
        position: 'absolute', top: '50%', height: t.h || 0, marginTop: -(t.h || 0) / 2,
        width: (wide ? c.w : t.w) || 0, borderRadius: 'var(--r-pill)', overflow: 'hidden', pointerEvents: 'none',
        backgroundImage: 'var(--glass-fill-3)', backdropFilter: 'var(--glass-bd-lg)', WebkitBackdropFilter: 'var(--glass-bd-lg)',
        boxShadow: 'var(--glass-shadow-thick)',
        opacity: glassOn ? 1 : 0,
        transition: 'width 240ms ' + E + ', opacity ' + (glassOn ? '80ms' : '220ms') + ' ' + E + (phase === 'idle' ? ' 160ms' : ''),
      }, side)}>
        <span style={{
          position: 'absolute', inset: 0,
          background: accent
            ? 'radial-gradient(90% 120% at 50% 0%, oklch(0.82 0.12 160 / 0.30), oklch(0.82 0.12 160 / 0) 70%)'
            : 'radial-gradient(90% 120% at 50% 0%, oklch(1 0 0 / 0.24), oklch(1 0 0 / 0) 70%)',
          opacity: phase === 'stretch' ? 1 : 0,
          transition: 'opacity ' + (phase === 'stretch' ? '160ms' : '320ms') + ' ' + E,
        }} />
      </span>

      <span
        ref={triggerRef}
        style={{
          position: 'relative',
          display: 'inline-flex',
          float: align === 'end' ? 'right' : 'none',
          opacity: wide ? 0 : 1,
          visibility: isOpen ? 'hidden' : 'visible',
          pointerEvents: isOpen ? 'none' : 'auto',
          transition: 'opacity ' + (wide ? '100ms' : '200ms 120ms') + ' ' + E + ', visibility 0s linear ' + (isOpen ? '100ms' : '0s'),
        }}
      >
        {triggerNode}
      </span>
      <span
        ref={contentRef}
        role="group"
        aria-label={label}
        style={Object.assign({
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'inline-flex',
          alignItems: 'center',
          gap,
          whiteSpace: 'nowrap',
          visibility: isOpen || phase === 'gather' ? 'visible' : 'hidden',
          pointerEvents: showKids ? 'auto' : 'none',
          transition: 'visibility 0s linear ' + (isOpen ? '0s' : '200ms'),
        }, side)}
      >
        {kids.map((k, i) => (
          <span key={k.key != null ? k.key : i} style={{
            display: 'inline-flex',
            opacity: showKids ? 1 : 0,
            transform: showKids ? 'translateX(0)' : 'translateX(' + ((mid - i) * gp) + 'px)',
            transition: showKids
              ? 'opacity 200ms ' + E + ' ' + (i * 20) + 'ms, transform 360ms ' + E
              : 'opacity 140ms ' + E + ', transform 180ms var(--ease-in-out)',
          }}>{k}</span>
        ))}
      </span>
    </span>
  );
}

export function GooSplit({ open, gap = 'var(--sp-3)', tone, filter, className = '', style, children, ...rest }) {
  return (
    <span className={className} style={Object.assign({ display: 'block' }, style)} {...rest}>
      <span style={{
        display: 'flex',
        alignItems: 'stretch',
        gap,
        opacity: open ? 1 : 0,
        transform: open ? 'translateY(0)' : 'translateY(-3px)',
        transition: 'opacity var(--dur-base) var(--ease-glass), transform var(--dur-base) var(--ease-glass)',
      }}>
        {children}
      </span>
    </span>
  );
}
