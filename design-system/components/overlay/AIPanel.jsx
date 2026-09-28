import React from 'react';
import { Icon } from '../core/Icon';
import { Button } from '../actions/Button';
import { IconButton } from '../actions/IconButton';

/* AI PANEL — a short exchange about ONE object, docked to the screen
   that object lives on.

   Three laws, and they are the whole component:

   1. It never leaves the screen. The panel docks — bottom half on a
      narrow screen, a right column on a wide one — and the host grid
      shrinks to make room. It must never cover its own subject.
   2. It always names its subject. The header restates what the AI is
      about to act on, because a panel with no subject is just a chat
      app in the wrong place.
   3. It states what it DID. No persona, no first person, no "I'd be
      happy to". A tool call surfaces as a result (the `did` item,
      same pattern as the Atlas chat screen), and anything
      irreversible parks on an `approve` item until one tap.

   It is deliberately quieter and smaller than the Atlas chat screen:
   level-2 glass, one accent, no avatars, no markdown, no history. */

const DOCK = {
  bottom: { width: '100%', height: '100%', radius: 'var(--r-card-lg) var(--r-card-lg) 0 0' },
  right: { width: 404, height: '100%', radius: 'var(--r-card-lg) 0 0 var(--r-card-lg)' },
};

function Kicker({ children, color = 'var(--fg-4)', style }) {
  return (
    <span style={{
      font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
      textTransform: 'uppercase', color, whiteSpace: 'nowrap', ...style,
    }}>{children}</span>
  );
}

/* What you said. Right-aligned, level-3 glass, nothing else. */
function You({ text }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', minWidth: 0 }}>
      <p style={{
        margin: 0, maxWidth: 'min(86%, 46ch)', padding: 'var(--sp-3) var(--sp-5)',
        borderRadius: 'var(--r-lg)', backgroundImage: 'var(--glass-fill-3)',
        boxShadow: 'var(--glass-rim-2), var(--glass-cast-1)',
        font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-1)',
        textWrap: 'pretty', overflowWrap: 'anywhere',
        animation: 'ag-condense var(--dur-base) var(--ease-glass) both',
      }}>{text}</p>
    </div>
  );
}

/* What it said. Plain text on the panel, never a bubble — the machine
   does not get a face. Optional chips are short answers to a question
   it asked, not suggestions it is pushing. */
