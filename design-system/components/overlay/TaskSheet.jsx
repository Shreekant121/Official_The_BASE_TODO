import React from 'react';
import { Icon } from '../core/Icon';
import { Button } from '../actions/Button';
import { IconButton } from '../actions/IconButton';
import { SegmentedControl } from '../actions/SegmentedControl';
import { Switch } from '../forms/Switch';
import { Checkbox } from '../forms/Checkbox';
import { ScoreDial } from '../data/ScoreDial';
import { StatusPill } from '../data/StatusPill';

/* TASK SHEET — every field of one task, on one surface.

   The old modal was a 480px column of fifteen stacked sections: the score
   was typed in, the deadline was judged twice, and half the facts were a
   scroll away from the title. This is the same field set, re-laid:

     · the header states what the task IS — breadcrumb, status, title,
       score, and the five measured facts as one mono line
     · the body is three columns — what decides the score / the work /
       timing and context — so nothing hides behind a scroll
     · the score, the deadline factor and the "still needed" count are
       DERIVED. Nothing in this sheet asks the user for a number the
       product can work out.

   Wells for anything data goes into, fills for anything that acts, and
   one accent that only ever means live. */

const MAX = 13.5;
const DAY = 86400000;

/* Each quadrant carries a status hue, used for its own meaning rather
   than as decoration: urgent-and-important is amber (a decision now),
   scheduled is cyan (queued), delegated is violet (someone else's
   backburner), eliminated is grey (archived). Emerald stays out of it —
   emerald only ever means live. */
const QUADRANTS = {
  schedule:  { label: 'Schedule',  points: 2, hue: '0.70 0.15 210', ink: 'oklch(0.93 0.07 210)', hint: 'Important, not urgent — give it a slot.' },
  do:        { label: 'Do first',  points: 4, hue: '0.75 0.15  82', ink: 'oklch(0.95 0.07 82)',  hint: 'Important and urgent — today.' },
  eliminate: { label: 'Eliminate', points: 1, hue: '0.70 0.02 260', ink: 'oklch(0.88 0.01 260)', hint: 'Neither — consider dropping it.' },
  delegate:  { label: 'Delegate',  points: 3, hue: '0.70 0.15 296', ink: 'oklch(0.93 0.07 296)', hint: 'Urgent, not important — hand it off.' },
};

/* Personal importance is one hue heating up, not five hues: the trough
   reads as a dial, and the ramp says "more of the same thing". */
const HEAT = (n) => 'oklch(0.75 0.15 82 / ' + (0.05 + n * 0.035) + ')';
const tintOf = (hue, a, b, c) =>
  'linear-gradient(155deg, oklch(' + hue + ' / ' + a + ') 0%, oklch(' + hue + ' / ' + b + ') 55%, oklch(' + hue + ' / ' + c + ') 100%)';

const IMPORTANCE = ['Very low', 'Low', 'Medium', 'High', 'Critical'];
const REMINDERS = ['None', 'At the deadline', '10 minutes before', '1 hour before', '1 day before'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function deadlineScore(iso, now) {
  if (!iso) return { points: 0, phrase: 'No deadline set' };
  const days = (new Date(iso) - now) / DAY;
  if (days < 0)   return { points: 4,   phrase: 'Overdue by ' + Math.ceil(-days) + 'd' };
  if (days <= 1)  return { points: 3.5, phrase: 'Due within a day' };
  if (days <= 7)  return { points: 3,   phrase: 'Due in ' + Math.ceil(days) + 'd' };
  if (days <= 21) return { points: 2,   phrase: 'Due in ' + Math.ceil(days) + 'd' };
  if (days <= 60) return { points: 1,   phrase: 'Due in ' + Math.round(days / 7) + 'w' };
  return { points: 0.5, phrase: 'Due in ' + Math.round(days / 30) + ' months' };
}

function scoreOf(t, now) {
  const eis = t.quadrant ? QUADRANTS[t.quadrant].points : 0;
  const dl = deadlineScore(t.deadline, now).points;
  const per = t.importance || 0;
  const quasi = t.quasi ? 1 : 0;
  const penalty = Number(t.est) > 120 ? 0.5 : 0;
  return {
    total: Math.max(0, Math.min(MAX, eis + dl + per + quasi - penalty)),
    penalty,
    factors: [
      { key: 'eis',   label: 'Eisenhower', value: eis,   max: 4, tone: 0.62 },
      { key: 'dl',    label: 'Deadline',   value: dl,    max: 4, tone: 0.44 },
      { key: 'per',   label: 'Personal',   value: per,   max: 5, tone: 0.30 },
      { key: 'quasi', label: 'Quasi-need', value: quasi, max: 1, tone: 0.19 },
    ],
  };
}

function needsOf(t) {
  const out = [];
  if (!t.quadrant) out.push({ id: 'quadrant', label: 'Eisenhower' });
  if (!t.importance) out.push({ id: 'importance', label: 'Importance' });
  if (!t.deadline) out.push({ id: 'deadline', label: 'Deadline' });
  if (!t.est) out.push({ id: 'est', label: 'Estimate' });
  if (!(t.desc || '').trim()) out.push({ id: 'desc', label: 'Description' });
  return out;
}

const money = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
const mins = (m) => (!m ? '—' : m >= 60 ? (m / 60 % 1 === 0 ? m / 60 + 'h' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm') : m + 'm');

function repeatText(r) {
  if (!r) return 'Does not repeat';
  const unit = r.every === 1 ? r.unit.replace(/s$/, '') : r.every + ' ' + r.unit;
  let s = 'Every ' + unit;
  if (r.unit === 'weeks' && r.days && r.days.length) {
    s += ' on ' + r.days.slice().sort().map((d) => DAY_NAMES[d]).join(', ');
  }
  if (r.ends === 'after') s += ', ' + r.count + '×';
  return s;
}

/* ---------------------------------------------------------------- *
   Primitives — the same well / kicker / chip vocabulary the Scoring
   screen uses, so the sheet and the session read as one product.
 * ---------------------------------------------------------------- */

function Kicker({ icon, children, tone = 'var(--fg-3)', style }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)',
      font: 'var(--type-kicker)', textTransform: 'uppercase',
      letterSpacing: 'var(--tracking-kicker)', color: tone, whiteSpace: 'nowrap', ...style,
    }}>
      {icon && <Icon name={icon} size={13} />}
      {children}
    </span>
  );
}

