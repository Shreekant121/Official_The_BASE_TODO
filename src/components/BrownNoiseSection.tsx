/**
 * Settings → Brown noise.
 *
 * Shreekant's request, 2026-09-15, after auditioning the generated sound:
 * *"allow me to customize the sound of the brown noise through the settings
 * app, create a new section called brown noise"*.
 *
 * **It is an audition, not a form.** Every control here changes what you are
 * hearing while you hold it — that is the whole reason this is its own section
 * rather than three rows filed under App. You cannot pick a low-pass cutoff
 * from a number; you pick it by dragging until it sounds right, which means
 * the sound has to be running while you drag. `Preview` is therefore the first
 * control and not the last.
 *
 * Nothing here is saved on a button. `lib/brownNoise.ts` writes every change
 * through to `localStorage` as it is made, and a Save button would imply the
 * thing you are listening to is not yet the thing you will get.
 *
 * WHY THE PREVIEW STOPS ITSELF ON THE WAY OUT
 * --------------------------------------------
 * The noise deliberately survives a route change (Q8 — it keeps playing while
 * you check a project, and the floating nav is where you mute it). That is
 * right for a *focus session* and wrong for an *audition*: leaving Settings
 * with the preview still running would be the app making noise for no reason,
 * with the only off switch on the screen you just left. So this component
 * remembers whether IT was the thing that started the sound, and stops it on
 * unmount only in that case — a session started from Focus Mode is never
 * touched.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Card, FieldLabel, Icon, SegmentedControl, Slider, Switch, Waveform, Well } from '../ui';
import {
  getNoisePrefs,
  isNoisePlaying,
  noiseSupported,
  setNoisePrefs,
  startNoise,
  stopNoise,
  subscribeNoise,
  type NoisePrefs,
  type NoiseVariant,
} from '../lib/brownNoise';

/** The three sources, with the spectral slope that actually distinguishes them. */
const VARIANTS: Array<{ id: NoiseVariant; name: string; slope: string; blurb: string }> = [
  { id: 'brown', name: 'Brown', slope: '−6 dB/oct', blurb: 'Deep and rumbling. The one people mean.' },
  { id: 'pink', name: 'Pink', slope: '−3 dB/oct', blurb: 'Brighter. Closer to steady rain.' },
  { id: 'white', name: 'White', slope: '0 dB/oct', blurb: 'Flat and hissy. For reference.' },
];

