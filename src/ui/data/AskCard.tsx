/**
 * Aurora Glass — AskCard (BUILD-16)
 * Ported from design-system/screens/Ask Card.dc.html, as drawn in
 * `Atlas Questions.dc.html`: the chat (1a, 1b) and the side panel (1c).
 *
 * Atlas stopped to ask. The card is the whole of that pause: every question
 * on one card, answered top to bottom, and **it must be obvious Atlas is
 * waiting on him** — the amber "Waiting on you" pulse and the amber rim are
 * the one amber thing on the screen while it is up. Answering sends one
 * ordinary message (`lib/askCard.ts`), so there is no path from a tap here to
 * an action, which is §7.3's rule and why this is never used for an approval.
 *
 * WHERE THIS DEPARTS FROM THE DESIGN, AND WHY
 * -------------------------------------------
 * - **No Esc for "Decide for me".** The design binds it; here Escape already
 *   closes the side panel and every sheet, and a key that closes things
 *   elsewhere must not *submit* answers when the pointer happens to rest on
 *   the card. The button does it. Number keys and Enter are kept.
 * - **The card does not do the work afterwards.** The design's card turns into
 *   "Adding the task" and then the created row; here the answers go back to
 *   Atlas and the next turn draws what it actually did, with its own Revert.
 *   The receipt (`AskReceipt`) is what the card becomes, and it sits where the
 *   answers message would have been drawn.
 * - **No "Change" on the receipt.** By the time it could be pressed, the turn
 *   the answers started has usually written, and taking that turn back is the
 *   changes container's job, not this card's.
 * - **The scale's end words are fixed** — "Can slip" and "Drop everything",
 *   the design's — because the only scale Atlas is told to ask is importance.
 * - **The submit button says "Send answers"**, not the design's "Add task": the
 *   card does not know what Atlas will do with them.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from '../core/Icon';
import { NARROW, useMedia } from '../useMedia';
import {
  answerLabel,
  canSubmit,
  decideRest,
  formatAnswers,
  receiptChips,
  receiptLabel,
  scaleWord,
  type AnswerReceipt,
  type AskAnswers,
  type AskCard as AskCardData,
  type AskQuestion,
} from '../../lib/askCard';

const AMBER_RIM = '0 0 0 1px oklch(0.78 0.13 75 / 0.30), 0 0 36px -14px oklch(0.78 0.13 75 / 0.45)';
const SUGGESTED_RING = 'inset 0 0 0 1.5px oklch(0.78 0.13 75 / 0.55)';
const ON = { fill: 'var(--glass-fill-solid)', rim: 'var(--glass-rim-3), var(--glass-cast-1)', ink: 'var(--fg-1)' };
const OFF = { fill: 'var(--glass-fill-1)', rim: 'var(--glass-rim-1)', ink: 'var(--fg-2)' };

const KICKER: CSSProperties = {
  font: 'var(--type-kicker)',
  letterSpacing: 'var(--tracking-kicker)',
  textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'],
};

const KEYCAP: CSSProperties = {
  display: 'grid', placeItems: 'center', minWidth: 20, height: 20, padding: '0 4px', boxSizing: 'border-box',
  borderRadius: 6, backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
  font: 'var(--type-numeric)', fontSize: 10, color: 'var(--fg-3)',
};

function WaitDot() {
  return (
    <span style={{ position: 'relative', width: 8, height: 8, flex: '0 0 auto' }} aria-hidden>
      <span
        style={{
          position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--status-review)',
          boxShadow: '0 0 10px var(--status-review)', animation: 'var(--kf-pulse) 1.4s var(--ease-glass) infinite',
        }}
      />
      <span
        style={{
          position: 'absolute', inset: 0, borderRadius: '50%', boxShadow: '0 0 0 1px var(--status-review)',
          animation: 'var(--kf-ripple) 1.8s var(--ease-glass) infinite',
        }}
      />
    </span>
  );
}

function Pill({
  selected, suggested, onClick, children, disabled, keycap, box, mono,
}: {
  selected: boolean;
  suggested?: boolean;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
  keycap?: string;
  /** A tick-several option draws its own checkbox. */
  box?: boolean;
  mono?: boolean;
}) {
  const look = selected ? ON : OFF;
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)', maxWidth: '100%', minHeight: 44,
        padding: `var(--sp-2) var(--sp-5) var(--sp-2) ${keycap || box ? 'var(--sp-3)' : 'var(--sp-5)'}`,
        border: 0, borderRadius: 'var(--r-pill)', backgroundColor: 'transparent',
        backgroundImage: look.fill, boxShadow: look.rim, color: look.ink,
        font: mono ? 'var(--type-numeric)' : 'var(--type-body)', fontSize: 'var(--text-sm)', textAlign: 'left',
        cursor: disabled ? 'default' : 'pointer', transition: 'var(--t-hover)',
      }}
    >
      {keycap && <span style={KEYCAP}>{keycap}</span>}
      {box && (
        <span
          aria-hidden
          style={{
            display: 'grid', placeItems: 'center', width: 16, height: 16, flex: '0 0 auto', borderRadius: 5,
            background: selected ? 'var(--fg-1)' : 'transparent',
            boxShadow: selected ? 'none' : 'inset 0 0 0 1px var(--line-strong)', color: 'var(--void-0)',
          }}
        >
          {selected && <Icon name="check" size={11} stroke={3} />}
        </span>
      )}
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{children}</span>
      {suggested && (
        <span title="Suggested" style={{ width: 6, height: 6, flex: '0 0 auto', borderRadius: '50%', boxShadow: 'inset 0 0 0 1.5px var(--status-review)' }} />
      )}
    </button>
  );
}

