/**
 * BASE's own sounds (29-1P3, ideas 117-121 and 123 of round 8).
 *
 * Every sound is made by the browser as it is asked for, with no audio file —
 * the same choice brown noise made (2026-09-15), for the same reason: nothing to
 * download, nothing on disk, and the whole set is a few kilobytes of code. The
 * look and the numbers are `docs/design/ideas-round-8.html`'s engine, ported:
 * the three styles (Glass, Wood, Pop), the climbing tick, the singing bowl, the
 * pick-up / slot / drop set and the slider's detent.
 *
 * ON BY DEFAULT, EVERYWHERE, FOCUS INCLUDED — his call while planning
 * (2026-09-30), with one switch in Settings → App to turn sound and buzzes off
 * together. Volume at zero keeps the buzzes and silences the speaker.
 *
 * NOTHING PLAYS UNLESS HE PRESSED SOMETHING. Every caller is a press handler,
 * with two deliberate exceptions that are the point of the sound: the session's
 * chime and the pomodoro edges (`FocusRunHost`), which are what a timer that
 * ends is for. An error sounds only for a failure of something he just did
 * (his call, 2026-10-07) — `Toast` asks `pressedRecently()` before it plays,
 * so a sync failing while he reads stays quiet.
 *
 * THE AUDIOCONTEXT IS MADE ON THE FIRST SOUND, NEVER AT STARTUP, and it is
 * suspended again after a short quiet spell. An open context holds the
 * device's audio output awake, which on the tablet is battery for nothing; a
 * suspended one costs nothing and resumes in a few milliseconds. The browser
 * lets a page that has been pressed at least once resume or create one later
 * without a fresh gesture, which is what lets the session's chime ring from a
 * timer.
 *
 * SOUND FROM WHERE YOU TAPPED (120). A capture-phase `pointerdown` listener
 * remembers where the last press landed, and a sound made within a second of
 * it is panned to that side of the screen. No caller passes a coordinate, so
 * every sound in the app gets it for free; a keyboard press or a timer plays
 * centred.
 *
 * WHY `localStorage` AND NOT THE STORE — brown noise's reason, verbatim in
 * spirit: a volume is about this device's speaker, not the account, and the
 * synced task document is rewritten whole on every edit under a 1 MB cap.
 */
import { useSyncExternalStore } from 'react';
import { buzz, type BuzzName } from './haptics';

export type SoundStyle = 'glass' | 'wood' | 'pop';

export interface SoundPrefs {
  /** Sound AND buzzes. One switch, his call. */
  enabled: boolean;
  style: SoundStyle;
  /** 0–1, the master gain. 0 keeps the buzzes. */
  volume: number;
}

export const DEFAULT_SOUND_PREFS: SoundPrefs = { enabled: true, style: 'glass', volume: 0.5 };

const PREFS_KEY = 'base.sound';

function loadPrefs(): SoundPrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_SOUND_PREFS };
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_SOUND_PREFS, ...(JSON.parse(raw) as Partial<SoundPrefs>) } : { ...DEFAULT_SOUND_PREFS };
  } catch {
    return { ...DEFAULT_SOUND_PREFS };
  }
}

let prefs: SoundPrefs = loadPrefs();
const listeners = new Set<() => void>();

export function getSoundPrefs(): SoundPrefs {
  return prefs;
}

export function setSoundPrefs(patch: Partial<SoundPrefs>): void {
  prefs = { ...prefs, ...patch };
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* A private window: it still holds for this session. */
  }
  if (master && ctx) master.gain.setTargetAtTime(prefs.volume, ctx.currentTime, 0.02);
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useSoundPrefs(): SoundPrefs {
  return useSyncExternalStore(subscribe, getSoundPrefs, getSoundPrefs);
}

// ─── Where and when he last pressed ─────────────────────────────────────────

let pressX: number | null = null;
let pressAt = 0;

if (typeof window !== 'undefined') {
  const remember = (e: PointerEvent | KeyboardEvent) => {
    pressAt = performance.now();
    pressX = 'clientX' in e ? e.clientX : null;
  };
  window.addEventListener('pointerdown', remember, { capture: true, passive: true });
  window.addEventListener('keydown', remember, { capture: true, passive: true });
}

/** Did he press something in the last few seconds? What makes an error "his". */
export function pressedRecently(ms = 4000): boolean {
  return pressAt > 0 && performance.now() - pressAt < ms;
}

/** −1 (left ear) … 1 (right), from the last press — kept short of the edges. */
function panFromPress(): number {
  if (pressX === null || performance.now() - pressAt > 1000 || !window.innerWidth) return 0;
  return Math.max(-1, Math.min(1, (pressX / window.innerWidth) * 2 - 1)) * 0.7;
}

