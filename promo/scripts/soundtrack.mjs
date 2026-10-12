// Synthesises the promo's soundtrack — score and sound effects, cut to the
// scene timeline — and writes public/soundtrack.wav. No samples, no licences:
// every sound is generated here. Swap in your own music by replacing the file.
import fs from 'node:fs';

const SR = 48000;
const DUR = 90;
const N = SR * DUR;
const L = new Float32Array(N);
const R = new Float32Array(N);

let seed = 12345;
const noise = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2147483648 - 1;
};
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const add = (i, l, r = l) => {
  if (i >= 0 && i < N) {
    L[i] += l;
    R[i] += r;
  }
};
const smooth = (x) => x * x * (3 - 2 * x);
const env = (t, a, b) => (t < a ? 0 : t > b ? 1 : smooth((t - a) / (b - a)));

/* ---------------- Sound effects ---------------- */
function impact(at, gain = 1) {
  const len = 2.2 * SR;
  let lp = 0;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const boom = Math.sin(2 * Math.PI * (30 * t + (70 / 9) * (1 - Math.exp(-t * 9)))) * Math.exp(-t * 2.2);
    lp += (noise() - lp) * (0.05 + 0.4 * Math.exp(-t * 12));
    const crack = lp * Math.exp(-t * 3.5) * 0.9;
    const v = (boom * 0.9 + crack) * gain;
    add(Math.round(at * SR) + n, v, v * 0.96);
  }
}
function whoosh(at, dur = 0.8, gain = 0.5, dir = 1) {
  const len = dur * SR;
  let lp = 0;
  let lp2 = 0;
  for (let n = 0; n < len; n++) {
    const x = n / len;
    const a = Math.sin(Math.PI * x) ** 2;
    const k = 0.02 + 0.25 * x;
    lp += (noise() - lp) * k;
    lp2 += (lp - lp2) * k;
    const v = lp2 * a * gain * 2.2;
    const pan = dir > 0 ? x : 1 - x;
    add(Math.round(at * SR) + n, v * (1 - pan * 0.7), v * (0.3 + pan * 0.7));
  }
}
function riser(from, to, gain = 0.35) {
  const len = (to - from) * SR;
  let ph = 0;
  let lp = 0;
  for (let n = 0; n < len; n++) {
    const x = n / len;
    const f = 160 * 2 ** (x * 3);
    ph += f / SR;
    lp += (noise() - lp) * (0.01 + x * 0.35);
    const v = (Math.sin(2 * Math.PI * ph) * 0.35 + Math.sin(2 * Math.PI * ph * 1.006) * 0.35 + lp * 1.4) * x ** 2.2 * gain;
    add(Math.round(from * SR) + n, v, v);
  }
}
function blip(at, f = 1200, gain = 0.18, decay = 30) {
  const len = 0.25 * SR;
  for (let n = 0; n < len; n++) {
    const t = n / SR;
    const v = Math.sin(2 * Math.PI * f * t * (1 + Math.exp(-t * 40) * 0.3)) * Math.exp(-t * decay) * gain;
    add(Math.round(at * SR) + n, v, v);
  }
}
function click(at, gain = 0.35) {
  blip(at, 2200, gain * 0.5, 90);
  const len = 0.03 * SR;
  for (let n = 0; n < len; n++) add(Math.round(at * SR) + n, noise() * Math.exp(-n / (0.004 * SR)) * gain);
  blip(at + 0.005, 140, gain * 0.9, 25);
}
function tick(at, gain = 0.08) {
  const len = 0.02 * SR;
  let prev = 0;
  for (let n = 0; n < len; n++) {
    const w = noise();
    add(Math.round(at * SR) + n, (w - prev) * Math.exp(-n / (0.003 * SR)) * gain);
    prev = w;
  }
}
function chime(at, gain = 0.2) {
  [0, 4, 7, 12].forEach((s, i) => blip(at + i * 0.045, hz(84 + s), gain * 0.7, 5));
}

/* ---------------- Score ---------------- */
// A minor → F → C → G, 4 s per chord. Root notes (MIDI).
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [55, 60, 64],
  [55, 59, 62],
];
const chordAt = (t) => CHORDS[Math.floor(t / 4) % 4];
const BEAT = 0.5;