function Typed({
  label, placeholder, value, onChange, onCommit, onCancel, focus = true,
}: {
  /** False for a typed-answer question, whose field is up with the card and must not take the caret from the composer. */
  focus?: boolean;
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel?: () => void;
}) {
  const ready = value.trim() !== '';
  return (
    <label
      style={{
        flex: '1 1 200px', display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', minHeight: 44, minWidth: 0,
        padding: '0 5px 0 var(--sp-5)', boxSizing: 'border-box', borderRadius: 'var(--r-pill)',
        backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow), 0 0 0 1px var(--line-strong)',
        animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
      }}
    >
      <span style={{ display: 'flex', color: 'var(--fg-4)' }}><Icon name="pencil" size={14} /></span>
      <input
        autoFocus={focus}
        value={value}
        aria-label={label}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onCommit();
          }
          if (e.key === 'Escape' && onCancel) {
            // Closes the field, not the panel or sheet around the card.
            e.stopPropagation();
            onCancel();
          }
        }}
        style={{
          flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent',
          color: 'var(--fg-1)', font: 'var(--type-body)', fontSize: 'var(--text-sm)',
        }}
      />
      <button
        type="button"
        onClick={onCommit}
        aria-label="Use this answer"
        style={{
          display: 'grid', placeItems: 'center', width: 34, height: 34, flex: '0 0 auto', border: 0, borderRadius: '50%',
          backgroundImage: ready ? 'var(--glass-tint-accent)' : 'var(--glass-fill-1)',
          boxShadow: ready ? 'var(--glass-rim-2), var(--glow-accent-sm)' : 'var(--glass-rim-1)',
          color: ready ? 'oklch(0.95 0.07 162)' : 'var(--fg-4)', cursor: 'pointer', transition: 'var(--t-hover)',
        }}
      >
        <Icon name="corner-down-left" size={15} />
      </button>
    </label>
  );
}

export interface AskCardProps {
  card: AskCardData;
  /** False draws it but takes no answers — a turn still running under it. */
  live: boolean;
  /** The side panel: tighter padding, no number keys or key hints. */
  compact?: boolean;
  /** The answers message (`formatAnswers`), sent as his next message. */
  onSubmit: (message: string) => void;
}

