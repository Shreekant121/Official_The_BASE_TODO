/**
 * Brown noise — the sound, and the one thing that owns it.
 *
 * Shreekant auditioned the generated version against the alternative (ship an
 * audio file and loop it) on 2026-09-15 and chose generated. That decision is
 * what this file is: **no asset, no download, nothing on disk.** The sound is
 * synthesised the first time it is asked for and lives in memory while it
 * plays.
 *
 * WHY A MODULE SINGLETON AND NOT A HOOK OR A STORE
 * ------------------------------------------------
 * There is one pair of speakers. Focus Mode starts the noise, the floating nav
 * mutes it, Settings auditions it, and a route change unmounts and remounts
 * every one of those — so the thing that must NOT be per-component is the
 * audio graph. A hook owning an `AudioContext` would tear the sound down every
 * time he looked at a project, which is the exact behaviour Q8 rejected: *"it
 * should keep playing"*. React subscribes to this; it does not contain it.
 *
 * `subscribe` exists so the mute pill and the Settings panel can both draw the
 * true state without either of them being its owner.
 *
 * THE LOOP POINT IS THE WHOLE TRICK
 * ----------------------------------
 * Brown noise is white noise integrated — each sample is a small step off the
 * last one, which is what produces its −6 dB/octave slope and its depth. But a
 * random walk **drifts**: after thirty seconds the signal is sitting at some
 * arbitrary offset, so looping the buffer jumps from that offset back to zero
 * and you hear a click every thirty seconds, for ever. `detrend` below removes
 * the straight line between the first and last sample, which lands both ends
 * on zero and makes the seam silent. It is two lines and the feature is
 * unusable without it.
 *
 * WHY THE PREFERENCES ARE IN `localStorage` AND NOT THE STORE
 * -----------------------------------------------------------
 * CLAUDE.md's standing rule: `users/{uid}/data/main` is rewritten whole on
 * every task edit under a 1 MB cap, and anything added to the persisted store
 * spends that budget. Seven numbers describing a noise are not task data and
 * have no business in that document. They also fail the *other* test — a level
 * set on the tablet is about the tablet's speakers, not about the account.
 *
 * This deliberately does **not** live in `atlas/devicePrefs.ts` even though it
 * is the same idea: that file is Atlas's, its comments are all about which
 * model answers, and a noise level filed under "the things about Atlas that
 * belong to this device" would be the first entry there that has nothing to do
 * with Atlas.
 */

export type NoiseVariant = 'brown' | 'pink' | 'white';

/** Which of the two behaviours from Q8 is running the noise. */
export type NoiseMode = 'task' | 'pomodoro';

export interface NoisePrefs {
  /** The master switch. Off means Focus Mode never starts the noise. */
  enabled: boolean;
  variant: NoiseVariant;
  /** Low-pass cutoff, Hz. Commercial "brown noise" tracks sit near 500. */
  toneHz: number;
  /** 0–1, already the real gain — not a percentage. */
  level: number;
  /** Fade in and fade out, seconds. Shared by both, deliberately. */
  fadeSeconds: number;
  mode: NoiseMode;
  focusMinutes: number;
  breakMinutes: number;
}

export const DEFAULT_NOISE_PREFS: NoisePrefs = {
  enabled: false,
  variant: 'brown',
  toneHz: 8000,
  level: 0.45,
  fadeSeconds: 3,
  mode: 'task',
  focusMinutes: 30,
  breakMinutes: 5,
};

const PREFS_KEY = 'mutineer_noise_prefs';

/* `localStorage` throws in a private window rather than returning null, so
   every access is wrapped — the same rule `devicePrefs.ts` states. A device
   with no storage gets the defaults, which is a working feature rather than a
   broken one. */
export function loadNoisePrefs(): NoisePrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_NOISE_PREFS };
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_NOISE_PREFS };
    const parsed = JSON.parse(raw) as Partial<NoisePrefs>;
    /* Spread over the defaults rather than trusting the document: a pref
       written by an older build is missing whatever was added since, and an
       `undefined` cutoff reaching a BiquadFilter silences the whole graph. */
    return { ...DEFAULT_NOISE_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_NOISE_PREFS };
  }
}