function Well({ children, focus, flash, pad = '0 var(--sp-5)', height = 46, radius = 'var(--r-control)', style }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
      minHeight: height, padding: pad, borderRadius: radius,
      backgroundImage: 'var(--glass-well)',
      boxShadow: flash
        ? 'var(--glass-well-shadow), 0 0 0 1px var(--hue-amber), 0 0 22px -6px var(--hue-amber)'
        : focus
          ? 'var(--glass-well-shadow), 0 0 0 1px var(--accent-hairline), 0 0 20px -6px oklch(0.70 0.15 162 / 0.5)'
          : 'var(--glass-well-shadow), 0 0 0 1px var(--line-faint)',
      transition: 'box-shadow var(--dur-base) var(--ease-glass)',
      ...style,
    }}>
      {children}
    </div>
  );
}

function Labelled({ icon, label, hint, right, children, flash }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-3)', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
        <Kicker icon={icon} tone={flash ? 'var(--hue-amber)' : 'var(--fg-3)'}>{label}</Kicker>
        <span style={{ flex: 1 }} />
        {right}
      </div>
      {children}
      {hint && <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>{hint}</span>}
    </div>
  );
}

const fieldStyle = (mono) => ({
  flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent',
  color: 'var(--fg-1)', font: mono ? 'var(--type-numeric)' : 'var(--type-body)',
  fontSize: 'var(--text-sm)', letterSpacing: 'var(--tracking-ui)',
  fontVariantNumeric: mono ? 'tabular-nums' : undefined,
});

function Area({ value, onChange, placeholder, rows = 3, inputRef, flash }) {
  const [focus, setFocus] = React.useState(false);
  return (
    <Well focus={focus} flash={flash} pad="var(--sp-5) var(--sp-6)" radius="var(--r-lg)" height={0}>
      <textarea
        ref={inputRef}
        className="ag-field"
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        placeholder={placeholder}
        style={{ ...fieldStyle(false), resize: 'none', lineHeight: 'var(--leading-normal)', padding: 0 }}
      />
    </Well>
  );
}

/* Our own dropdown: the native select paints an OS menu that ignores
   every rule in this system. This one unfurls out of its trigger. */
function Pick({ value, onChange, options, inputRef, placeholder, icon }) {
  const [open, setOpen] = React.useState(false);
  const [hover, setHover] = React.useState(null);
  const box = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', esc, true); };
  }, [open]);

  return (
    <div ref={box} style={{ position: 'relative', minWidth: 0 }}>
      <button
        ref={inputRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', width: '100%',
          minHeight: 46, padding: '0 var(--sp-5)', border: 0, cursor: 'pointer', textAlign: 'left',
          borderRadius: 'var(--r-control)',
          backgroundImage: 'var(--glass-well)',
          boxShadow: open
            ? 'var(--glass-well-shadow), 0 0 0 1px var(--accent-hairline), 0 0 20px -6px oklch(0.70 0.15 162 / 0.5)'
            : 'var(--glass-well-shadow), 0 0 0 1px var(--line-faint)',
          color: value ? 'var(--fg-1)' : 'var(--fg-4)',
          font: 'var(--type-body)', fontSize: 'var(--text-sm)', letterSpacing: 'var(--tracking-ui)',
          transition: 'box-shadow var(--dur-base) var(--ease-glass)',
        }}
      >
        {icon && <span style={{ display: 'flex', color: 'var(--fg-4)' }}><Icon name={icon} size={15} /></span>}
        <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {value || placeholder}
        </span>
        <span style={{
          display: 'flex', color: open ? 'var(--accent)' : 'var(--fg-4)',
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform var(--dur-base) var(--ease-glass), color var(--dur-fast) var(--ease-glass)',
        }}>
          <Icon name="chevron-down" size={16} />
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          className="ag-scroll"
          style={{
            position: 'absolute', top: 'calc(100% + var(--sp-3))', left: 0, right: 0, zIndex: 60,
            display: 'grid', gap: 2, maxHeight: 260, overflowY: 'auto',
            padding: 'var(--sp-3)', borderRadius: 'var(--r-lg)',
            backgroundImage: 'var(--glass-fill-3)',
            backdropFilter: 'var(--glass-bd-xl)', WebkitBackdropFilter: 'var(--glass-bd-xl)',
            boxShadow: 'var(--glass-shadow-thick)',
            transformOrigin: 'top center',
            animation: 'ag-unfurl var(--dur-morph) var(--ease-morph) both',
          }}
        >
          {options.length === 0 && (
            <span style={{ padding: 'var(--sp-4) var(--sp-5)', font: 'var(--type-caption)', color: 'var(--fg-4)' }}>Nothing left to pick.</span>
          )}
          {options.map((o) => {
            const on = o === value;
            return (
              <button
                key={o}
                type="button"
                role="option"
                aria-selected={on}
                onClick={() => { onChange(o); setOpen(false); }}
                onMouseEnter={() => setHover(o)}
                onMouseLeave={() => setHover(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', width: '100%',
                  minHeight: 44, padding: '0 var(--sp-5)', border: 0, cursor: 'pointer', textAlign: 'left',
                  borderRadius: 'var(--r-md)',
                  backgroundImage: on ? 'var(--glass-tint-accent)' : hover === o ? 'var(--glass-fill-2)' : 'transparent',
                  boxShadow: on ? 'var(--glass-rim-1)' : 'none',
                  color: on ? 'oklch(0.93 0.07 162)' : 'var(--fg-2)',
                  font: 'var(--type-body)', fontSize: 'var(--text-sm)',
                  transition: 'var(--t-hover)',
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>{o}</span>
                {on && <Icon name="check" size={15} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Points({ value, tone = 'var(--fg-2)', size = 'var(--text-xs)' }) {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return (
    <span style={{ font: 'var(--type-numeric)', fontSize: size, fontVariantNumeric: 'tabular-nums', color: tone, whiteSpace: 'nowrap' }}>
      {sign}{Math.abs(value)}
    </span>
  );
}

function Chip({ children, icon, onRemove, onClick, tone, active }) {
  const [hover, setHover] = React.useState(false);
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)', flex: '0 0 auto',
        height: 30, padding: '0 ' + (onRemove ? 'var(--sp-3)' : 'var(--sp-5)') + ' 0 var(--sp-5)',
        border: 0, borderRadius: 'var(--r-pill)', cursor: onClick ? 'pointer' : 'default',
        backgroundImage: tone === 'amber'
          ? 'var(--glass-tint-amber)'
          : active ? 'var(--glass-fill-3)' : (hover && onClick ? 'var(--glass-fill-2)' : 'var(--glass-fill-1)'),
        boxShadow: tone === 'amber' ? 'var(--glass-rim-1)' : active ? 'var(--glass-rim-2)' : 'var(--glass-rim-1)',
        color: tone === 'amber' ? 'oklch(0.95 0.07 82)' : active ? 'var(--fg-1)' : 'var(--fg-2)',
        font: 'var(--type-label)', fontSize: 'var(--text-xs)', whiteSpace: 'nowrap',
        transition: 'var(--t-hover)',
      }}
    >
      {icon && <Icon name={icon} size={13} />}
      {children}
      {onRemove && (
        <span
          role="button"
          aria-label="Remove"
          tabIndex={0}
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRemove(); } }}
          style={{ display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: '50%', color: 'var(--fg-3)', cursor: 'pointer' }}
        >
          <Icon name="x" size={13} />
        </span>
      )}
    </Tag>
  );
}

