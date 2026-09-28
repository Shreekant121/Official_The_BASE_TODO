import React from 'react';

/* LoadingPill — a near-black glass pill with a large mono numeral and a
   kicker. Behind the frost, three soft fields of the system's own hues
   (emerald accent, cyan, violet) drift slowly; they never touch the
   type. Digits roll one column at a time. At 100 the field settles to
   emerald and the kicker reads the done label.

   progress   0–100 (null = indeterminate: numeral hidden, field drifts)
   label      kicker while loading      default "Loading"
   doneLabel  kicker at 100             default "Ready"
   size       "md" 240×160 | "sm" 168×112                                  */

const KF_ID = 'ag-loading-pill-kf';
function ensureKeyframes() {
  if (typeof document === 'undefined' || document.getElementById(KF_ID)) return;
  const st = document.createElement('style');
  st.id = KF_ID;
  st.textContent = `
@keyframes ag-lp-a { 0%,100% { transform: translate(-18%, 10%) } 33% { transform: translate(22%, -14%) } 66% { transform: translate(6%, 22%) } }
@keyframes ag-lp-b { 0%,100% { transform: translate(20%, -12%) } 33% { transform: translate(-16%, 18%) } 66% { transform: translate(-24%, -10%) } }
@keyframes ag-lp-c { 0%,100% { transform: translate(4%, 20%) } 50% { transform: translate(-6%, -22%) } }
@media (prefers-reduced-motion: reduce) { .ag-lp-f { animation: none !important; } }`;
  document.head.appendChild(st);
}

function Digit({ d, h }) {
  return (
    <span style={{ display: 'inline-block', height: h, overflow: 'hidden', verticalAlign: 'top' }}>
      <span style={{
        display: 'flex', flexDirection: 'column',
        transform: 'translateY(' + (-d * h) + 'px)',
        transition: 'transform 420ms var(--ease-glass)',
      }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <span key={n} style={{ height: h, lineHeight: h + 'px' }}>{n}</span>)}
      </span>
    </span>
  );
}

export function LoadingPill({ progress = null, label = 'Loading', doneLabel = 'Ready', size = 'md', style, ...rest }) {
  React.useEffect(ensureKeyframes, []);
  const sm = size === 'sm';
  const W = sm ? 168 : 240, H = sm ? 112 : 160, fh = sm ? 44 : 64;
  const done = progress != null && progress >= 100;
  const v = progress == null ? null : Math.max(0, Math.min(100, Math.round(progress)));
  const digits = v == null ? [] : String(v).split('').map(Number);

  const field = (hue, anim, dur, pos, op) => (
    <span className="ag-lp-f" style={{
      position: 'absolute', width: '90%', height: '120%', left: pos[0], top: pos[1],
      background: 'radial-gradient(closest-side, ' + hue + ', transparent)',
      opacity: op, animation: anim + ' ' + dur + 's ease-in-out infinite',
      transition: 'opacity 900ms var(--ease-glass)',
    }} />
  );

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v == null ? undefined : v}
      aria-label={done ? doneLabel : label}
      style={Object.assign({
        position: 'relative', width: W, height: H, borderRadius: H / 2, overflow: 'hidden', isolation: 'isolate',
        background: 'oklch(0.14 0.004 260)',
        boxShadow: 'var(--glass-shadow-thick)',
      }, style)}
      {...rest}
    >
      {field('oklch(0.62 0.13 210 / 0.55)', 'ag-lp-a', 9.5, ['-20%', '-10%'], done ? 0 : 1)}
      {field('oklch(0.60 0.14 296 / 0.50)', 'ag-lp-b', 11.5, ['30%', '-20%'], done ? 0 : 1)}
      {field('oklch(0.66 0.14 162 / ' + (done ? '0.60' : '0.40') + ')', 'ag-lp-c', 13, ['5%', '0%'], 1)}

      {/* frost — keeps the colour under the glass, off the type */}
      <span style={{
        position: 'absolute', inset: 0, borderRadius: 'inherit',
        backdropFilter: 'blur(22px) saturate(1.2)', WebkitBackdropFilter: 'blur(22px) saturate(1.2)',
        background: 'radial-gradient(60% 55% at 50% 50%, oklch(0.12 0.004 260 / 0.78), oklch(0.12 0.004 260 / 0.30) 100%)',
        boxShadow: 'var(--glass-rim-3)',
      }} />

      <div style={{
        position: 'relative', height: '100%', display: 'grid', placeItems: 'center', alignContent: 'center', gap: sm ? 4 : 8,
        color: 'var(--fg-1)',
      }}>
        <span aria-hidden="true" style={{
          display: 'flex', alignItems: 'flex-start', height: fh,
          fontFamily: 'var(--font-mono)', fontWeight: 300, fontSize: fh, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums',
          opacity: v == null ? 0 : 1, transition: 'opacity 300ms var(--ease-glass)',
        }}>
          {digits.map((d, i) => <Digit key={digits.length - i} d={d} h={fh} />)}
          <span style={{ fontSize: fh * 0.42, lineHeight: 1, alignSelf: 'flex-end', marginBottom: fh * 0.1, marginLeft: 2, color: 'var(--fg-2)' }}>%</span>
        </span>
        <span style={{
          font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)', textTransform: 'uppercase',
          color: done ? 'var(--fg-1)' : 'var(--fg-2)', transition: 'color 300ms var(--ease-glass)',
        }}>{done ? doneLabel : label}</span>
      </div>
    </div>
  );
}

/* showProgress — mount a LoadingPill over the screen for a job with a
   known end (model swap, first sync, import). Returns a handle with
   set(pct) and done(); with no handle use it runs a realistic fake
   progress over `duration` ms and dismisses itself.                    */
export function showProgress({ label = 'Loading', doneLabel = 'Ready', duration = 3200, indeterminate = false } = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOM.createRoot(host);
  let p = 0, shown = true, timer, manual = false;
  const paint = () => root.render(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400, display: 'grid', placeItems: 'center', pointerEvents: 'none',
      background: 'oklch(0.04 0 0 / ' + (shown ? 0.35 : 0) + ')', transition: 'background-color 240ms var(--ease-glass)',
    }}>
      <div style={{ opacity: shown ? 1 : 0, transform: shown ? 'translateY(0)' : 'translateY(4px)', transition: 'opacity 240ms var(--ease-glass), transform 240ms var(--ease-glass)' }}>
        <LoadingPill progress={indeterminate && p < 100 ? null : p} label={label} doneLabel={doneLabel} />
      </div>
    </div>
  );
  const close = () => { shown = false; paint(); setTimeout(() => { root.unmount(); host.remove(); }, 260); };
  const set = (v) => { manual = true; p = Math.max(p, Math.min(100, v)); paint(); if (p >= 100) setTimeout(close, 900); };
  const step = () => {
    if (manual) return;
    const stall = p > 82 && p < 90;
    p = Math.min(100, p + (stall ? 0.8 : 2 + Math.random() * 6) * (3200 / duration));
    paint();
    if (p < 100) timer = setTimeout(step, stall ? 360 : 140 + Math.random() * 160);
    else setTimeout(close, 900);
  };
  requestAnimationFrame(() => { paint(); timer = setTimeout(step, 300); });
  paint();
  return { set, done: () => set(100), cancel: () => { clearTimeout(timer); close(); } };
}