// ─── The graph ──────────────────────────────────────────────────────────────

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
/** How long a quiet context stays open; past it, it is suspended. */
const IDLE_MS = 15_000;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
    master = ctx.createGain();
    master.gain.value = prefs.volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    if (ctx?.state === 'running') void ctx.suspend().catch(() => {});
  }, IDLE_MS);
  return ctx;
}

interface ToneOpts {
  t?: number;
  dur?: number;
  type?: OscillatorType;
  vol?: number;
  attack?: number;
  pan?: number;
  bend?: number;
  lp?: number;
}

function out(c: AudioContext, node: AudioNode, pan: number): void {
  if (pan && c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.value = pan;
    node.connect(p);
    p.connect(master!);
  } else {
    node.connect(master!);
  }
}

function tone(c: AudioContext, freq: number, o: ToneOpts = {}): void {
  const { t = 0, dur = 0.15, type = 'sine', vol = 0.25, attack = 0.004, pan = 0, bend = 0, lp = 0 } = o;
  const now = c.currentTime + t;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (bend) osc.frequency.exponentialRampToValueAtTime(freq * bend, now + dur);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), now + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, now + attack + dur);
  osc.connect(g);
  let node: AudioNode = g;
  if (lp) {
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    g.connect(f);
    node = f;
  }
  out(c, node, pan);
  osc.start(now);
  osc.stop(now + attack + dur + 0.05);
}

