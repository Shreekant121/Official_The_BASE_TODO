/**
 * BUILD-10 — the shortcut sheet's edit view: change a key, add his own.
 *
 * Lives in the `?` sheet rather than in Settings on purpose: Settings is
 * redrawn at BIG-9, which gives shortcuts their home there. Until then the
 * sheet that lists the keys is the one place to change them, and it is one
 * press of `?` or one tap of Home's keyboard button from anywhere.
 *
 * Every rule is `lib/shortcutBindings.ts`'s — what is reserved, what clashes,
 * the sentence that says so. This file only draws it and captures the key.
 *
 * Three groups, in the order he would reach for them: the keys screens ship
 * with (rebindable, each with a way back to its default), his own (a palette
 * command on a key, live everywhere), and what is fixed — the `g` sequences,
 * his call ("B now, C later"), and the three that are true everywhere.
 */
import { useEffect, useRef, useState } from 'react';
import { Button, Icon, IconButton, WarnLine } from '../../ui';
import { useAccountAccess } from '../../lib/accountAccess';
import {
  BUILT_IN_IDS,
  BUILT_IN_SHORTCUTS,
  builtInKey,
  keyCap,
  normaliseKey,
  placePhrase,
  refusal,
  withBuiltInKey,
  withCustomAdded,
  withCustomKey,
  withCustomRemoved,
  type ShortcutPrefs,
  type ShortcutRef,
} from '../../lib/shortcutBindings';
import { useShortcutPrefs } from '../../lib/shortcutPrefs';
import { paletteCommandCatalog } from '../paletteCommands';
import { Caps, Row, Trough } from './parts';

export interface FixedRow {
  id: string;
  label: string;
  keys: string[];
}

function sentence(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The one keycap you type into. Focus it (click, tap or Tab) and it listens;
 * the next printable key is offered to `onPick`, which answers whether it
 * was taken. Escape or leaving the field stops listening and changes nothing.
 *
 * An `<input>`, not a button with a key listener, for the tablet: focusing an
 * input is what raises Android's keyboard, and Android's keyboard reports
 * most keys as `Unidentified` on keydown — so the character is read from the
 * input's value instead. On a real keyboard the keydown takes it first and
 * the input never receives it. The registry ignores keys typed in an input,
 * so a key pressed here never also runs the shortcut it used to be.
 */
function KeyField({
  current, name, focusOnMount, onPick, onStop,
}: {
  current: string | null;
  name: string;
  focusOnMount?: boolean;
  onPick: (key: string) => boolean;
  onStop?: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);

  const pick = (raw: string) => {
    const key = normaliseKey(raw);
    if (key && onPick(key)) ref.current?.blur();
  };

  return (
    <input
      ref={ref}
      value={listening || !current ? '' : keyCap(current)}
      placeholder={listening ? 'Press a key' : '—'}
      aria-label={`${name}: ${current ? keyCap(current) : 'no key yet'}. Press a key to set it.`}
      autoComplete="off"
      autoCapitalize="off"
      spellCheck={false}
      onFocus={() => setListening(true)}
      onBlur={() => { setListening(false); onStop?.(); }}
      onKeyDown={(e) => {
        if (e.key === 'Tab') return;
        if (e.key === 'Escape') {
          /* Stopped here so the sheet's own Escape (`useOverlayDismiss`, on
             window) does not close the whole sheet under the field. */
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.blur();
          return;
        }
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key.length === 1) { e.preventDefault(); pick(e.key); return; }
        /* Shift, the arrows, Enter: not a key he can bind, and nothing to
           type. Android's `Unidentified` is left alone — the value carries it. */
        if (e.key !== 'Unidentified' && e.key !== 'Process') e.preventDefault();
      }}
      onChange={(e) => { const v = e.target.value; if (v) pick(v.slice(-1)); }}
      style={{
        width: listening ? 104 : 44,
        height: 32,
        flex: '0 0 auto',
        boxSizing: 'border-box',
        padding: '0 var(--sp-3)',
        border: 'none',
        outline: 'none',
        borderRadius: 'var(--r-sm)',
        backgroundImage: 'var(--glass-well)',
        boxShadow: listening
          ? 'var(--glass-well-shadow), 0 0 0 1px var(--job-lime-line)'
          : 'var(--glass-well-shadow), 0 0 0 1px var(--line-faint)',
        font: 'var(--type-numeric)',
        fontSize: 'var(--text-xs)',
        color: 'var(--fg-1)',
        textAlign: 'center',
        caretColor: 'transparent',
        cursor: 'pointer',
      }}
    />
  );
}

/**
 * Why the last key was not taken, under the row it was pressed on. A warning,
 * so grey with its icon (29-1P2c2); nothing broke, the key was just not taken.
 */
function Refused({ text }: { text: string }) {
  return <WarnLine as="span" role="alert" style={{ font: 'inherit' }}>{text}</WarnLine>;
}

