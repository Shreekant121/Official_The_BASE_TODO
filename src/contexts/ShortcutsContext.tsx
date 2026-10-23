import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo, type ReactNode } from 'react';
import { Dialog, Icon, IconButton, SoftToggle } from '../ui';
import { useOverlayDismiss } from '../lib/useOverlayDismiss';
import { Z } from '../lib/zLayers';
import { BUILT_IN_SHORTCUTS, builtInKey, keyCap, type BuiltInShortcutId } from '../lib/shortcutBindings';
import { useShortcutPrefs } from '../lib/shortcutPrefs';
import { Caps, Row, Trough } from '../components/shortcuts/parts';
import { ShortcutsEditor } from '../components/shortcuts/ShortcutsEditor';

export interface ShortcutDef {
  /** Single key, e.g. 'n', 'l', 'p', 'h'. Case-insensitive, never combined with a modifier. */
  key: string;
  label: string;
  handler: () => void;
  /** When set to 'g', this only fires after the leader key `g` was pressed first (e.g. "g then h" for Home) — kept separate from bare page-scoped keys like `n`/`l` so navigation never collides with quick-add shortcuts. */
  leader?: 'g';
  /**
   * BUILD-10 — a rebindable action. When set, `key` is only the default: the
   * registry answers on whatever key he moved it to. Build one with
   * `builtInShortcut`, which takes the label and default from the catalog in
   * `lib/shortcutBindings.ts`, so a screen never spells out a key it does not own.
   */
  action?: BuiltInShortcutId;
}

type ScopedShortcut = ShortcutDef & { scopeId: string };

interface ShortcutsContextValue {
  registerShortcuts: (scopeId: string, shortcuts: ShortcutDef[]) => () => void;
  /**
   * Opens the help sheet from a control rather than from the `?` key —
   * Home's header carries a keyboard button for it, since `?` is not
   * discoverable and this app runs on a tablet where there is no key to
   * press at all.
   */
  openHelp: () => void;
}

const ShortcutsContext = createContext<ShortcutsContextValue | null>(null);

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * App-wide keyboard shortcut registry. Any page/component can register a set
 * of single-key shortcuts scoped to itself via `useShortcuts` — they're
 * automatically unregistered on unmount, so switching pages never leaves
 * stale bindings active. Keystrokes are ignored while focus is in a text
 * field, matching the Escape-suppression convention already used around the
 * app. Press `?` anywhere to see every shortcut currently active.
 */
