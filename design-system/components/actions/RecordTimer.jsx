import React from 'react';

/* RecordTimer — a round glass mic button that widens into a live counter.
   idle → (press) recording: the circle stays put as the core, the glass
   widens either side to hold MIN · SEC in mono; the core glows rose.
   (press again) saved: the glow turns emerald for a beat, then the glass
   narrows back to the circle. `armed` gates it; disarmed the button dims
   and ignores presses.

   armed     boolean (default true)
   onSave    (seconds) => void
   icon      the idle glyph — pass <Icon name="mic" size={24} />                                           */

function Digit({ d, h }) {
  return (
    <span style={{ display: 'inline-block', height: h, overflow: 'hidden', verticalAlign: 'top' }}>
      <span style={{ display: 'flex', flexDirection: 'column', transform: 'translateY(' + (-d * h) + 'px)', transition: 'transform 380ms var(--ease-glass)' }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <span key={n} style={{ height: h, lineHeight: h + 'px' }}>{n}</span>)}
      </span>
    </span>
  );
}

function Readout({ value, unit, show, side, sm }) {
  const dh = sm ? 18 : 30;
  const s = String(value).padStart(2, '0');
  return (
    <span style={{
      display: 'grid', justifyItems: 'center', gap: sm ? 0 : 2, width: sm ? 38 : 56, color: 'var(--fg-1)',
      opacity: show ? 1 : 0, transform: show ? 'translateX(0)' : 'translateX(' + (side * 10) + 'px)',
      transition: 'opacity 220ms var(--ease-glass) ' + (show ? '140ms' : '0ms') + ', transform 300ms var(--ease-glass)',
    }}>
      <span style={{ display: 'flex', fontFamily: 'var(--font-mono)', fontWeight: 300, fontSize: sm ? 16 : 28, height: dh, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
        <Digit d={+s[0]} h={dh} /><Digit d={+s[1]} h={dh} />
      </span>
      <span style={{ font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)', textTransform: 'uppercase', color: 'var(--fg-3)', fontSize: sm ? 8 : undefined }}>{unit}</span>
    </span>
  );
}

export function RecordTimer({ armed = true, onSave, onStart, icon, size = 'md', label = 'recording', style, ...rest }) {
  const sm = size === 'sm';
  const [mode, setMode] = React.useState('idle'); // idle | rec | saved
  const [sec, setSec] = React.useState(0);
  const [down, setDown] = React.useState(false);

  React.useEffect(() => {
    if (mode !== 'rec') return undefined;
    const t0 = Date.now() - sec * 1000;
    const id = setInterval(() => setSec(Math.floor((Date.now() - t0) / 1000)), 200);
    return () => clearInterval(id);
  }, [mode]);

  React.useEffect(() => {
    if (mode !== 'saved') return undefined;
    const id = setTimeout(() => { setMode('idle'); setTimeout(() => setSec(0), 320); }, 1300);
    return () => clearTimeout(id);
  }, [mode]);

  React.useEffect(() => { if (!armed && mode === 'rec') setMode('idle'); }, [armed]);

  const press = () => {
    if (!armed || mode === 'saved') return;
    if (mode === 'idle') { setSec(0); setMode('rec'); if (onStart) onStart(); }
    else { setMode('saved'); if (onSave) onSave(sec); }
  };

  const open = mode !== 'idle';
  const E = 'var(--ease-glass)';
  const C = sm ? 44 : 80;
  const glow = mode === 'rec' ? 'var(--hue-rose)' : mode === 'saved' ? 'var(--accent)' : null;
  const core = mode === 'rec'
    ? 'radial-gradient(circle at 50% 40%, oklch(0.72 0.17 20), oklch(0.52 0.17 20) 70%)'
    : mode === 'saved'
      ? 'radial-gradient(circle at 50% 40%, oklch(0.74 0.14 162), oklch(0.52 0.12 162) 70%)'
      : 'oklch(1 0 0 / 0)';

  return (
    <div style={Object.assign({ position: 'relative', display: 'grid', placeItems: 'center', height: C + (sm ? 0 : 16) }, style)} {...rest}>
      <div style={{
        position: 'relative', height: C, width: open ? (sm ? 140 : 248) : C, borderRadius: C / 2,
        display: 'grid', gridTemplateColumns: '1fr ' + C + 'px 1fr', alignItems: 'center',
        backgroundImage: 'var(--glass-fill-3)', backdropFilter: 'var(--glass-bd-lg)', WebkitBackdropFilter: 'var(--glass-bd-lg)',
        boxShadow: 'var(--glass-shadow-thick)', overflow: 'hidden',
        opacity: armed ? 1 : 0.5,
        transition: 'width 380ms ' + E + ' ' + (open ? '0ms' : '120ms') + ', opacity var(--dur-base) ' + E,
      }}>
        <span style={{ justifySelf: 'end', overflow: 'hidden' }}><Readout value={Math.floor(sec / 60)} unit="Min." show={open} side={1} sm={sm} /></span>
        <button
          type="button"
          aria-label={mode === 'rec' ? 'Stop and save ' + label : 'Start ' + label}
          aria-pressed={mode === 'rec'}
          disabled={!armed}
          onClick={press}
          onPointerDown={() => setDown(true)} onPointerUp={() => setDown(false)} onPointerLeave={() => setDown(false)}
          style={{
            position: 'relative', width: C, height: C, borderRadius: '50%', border: 0, padding: 0,
            display: 'grid', placeItems: 'center', cursor: armed ? 'pointer' : 'default',
            color: mode === 'idle' ? 'var(--fg-1)' : 'oklch(0.98 0 0)',
            background: 'oklch(1 0 0 / 0)',
            transform: down && armed ? 'scale(0.94)' : 'scale(1)',
            transition: 'transform var(--dur-fast) ' + E,
          }}>
          <span aria-hidden="true" style={{
            position: 'absolute', inset: sm ? 4 : 6, borderRadius: '50%', background: core,
            boxShadow: glow ? (sm ? '0 0 14px 2px' : '0 0 28px 4px') + ' color-mix(in oklch, ' + glow + ' 55%, transparent), inset 0 1px 0 oklch(1 0 0 / 0.35)' : 'none',
            opacity: glow ? 1 : 0, transform: glow ? 'scale(1)' : 'scale(0.86)',
            transition: 'opacity 260ms ' + E + ', transform 320ms ' + E + ', box-shadow 320ms ' + E,
          }} />
          <span style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
            <span style={{ gridArea: '1 / 1', opacity: mode === 'rec' ? 0 : 1, transition: 'opacity 200ms ' + E }}>{icon}</span>
            <span style={{
              gridArea: '1 / 1', width: sm ? 10 : 14, height: sm ? 10 : 14, borderRadius: sm ? 3 : 4, background: 'oklch(0.98 0 0)',
              opacity: mode === 'rec' ? 1 : 0, transform: mode === 'rec' ? 'scale(1)' : 'scale(0.6)',
              transition: 'opacity 200ms ' + E + ', transform 260ms ' + E,
            }} />
          </span>
        </button>
        <span style={{ justifySelf: 'start', overflow: 'hidden' }}><Readout value={sec % 60} unit="Sec." show={open} side={-1} sm={sm} /></span>
      </div>
      <span aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {mode === 'rec' ? 'Recording' : mode === 'saved' ? 'Saved' : ''}
      </span>
    </div>
  );
}