/** Delete: a short band of noise falling away. */
function whoosh(c: AudioContext, pan: number, peak = 0.18, dur = 0.3): void {
  const now = c.currentTime;
  if (!noise || noise.sampleRate !== c.sampleRate) {
    /* Always the longest whoosh's length: the buffer is shared. */
    noise = c.createBuffer(1, Math.ceil(c.sampleRate * 0.3), c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 0.8;
  f.frequency.setValueAtTime(2400, now);
  f.frequency.exponentialRampToValueAtTime(250, now + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(peak, now + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  src.connect(f);
  f.connect(g);
  out(c, g, pan);
  src.start(now);
}

/**
 * A chime that swells (119): a singing bowl that starts almost silent and
 * rises for a second before it rings out, so the end of a session pulls him
 * out of deep work instead of making him jump. Four partials, each a hair
 * detuned against itself for the bowl's slow beat.
 */
function bowl(c: AudioContext, level = 1): void {
  const now = c.currentTime;
  const base = 196;
  for (const [m, v] of [[1, 0.5], [2.76, 0.28], [5.4, 0.12], [8.93, 0.06]] as const) {
    for (const det of [1, 1.004]) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.value = base * m * det;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(Math.max(0.0002, v * 0.28 * level), now + 1.1);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 6);
      o.connect(g);
      g.connect(master!);
      o.start(now);
      o.stop(now + 6.1);
    }
  }
}

/** The three styles, the page's numbers. */
const STYLE: Record<SoundStyle, { type: OscillatorType; mul: number; harm: boolean; d: number; lp: number; bend: number; v: number }> = {
  glass: { type: 'sine', mul: 1, harm: true, d: 1, lp: 0, bend: 0, v: 1 },
  wood: { type: 'triangle', mul: 0.5, harm: false, d: 0.5, lp: 1500, bend: 0, v: 1.3 },
  pop: { type: 'square', mul: 1, harm: false, d: 0.8, lp: 2200, bend: 1.25, v: 0.35 },
};

function note(c: AudioContext, f: number, o: { t?: number; dur?: number; vol?: number; pan?: number } = {}): void {
  const k = STYLE[prefs.style] ?? STYLE.glass;
  const dur = o.dur ?? 0.15;
  const vol = o.vol ?? 0.22;
  tone(c, f * k.mul, { t: o.t, pan: o.pan, type: k.type, dur: dur * k.d, vol: vol * k.v, lp: k.lp, bend: k.bend });
  if (k.harm) tone(c, f * 2, { t: o.t, pan: o.pan, dur: dur * 0.6, vol: vol * 0.22 });
}

/**
 * Notes that climb (118): ticks close together go up a scale, so a run of
 * them is a little tune; a pause of six seconds starts again at the bottom.
 */
const TICK_SCALE = [1046, 1175, 1318, 1568, 1760, 2093, 2349];
const CLIMB_RESET_MS = 6000;
let climb = 0;
let lastTickAt = 0;

export type Cue =
  | 'tick' | 'untick' | 'done' | 'cleared' | 'start' | 'chime' | 'flowChime' | 'breakEdge' | 'delete' | 'error' | 'streak'
  | 'pick' | 'pass' | 'drop' | 'into' | 'detent' | 'undo' | 'redo' | 'toss';

/** Which buzz goes with each sound (122). */
const BUZZ: Record<Cue, BuzzName> = {
  tick: 'tick', untick: 'tick', done: 'done', cleared: 'done', start: 'start', chime: 'sessionEnd', flowChime: 'nudge', breakEdge: 'nudge',
  delete: 'delete', error: 'error', streak: 'done', pick: 'pick', pass: 'pass', drop: 'drop', into: 'into', detent: 'detent',
  undo: 'undo', redo: 'tick', toss: 'toss',
};

function sound(c: AudioContext, name: Cue, step: number): void {
  const pan = panFromPress();
  switch (name) {
    case 'tick': {
      const now = performance.now();
      if (now - lastTickAt > CLIMB_RESET_MS) climb = 0;
      lastTickAt = now;
      note(c, TICK_SCALE[Math.min(climb, TICK_SCALE.length - 1)], { dur: 0.12, pan });
      climb++;
      return;
    }
    case 'untick': note(c, 784, { dur: 0.08, vol: 0.12, pan }); return;
    case 'done': note(c, 1046, { dur: 0.14, pan }); note(c, 1568, { dur: 0.24, t: 0.09, pan }); return;
    /* The end of a list: the run of ticks lands on a chord. */
    case 'cleared': for (const f of [523, 659, 784, 1046]) note(c, f, { dur: 0.9, vol: 0.12, t: 0.12, pan }); return;
    case 'start': note(c, 523, { dur: 0.12, pan }); note(c, 784, { dur: 0.2, t: 0.08, pan }); return;
    /* The session's end, and a pomodoro break's start and end (his calls,
       2026-10-07): the same bowl, told apart by the buzz. */
    case 'chime': case 'breakEdge': bowl(c); return;
    /* 29-1P10b, idea 102: the session's end while he is deep in it - the
       same bowl at under half its level, with the gentle buzz, rung once.
       Then Focus's numbers turn gold and count up (his call, 2026-10-15). */
    case 'flowChime': bowl(c, 0.4); return;
    case 'delete': whoosh(c, pan); return;
    case 'error': note(c, 330, { dur: 0.12, pan }); note(c, 262, { dur: 0.22, t: 0.13, pan }); return;
    case 'streak': [1568, 2093, 2637].forEach((f, i) => note(c, f, { dur: 0.14, t: i * 0.055, vol: 0.16, pan })); return;
    case 'pick': tone(c, prefs.style === 'wood' ? 160 : 220, { type: 'triangle', dur: 0.08, vol: 0.32, lp: 900, pan }); return;
    /* Each slot passed is a little higher the further it has travelled. */
    case 'pass': tone(c, 700 * Math.pow(2, Math.max(-14, Math.min(14, step)) / 7), { dur: 0.03, vol: 0.08, pan }); return;
    case 'drop': tone(c, 660, { type: 'triangle', dur: 0.05, vol: 0.26, pan }); tone(c, 1320, { dur: 0.07, vol: 0.08, t: 0.02, pan }); return;
    /* A held card armed to go inside another: the pick-up's tock, a step lower. */
    case 'into': tone(c, prefs.style === 'wood' ? 120 : 165, { type: 'triangle', dur: 0.1, vol: 0.28, lp: 800, pan }); return;
    case 'detent': tone(c, 2600, { type: 'square', dur: 0.012, vol: 0.05, lp: 5000, pan }); return;
    /* 29-1P4a: undo steps down, redo steps back up — the same two notes. */
    case 'undo': note(c, 1318, { dur: 0.08, vol: 0.16, pan }); note(c, 988, { dur: 0.14, vol: 0.16, t: 0.07, pan }); return;
    case 'redo': note(c, 988, { dur: 0.08, vol: 0.16, pan }); note(c, 1318, { dur: 0.14, vol: 0.16, t: 0.07, pan }); return;
    /* 29-1P6b, 126: a notice flicked away - the delete's whoosh, lighter and
       shorter, because nothing was lost. */
    case 'toss': whoosh(c, pan, 0.12, 0.25); return;
  }
}

/**
 * Plays one of BASE's sounds and its buzz. The only door in: callers say what
 * happened, never how it sounds.
 *
 * `step` is how far a dragged row has travelled, for `pass`. `buzzToo: false`
 * is for a moment a finger is not on (the slot clicks under a mouse).
 */
export function cue(name: Cue, opts: { step?: number; buzzToo?: boolean } = {}): void {
  if (!prefs.enabled) return;
  if (opts.buzzToo !== false) buzz(BUZZ[name]);
  if (prefs.volume <= 0) return;
  const c = audio();
  if (!c || !master) return;
  try {
    sound(c, name, opts.step ?? 0);
  } catch {
    /* A browser that refuses mid-graph is a silent app, never a broken one. */
  }
}
