/**
 * BUILD-10 — his shortcuts, remembered on this device.
 *
 * `localStorage`, for `useRememberedState`'s two reasons (FIX-1): the cloud
 * document is rewritten whole under a 1 MB cap and is for task data, and a key
 * binding is a fact about the keyboard in front of you — the laptop has one,
 * the tablet usually does not. Not `useRememberedState` itself, because two
 * places read it at once (the registry and the palette host, which registers
 * his own), and a hook's copy per caller would let them disagree until the
 * next mount.
 *
 * Read once, sanitised (`sanitisePrefs`), and written on every change before
 * the change is shown, so a reload straight after an edit keeps it.
 */
import { create } from 'zustand';
import { EMPTY_PREFS, sanitisePrefs, type ShortcutPrefs } from './shortcutBindings';

const KEY = 'base.shortcuts';

function read(): ShortcutPrefs {
  if (typeof window === 'undefined') return EMPTY_PREFS;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === null ? EMPTY_PREFS : sanitisePrefs(JSON.parse(raw));
  } catch {
    return EMPTY_PREFS;
  }
}

function write(prefs: ShortcutPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* Out of quota, or a private window. The change still holds this session. */
  }
}

interface ShortcutPrefsState {
  prefs: ShortcutPrefs;
  setPrefs: (prefs: ShortcutPrefs) => void;
}

export const useShortcutPrefs = create<ShortcutPrefsState>((set) => ({
  prefs: read(),
  setPrefs: (prefs) => {
    write(prefs);
    set({ prefs });
  },
}));