// Section intensity: 0 silent → 1 full.
const drums = (t) => (t < 14 ? 0 : t < 47 ? 1 : t < 53.75 ? 0.25 : t < 83 ? 1 : 0) * (t > 9.4 ? 1 : 0);
const padLevel = (t) => (t < 9.4 ? 0.5 * env(t, 0, 3) : t < 86 ? 0.75 : 0.75 * (1 - env(t, 86, 90)));

// Pad: detuned saws through a slow low-pass.
{
  const phases = new Float64Array(9);
  let lpL = 0;
  let lpR = 0;
  for (let n = 0; n < N; n++) {
    const t = n / SR;
    const ch = chordAt(t);
    let sl = 0;
    let sr = 0;
    for (let v = 0; v < 3; v++) {
      for (let d = 0; d < 3; d++) {
        const idx = v * 3 + d;
        const f = hz(ch[v] - 12) * (1 + (d - 1) * 0.004);
        phases[idx] = (phases[idx] + f / SR) % 1;
        const s = phases[idx] * 2 - 1;
        if (d === 0) sl += s;
        else if (d === 2) sr += s;
        else {
          sl += s * 0.5;
          sr += s * 0.5;
        }
      }
    }
    const tension = t < 9.4 ? 0.02 + env(t, 4, 9.3) * 0.06 : 0.035 + Math.sin(t * 0.4) * 0.01;
    lpL += (sl - lpL) * tension;
    lpR += (sr - lpR) * tension;
    const g = padLevel(t) * 0.05;
    L[n] += lpL * g;
    R[n] += lpR * g;
  }
}

// Sub-bass on the chord root, eighth-note pulse.
{
  let ph = 0;
  for (let n = 0; n < N; n++) {
    const t = n / SR;
    const d = drums(t);
    if (!d) continue;
    const f = hz(chordAt(t)[0] - 24);
    ph = (ph + f / SR) % 1;
    const gate = Math.exp(-((t % (BEAT / 2)) / (BEAT / 2)) * 3);
    const v = Math.sin(2 * Math.PI * ph) * gate * 0.22 * d;
    L[n] += v;
    R[n] += v;
  }
}

// Kick, hats, claps, arp.
for (let b = 0; b * BEAT < DUR; b++) {
  const t = b * BEAT;
  const d = drums(t + 0.01);
  if (!d) continue;
  // Kick
  const len = 0.4 * SR;
  for (let n = 0; n < len; n++) {
    const x = n / SR;
    const v = Math.sin(2 * Math.PI * (45 * x + (95 / 30) * (1 - Math.exp(-x * 30)))) * Math.exp(-x * 9) * 0.55 * d;
    add(Math.round(t * SR) + n, v, v);
  }
  // Hats on the off-beat
  if (t > 24) for (let n = 0; n < 0.05 * SR; n++) add(Math.round((t + BEAT / 2) * SR) + n, noise() * Math.exp(-n / (0.008 * SR)) * 0.07 * d, noise() * Math.exp(-n / (0.008 * SR)) * 0.07 * d);
  // Clap on 2 and 4
  if (b % 2 === 1 && t > 24) {
    let lp = 0;
    for (let n = 0; n < 0.18 * SR; n++) {
      lp += (noise() - lp) * 0.5;
      const v = lp * Math.exp(-n / (0.04 * SR)) * 0.22 * d;
      add(Math.round(t * SR) + n, v, v * 0.9);
    }
  }
  // Arp: chord tones in sixteenths, two octaves up
  if ((t >= 24 && t < 47) || (t >= 57 && t < 83)) {
    const ch = chordAt(t);
    for (let s = 0; s < 2; s++) {
      const note = ch[(b * 2 + s) % 3] + 12 + ((b >> 2) % 2) * 12;
      const at = t + s * (BEAT / 2);
      const f = hz(note);
      for (let n = 0; n < 0.22 * SR; n++) {
        const x = n / SR;
        const v = (Math.sin(2 * Math.PI * f * x) + 0.3 * Math.sin(4 * Math.PI * f * x)) * Math.exp(-x * 14) * 0.05;
        const pan = s ? 0.3 : 0.7;
        add(Math.round(at * SR) + n, v * pan * 2, v * (1 - pan) * 2);
      }
    }
  }
}

// Focus scene: a clock ticking under a near-silent mix.
for (let t = 47.4; t < 53.7; t += 0.5) tick(t, 0.12);