/* A pane inside the sheet. Level 1 glass on level 3 glass: enough to
   group, not enough to compete with the sheet's own edge. */
function Pane({ icon, title, meta, children, style }) {
  return (
    <section style={{
      display: 'grid', gap: 'var(--sp-7)', alignContent: 'start',
      padding: 'var(--pad-card)', borderRadius: 'var(--r-card)',
      backgroundImage: 'var(--glass-fill-1)',
      boxShadow: 'var(--glass-rim-1), var(--glass-inner-1)',
      ...style,
    }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
        <span style={{ display: 'flex', color: 'var(--fg-3)' }}><Icon name={icon} size={16} /></span>
        <h3 style={{ margin: 0, flex: 1, minWidth: 0, font: 'var(--type-title)', fontSize: 'var(--text-md)', letterSpacing: 'var(--tracking-ui)', color: 'var(--fg-1)' }}>{title}</h3>
        {meta}
      </header>
      {children}
    </section>
  );
}

function Quadrants({ value, onChange, firstRef, flash }) {
  const cell = (key) => {
    const q = QUADRANTS[key];
    const on = value === key;
    return (
      <button
        key={key}
        ref={key === 'schedule' ? firstRef : undefined}
        type="button"
        onClick={() => onChange(key)}
        aria-pressed={on}
        style={{
          display: 'grid', alignContent: 'space-between', gap: 'var(--sp-3)',
          minHeight: 92, padding: 'var(--sp-5)', border: 0, cursor: 'pointer', textAlign: 'left',
          borderRadius: 'var(--r-tile)',
          backgroundImage: on ? tintOf(q.hue, 0.30, 0.10, 0.19) : tintOf(q.hue, 0.10, 0.03, 0.07),
          boxShadow: on
            ? 'var(--glass-rim-2), 0 0 0 1px oklch(' + q.hue + ' / 0.45), 0 0 26px -6px oklch(' + q.hue + ' / 0.55)'
            : flash
              ? 'var(--glass-well-shadow), 0 0 0 1px var(--hue-amber)'
              : 'var(--glass-well-shadow), inset 0 0 0 1px oklch(' + q.hue + ' / 0.16)',
          color: on ? 'var(--fg-1)' : 'var(--fg-1)',
          transition: 'var(--t-hover)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-4)' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)', flex: 1, minWidth: 0,
            font: 'var(--type-title)', fontSize: 'var(--text-sm)', letterSpacing: 'var(--tracking-ui)',
          }}>
            <span aria-hidden="true" style={{
              width: 5, height: 5, borderRadius: '50%', flex: '0 0 auto',
              background: 'oklch(' + q.hue + ')',
              boxShadow: on ? '0 0 8px oklch(' + q.hue + ' / 0.9)' : 'none',
              opacity: on ? 1 : 0.75,
            }} />
            {q.label}
          </span>
          <Points value={q.points} tone={on ? q.ink : 'var(--fg-2)'} />
        </div>
        <span style={{ font: 'var(--type-caption)', color: on ? q.ink : 'var(--fg-2)', textWrap: 'pretty' }}>
          {q.hint}
        </span>
      </button>
    );
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '76px 1fr 1fr', gap: 'var(--sp-3)', alignItems: 'stretch' }}>
      <span />
      <Kicker style={{ justifyContent: 'center' }}>Not urgent</Kicker>
      <Kicker icon="flame" style={{ justifyContent: 'center' }}>Urgent</Kicker>

      <Kicker style={{ alignSelf: 'center' }}>Important</Kicker>
      {cell('schedule')}
      {cell('do')}

      <Kicker style={{ alignSelf: 'center', whiteSpace: 'normal', textWrap: 'pretty' }}>Not important</Kicker>
      {cell('eliminate')}
      {cell('delegate')}
    </div>
  );
}