export function ShortcutsProvider({ children }: { children: ReactNode }) {
  const scopesRef = useRef<Map<string, ShortcutDef[]>>(new Map());
  const [helpOpen, setHelpOpen] = useState(false);
  // Snapshot of `scopesRef`, captured fresh only at the moment the help
  // overlay opens (see the `?` handler below) — reading the ref there is
  // safe (it's inside an event handler, not render), and avoids needing any
  // "bump a version counter on every register/unregister, then re-render to
  // resync a snapshot" machinery. That used to make *every* register/
  // unregister of a page's shortcuts (i.e. every render of every page using
  // `useShortcuts`, since it re-registers with no dependency array) trigger
  // two extra `ShortcutsProvider` re-renders — this way, registering a
  // shortcut is a plain ref mutation with zero React re-renders.
  const [helpShortcuts, setHelpShortcuts] = useState<ScopedShortcut[]>([]);
  const leaderActiveRef = useRef(false);
  const leaderTimerRef = useRef<number | undefined>(undefined);

  /* Every registered shortcut on the key it answers to NOW. His moved keys
     are read at the moment of asking, never captured, so a key changed in
     the sheet is live on the very next keypress. */
  const getAll = useCallback((): ScopedShortcut[] => {
    const prefs = useShortcutPrefs.getState().prefs;
    return Array.from(scopesRef.current.entries()).flatMap(([scopeId, defs]) =>
      defs.map((d) => ({ ...d, key: d.action ? builtInKey(prefs, d.action) : d.key, scopeId }))
    );
  }, []);

  const registerShortcuts = useCallback((scopeId: string, shortcuts: ShortcutDef[]) => {
    scopesRef.current.set(scopeId, shortcuts);
    return () => {
      scopesRef.current.delete(scopeId);
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === '?') {
        e.preventDefault();
        setHelpShortcuts(getAll());
        setHelpOpen((v) => !v);
        return;
      }
      // Escape is deliberately not handled here. The help sheet closes itself
      // through `useOverlayDismiss`, which answers Escape only when the sheet
      // is the *topmost* overlay — closing it from this global handler as well
      // would collapse it out from under anything opened on top of it.
      // Nothing else answers while the sheet is up (BUILD-10): it covers the
      // screen, so a shortcut run under it happens where he cannot see it —
      // and in the editor a key pressed off the field would be exactly that.
      if (helpOpen) return;

      const key = e.key.toLowerCase();
      const all = getAll();

      if (leaderActiveRef.current) {
        leaderActiveRef.current = false;
        window.clearTimeout(leaderTimerRef.current);
        const match = all.find((s) => s.leader === 'g' && s.key.toLowerCase() === key);
        if (match) { e.preventDefault(); match.handler(); }
        return;
      }

      if (key === 'g' && all.some((s) => s.leader === 'g')) {
        leaderActiveRef.current = true;
        leaderTimerRef.current = window.setTimeout(() => { leaderActiveRef.current = false; }, 1200);
        return;
      }

      const match = all.find((s) => !s.leader && s.key.toLowerCase() === key);
      if (match) { e.preventDefault(); match.handler(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [getAll, helpOpen]);

  // Memoized so the context value's identity never changes across
  // `version` bumps — otherwise every registration would re-render every
  // consumer, whose no-dependency-array effects (see `useShortcuts`) would
  // immediately re-register and bump `version` again, looping forever.
  const openHelp = useCallback(() => {
    setHelpShortcuts(getAll());
    setHelpOpen(true);
  }, [getAll]);

  /* Leaving the editor re-reads the registry: the palette host re-registers
     his own shortcuts after every edit, and the list should show them. */
  const refreshHelp = useCallback(() => setHelpShortcuts(getAll()), [getAll]);

  const contextValue = useMemo(() => ({ registerShortcuts, openHelp }), [registerShortcuts, openHelp]);

  return (
    <ShortcutsContext.Provider value={contextValue}>
      {children}
      <ShortcutsHelpOverlay open={helpOpen} onClose={() => setHelpOpen(false)} shortcuts={helpShortcuts} onEdited={refreshHelp} />
    </ShortcutsContext.Provider>
  );
}

/**
 * Registers a set of single-key shortcuts for as long as the calling
 * component is mounted. Pass a stable `scopeId` (e.g. the page name).
 * Re-registers on every render (cheap — a `Map.set`) so handler closures
 * are always fresh and never go stale, rather than requiring callers to
 * carefully memoize the `shortcuts` array/handlers themselves.
 */
// Co-located provider/hook pair is the standard pattern for a React Context
// module; splitting it into two files just for Fast Refresh isn't worth it.
// eslint-disable-next-line react-refresh/only-export-components
export function useShortcuts(scopeId: string, shortcuts: ShortcutDef[]) {
  const ctx = useContext(ShortcutsContext);
  useEffect(() => {
    if (!ctx) return;
    return ctx.registerShortcuts(scopeId, shortcuts);
  });
}

/**
 * A rebindable shortcut from the catalog (BUILD-10), for `useShortcuts`:
 * `{ ...builtInShortcut('new-task'), handler }`. The handler is spread in
 * beside it rather than passed through, because the compiler lint reads a
 * ref-touching handler handed to a call during render as a ref read.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function builtInShortcut(action: BuiltInShortcutId): Omit<ShortcutDef, 'handler'> {
  const { key, label } = BUILT_IN_SHORTCUTS[action];
  return { key, label, action };
}

/** Opens the shortcuts help sheet. For a button; `?` still works too. */
// eslint-disable-next-line react-refresh/only-export-components
export function useOpenShortcutsHelp(): () => void {
  const ctx = useContext(ShortcutsContext);
  return ctx?.openHelp ?? (() => {});
}

interface ShortcutRow {
  id: string;
  label: string;
  /** Rendered as keycaps in order. The literal `then` renders unboxed. */
  keys: string[];
}

/**
 * The rows that are true on every screen. Escape is answered by
 * `useOverlayDismiss`, `?` by this file's own keydown handler and Ctrl+K by
 * `components/CommandPaletteHost.tsx` (BUILD-9 — a modifier chord, which the
 * registry ignores by design), so none is registered by any page and none
 * can be derived from the registry the way the other groups are.
 */
const ANYWHERE: ShortcutRow[] = [
  { id: 'anywhere-palette', label: 'Search and commands', keys: ['Ctrl', 'K'] },
  { id: 'anywhere-escape', label: 'Close this sheet', keys: ['Esc'] },
  { id: 'anywhere-help', label: 'Toggle this help', keys: ['?'] },
];

/** The id the sheet is named by, for `aria-labelledby`. */
const TITLE_ID = 'shortcuts-sheet-title';

function keysFor(s: ShortcutDef): string[] {
  return s.leader ? [s.leader.toUpperCase(), 'then', keyCap(s.key)] : [keyCap(s.key)];
}

function toRow(s: ScopedShortcut): ShortcutRow {
  return { id: `${s.scopeId}-${s.key}-${s.leader ?? ''}`, label: s.label, keys: keysFor(s) };
}

/** One kicker-labelled group of rows, in a single hairline-ruled trough. */
function Group({ label, rows }: { label: string; rows: ShortcutRow[] }) {
  return (
    <Trough label={label}>
      {rows.map((r) => <Row key={r.id} label={r.label} end={<Caps keys={r.keys} />} />)}
    </Trough>
  );
}

/**
 * The `?` sheet, rebuilt on Aurora Glass from `ShortcutsDialog` in
 * `design-system/screens/home.html`.
 *
 * The mockup hard-codes three groups — Navigate / Act / Anywhere —
 * against fake data. The real list is whatever the mounted pages have
 * registered, so the split is DERIVED rather than transcribed:
 * `leader: 'g'` is exactly the "go somewhere" set and everything else is
 * an action. Registering a shortcut therefore still needs no change here,
 * which is the whole point of the registry.
 *
 * BUILD-10 gave it a second view, the editor, behind Edit in the header. The
 * list shows what this screen answers to; the editor shows every rebindable
 * key in the app, since a key for the project board has to be changeable from
 * Home. Closing the sheet leaves the editor, so `?` always opens on the list.
 */
function ShortcutsHelpOverlay({
  open, onClose, shortcuts, onEdited,
}: { open: boolean; onClose: () => void; shortcuts: ScopedShortcut[]; onEdited: () => void }) {
  useOverlayDismiss(open, onClose);
  const [editing, setEditing] = useState(false);

  /* Adjusted during render, like `Dialog`'s own `open`, so a reopened sheet
     never flashes the editor it was closed on. */
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (!open) setEditing(false);
  }

  const navigate = shortcuts.filter((s) => s.leader).map(toRow);
  const act = shortcuts.filter((s) => !s.leader).map(toRow);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      width={480}
      labelledBy={TITLE_ID}
      /* Escape is `useOverlayDismiss`'s above, which answers only for the
         topmost overlay. See Dialog's port note 2. */
      closeOnEscape={false}
      zIndex={Z.shortcuts}
      style={{ gap: 0, padding: 0, gridTemplateColumns: 'minmax(0, 1fr)' }}
    >
      <div
        className="ag-scroll ag-fade"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: 'var(--sp-8)',
          padding: 'var(--pad-sheet)',
          minWidth: 0,
          boxSizing: 'border-box',
          maxHeight: '86vh',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)' }}>
          <span aria-hidden="true" style={{ display: 'flex', color: 'var(--fg-3)' }}>
            <Icon name="keyboard" size={20} />
          </span>
          <h2
            id={TITLE_ID}
            style={{
              flex: 1,
              minWidth: 0,
              font: 'var(--type-title)',
              fontSize: 'var(--text-xl)',
              letterSpacing: 'var(--tracking-title)',
              color: 'var(--fg-1)',
            }}
          >
            Shortcuts
          </h2>
          {/* The Dashboard's Edit (29-1P2): pressed in while editing. */}
          <SoftToggle
            pressed={editing}
            onPressedChange={(next) => { setEditing(next); if (!next) onEdited(); }}
            icon={<Icon name={editing ? 'check' : 'pencil'} size={15} />}
          >
            {editing ? 'Done' : 'Edit'}
          </SoftToggle>
          <IconButton label="Close" variant="ghost" onClick={onClose}><Icon name="x" size={18} /></IconButton>
        </header>

        {editing ? (
          <ShortcutsEditor fixed={[...navigate, ...ANYWHERE]} />
        ) : (
          <>
            {navigate.length === 0 && act.length === 0 && (
              <p style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>
                No shortcuts available on this page.
              </p>
            )}
            {navigate.length > 0 && <Group label="Navigate" rows={navigate} />}
            {act.length > 0 && <Group label="Act" rows={act} />}
            <Group label="Anywhere" rows={ANYWHERE} />

            {navigate.length > 0 && (
              <p style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
                Sequences are typed in order, not held together.
              </p>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