/* ---------------- Cues (seconds on the master timeline) ---------------- */
for (let i = 0; i < 44; i++) blip(0.3 + i * 0.12 + (Math.sin(i * 7) + 1) * 0.1, 500 + (i % 7) * 90, 0.05 + i * 0.002, 40);
riser(5.0, 9.5, 0.4);
whoosh(7.9, 1.0, 0.45);
impact(9.55, 1.1);
chime(9.75, 0.25);
[13.9, 24.0, 36.0, 46.9, 57.0, 73.0, 76.4, 79.6].forEach((t, i) => whoosh(t, 0.75, 0.42, i % 2 ? -1 : 1));
// Board
click(19.95);
click(21.05, 0.25);
blip(21.8, 1500, 0.1, 18);
// Score
for (let i = 0; i < 7; i++) blip(24.9 + i * 0.3, 700 + i * 120, 0.08, 30);
riser(28.4, 29.45, 0.3);
impact(29.45, 0.9);
blip(32.35, 1600, 0.12, 20);
whoosh(32.6, 0.8, 0.3);
// Smart Start
click(37.7, 0.45);
impact(37.72, 0.5);
for (let i = 0; i < 10; i++) blip(37.9 + i * 0.05, 900 + i * 60, 0.06, 35);
for (let i = 0; i < 3; i++) blip(39.2 + i * 0.22, 1300 + i * 200, 0.1, 22);
whoosh(40.0, 0.9, 0.3);
for (let i = 0; i < 3; i++) blip(41.8 + i * 0.25, 1100, 0.06, 30);
click(45.15, 0.45);
impact(45.2, 0.45);
// Focus
[48.9, 49.8, 50.8, 51.6, 52.4].forEach((t, i) => blip(t, hz(76 + [0, 3, 7, 10, 12][i]), 0.13, 16));
click(53.75, 0.5);
impact(53.77, 1.0);
chime(53.85, 0.3);
whoosh(54.6, 0.8, 0.3);
// Agent
for (let i = 0; i < 26; i++) tick(57.7 + i * 0.062 + Math.sin(i * 3) * 0.012, 0.11);
click(59.5, 0.3);
whoosh(59.5, 0.5, 0.2);
[60.15, 60.85, 61.55, 62.15, 63.45, 64.25].forEach((t) => {
  blip(t, 980, 0.07, 30);
  blip(t + 0.5, 1470, 0.08, 25);
});
for (let i = 0; i < 5; i++) blip(62.35 + i * 0.2, 1200 + i * 80, 0.06, 30);
blip(65.15, 880, 0.12, 10);
click(66.35, 0.4);
chime(66.45, 0.18);
click(69.25, 0.4);
riser(69.3, 70.6, 0.18);
whoosh(70.6, 0.6, 0.3, -1);
whoosh(71.9, 0.8, 0.25);
// Everywhere
click(73.85, 0.3);
blip(73.9, 600, 0.12, 12);
click(74.95, 0.35);
for (let i = 0; i < 8; i++) blip(77.0 + i * 0.16, 700 + i * 70, 0.06, 30);
chime(78.0, 0.22);
for (let i = 0; i < 3; i++) whoosh(79.75 + i * 0.2, 0.6, 0.18);
blip(81.6, 500, 0.08, 10);
// Finale
riser(81.0, 83.0, 0.4);
[83.0, 83.62, 84.24, 84.86].forEach((t) => impact(t, 0.75));
impact(85.53, 1.3);
chime(85.7, 0.3);

/* ---------------- Master ---------------- */
let peak = 0;
for (let n = 0; n < N; n++) {
  L[n] = Math.tanh(L[n] * 1.2);
  R[n] = Math.tanh(R[n] * 1.2);
  peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
}
const norm = 0.89 / peak;
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + N * 4, 4);
buf.write('WAVEfmt ', 8);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(N * 4, 40);
for (let n = 0; n < N; n++) {
  const fade = Math.min(1, n / (SR * 0.02), (N - n) / (SR * 0.5));
  buf.writeInt16LE(Math.round(L[n] * norm * fade * 32767), 44 + n * 4);
  buf.writeInt16LE(Math.round(R[n] * norm * fade * 32767), 46 + n * 4);
}
fs.mkdirSync('public', { recursive: true });
fs.writeFileSync('public/soundtrack.wav', buf);
console.log(`public/soundtrack.wav · ${DUR}s · peak normalised`);