function Reply({ text, chips, onChip }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)', minWidth: 0, animation: 'ag-condense var(--dur-base) var(--ease-glass) both' }}>
      <p style={{
        margin: 0, maxWidth: '54ch', font: 'var(--type-body)', fontSize: 'var(--text-sm)',
        lineHeight: 'var(--leading-normal)', color: 'var(--fg-2)', textWrap: 'pretty',
      }}>{text}</p>
      {chips && chips.length > 0 && (
        <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
          {chips.map((c) => (
            <button key={c} type="button" onClick={() => onChip && onChip(c)} style={{
              minHeight: 44, padding: '0 var(--sp-5)', border: 0, cursor: 'pointer',
              borderRadius: 'var(--r-pill)', backgroundImage: 'var(--glass-fill-2)',
              boxShadow: 'var(--glass-rim-1)', color: 'var(--fg-1)',
              font: 'var(--type-body)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap',
              transition: 'var(--t-hover)',
            }}>{c}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/* THE TOOL RESULT. Same pattern as the chat screen: a kicker naming
   the tool, then hairline rows of what it touched. Past tense, always.
   `undo` turns it into the applied state — the change is live and the
   way back is on the same object that announced it. */
function Did({ item, onUndo, undone }) {
  return (
    <div style={{
      display: 'grid', gap: 'var(--sp-3)', minWidth: 0,
      opacity: undone ? 0.5 : 1, transition: 'opacity var(--dur-base) var(--ease-glass)',
      animation: 'ag-condense var(--dur-base) var(--ease-glass) both',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', minWidth: 0 }}>
        <span style={{ display: 'flex', color: 'var(--fg-3)' }}><Icon name={item.icon || 'wrench'} size={13} /></span>
        <Kicker color="var(--fg-3)">{item.tool}</Kicker>
        <span style={{ flex: 1, height: 1, background: 'var(--line-faint)' }} />
        {item.count != null && <Kicker>{item.count}</Kicker>}
      </div>

      {item.rows && item.rows.length > 0 && (
        <div style={{
          display: 'grid', minWidth: 0, padding: '0 var(--sp-4)',
          borderRadius: 'var(--r-sm)', backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
        }}>
          {item.rows.map((r, i) => (
            <div key={r.label + i} style={{
              display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center',
              gap: 'var(--sp-4)', minHeight: 38, padding: 'var(--sp-2) var(--sp-2)',
              borderTop: i === 0 ? 'none' : '1px solid var(--line-faint)',
            }}>
              <span style={{
                minWidth: 0, font: 'var(--type-body)', fontSize: 'var(--text-sm)',
                color: undone ? 'var(--fg-3)' : 'var(--fg-1)',
                textDecoration: undone ? 'line-through' : 'none', textDecorationColor: 'var(--fg-4)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{r.label}</span>
              {r.meta && (
                <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-2xs)', color: r.tone || 'var(--fg-3)', whiteSpace: 'nowrap' }}>
                  {r.meta}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {item.undo && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minHeight: 44 }}>
          <span style={{ display: 'flex', color: undone ? 'var(--fg-4)' : 'var(--accent)' }}>
            <Icon name={undone ? 'rotate-ccw' : 'check'} size={14} />
          </span>
          <span style={{ flex: 1, minWidth: 0, font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
            {undone ? 'Reverted. Nothing changed.' : item.applied || 'Applied to the task.'}
          </span>
          {!undone && <Button variant="ghost" size="sm" onClick={onUndo} iconLeft={<Icon name="rotate-ccw" size={14} />}>Undo</Button>}
        </div>
      )}
    </div>
  );
}

/* THE APPROVAL. Nothing irreversible happens without one tap. Amber
   tint, amber glow, the cost stated in words, and the affirmative is
   the frost surface — the loudest thing the system owns. */
function Ask({ item, state, onYes, onNo }) {
  const hard = !!item.hard;

  if (state) {
    const yes = state === 'yes';
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minHeight: 44,
        padding: '0 var(--sp-5)', borderRadius: 'var(--r-lg)',
        backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
        animation: 'ag-condense var(--dur-base) var(--ease-glass) both',
      }}>
        <span style={{ display: 'flex', color: yes ? 'var(--accent)' : 'var(--fg-4)' }}>
          <Icon name={yes ? 'check' : 'x'} size={15} />
        </span>
        <span style={{ flex: 1, minWidth: 0, font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)' }}>
          {yes ? item.done || 'Done.' : 'Rejected — nothing changed.'}
        </span>
        <Kicker>in the log</Kicker>
      </div>
    );
  }

  return (
    <div style={{
      display: 'grid', gap: 'var(--sp-4)', padding: 'var(--sp-5)', minWidth: 0,
      borderRadius: 'var(--r-card)',
      backgroundColor: hard ? 'oklch(0.16 0.02 82 / 0.42)' : 'transparent',
      backgroundImage: hard ? 'var(--glass-tint-amber)' : 'var(--glass-fill-2)',
      boxShadow: hard
        ? 'var(--glass-rim-3), var(--glass-inner-1), var(--glass-cast-2), var(--glow-amber-md)'
        : 'var(--glass-rim-2), var(--glass-cast-1)',
      animation: 'ag-condense var(--dur-slow) var(--ease-glass) both',
    }}>
      <div style={{ display: 'grid', gap: 2, minWidth: 0 }}>
        <Kicker color={hard ? 'var(--status-review)' : 'var(--fg-4)'}>
          {hard ? 'Cannot be undone · needs your tap' : 'Needs your tap'}
        </Kicker>
        <span style={{
          font: 'var(--type-title)', fontSize: 'var(--text-md)',
          letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)', textWrap: 'pretty',
        }}>{item.title}</span>
      </div>

      {item.rows && item.rows.length > 0 && (
        <div style={{
          display: 'grid', minWidth: 0, padding: '0 var(--sp-4)',
          borderRadius: 'var(--r-sm)', backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
        }}>
          {item.rows.map((r, i) => (
            <div key={r.label + i} style={{
              display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', alignItems: 'center',
              gap: 'var(--sp-4)', minHeight: 36, padding: 'var(--sp-2) var(--sp-2)',
              borderTop: i === 0 ? 'none' : '1px solid var(--line-faint)',
            }}>
              <span style={{ minWidth: 0, font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
              {r.meta && <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-2xs)', color: r.tone || 'var(--fg-3)' }}>{r.meta}</span>}
            </div>
          ))}
        </div>
      )}

      {item.note && (
        <span style={{ font: 'var(--type-caption)', color: hard ? 'var(--status-overrun)' : 'var(--fg-3)', textWrap: 'pretty' }}>
          {item.note}
        </span>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
        <Button variant={hard ? 'frost' : 'tint'} size="sm" onClick={onYes} iconLeft={<Icon name={hard ? 'alert-triangle' : 'check'} size={15} />}>
          {item.yes || 'Apply'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onNo}>{item.no || 'Discard'}</Button>
      </div>
    </div>
  );
}

/* A FIELD IT FILLED. The Score screen's whole reason for having a
   panel: the answer lands in a field, and the field says so. */
function Filled({ item }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minHeight: 48,
      padding: '0 var(--sp-5)', borderRadius: 'var(--r-lg)',
      backgroundImage: 'var(--glass-tint-accent)', boxShadow: 'var(--glass-rim-2), var(--glow-accent-sm)',
      animation: 'ag-condense var(--dur-base) var(--ease-glass) both',
    }}>
      <span style={{ display: 'flex', color: 'oklch(0.93 0.07 162)' }}><Icon name="check" size={15} /></span>
      <span style={{ display: 'grid', gap: 1, flex: 1, minWidth: 0 }}>
        <Kicker color="var(--fg-3)">{item.field}</Kicker>
        <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.value}</span>
      </span>
      {item.delta && (
        <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-sm)', color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>{item.delta}</span>
      )}
    </div>
  );
}

/* WORKING. One pill, one label, named tool or nothing. Never a log. */
function Working({ label, tool }) {
  const [dots, setDots] = React.useState(0);
  React.useEffect(() => {
    const iv = setInterval(() => setDots((n) => (n + 1) % 3), 420);
    return () => clearInterval(iv);
  }, []);
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-4)', justifySelf: 'start',
      minHeight: 36, padding: '0 var(--sp-5) 0 var(--sp-4)', borderRadius: 'var(--r-pill)',
      backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1), var(--glass-cast-1)',
      animation: 'ag-condense var(--dur-base) var(--ease-glass) both',
    }}>
      {typeof AiPresence === 'function'
        ? <AiPresence state="thinking" size={22} style={{ flex: '0 0 auto' }} />
        : <span style={{
          display: 'grid', placeItems: 'center', width: 20, height: 20, flex: '0 0 auto',
          borderRadius: '50%', backgroundImage: 'var(--glass-tint-accent)',
          boxShadow: 'var(--glass-rim-1), var(--glow-accent-sm)', color: 'oklch(0.93 0.07 162)',
          animation: 'ag-pulse 1600ms var(--ease-glass) infinite',
        }}>
          <Icon name={tool ? 'wrench' : 'sparkles'} size={11} />
        </span>}
      <span style={{ font: 'var(--type-caption)', color: 'var(--fg-2)', whiteSpace: 'nowrap' }}>
        {label || 'Working'}
        <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-4)' }}>{'.'.repeat(dots + 1)}</span>
      </span>
      {tool && <Kicker style={{ borderLeft: '1px solid var(--line-faint)', paddingLeft: 'var(--sp-4)' }}>{tool}</Kicker>}
    </div>
  );
}

/* ================================================================== */

export function AIPanel({
  subject,
  items = [],
  working = null,
  prompts = [],
  placeholder = 'Ask about this task',
  dock = 'bottom',
  open = true,
  onClose,
  onSend,
  onApprove,
  onReject,
  style,
  ...rest
}) {
  const [asks, setAsks] = React.useState({});
  const [undone, setUndone] = React.useState({});
  const [draft, setDraft] = React.useState('');
  const bodyRef = React.useRef(null);
  const geom = DOCK[dock] || DOCK.bottom;
  const empty = items.length === 0 && !working;

  React.useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [items.length, working]);

  React.useEffect(() => {
    const key = (e) => { if (e.key === 'Escape' && onClose) onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);

  return (
    <aside
      aria-label={'Ask about ' + (subject ? subject.title : 'this')}
      style={{
        position: 'relative', zIndex: 50, boxSizing: 'border-box',
        width: geom.width, height: geom.height,
        display: 'grid', gridTemplateRows: 'auto minmax(0,1fr) auto',
        borderRadius: geom.radius,
        backgroundColor: 'oklch(0.145 0.004 260 / 0.82)',
        backgroundImage: 'var(--glass-fill-2)',
        backdropFilter: 'var(--glass-bd-lg)', WebkitBackdropFilter: 'var(--glass-bd-lg)',
        boxShadow: 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-3)',
        transform: open ? 'none' : (dock === 'bottom' ? 'translateY(100%)' : 'translateX(100%)'),
        transition: 'transform var(--dur-sheet) var(--ease-glass)',
        ...style,
      }}
      {...rest}
    >
      {/* THE SUBJECT. Always. You must know what it is about to act on. */}
      <header style={{
        display: 'grid', gap: 'var(--sp-4)',
        padding: dock === 'bottom' ? 'var(--sp-4) var(--sp-6) var(--sp-5)' : 'var(--sp-6) var(--sp-6) var(--sp-5)',
        borderBottom: '1px solid var(--line-faint)',
      }}>
        {dock === 'bottom' && (
          /* One gesture out: drag the handle down, or tap the X. */
          <button type="button" onClick={onClose} aria-label="Dismiss panel" style={{
            justifySelf: 'center', width: 96, minHeight: 20, border: 0, padding: 0,
            background: 'transparent', cursor: 'grab', display: 'grid', placeItems: 'center',
          }}>
            <span style={{ width: 44, height: 4, borderRadius: 'var(--r-pill)', background: 'var(--line-strong)' }} />
          </button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minWidth: 0 }}>
          {typeof AiPresence === 'function' && !(subject && subject.icon)
            ? <AiPresence state={working ? 'thinking' : 'idle'} size={32} style={{ flex: '0 0 auto' }} />
            : <span style={{
              display: 'grid', placeItems: 'center', width: 30, height: 30, flex: '0 0 auto',
              borderRadius: '50%', backgroundImage: 'var(--glass-fill-2)', boxShadow: 'var(--glass-rim-2)',
              color: 'var(--fg-2)',
            }}>
              <Icon name={(subject && subject.icon) || 'sparkles'} size={15} />
            </span>}
          <span style={{ display: 'grid', gap: 1, flex: 1, minWidth: 0 }}>
            <Kicker>{(subject && subject.kicker) || 'Subject'}</Kicker>
            <span style={{
              font: 'var(--type-label)', color: 'var(--fg-1)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{subject && subject.title}</span>
          </span>
          {subject && subject.meta && (
            <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-2xs)', color: 'var(--fg-4)', whiteSpace: 'nowrap' }}>{subject.meta}</span>
          )}
          <IconButton label="Dismiss panel" variant="ghost" onClick={onClose}><Icon name="x" size={17} /></IconButton>
        </div>
      </header>

      <div ref={bodyRef} className="ag-scroll" style={{
        display: 'grid', alignContent: empty ? 'center' : 'start', gap: 'var(--sp-6)',
        minWidth: 0, overflowY: 'auto', overscrollBehavior: 'contain',
        padding: 'var(--sp-6)',
      }}>
        {empty && (
          <div style={{ display: 'grid', gap: 'var(--sp-5)', justifyItems: 'start' }}>
            <p style={{ margin: 0, maxWidth: '40ch', font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
              Asks about this one task. It can add subtasks, change the estimate or move the deadline — anything irreversible waits for your tap.
            </p>
            {prompts.length > 0 && (
              <div style={{ display: 'grid', gap: 'var(--sp-3)', width: '100%' }}>
                {prompts.map((p) => (
                  <button key={p} type="button" onClick={() => onSend && onSend(p)} style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', width: '100%',
                    minHeight: 46, padding: '0 var(--sp-5)', border: 0, cursor: 'pointer', textAlign: 'left',
                    borderRadius: 'var(--r-pill)', backgroundImage: 'var(--glass-fill-1)',
                    boxShadow: 'var(--glass-rim-1)', color: 'var(--fg-2)',
                    font: 'var(--type-body)', fontSize: 'var(--text-sm)', transition: 'var(--t-hover)',
                  }}>
                    <span style={{ display: 'flex', color: 'var(--fg-4)' }}><Icon name="corner-down-right" size={14} /></span>
                    <span style={{ flex: 1, minWidth: 0 }}>{p}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {items.map((it, i) => {
          const key = it.id || it.kind + i;
          if (it.kind === 'you') return <You key={key} text={it.text} />;
          if (it.kind === 'ai') return <Reply key={key} text={it.text} chips={it.chips} onChip={onSend} />;
          if (it.kind === 'did') return <Did key={key} item={it} undone={!!undone[key]} onUndo={() => setUndone((p) => ({ ...p, [key]: true }))} />;
          if (it.kind === 'filled') return <Filled key={key} item={it} />;
          if (it.kind === 'approve') {
            return (
              <Ask
                key={key}
                item={it}
                state={asks[key]}
                onYes={() => { setAsks((p) => ({ ...p, [key]: 'yes' })); if (onApprove) onApprove(it); }}
                onNo={() => { setAsks((p) => ({ ...p, [key]: 'no' })); if (onReject) onReject(it); }}
              />
            );
          }
          return null;
        })}

        {working && <Working label={working.label} tool={working.tool} />}
      </div>

      {/* One field, one send. Nothing else lives down here. */}
      <div style={{ padding: 'var(--sp-5) var(--sp-6) var(--sp-6)', borderTop: '1px solid var(--line-faint)' }}>
        <form
          onSubmit={(e) => { e.preventDefault(); if (!draft.trim()) return; if (onSend) onSend(draft.trim()); setDraft(''); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', minHeight: 52,
            padding: 'var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-5)', borderRadius: 'var(--r-pill)',
            backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            data-ag-field
            className="ag-field"
            style={{
              flex: 1, minWidth: 0, height: 44, border: 0, outline: 'none', background: 'transparent',
              font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-1)',
              letterSpacing: 'var(--tracking-ui)',
            }}
          />
          {typeof RecordTimer === 'function' && !draft.trim() && (
            <RecordTimer size="sm" label="voice question" icon={<Icon name="mic" size={17} />}
              onSave={(s) => onSend && onSend('Voice question · ' + s + 's')} />
          )}
          <IconButton
            label="Send"
            type="submit"
            variant={draft.trim() ? 'tint' : 'glass'}
            tone={draft.trim() ? 'accent' : undefined}
          >
            <Icon name="arrow-up" size={17} />
          </IconButton>
        </form>
      </div>
    </aside>
  );
}