export function AskCard({ card, live, compact = false, onSubmit }: AskCardProps) {
  const qs = card.questions;
  /* No key hints where there are no keys to press: on a phone they only push
     the two buttons onto a second line. */
  const narrow = useMedia(NARROW);
  const single = qs.length === 1;
  const [answers, setAnswers] = useState<AskAnswers>({});
  /* A tick-several question holds its picks here until they are confirmed —
     a pick is not yet an answer, or the first tick would move the card on. */
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [typing, setTyping] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [active, setActive] = useState(0);
  const [shown, setShown] = useState(false);
  const [sent, setSent] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const t = setTimeout(() => setShown(true), 60);
    return () => {
      clearTimeout(t);
      clearTimeout(timer.current);
    };
  }, []);

  const open = live && !sent;
  /* The panel's spacing on a phone too: at 390px the chat's leaves the two
     footer buttons no room to share a line. */
  const tight = compact || narrow;
  const px = tight ? 'var(--sp-5)' : 'var(--sp-7)';
  const answeredN = qs.filter((q) => answers[q.id] !== undefined).length;
  const ready = canSubmit(card, answers);

  const submit = (all: AskAnswers) => {
    if (!open || !canSubmit(card, all)) return;
    setSent(true);
    onSubmit(formatAnswers(card, all));
  };

  const nextOpen = (from: number, all: AskAnswers): number => {
    for (let k = 1; k <= qs.length; k += 1) {
      const i = (from + k) % qs.length;
      if (all[qs[i].id] === undefined) return i;
    }
    return -1;
  };

  const commit = (q: AskQuestion, values: string[]) => {
    const all = { ...answers, [q.id]: { values } };
    setAnswers(all);
    setTyping(null);
    clearTimeout(timer.current);
    /* The design's two beats: a single question sends itself a moment after
       the tap, so the pick is seen landing; several move on to the next open
       one. Faster than typing the answer out, which is the brief. */
    if (single) timer.current = setTimeout(() => submit(all), 260);
    else timer.current = setTimeout(() => setActive(nextOpen(qs.indexOf(q), all)), 220);
  };

  const togglePick = (q: AskQuestion, option: string) =>
    setPicks((p) => {
      const cur = p[q.id] ?? [];
      return { ...p, [q.id]: cur.includes(option) ? cur.filter((o) => o !== option) : [...cur, option] };
    });

  const commitTyped = (q: AskQuestion) => {
    const value = (drafts[q.id] ?? '').trim();
    if (value === '') {
      setTyping(null);
      return;
    }
    if (q.kind !== 'text') setDrafts((d) => ({ ...d, [q.id]: '' }));
    if (q.kind === 'many') {
      setPicks((p) => ({ ...p, [q.id]: [...(p[q.id] ?? []).filter((o) => o !== value), value] }));
      setTyping(null);
      return;
    }
    commit(q, [value]);
  };

  /* Number keys and Enter, while the pointer is over the card or focus is in
     it — the design's keyboard, minus Esc (see the header). Typing in a field
     is never taken, and Enter on a focused button stays that button's. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root || !(hoverRef.current || root.contains(document.activeElement))) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.closest('input, textarea, [contenteditable="true"]') !== null)) return;
      const q = qs[single ? 0 : active];
      if (/^[1-9]$/.test(e.key) && q) {
        const n = Number(e.key);
        if (q.kind === 'scale') commit(q, [String(n)]);
        else if (q.kind === 'text') setTyping(q.id);
        else if (n <= q.options.length) {
          if (q.kind === 'many') togglePick(q, q.options[n - 1]);
          else commit(q, [q.options[n - 1]]);
        } else if (n === q.options.length + 1) setTyping(q.id);
        else return;
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === 'Enter') {
        if (target?.closest('button') && root.contains(target)) return;
        if (q?.kind === 'many') commit(q, picks[q.id] ?? []);
        else if (!single) submit(answers);
        else return;
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const title = card.title ?? (single ? 'One thing I can’t tell from your message' : `${qs.length} things I need to know first`);

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onMouseEnter={() => { hoverRef.current = true; }}
      onMouseLeave={() => { hoverRef.current = false; }}
      aria-label="Atlas is waiting on your answers"
      data-ask-card={single ? 'single' : 'multi'}
      style={{
        display: 'grid', minWidth: 0, outline: 'none', borderRadius: 'var(--r-card)',
        backgroundImage: 'var(--glass-fill-2)',
        WebkitBackdropFilter: 'var(--glass-bd-md)', backdropFilter: 'var(--glass-bd-md)',
        boxShadow: `var(--glass-rim-2), var(--glass-cast-2)${open ? `, ${AMBER_RIM}` : ''}`,
        opacity: shown ? (open ? 1 : 0.72) : 0,
        transform: shown ? 'translateY(0)' : 'translateY(8px)',
        transition: 'opacity var(--dur-slow) var(--ease-glass), transform var(--dur-slow) var(--ease-glass), box-shadow var(--dur-base) var(--ease-glass)',
      }}
    >
      {/* ── Head: waiting, how far, what for ─────────────────────────── */}
      <div style={{ display: 'grid', gap: 'var(--sp-3)', padding: `${compact ? 'var(--sp-5)' : 'var(--sp-6)'} ${px} ${single ? 'var(--sp-2)' : 'var(--sp-5)'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', minWidth: 0 }}>
          {open && <WaitDot />}
          <span style={{ ...KICKER, color: open ? 'var(--status-review)' : 'var(--fg-4)', whiteSpace: 'nowrap' }}>
            {open ? 'Waiting on you' : sent ? 'Sent' : 'Asked'}
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-3)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
            {single ? '1 question' : `${answeredN} of ${qs.length}`}
          </span>
        </div>
        <span style={{ font: 'var(--type-title)', fontSize: compact ? 'var(--text-md)' : 'var(--text-lg)', letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)', textWrap: 'pretty' }}>
          {title}
        </span>
      </div>

      {/* ── The questions ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', minWidth: 0 }}>
        {qs.map((q, idx) => {
          const isOpen = single || active === idx;
          const answer = answers[q.id];
          const done = answer !== undefined;
          const qPicks = picks[q.id] ?? [];
          const scaleN = q.kind === 'scale' && done ? Number(answer.values[0]) : undefined;
          const draft = drafts[q.id] ?? '';
          const options = q.kind === 'many'
            ? [...q.options, ...qPicks.filter((p) => !q.options.includes(p))]
            : done && answer.values[0] !== undefined && !q.options.includes(answer.values[0]) && q.kind === 'one'
              ? [...q.options, answer.values[0]]
              : q.options;
          return (
            <div
              key={q.id}
              style={{
                display: 'grid', minWidth: 0,
                borderTop: single ? 'none' : '1px solid var(--line-faint)',
                backgroundColor: isOpen && !single ? 'oklch(1 0 0 / 0.025)' : 'transparent',
                opacity: shown ? 1 : 0, transform: shown ? 'translateY(0)' : 'translateY(6px)',
                transition: `opacity var(--dur-slow) var(--ease-glass) ${idx * 40 + 100}ms, transform var(--dur-slow) var(--ease-glass) ${idx * 40 + 100}ms, background-color var(--dur-base) var(--ease-glass)`,
              }}
            >
              {!single && (
                <button
                  type="button"
                  onClick={() => { setActive(active === idx ? -1 : idx); setTyping(null); }}
                  aria-expanded={isOpen}
                  style={{
                    display: 'grid', gridTemplateColumns: '22px minmax(0,1fr) auto', alignItems: 'center', gap: 'var(--sp-4)',
                    minHeight: 52, padding: `0 ${px}`, border: 0, background: 'transparent', textAlign: 'left',
                    cursor: 'pointer', color: 'inherit',
                  }}
                >
                  <span
                    style={{
                      display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: '50%',
                      background: done ? 'var(--fg-2)' : 'transparent',
                      boxShadow: done ? 'none' : isOpen ? 'inset 0 0 0 1.5px var(--status-review)' : 'inset 0 0 0 1px var(--line-strong)',
                      color: done ? 'var(--void-0)' : isOpen ? 'var(--status-review)' : 'var(--fg-4)',
                      font: 'var(--type-numeric)', fontSize: 10, transition: 'background-color var(--dur-base) var(--ease-glass)',
                    }}
                  >
                    {done ? <Icon name="check" size={11} stroke={3} /> : String(idx + 1).padStart(2, '0')}
                  </span>
                  <span
                    style={{
                      minWidth: 0, font: 'var(--type-body)', fontSize: 'var(--text-sm)',
                      color: isOpen ? 'var(--fg-1)' : done ? 'var(--fg-2)' : 'var(--fg-3)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >
                    {q.question}
                  </span>
                  <span
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)', maxWidth: compact ? 120 : 220,
                      font: done && q.kind === 'scale' ? 'var(--type-numeric)' : 'var(--type-body)', fontSize: 'var(--text-sm)',
                      color: done ? 'var(--fg-1)' : 'var(--fg-4)', opacity: isOpen && !done ? 0 : 1,
                      transition: 'opacity var(--dur-base) var(--ease-glass)',
                    }}
                  >
                    <span style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {done ? answerLabel(q, answer) : q.optional ? 'Optional' : 'Needed'}
                    </span>
                    <span style={{ display: 'flex', color: 'var(--fg-4)', opacity: done && !isOpen ? 1 : 0 }}>
                      <Icon name="pencil" size={14} />
                    </span>
                  </span>
                </button>
              )}

              <div style={{ display: 'grid', gridTemplateRows: isOpen ? '1fr' : '0fr', opacity: isOpen ? 1 : 0, transition: 'grid-template-rows var(--dur-sheet) var(--ease-glass), opacity var(--dur-base) var(--ease-glass)' }}>
                <div style={{ overflow: 'hidden', minHeight: 0 }}>
                  <div
                    style={{
                      display: 'grid', gap: 'var(--sp-4)',
                      padding: single ? `0 ${px} var(--sp-6)` : `0 ${px} var(--sp-6) calc(${px} + 22px + var(--sp-4))`,
                    }}
                  >
                    {single && (
                      <span style={{ font: 'var(--type-body)', fontSize: compact ? 'var(--text-sm)' : 'var(--text-md)', color: 'var(--fg-1)', textWrap: 'pretty' }}>
                        {q.question}
                      </span>
                    )}

                    {(q.kind === 'one' || q.kind === 'many') && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-3)' }}>
                        {options.map((option, i) => {
                          const selected = q.kind === 'many' ? qPicks.includes(option) : done && answer.values[0] === option;
                          return (
                            <Pill
                              key={option}
                              selected={selected}
                              suggested={!done && q.suggested.includes(option) && (q.kind !== 'many' || qPicks.length === 0)}
                              disabled={!open}
                              keycap={!compact && !narrow && q.kind === 'one' && i < q.options.length ? String(i + 1) : undefined}
                              box={q.kind === 'many'}
                              onClick={() => (q.kind === 'many' ? togglePick(q, option) : commit(q, [option]))}
                            >
                              {option}
                            </Pill>
                          );
                        })}
                        {open && (typing === q.id ? (
                          <Typed
                            label={q.question}
                            placeholder={q.kind === 'many' ? 'Name another' : 'Type your own answer'}
                            value={draft}
                            onChange={(v) => setDrafts((d) => ({ ...d, [q.id]: v }))}
                            onCommit={() => commitTyped(q)}
                            onCancel={() => setTyping(null)}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setTyping(q.id)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)', minHeight: 44,
                              padding: '0 var(--sp-5)', border: 0, borderRadius: 'var(--r-pill)', background: 'transparent',
                              boxShadow: 'inset 0 0 0 1px var(--line-soft)', color: 'var(--fg-3)',
                              font: 'var(--type-body)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap', cursor: 'pointer',
                              transition: 'var(--t-hover)',
                            }}
                          >
                            <Icon name="pencil" size={14} />
                            {q.kind === 'many' ? 'Add another' : 'Something else'}
                          </button>
                        ))}
                      </div>
                    )}

                    {q.kind === 'text' && (
                      open ? (
                        <div style={{ display: 'flex' }}>
                          <Typed
                            label={q.question}
                            focus={false}
                            placeholder={q.suggested[0] ? `e.g. ${q.suggested[0]}` : 'Type your answer'}
                            value={draft}
                            onChange={(v) => setDrafts((d) => ({ ...d, [q.id]: v }))}
                            onCommit={() => commitTyped(q)}
                          />
                        </div>
                      ) : done ? (
                        <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)' }}>{answer.values[0]}</span>
                      ) : null
                    )}

                    {q.kind === 'scale' && (
                      <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
                        <div
                          role="radiogroup"
                          aria-label={q.question}
                          style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 'var(--r-pill)', backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)' }}
                        >
                          {Array.from({ length: 9 }, (_, i) => {
                            const n = i + 1;
                            const sel = scaleN === n;
                            const lit = scaleN !== undefined && n < scaleN;
                            const sug = scaleN === undefined && q.suggested[0] === String(n);
                            return (
                              <button
                                key={n}
                                type="button"
                                role="radio"
                                aria-checked={sel}
                                disabled={!open}
                                onClick={() => commit(q, [String(n)])}
                                style={{
                                  flex: '1 1 0', minWidth: 0, height: 40, border: 0,
                                  borderRadius: i === 0 ? '999px 8px 8px 999px' : i === 8 ? '8px 999px 999px 8px' : 8,
                                  backgroundColor: lit ? `oklch(1 0 0 / ${(0.03 + n * 0.012).toFixed(3)})` : 'transparent',
                                  backgroundImage: sel ? 'var(--glass-fill-solid)' : 'none',
                                  boxShadow: sel ? 'var(--glass-rim-3), var(--glass-cast-1)' : sug ? SUGGESTED_RING : 'none',
                                  color: sel ? 'var(--fg-1)' : lit ? 'var(--fg-2)' : 'var(--fg-3)',
                                  font: 'var(--type-numeric)', fontSize: 'var(--text-sm)', fontVariantNumeric: 'tabular-nums',
                                  cursor: open ? 'pointer' : 'default',
                                  transition: 'background-color var(--dur-fast) var(--ease-glass), box-shadow var(--dur-fast) var(--ease-glass), color var(--dur-fast) var(--ease-glass)',
                                }}
                              >
                                {n}
                              </button>
                            );
                          })}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-4)', padding: '0 var(--sp-3)' }}>
                          <span style={{ ...KICKER, color: 'var(--fg-4)', whiteSpace: 'nowrap' }}>1 · Can slip</span>
                          <span style={{ flex: 1, textAlign: 'center', font: 'var(--type-caption)', color: 'var(--fg-1)', whiteSpace: 'nowrap', opacity: scaleN ? 1 : 0.5 }}>
                            {scaleWord(scaleN) || (compact ? '' : 'Tap a number')}
                          </span>
                          <span style={{ ...KICKER, color: 'var(--fg-4)', whiteSpace: 'nowrap' }}>Drop everything · 9</span>
                        </div>
                      </div>
                    )}

                    {(q.why || q.kind === 'many') && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap', minHeight: 20 }}>
                        <span style={{ flex: '1 1 200px', display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
                          {q.why && (
                            <>
                              <span style={{ flex: '0 0 auto', width: 6, height: 6, borderRadius: '50%', boxShadow: 'inset 0 0 0 1.5px var(--status-review)' }} />
                              {q.why}
                            </>
                          )}
                        </span>
                        {q.kind === 'many' && open && (
                          <button
                            type="button"
                            onClick={() => commit(q, qPicks)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)', minHeight: 44, padding: '0 var(--sp-5)',
                              border: 0, borderRadius: 'var(--r-pill)', backgroundImage: 'var(--glass-fill-2)', boxShadow: 'var(--glass-rim-2)',
                              color: 'var(--fg-1)', font: 'var(--type-label)', whiteSpace: 'nowrap', cursor: 'pointer',
                            }}
                          >
                            {qPicks.length > 0 ? `Use ${qPicks.length}` : 'None of these'}
                            <span style={{ display: 'flex', color: 'var(--fg-3)' }}><Icon name="corner-down-left" size={15} /></span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Foot: the keys, the way out, and send ─────────────────────── */}
      {open && (
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 'var(--sp-3) var(--sp-4)', flexWrap: 'wrap',
            padding: `var(--sp-3) ${tight ? 'var(--sp-3)' : 'var(--sp-4)'} var(--sp-3) ${tight ? 'var(--sp-3)' : px}`,
            borderTop: '1px solid var(--line-faint)',
          }}
        >
          {!compact && !narrow && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)', font: 'var(--type-caption)', color: 'var(--fg-4)', whiteSpace: 'nowrap' }}>
              <span style={KEYCAP}>1–9</span>pick
              <span style={KEYCAP}><Icon name="corner-down-left" size={11} stroke={2} /></span>confirm
            </span>
          )}
          <span style={{ flex: 1 }} />
          <button
            type="button"
            onClick={() => submit(decideRest(card, answers))}
            style={{
              minHeight: 44, padding: '0 var(--sp-5)', border: 0, borderRadius: 'var(--r-pill)', background: 'transparent',
              color: 'var(--fg-2)', font: 'var(--type-label)', whiteSpace: 'nowrap', cursor: 'pointer', transition: 'var(--t-hover)',
            }}
          >
            Decide for me
          </button>
          {!single && (
            <button
              type="button"
              onClick={() => submit(answers)}
              disabled={!ready}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)', minHeight: 44, padding: tight ? '0 var(--sp-5)' : '0 var(--sp-6)',
                border: 0, borderRadius: 'var(--r-pill)',
                backgroundImage: ready ? 'var(--glass-fill-solid)' : 'var(--glass-fill-1)',
                boxShadow: ready ? 'var(--glass-rim-3), var(--glass-cast-1)' : 'var(--glass-rim-1)',
                color: ready ? 'var(--fg-1)' : 'var(--fg-4)', font: 'var(--type-label)', whiteSpace: 'nowrap',
                cursor: ready ? 'pointer' : 'default', transition: 'var(--t-hover)',
              }}
            >
              <Icon name="check" size={15} stroke={2} />
              Send answers
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * What the card becomes once answered: who answered, and the answers as
 * chips. Drawn in place of the answers message, which is his words in a form
 * written for the model and not worth reading back as a speech bubble.
 */
export function AskReceipt({ receipt, style }: { receipt: AnswerReceipt; style?: CSSProperties }) {
  const chips = receiptChips(receipt);
  return (
    <div
      aria-label={`${receiptLabel(receipt)}: ${chips.join(', ')}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 'var(--sp-3) var(--sp-4)', flexWrap: 'wrap', minWidth: 0,
        minHeight: 48, padding: 'var(--sp-3) var(--sp-5)', boxSizing: 'border-box', borderRadius: 'var(--r-lg)',
        backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
        animation: 'var(--kf-condense) var(--dur-base) var(--ease-glass) both',
        ...style,
      }}
    >
      <span style={{ display: 'flex', color: 'var(--fg-2)' }}><Icon name="check" size={15} stroke={2} /></span>
      <span style={{ font: 'var(--type-caption)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)', whiteSpace: 'nowrap' }}>
        {receiptLabel(receipt)}
      </span>
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', minWidth: 0 }}>
        {chips.map((chip, i) => (
          <span
            key={`${chip}-${i}`}
            title={receipt.rows.find((row) => row.answer === chip)?.question}
            style={{
              display: 'inline-flex', alignItems: 'center', maxWidth: '100%', minHeight: 26, padding: '0 var(--sp-3)',
              boxSizing: 'border-box', borderRadius: 'var(--r-pill)', backgroundImage: 'var(--glass-well)',
              boxShadow: 'var(--glass-well-shadow)', font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-1)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {chip}
          </span>
        ))}
      </span>
    </div>
  );
}