export function saveNoisePrefs(prefs: NoisePrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* Out of quota or a private window. The sound still works this session. */
  }
}

const SAMPLE_RATE = 44100;
const LOOP_SECONDS = 30;

/**
 * Fills `out` with one of the three noises, normalised and detrended.
 *
 * Exported for the test, which is the only way to assert the loop seam: a
 * click at the join is inaudible in a unit test and unmissable after an hour
 * of work.
 */
export function fillNoise(out: Float32Array, variant: NoiseVariant): void {
  const n = out.length;
  let i: number;

  if (variant === 'white') {
    for (i = 0; i < n; i++) out[i] = Math.random() * 2 - 1;
  } else if (variant === 'pink') {
    /* Paul Kellet's economy pink filter — six one-pole sections summed, which
       tracks −3 dB/octave closely enough that nothing else is worth the CPU. */
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.96900 * b2 + w * 0.1538520;
      b3 = 0.86650 * b3 + w * 0.3104856;
      b4 = 0.55000 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.0168980;
      out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else {
    /* Brown: integrate white, leaking slightly so the walk cannot run away. */
    let last = 0;
    for (i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      out[i] = last * 3.5;
    }
  }

  /* See the header — without this the loop seam clicks every LOOP_SECONDS. */
  const first = out[0];
  const slope = (out[n - 1] - first) / (n - 1);
  let peak = 0;
  for (i = 0; i < n; i++) {
    out[i] -= first + slope * i;
    const abs = Math.abs(out[i]);
    if (abs > peak) peak = abs;
  }
  if (peak > 0) {
    const g = 0.92 / peak;
    for (i = 0; i < n; i++) out[i] *= g;
  }
}

type Listener = (playing: boolean) => void;
type PrefsListener = (prefs: NoisePrefs) => void;

let ctx: AudioContext | null = null;
let filterNode: BiquadFilterNode | null = null;
let gainNode: GainNode | null = null;
let source: AudioBufferSourceNode | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;

const buffers = new Map<NoiseVariant, AudioBuffer>();
const listeners = new Set<Listener>();
const prefsListeners = new Set<PrefsListener>();

let playing = false;
let prefs: NoisePrefs = loadNoisePrefs();

function announce(): void {
  for (const fn of listeners) fn(playing);
}

/** True where the browser can do this at all. False in Node, so tests import freely. */
export function noiseSupported(): boolean {
  return typeof window !== 'undefined'
    && !!(window.AudioContext || (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
}

/**
 * Builds the graph. **Called only from a user gesture** — every browser
 * refuses to start an `AudioContext` otherwise, and one created too early
 * lands in `suspended` and stays there silently.
 */
function ensureGraph(): boolean {
  if (ctx) return true;
  if (!noiseSupported()) return false;

  const Ctor = window.AudioContext
    || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  ctx = new Ctor();

  filterNode = ctx.createBiquadFilter();
  filterNode.type = 'lowpass';
  filterNode.frequency.value = prefs.toneHz;
  filterNode.Q.value = 0.707;

  gainNode = ctx.createGain();
  /* Always starts silent. Every path into sound goes through a ramp, so there
     is no route that opens at full level in one sample — which is a thump on
     a good pair of headphones. */
  gainNode.gain.value = 0;

  filterNode.connect(gainNode);
  gainNode.connect(ctx.destination);
  return true;
}

function bufferFor(variant: NoiseVariant): AudioBuffer {
  const cached = buffers.get(variant);
  if (cached) return cached;
  const buf = ctx!.createBuffer(1, SAMPLE_RATE * LOOP_SECONDS, SAMPLE_RATE);
  fillNoise(buf.getChannelData(0), variant);
  buffers.set(variant, buf);
  return buf;
}

function ramp(target: number, seconds: number): void {
  if (!ctx || !gainNode) return;
  const t = ctx.currentTime;
  const safe = Math.max(0.02, seconds);
  gainNode.gain.cancelScheduledValues(t);
  gainNode.gain.setValueAtTime(gainNode.gain.value, t);
  gainNode.gain.linearRampToValueAtTime(target, t + safe);
}

function attachSource(): void {
  if (source) {
    try { source.stop(); } catch { /* already stopped */ }
    source.disconnect();
  }
  source = ctx!.createBufferSource();
  source.buffer = bufferFor(prefs.variant);
  source.loop = true;
  source.connect(filterNode!);
  source.start();
}

/** Starts, or fades back up if a stop was already in flight. */
export function startNoise(): void {
  if (!ensureGraph()) return;
  if (stopTimer) { clearTimeout(stopTimer); stopTimer = null; }
  /* A context suspended by the tab going to the background resumes here
     rather than on a timer — the gesture that reaches this function is the
     only thing the browser will accept. */
  if (ctx!.state === 'suspended') void ctx!.resume();
  if (!source) attachSource();
  ramp(prefs.level, prefs.fadeSeconds);
  if (!playing) { playing = true; announce(); }
}

/**
 * Fades out and releases the source.
 *
 * The node is torn down **after** the fade rather than with it, and the timer
 * re-checks that the source it captured is still the current one: changing
 * variant mid-fade would otherwise have the old timer stop the new sound.
 */
export function stopNoise(): void {
  if (!ctx || !playing) return;
  const seconds = Math.max(0.02, prefs.fadeSeconds);
  ramp(0, seconds);
  playing = false;
  announce();

  const captured = source;
  if (stopTimer) clearTimeout(stopTimer);
  stopTimer = setTimeout(() => {
    stopTimer = null;
    if (captured && captured === source) {
      try { captured.stop(); } catch { /* already stopped */ }
      captured.disconnect();
      source = null;
    }
  }, seconds * 1000 + 120);
}

export function toggleNoise(): void {
  if (playing) stopNoise(); else startNoise();
}

export function isNoisePlaying(): boolean {
  return playing;
}

export function getNoisePrefs(): NoisePrefs {
  return prefs;
}

/**
 * Applies a change and writes it through.
 *
 * Live where it can be: level and tone are `setTargetAtTime` so dragging a
 * slider is a smooth move rather than a zipper, and a variant change rebuilds
 * the source **without** touching the gain, so the sound swaps under a steady
 * level instead of fading out and back in.
 */
export function setNoisePrefs(patch: Partial<NoisePrefs>): NoisePrefs {
  const before = prefs;
  prefs = { ...prefs, ...patch };
  saveNoisePrefs(prefs);

  if (ctx && gainNode && filterNode) {
    if (patch.toneHz !== undefined) {
      filterNode.frequency.setTargetAtTime(prefs.toneHz, ctx.currentTime, 0.02);
    }
    if (patch.level !== undefined && playing) {
      gainNode.gain.cancelScheduledValues(ctx.currentTime);
      gainNode.gain.setTargetAtTime(prefs.level, ctx.currentTime, 0.04);
    }
    if (patch.variant !== undefined && patch.variant !== before.variant && playing) {
      attachSource();
    }
  }

  /* Turning the master switch off is expected to go quiet immediately, not at
     the start of the next task. */
  if (patch.enabled === false && playing) stopNoise();
  for (const fn of prefsListeners) fn(prefs);
  return prefs;
}

export function subscribeNoise(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/**
 * The settings themselves changing, which `subscribeNoise` cannot say — it
 * announces whether sound is coming out, and these are the rules about when it
 * should be (BUILD-1).
 *
 * `FocusRunHost` is the subscriber that matters: he can turn the master switch
 * on, or swap "follows the task" for the focus/break cycle, on the Settings
 * screen *while a session is running on another*. Without this the new rule
 * would not apply until the next task started.
 */
export function subscribeNoisePrefs(fn: PrefsListener): () => void {
  prefsListeners.add(fn);
  return () => { prefsListeners.delete(fn); };
}