function formatHz(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${Math.round(hz)} Hz`;
}

/**
 * A visible name above a `Slider`.
 *
 * `Slider.label` is the ACCESSIBLE name and nothing else — its own prop
 * comment says the track has no visible text — so three bare sliders here read
 * as three anonymous tracks with numbers under them. `hint` carries the unit
 * the readouts cannot say for themselves.
 */
function LabelledSlider({ name, hint, children }: { name: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-4)' }}>
        <span
          style={{
            font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
            textTransform: 'var(--kicker-transform)' as CSSProperties['textTransform'], color: 'var(--fg-3)',
          }}
        >
          {name}
        </span>
        {hint && <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export default function BrownNoiseSection() {
  const [prefs, setPrefs] = useState<NoisePrefs>(() => getNoisePrefs());
  const [playing, setPlaying] = useState(() => isNoisePlaying());
  /* Whether the sound currently running was started by this screen. See the
     note at the top — it is what makes leaving safe without making Focus
     Mode's session fragile. */
  const startedHere = useRef(false);

  useEffect(() => subscribeNoise(setPlaying), []);

  useEffect(() => () => {
    if (startedHere.current) stopNoise();
  }, []);

  const patch = (p: Partial<NoisePrefs>) => setPrefs(setNoisePrefs(p));

  const togglePreview = () => {
    if (playing) {
      stopNoise();
      startedHere.current = false;
    } else {
      startNoise();
      startedHere.current = true;
    }
  };

  if (!noiseSupported()) {
    return (
      <Card>
        <FieldLabel>Brown noise</FieldLabel>
        <p style={{ margin: 'var(--sp-4) 0 0', font: 'var(--type-body)', color: 'var(--fg-3)' }}>
          This browser cannot generate audio, so there is nothing to set here.
        </p>
      </Card>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--gap-section)' }}>

      {/* ── The switch, and the audition ──────────────────────────── */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <FieldLabel>Brown noise</FieldLabel>
            <p style={{ margin: 'var(--sp-3) 0 0', font: 'var(--type-body)', color: 'var(--fg-3)' }}>
              Plays while you work in Focus. Generated on this device — no download, works offline,
              and it never repeats audibly.
            </p>
          </div>
          <Switch
            checked={prefs.enabled}
            onChange={(v) => patch({ enabled: v })}
            label={prefs.enabled ? 'On' : 'Off'}
          />
        </div>

        {/* The audition bar. `Waveform` is the system's own "this is live"
            reading, so the running state needs no invented indicator. */}
        <Well style={{ marginTop: 'var(--sp-6)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={togglePreview}
              aria-pressed={playing}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)',
                padding: 'var(--sp-3) var(--sp-5)', borderRadius: 'var(--r-pill)',
                border: 0, cursor: 'pointer',
                backgroundImage: 'var(--glass-fill-3)',
                boxShadow: 'var(--glass-rim-2)',
                color: 'var(--fg-1)', font: 'var(--type-label)',
              }}
            >
              <Icon name={playing ? 'pause' : 'play'} size={15} />
              {playing ? 'Stop preview' : 'Preview'}
            </button>
            <Waveform active={playing} bars={22} height={26} label="Noise level" />
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', marginLeft: 'auto' }}>
              {playing ? 'Playing' : 'Silent'}
            </span>
          </div>
        </Well>
      </Card>

      {/* ── The sound itself ──────────────────────────────────────── */}
      <Card>
        <FieldLabel>The sound</FieldLabel>

        <div
          style={{
            display: 'grid', gap: 'var(--sp-4)', marginTop: 'var(--sp-5)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          }}
        >
          {VARIANTS.map((v) => {
            const on = prefs.variant === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => patch({ variant: v.id })}
                aria-pressed={on}
                style={{
                  textAlign: 'left', cursor: 'pointer', border: 0,
                  padding: 'var(--sp-5)', borderRadius: 'var(--r-md)',
                  display: 'grid', gap: 2,
                  backgroundImage: on ? 'var(--glass-tint-accent)' : 'var(--glass-well)',
                  boxShadow: on
                    ? 'var(--glass-rim-2), var(--glow-accent-sm)'
                    : 'var(--glass-well-shadow), 0 0 0 1px var(--line-faint)',
                }}
              >
                <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)' }}>{v.name}</span>
                <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--accent)' }}>
                  {v.slope}
                </span>
                <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>{v.blurb}</span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'grid', gap: 'var(--sp-7)', marginTop: 'var(--sp-7)' }}>
          <LabelledSlider name="Tone" hint="low-pass cutoff">
            <Slider
              label="Tone"
              value={prefs.toneHz}
              min={120}
              max={16000}
              step={20}
              format={(v) => formatHz(v)}
              valueText={formatHz(prefs.toneHz)}
              onValueChange={(v) => patch({ toneHz: v })}
            />
          </LabelledSlider>
          {/* The one number here nobody could guess, and the reason the slider
              goes as low as 120 Hz. */}
          <p style={{ margin: 0, font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
            Most commercial brown-noise tracks are filtered near 500 Hz. Drag Tone down there while
            the preview runs to compare.
          </p>

          <LabelledSlider name="Level" hint="how loud">
            <Slider
              label="Level"
              value={Math.round(prefs.level * 100)}
              min={0}
              max={100}
              format={(v) => `${v}%`}
              valueText={`${Math.round(prefs.level * 100)} percent`}
              onValueChange={(v) => patch({ level: v / 100 })}
            />
          </LabelledSlider>

          <LabelledSlider name="Fade" hint="in and out">
            <Slider
              label="Fade"
              value={prefs.fadeSeconds}
              min={0}
              max={12}
              step={0.5}
              format={(v) => `${v.toFixed(1)}s`}
              valueText={`${prefs.fadeSeconds.toFixed(1)} seconds`}
              onValueChange={(v) => patch({ fadeSeconds: v })}
            />
          </LabelledSlider>
        </div>
      </Card>

      {/* ── When it plays ─────────────────────────────────────────── */}
      <Card>
        <FieldLabel>When it plays</FieldLabel>

        <div style={{ marginTop: 'var(--sp-5)' }}>
          <SegmentedControl
            value={prefs.mode}
            onChange={(v) => patch({ mode: v as NoisePrefs['mode'] })}
            options={[
              { value: 'task', label: 'Follows the task' },
              { value: 'pomodoro', label: 'Focus / break cycle' },
            ]}
          />
        </div>

        {prefs.mode === 'task' ? (
          <p style={{ margin: 'var(--sp-5) 0 0', font: 'var(--type-body)', color: 'var(--fg-3)' }}>
            Fades in when you start a task and out when you finish or pause it. No second timer —
            it follows the countdown already on the Focus screen.
          </p>
        ) : (
          <>
            <p style={{ margin: 'var(--sp-5) 0 var(--sp-6)', font: 'var(--type-body)', color: 'var(--fg-3)' }}>
              Plays through each focus block, fades out for the break, and comes back. The task's own
              countdown keeps running underneath — this only decides when there is sound.
            </p>
            <div style={{ display: 'grid', gap: 'var(--sp-7)' }}>
              <LabelledSlider name="Focus block">
                <Slider
                  label="Focus block"
                  value={prefs.focusMinutes}
                  min={5}
                  max={120}
                  step={5}
                  format={(v) => `${v} min`}
                  valueText={`${prefs.focusMinutes} minutes`}
                  onValueChange={(v) => patch({ focusMinutes: v })}
                />
              </LabelledSlider>
              <LabelledSlider name="Break">
                <Slider
                  label="Break"
                  value={prefs.breakMinutes}
                  min={1}
                  max={30}
                  format={(v) => `${v} min`}
                  valueText={`${prefs.breakMinutes} minutes`}
                  onValueChange={(v) => patch({ breakMinutes: v })}
                />
              </LabelledSlider>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