function Importance({ value, onChange, firstRef, flash }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
      <div style={{
        display: 'grid', gridAutoFlow: 'column', gridAutoColumns: '1fr', gap: 'var(--sp-2)',
        padding: 4, borderRadius: 'var(--r-pill)',
        backgroundImage: 'var(--glass-well)',
        boxShadow: flash ? 'var(--glass-well-shadow), 0 0 0 1px var(--hue-amber)' : 'var(--glass-well-shadow)',
      }}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value === n;
          return (
            <button
              key={n}
              ref={n === 1 ? firstRef : undefined}
              type="button"
              onClick={() => onChange(n)}
              aria-pressed={on}
              aria-label={n + ' — ' + IMPORTANCE[n - 1]}
              style={{
                height: 44, border: 0, cursor: 'pointer', borderRadius: 'var(--r-pill)',
                backgroundImage: on
                  ? tintOf('0.75 0.15 82', 0.34, 0.12, 0.22)
                  : 'linear-gradient(155deg, ' + HEAT(n) + ', ' + HEAT(n) + ')',
                boxShadow: on
                  ? 'var(--glass-rim-2), 0 0 0 1px oklch(0.75 0.15 82 / 0.45), 0 0 24px -6px oklch(0.75 0.15 82 / 0.6)'
                  : 'none',
                color: on ? 'oklch(0.96 0.07 82)' : 'var(--fg-1)',
                font: 'var(--type-numeric)', fontSize: 'var(--text-md)',
                transition: 'var(--t-hover)',
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Kicker tone="var(--fg-4)">Very low</Kicker>
        <Kicker tone="var(--fg-4)">Critical</Kicker>
      </div>
    </div>
  );
}

/* Recurrence edits in place, in the field's own slot — a second modal
   over a sheet would lose the subject. */
function RepeatEditor({ r, onSave, onClose }) {
  const [d, setD] = React.useState(r || { every: 1, unit: 'weeks', days: [], ends: 'never', count: 8 });
  const set = (k, v) => setD(Object.assign({}, d, { [k]: v }));
  const toggleDay = (n) => {
    const days = (d.days || []);
    set('days', days.indexOf(n) > -1 ? days.filter((x) => x !== n) : days.concat(n));
  };

  return (
    <div style={{
      display: 'grid', gap: 'var(--gap-stack)', padding: 'var(--sp-6)',
      borderRadius: 'var(--r-lg)', backgroundImage: 'var(--glass-fill-2)',
      boxShadow: 'var(--glass-rim-2), var(--glass-cast-2)',
      animation: 'ag-condense var(--dur-base) var(--ease-glass) both',
    }}>
      <div style={{ display: 'flex', gap: 'var(--sp-4)' }}>
        <Well style={{ width: 76, flex: '0 0 auto' }}>
          <input className="ag-field" type="number" min="1" max="99" value={d.every}
            onChange={(e) => set('every', Math.max(1, Number(e.target.value) || 1))}
            aria-label="Repeat interval" style={{ ...fieldStyle(true), textAlign: 'center' }} />
        </Well>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Pick value={d.unit} onChange={(v) => set('unit', v)} options={['days', 'weeks', 'months', 'years']} />
        </div>
      </div>

      {d.unit === 'weeks' && (
        <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, n) => {
            const on = (d.days || []).indexOf(n) > -1;
            return (
              <button
                key={n}
                type="button"
                onClick={() => toggleDay(n)}
                aria-pressed={on}
                aria-label={DAY_NAMES[n]}
                style={{
                  width: 40, height: 40, border: 0, cursor: 'pointer', borderRadius: '50%',
                  backgroundImage: on ? 'var(--glass-tint-accent)' : 'var(--glass-well)',
                  boxShadow: on ? 'var(--glass-rim-2), var(--glow-accent-sm)' : 'var(--glass-well-shadow)',
                  color: on ? 'oklch(0.93 0.07 162)' : 'var(--fg-3)',
                  font: 'var(--type-label)', fontSize: 'var(--text-xs)', transition: 'var(--t-hover)',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      <SegmentedControl
        value={d.ends}
        onChange={(v) => set('ends', v)}
        style={{ width: '100%' }}
        options={[{ value: 'never', label: 'Never ends' }, { value: 'after', label: 'After' }]}
      />

      {d.ends === 'after' && (
        <Well>
          <input className="ag-field" type="number" min="1" value={d.count}
            onChange={(e) => set('count', Math.max(1, Number(e.target.value) || 1))}
            aria-label="Occurrences" style={{ ...fieldStyle(true), flex: '0 0 56px', textAlign: 'center' }} />
          <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>occurrences</span>
        </Well>
      )}

      <div style={{ display: 'flex', gap: 'var(--sp-4)' }}>
        <Button variant="ghost" size="sm" onClick={() => { onSave(null); onClose(); }}>Don't repeat</Button>
        <span style={{ flex: 1 }} />
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
        <Button variant="solid" size="sm" onClick={() => { onSave(d); onClose(); }}>Set</Button>
      </div>
    </div>
  );
}

/* ================================================================== *
   THE SHEET
 * ================================================================== */

export function TaskSheet({
  task,
  lists = [],
  shareLists = [],
  prereqs = [],
  now,
  onClose,
  onSave,
  onDelete,
  className = '',
  style,
}) {
  const NOW = React.useMemo(() => (now ? new Date(now) : new Date()), [now]);
  const [t, setT] = React.useState(task);
  const [wide, setWide] = React.useState(window.innerWidth >= 1260);
  const [mid, setMid] = React.useState(window.innerWidth >= 880);
  const [flash, setFlash] = React.useState(null);
  const [confirm, setConfirm] = React.useState(false);
  const [editRepeat, setEditRepeat] = React.useState(false);
  const [tagDraft, setTagDraft] = React.useState('');
  const [linkDraft, setLinkDraft] = React.useState({ label: '', url: '' });
  const [subDraft, setSubDraft] = React.useState('');
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    setT(task); setDirty(false); setConfirm(false); setEditRepeat(false);
  }, [task]);

  const refs = {
    quadrant: React.useRef(null), importance: React.useRef(null),
    deadline: React.useRef(null), est: React.useRef(null), desc: React.useRef(null),
  };

  React.useEffect(() => {
    const onResize = () => { setWide(window.innerWidth >= 1260); setMid(window.innerWidth >= 880); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  React.useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape' && onClose) onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  if (!t) return null;

  const patch = (k, v) => { setT((cur) => Object.assign({}, cur, { [k]: v })); setDirty(true); };

  const score = scoreOf(t, NOW);
  const needs = needsOf(t);
  const dl = deadlineScore(t.deadline, NOW);
  const subtasks = t.subtasks || [];
  const doneSubs = subtasks.filter((s) => s.done).length;
  const subPct = subtasks.length ? (doneSubs / subtasks.length) * 100 : 0;
  const tags = t.tags || [];
  const links = t.links || [];
  const shared = t.shared || [];

  const jump = (id) => {
    setFlash(id);
    window.setTimeout(() => setFlash(null), 1400);
    const el = refs[id] && refs[id].current;
    if (el) window.setTimeout(() => el.focus(), 40);
  };

  const fact = (icon, text, tone) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)', font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: tone || 'var(--fg-3)' }}>
      <Icon name={icon} size={14} />{text}
    </span>
  );

  const cols = wide ? 'minmax(0, 1.05fr) minmax(0, 1fr) minmax(0, 0.95fr)' : mid ? 'minmax(0, 1fr) minmax(0, 1fr)' : '1fr';

  return (
    <div
      className={className}
      style={{
        position: 'fixed', inset: 0, zIndex: 100, display: 'grid', placeItems: 'center',
        padding: mid ? 'var(--sp-7)' : 'var(--sp-4)',
        background: 'oklch(0.04 0 0 / 0.62)',
        backdropFilter: 'blur(10px) saturate(1.2)', WebkitBackdropFilter: 'blur(10px) saturate(1.2)',
        animation: 'ag-condense var(--dur-fast) var(--ease-glass) both',
        ...style,
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 1240, maxHeight: '92vh',
          display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto',
          borderRadius: 'var(--r-sheet)',
          backgroundImage: 'var(--glass-fill-3)',
          backdropFilter: 'var(--glass-bd-xl)', WebkitBackdropFilter: 'var(--glass-bd-xl)',
          boxShadow: 'var(--glass-shadow-thick), var(--shadow-5)',
          animation: 'ag-condense var(--dur-morph) var(--ease-morph) both',
          overflow: 'hidden',
        }}
      >
        {/* ------------- HEADER: what this task IS ------------- */}
        <header style={{
          display: 'grid', gap: 'var(--sp-5)',
          padding: mid ? 'var(--sp-8) var(--pad-sheet) var(--sp-7)' : 'var(--sp-6) var(--sp-6) var(--sp-5)',
          borderBottom: '1px solid var(--line-faint)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            {t.project && <Chip icon="folder">{t.project}</Chip>}
            {t.project && <span style={{ display: 'flex', color: 'var(--fg-4)' }}><Icon name="chevron-right" size={14} /></span>}
            <Chip icon="list">{t.list}</Chip>
            <StatusPill status={t.status === 'done' ? 'done' : t.status === 'doing' ? 'running' : 'queued'}>
              {t.status === 'done' ? 'Done' : t.status === 'doing' ? 'In progress' : 'To do'}
            </StatusPill>
            {t.blockedBy && <Chip icon="lock" tone="amber">Blocked by {t.blockedBy}</Chip>}
            <span style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" iconLeft={<Icon name="image-up" size={15} />}>
              {t.cover ? 'Change cover' : 'Add cover'}
            </Button>
            <IconButton label="Close" variant="ghost" onClick={onClose}><Icon name="x" size={18} /></IconButton>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-6)', flexWrap: 'wrap' }}>
            <input
              value={t.title}
              onChange={(e) => patch('title', e.target.value)}
              aria-label="Task title"
              className="ag-field"
              style={{
                flex: '1 1 340px', minWidth: 0, border: 0, background: 'transparent', padding: 0,
                font: 'var(--type-display)', fontSize: mid ? 'var(--text-3xl)' : 'var(--text-2xl)',
                letterSpacing: 'var(--tracking-display)', color: 'var(--fg-1)',
              }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flex: '0 0 auto' }}>
              <Kicker icon="target">Priority</Kicker>
              <ScoreDial value={score.total} max={MAX} size="lg" showMax />
            </div>
          </div>

          {/* The facts the old modal made you scroll for. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-6)', flexWrap: 'wrap' }}>
            {fact('calendar-clock', dl.phrase, dl.points >= 3.5 ? 'var(--hue-amber)' : null)}
            {fact('timer', mins(Number(t.est)))}
            {subtasks.length > 0 && fact('list-checks', doneSubs + ' / ' + subtasks.length)}
            {fact('indian-rupee', money(t.value))}
            {t.repeat && fact('repeat', repeatText(t.repeat) + (t.occurrence && t.repeat.ends === 'after' ? ' · ' + t.occurrence + ' of ' + t.repeat.count : ''))}
            <span style={{ flex: 1 }} />
            {needs.length > 0 ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
                <Kicker icon="triangle-alert" tone="var(--hue-amber)">Needs</Kicker>
                {needs.map((n) => <Chip key={n.id} tone="amber" onClick={() => jump(n.id)}>{n.label}</Chip>)}
              </span>
            ) : (
              <Kicker icon="check" tone="var(--accent)">Fully scored</Kicker>
            )}
          </div>
        </header>

        {/* ------------- BODY: three columns, no wall ------------- */}
        <div className="ag-scroll" style={{
          overflowY: 'auto', display: 'grid', gridTemplateColumns: cols,
          gap: 'var(--gap-card)', alignItems: 'start',
          padding: mid ? 'var(--sp-7) var(--pad-sheet)' : 'var(--sp-6)',
        }}>
          {/* ===== 1. WHAT DECIDES THE SCORE ===== */}
          <Pane icon="target" title="What decides the score" meta={<Kicker tone="var(--fg-4)">{score.total.toFixed(1)} / {MAX}</Kicker>}>
            <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
              <div style={{ display: 'flex', gap: 2, height: 10, padding: 2, borderRadius: 'var(--r-pill)', backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)', overflow: 'hidden' }}>
                {score.factors.filter((f) => f.value > 0).map((f) => (
                  <span key={f.key} style={{ flex: f.value + ' 0 0', minWidth: 3, borderRadius: 'var(--r-pill)', background: 'oklch(1 0 0 / ' + f.tone + ')', transition: 'flex-grow var(--dur-slow) var(--ease-glass)' }} />
                ))}
                <span style={{ flex: Math.max(0, MAX - score.total) + ' 0 0' }} />
              </div>
              <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
                {score.factors.map((f) => (
                  <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
                    <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, flex: '0 0 auto', background: 'oklch(1 0 0 / ' + f.tone + ')' }} />
                    <span style={{ flex: 1, minWidth: 0, font: 'var(--type-caption)', color: f.value ? 'var(--fg-2)' : 'var(--fg-4)' }}>{f.label}</span>
                    <Points value={f.value} tone={f.value ? 'var(--fg-1)' : 'var(--fg-4)'} />
                    <span style={{ font: 'var(--type-kicker)', color: 'var(--fg-4)', width: 24, textAlign: 'right' }}>/{f.max}</span>
                  </div>
                ))}
                {score.penalty > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', paddingTop: 'var(--sp-3)', borderTop: '1px solid var(--line-faint)' }}>
                    <span aria-hidden="true" style={{ width: 8, height: 8, flex: '0 0 auto', borderRadius: 2, background: 'repeating-linear-gradient(45deg, var(--fg-4) 0 2px, transparent 2px 4px)' }} />
                    <span style={{ flex: 1, minWidth: 0, font: 'var(--type-caption)', color: 'var(--fg-3)' }}>Over two hours</span>
                    <Points value={-score.penalty} tone="var(--fg-3)" />
                    <span style={{ width: 24 }} />
                  </div>
                )}
              </div>
            </div>

            <Labelled icon="grid-2x2" label="Eisenhower quadrant" flash={flash === 'quadrant'}
              right={<Points value={t.quadrant ? QUADRANTS[t.quadrant].points : 0} />}>
              <Quadrants value={t.quadrant} onChange={(v) => patch('quadrant', v)} firstRef={refs.quadrant} flash={flash === 'quadrant'} />
            </Labelled>

            <Labelled icon="star" label="Personal importance" flash={flash === 'importance'}
              right={<span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>{t.importance ? IMPORTANCE[t.importance - 1] : 'Not set'}</span>
                <Points value={t.importance || 0} />
              </span>}
              hint="The only subjective input. Everything else is derived.">
              <Importance value={t.importance} onChange={(v) => patch('importance', v)} firstRef={refs.importance} flash={flash === 'importance'} />
            </Labelled>

            <Labelled icon="indian-rupee" label="Value" hint={'Rolls up into ' + t.list + ' and the project total.'}>
              <Well>
                <span style={{ font: 'var(--type-numeric)', color: 'var(--fg-4)' }}>₹</span>
                <input className="ag-field" type="number" min="0" step="1000" value={t.value}
                  onChange={(e) => patch('value', e.target.value === '' ? 0 : Number(e.target.value))}
                  aria-label="Value in rupees" style={fieldStyle(true)} />
                <span style={{ font: 'var(--type-kicker)', color: 'var(--fg-4)' }}>{money(t.value)}</span>
              </Well>
            </Labelled>

            <Well style={{ minHeight: 58, padding: 'var(--sp-4) var(--sp-6)', borderRadius: 'var(--r-lg)' }}>
              <div style={{ display: 'grid', gap: 2, flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', font: 'var(--type-label)', color: 'var(--fg-1)' }}>
                  Quasi-need <Points value={1} tone="var(--fg-3)" />
                </span>
                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>Someone else is blocked until this lands.</span>
              </div>
              <Switch checked={!!t.quasi} onChange={(v) => patch('quasi', typeof v === 'boolean' ? v : !t.quasi)} aria-label="Quasi-need" />
            </Well>
          </Pane>

          {/* ===== 2. THE WORK ===== */}
          <Pane icon="align-left" title="The work">
            <Labelled icon="circle-dot" label="Status">
              <SegmentedControl
                value={t.status}
                onChange={(v) => patch('status', v)}
                style={{ width: '100%' }}
                options={[{ value: 'todo', label: 'To do' }, { value: 'doing', label: 'In progress' }, { value: 'done', label: 'Done' }]}
              />
            </Labelled>

            <Labelled icon="text" label="Description" flash={flash === 'desc'}
              right={!(t.desc || '').trim() ? <Chip tone="amber">Needed</Chip> : null}
              hint="What has to be true when it's done.">
              <Area value={t.desc || ''} onChange={(v) => patch('desc', v)} rows={3} inputRef={refs.desc} flash={flash === 'desc'}
                placeholder="One or two lines." />
            </Labelled>

            <Labelled icon="list-checks" label="Subtasks"
              right={<span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-3)' }}>{doneSubs} / {subtasks.length}</span>}>
              <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
                {/* The field sits above the list: you write several in a
                    row, and each one lands under the caret, not below a
                    growing stack you have to chase. */}
                <Well>
                  <span style={{ display: 'flex', color: 'var(--fg-4)' }}><Icon name="plus" size={15} /></span>
                  <input className="ag-field" value={subDraft} onChange={(e) => setSubDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' || !subDraft.trim()) return;
                      e.preventDefault();
                      patch('subtasks', subtasks.concat({ id: 's' + Date.now(), title: subDraft.trim(), done: false }));
                      setSubDraft('');
                    }}
                    placeholder="Add subtask, then Enter" aria-label="Add subtask" style={fieldStyle(false)} />
                </Well>
                <span style={{ display: 'block', height: 3, borderRadius: 'var(--r-pill)', backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)', overflow: 'hidden' }}>
                  <span style={{ display: 'block', height: '100%', width: subPct + '%', borderRadius: 'var(--r-pill)', background: 'var(--accent)', boxShadow: '0 0 10px -1px var(--accent)', transition: 'width var(--dur-slow) var(--ease-glass)' }} />
                </span>
                {subtasks.length > 0 && (
                  <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
                    {subtasks.map((s) => (
                      <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minHeight: 44, padding: '0 var(--sp-4)', borderRadius: 'var(--r-md)' }}>
                        <Checkbox
                          size="sm"
                          checked={s.done}
                          label={s.title}
                          onChange={(v) => patch('subtasks', subtasks.map((x) => (x.id === s.id ? Object.assign({}, x, { done: v }) : x)))}
                        />
                        <span style={{ flex: 1 }} />
                        <IconButton label="Remove subtask" variant="ghost" size="sm"
                          onClick={() => patch('subtasks', subtasks.filter((x) => x.id !== s.id))}>
                          <Icon name="x" size={15} />
                        </IconButton>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Labelled>

            <Labelled icon="file-text" label="Notes" hint="Long-form. Never shown on the card.">
              <Area value={t.notes || ''} onChange={(v) => patch('notes', v)} rows={4}
                placeholder="Research, context, links to dig into later." />
              {typeof RecordTimer === 'function' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', marginTop: 'var(--sp-3)' }}>
                <RecordTimer size="sm" label="voice note" icon={<Icon name="mic" size={16} />}
                  onSave={(sec) => patch('notes', ((t.notes || '') + (t.notes ? '\n' : '') + 'Voice note · ' + sec + 's').trim())} />
                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>Voice note</span>
              </div>
            )}
          </Labelled>
          </Pane>

          {/* ===== 3. TIMING + CONTEXT ===== */}
          <div style={{ display: 'grid', gap: 'var(--gap-card)', minWidth: 0 }}>
            <Pane icon="calendar-clock" title="Timing">
              <Labelled icon="calendar-clock" label="Deadline" flash={flash === 'deadline'}
                right={<Points value={dl.points} tone={dl.points >= 3.5 ? 'var(--hue-amber)' : 'var(--fg-2)'} />}
                hint={dl.phrase + ' — the Deadline factor is derived from this.'}>
                <Well flash={flash === 'deadline'}>
                  <span style={{ display: 'flex', color: 'var(--fg-4)' }}><Icon name="calendar" size={15} /></span>
                  <input ref={refs.deadline} className="ag-field" type="datetime-local" value={t.deadline || ''}
                    onChange={(e) => patch('deadline', e.target.value)} aria-label="Deadline" style={fieldStyle(true)} />
                </Well>
              </Labelled>

              <Labelled icon="play" label="Start date" hint="Optional. Keeps it out of sessions until then.">
                <Well>
                  <span style={{ display: 'flex', color: 'var(--fg-4)' }}><Icon name="calendar" size={15} /></span>
                  <input className="ag-field" type="datetime-local" value={t.start || ''}
                    onChange={(e) => patch('start', e.target.value)} aria-label="Start date" style={fieldStyle(true)} />
                </Well>
              </Labelled>

              <Labelled icon="clock" label="Estimate" flash={flash === 'est'}
                right={score.penalty > 0 ? <Points value={-score.penalty} tone="var(--fg-3)" /> : null}
                hint={score.penalty > 0 ? 'Over two hours — half a point off, so it cannot crowd out short work.' : 'Feeds the session clock.'}>
                <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
                  <Well flash={flash === 'est'}>
                    <span style={{ display: 'flex', color: 'var(--fg-4)' }}><Icon name="timer" size={15} /></span>
                    <input ref={refs.est} className="ag-field" type="number" min="0" step="5" value={t.est}
                      onChange={(e) => patch('est', e.target.value === '' ? '' : Number(e.target.value))}
                      aria-label="Estimated minutes" style={fieldStyle(true)} />
                    <span style={{ font: 'var(--type-kicker)', color: 'var(--fg-4)' }}>MIN</span>
                  </Well>
                  <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
                    {[30, 60, 90, 150].map((m) => (
                      <Chip key={m} onClick={() => patch('est', m)} active={Number(t.est) === m}>{m}m</Chip>
                    ))}
                  </div>
                </div>
              </Labelled>

              <Labelled icon="repeat" label="Repeat"
                right={t.repeat && t.occurrence && t.repeat.ends === 'after'
                  ? <Kicker tone={t.occurrence === t.repeat.count ? 'var(--hue-amber)' : 'var(--fg-4)'}>
                      {t.occurrence === t.repeat.count ? 'Last one' : t.occurrence + ' of ' + t.repeat.count}
                    </Kicker>
                  : null}>
                {editRepeat ? (
                  <RepeatEditor r={t.repeat} onSave={(v) => patch('repeat', v)} onClose={() => setEditRepeat(false)} />
                ) : (
                  <button type="button" onClick={() => setEditRepeat(true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', width: '100%', minHeight: 46,
                      padding: '0 var(--sp-5)', border: 0, cursor: 'pointer', textAlign: 'left',
                      borderRadius: 'var(--r-control)', backgroundImage: 'var(--glass-well)',
                      boxShadow: 'var(--glass-well-shadow), 0 0 0 1px var(--line-faint)',
                      color: t.repeat ? 'var(--fg-1)' : 'var(--fg-4)', font: 'var(--type-body)', fontSize: 'var(--text-sm)',
                    }}>
                    <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{repeatText(t.repeat)}</span>
                    <span style={{ display: 'flex', color: 'var(--fg-3)' }}><Icon name="pencil" size={15} /></span>
                  </button>
                )}
              </Labelled>

              <Labelled icon="bell" label="Reminder">
                <Pick value={t.reminder} onChange={(v) => patch('reminder', v)} options={REMINDERS} icon="bell" />
              </Labelled>
            </Pane>

            <Pane icon="share-2" title="Context">
              <Labelled icon="list" label="List" hint="Moving it re-parents the task; the score is unaffected.">
                <Pick value={t.list} onChange={(v) => patch('list', v)} options={lists} icon="folder" />
              </Labelled>

              <Labelled icon="copy" label="Also shown in" hint="Shared tasks stay in sync everywhere they appear.">
                <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
                  <Pick value="" placeholder="Share into another list…"
                    onChange={(v) => { if (v && shared.indexOf(v) < 0) patch('shared', shared.concat(v)); }}
                    options={shareLists.filter((l) => shared.indexOf(l) < 0)} />
                  {shared.length > 0 && (
                    <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
                      {shared.map((s) => <Chip key={s} onRemove={() => patch('shared', shared.filter((x) => x !== s))}>{s}</Chip>)}
                    </div>
                  )}
                </div>
              </Labelled>

              <Labelled icon="git-branch" label="Depends on" hint="A soft warning. The task is never hidden or reordered.">
                <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
                  <Pick value={t.blockedBy || ''} placeholder="Add a prerequisite task…"
                    onChange={(v) => patch('blockedBy', v)}
                    options={prereqs.filter((p) => p !== t.blockedBy && p !== t.title)} icon="lock" />
                  {t.blockedBy && (
                    <div style={{ display: 'flex' }}>
                      <Chip icon="lock" onRemove={() => patch('blockedBy', '')}>{t.blockedBy}</Chip>
                    </div>
                  )}
                </div>
              </Labelled>

              <Labelled icon="user-round" label="Assignee">
                {t.assignee ? (
                  <Well>
                    <span style={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: '50%', backgroundImage: 'var(--glass-fill-3)', boxShadow: 'var(--glass-rim-2)', color: 'var(--fg-1)', font: 'var(--type-kicker)' }}>
                      {t.assignee.slice(0, 1).toUpperCase()}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-1)' }}>{t.assignee}</span>
                    <IconButton label="Unassign" variant="ghost" onClick={() => patch('assignee', null)}><Icon name="x" size={16} /></IconButton>
                  </Well>
                ) : (
                  <button type="button" onClick={() => patch('assignee', 'Me')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', width: '100%', minHeight: 46,
                      padding: '0 var(--sp-5)', cursor: 'pointer', borderRadius: 'var(--r-control)',
                      border: '1px dashed var(--line-strong)', background: 'transparent',
                      color: 'var(--fg-3)', font: 'var(--type-body)', fontSize: 'var(--text-sm)', transition: 'var(--t-hover)',
                    }}>
                    <Icon name="user-round-plus" size={16} />Assign to me
                  </button>
                )}
              </Labelled>

              <Labelled icon="tag" label="Tags">
                <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
                  {tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
                      {tags.map((tag) => <Chip key={tag} onRemove={() => patch('tags', tags.filter((x) => x !== tag))}>#{tag}</Chip>)}
                    </div>
                  )}
                  <Well>
                    <input className="ag-field" value={tagDraft} onChange={(e) => setTagDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' || !tagDraft.trim()) return;
                        e.preventDefault();
                        patch('tags', tags.concat(tagDraft.trim().replace(/^#/, '')));
                        setTagDraft('');
                      }}
                      placeholder="Add tag, then Enter" aria-label="Add tag" style={fieldStyle(false)} />
                  </Well>
                </div>
              </Labelled>

              <Labelled icon="link" label="Links">
                <div style={{ display: 'grid', gap: 'var(--sp-3)', minWidth: 0 }}>
                  {links.map((l, n) => (
                    <Well key={n} style={{ minWidth: 0 }}>
                      <span style={{ display: 'flex', color: 'var(--fg-4)' }}><Icon name="link" size={15} /></span>
                      <span style={{ flex: 1, minWidth: 0, font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {l.label || l.url}
                      </span>
                      <IconButton label="Open link" variant="ghost" size="sm"><Icon name="arrow-up-right" size={15} /></IconButton>
                      <IconButton label="Remove link" variant="ghost" size="sm"
                        onClick={() => patch('links', links.filter((x, m) => m !== n))}><Icon name="x" size={15} /></IconButton>
                    </Well>
                  ))}
                  {/* Grid, not flex: min-content on three flex children is
                     what pushed this row past the pane's edge. */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 0.8fr) minmax(0, 1fr) 44px', gap: 'var(--sp-3)', minWidth: 0 }}>
                    <Well style={{ minWidth: 0 }}>
                      <input className="ag-field" value={linkDraft.label}
                        onChange={(e) => setLinkDraft({ label: e.target.value, url: linkDraft.url })}
                        placeholder="Label" aria-label="Link label" style={fieldStyle(false)} />
                    </Well>
                    <Well style={{ minWidth: 0 }}>
                      <input className="ag-field" value={linkDraft.url}
                        onChange={(e) => setLinkDraft({ label: linkDraft.label, url: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter' || !linkDraft.url.trim()) return;
                          e.preventDefault();
                          patch('links', links.concat(linkDraft));
                          setLinkDraft({ label: '', url: '' });
                        }}
                        placeholder="https://…" aria-label="Link URL" style={fieldStyle(false)} />
                    </Well>
                    <IconButton label="Add link"
                      onClick={() => { if (!linkDraft.url.trim()) return; patch('links', links.concat(linkDraft)); setLinkDraft({ label: '', url: '' }); }}>
                      <Icon name="plus" size={16} />
                    </IconButton>
                  </div>
                </div>
              </Labelled>

              <Labelled icon="share-2" label="Share" hint="A live, read-only page. Anyone with the link can watch progress.">
                <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
                  {t.publicLink ? (
                    <Well>
                      <span style={{ display: 'flex', color: 'var(--accent)' }}><Icon name="globe" size={15} /></span>
                      <span style={{ flex: 1, minWidth: 0, font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {t.publicLink}
                      </span>
                      <IconButton label="Copy link" variant="ghost" size="sm"><Icon name="copy" size={15} /></IconButton>
                      <IconButton label="Revoke link" variant="ghost" size="sm" onClick={() => patch('publicLink', null)}><Icon name="x" size={15} /></IconButton>
                    </Well>
                  ) : (
                    <Button variant="glass" onClick={() => patch('publicLink', 'mtnr.co/t/8fk2')} iconLeft={<Icon name="share-2" size={15} />} style={{ width: '100%' }}>
                      Create a public link
                    </Button>
                  )}
                  <Well style={{ minHeight: 52 }}>
                    <span style={{ display: 'flex', color: 'var(--fg-4)' }}><Icon name={t.visibleInShared ? 'eye' : 'eye-off'} size={15} /></span>
                    <span style={{ flex: 1, minWidth: 0, font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)' }}>
                      {t.visibleInShared ? 'Visible in shared links' : 'Hidden from shared links'}
                    </span>
                    <Switch checked={!!t.visibleInShared} onChange={(v) => patch('visibleInShared', typeof v === 'boolean' ? v : !t.visibleInShared)} aria-label="Visible in shared links" />
                  </Well>
                </div>
              </Labelled>
            </Pane>
          </div>
        </div>

        {/* ------------- FOOTER: the two verbs ------------- */}
        <footer style={{
          display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap',
          padding: mid ? 'var(--sp-6) var(--pad-sheet)' : 'var(--sp-5) var(--sp-6)',
          borderTop: '1px solid var(--line-faint)',
          backgroundImage: 'var(--glass-fill-1)',
        }}>
          {confirm ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flex: 1, minWidth: 0, flexWrap: 'wrap',
              padding: 'var(--sp-3) var(--sp-3) var(--sp-3) var(--sp-6)', borderRadius: 'var(--r-pill)',
              backgroundImage: 'var(--glass-tint-rose)', boxShadow: 'var(--glass-rim-1)',
              animation: 'ag-condense var(--dur-base) var(--ease-glass) both',
            }}>
              <span style={{ flex: 1, minWidth: 0, font: 'var(--type-label)', color: 'oklch(0.95 0.07 20)' }}>
                Delete this task{subtasks.length ? ' and its ' + subtasks.length + ' subtasks' : ''}. It leaves every shared list too.
              </span>
              <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>Keep</Button>
              <Button variant="solid" tone="rose" size="sm" iconLeft={<Icon name="trash-2" size={15} />}
                onClick={() => { if (onDelete) onDelete(t); else if (onClose) onClose(); }}>
                Delete
              </Button>
            </div>
          ) : (
            <React.Fragment>
              <IconButton label="Delete task" variant="ghost" onClick={() => setConfirm(true)}>
                <Icon name="trash-2" size={17} />
              </IconButton>
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
                {dirty ? 'Unsaved changes' : 'Saved 4 min ago'}
              </span>
              <span style={{ flex: 1 }} />
              {needs.length > 0 && (
                <span style={{ font: 'var(--type-label)', fontSize: 'var(--text-xs)', color: 'oklch(0.95 0.07 82)' }}>
                  {needs.length === 1 ? '1 field still needed' : needs.length + ' fields still needed'}
                </span>
              )}
              <Button variant="ghost" onClick={onClose}>Discard</Button>
              <Button variant="frost" iconRight={<Icon name="check" size={16} />}
                onClick={() => { if (onSave) onSave(t); else if (onClose) onClose(); }}>
                Save changes
              </Button>
            </React.Fragment>
          )}
        </footer>
      </div>
    </div>
  );
}