export function ShortcutsEditor({ fixed }: { fixed: FixedRow[] }) {
  const prefs = useShortcutPrefs((s) => s.prefs);
  const setPrefs = useShortcutPrefs((s) => s.setPrefs);
  const owner = useAccountAccess((s) => s.owner);
  const commands = paletteCommandCatalog(owner);
  const nameOf = (id: string) => commands.find((c) => c.id === id)?.name;

  /** Which row the refusal belongs to, by `rowId`. */
  const [refused, setRefused] = useState<{ row: string; text: string } | null>(null);
  /** `choose` lists the commands; a command id is a new row waiting for its key. */
  const [adding, setAdding] = useState<null | 'choose' | { command: string }>(null);

  const rowId = (ref: ShortcutRef) => `${ref.kind}:${ref.id}`;

  /** Applies `next` if `key` may go on `ref`; otherwise says why, on that row. */
  const offer = (ref: ShortcutRef, key: string, next: (p: ShortcutPrefs) => ShortcutPrefs): boolean => {
    const why = refusal(prefs, ref, key, nameOf);
    if (why) { setRefused({ row: rowId(ref), text: why }); return false; }
    setRefused(null);
    setPrefs(next(prefs));
    return true;
  };

  const captionFor = (row: string, normal: string) =>
    refused?.row === row ? <Refused text={refused.text} /> : normal;

  const bound = new Set(prefs.custom.map((c) => c.command));
  const unbound = commands.filter((c) => !bound.has(c.id));

  return (
    <>
      <Trough label="On screens">
        {BUILT_IN_IDS.map((id) => {
          const def = BUILT_IN_SHORTCUTS[id];
          const ref: ShortcutRef = { kind: 'built-in', id };
          const key = builtInKey(prefs, id);
          const moved = key !== def.key;
          return (
            <Row
              key={id}
              label={def.label}
              caption={captionFor(rowId(ref), sentence(placePhrase(def.where)))}
              end={
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                  {moved && (
                    <IconButton
                      label={`Put ${def.label} back on ${keyCap(def.key)}`}
                      variant="ghost"
                      onClick={() => offer(ref, def.key, (p) => withBuiltInKey(p, id, def.key))}
                    >
                      <Icon name="rotate-ccw" size={16} />
                    </IconButton>
                  )}
                  <KeyField
                    current={key}
                    name={def.label}
                    onPick={(k) => offer(ref, k, (p) => withBuiltInKey(p, id, k))}
                    onStop={() => setRefused((r) => (r?.row === rowId(ref) ? null : r))}
                  />
                </span>
              }
            />
          );
        })}
      </Trough>

      <Trough label="Your shortcuts">
        {prefs.custom.map((c) => {
          const ref: ShortcutRef = { kind: 'custom', id: c.id };
          const name = nameOf(c.command);
          return (
            <Row
              key={c.id}
              label={name ?? 'Not available on this account'}
              caption={captionFor(rowId(ref), sentence(placePhrase(['anywhere'])))}
              end={
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
                  <IconButton
                    label={`Remove ${name ?? 'this shortcut'}`}
                    variant="ghost"
                    onClick={() => { setRefused(null); setPrefs(withCustomRemoved(prefs, c.id)); }}
                  >
                    <Icon name="trash-2" size={16} />
                  </IconButton>
                  <KeyField
                    current={c.key}
                    name={name ?? 'Shortcut'}
                    onPick={(k) => offer(ref, k, (p) => withCustomKey(p, c.id, k))}
                    onStop={() => setRefused((r) => (r?.row === rowId(ref) ? null : r))}
                  />
                </span>
              }
            />
          );
        })}

        {adding && adding !== 'choose' && (() => {
          /* Not in his prefs until it has a key: a shortcut with no key
             would be a row that does nothing, saved. */
          const ref: ShortcutRef = { kind: 'custom', id: 'new' };
          const name = nameOf(adding.command) ?? 'Shortcut';
          return (
            <Row
              label={name}
              caption={captionFor(rowId(ref), 'Press the key you want')}
              end={
                <KeyField
                  current={null}
                  name={name}
                  focusOnMount
                  onPick={(k) => {
                    const added = offer(ref, k, (p) =>
                      withCustomAdded(p, { id: `c${Date.now().toString(36)}`, command: adding.command, key: k }));
                    if (added) setAdding(null);
                    return added;
                  }}
                  onStop={() => { setAdding(null); setRefused(null); }}
                />
              }
            />
          );
        })()}

        {adding === 'choose' && (
          <p style={{ padding: 'var(--sp-4) 0', font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
            What should the new key do?
          </p>
        )}
        {adding === 'choose' && unbound.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setAdding({ command: c.id })}
            style={{
              all: 'unset',
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--sp-4)',
              width: '100%',
              minHeight: 44,
              cursor: 'pointer',
              font: 'var(--type-body)',
              fontSize: 'var(--text-sm)',
              color: 'var(--fg-2)',
            }}
          >
            <span aria-hidden="true" style={{ display: 'flex', color: 'var(--fg-3)' }}><Icon name={c.icon} size={16} /></span>
            <span style={{ flex: 1, minWidth: 0 }}>{c.name}</span>
          </button>
        ))}

        {adding === null && (
          <div style={{ padding: 'var(--sp-3) 0' }}>
            <Button
              variant="ghost"
              iconLeft={<Icon name="plus" size={16} />}
              onClick={() => { setRefused(null); setAdding('choose'); }}
              disabled={unbound.length === 0}
            >
              Add a shortcut
            </Button>
          </div>
        )}
        {adding === 'choose' && (
          <div style={{ padding: 'var(--sp-3) 0' }}>
            <Button variant="ghost" onClick={() => setAdding(null)}>Cancel</Button>
          </div>
        )}
      </Trough>

      <Trough label="Fixed">
        {fixed.map((r) => <Row key={r.id} label={r.label} end={<Caps keys={r.keys} />} />)}
      </Trough>

      <p style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
        Click a key and press the new one. Esc leaves it as it was. Your shortcuts work on every screen;
        the ones on screens only where that screen is open.
      </p>
    </>
  );
}
