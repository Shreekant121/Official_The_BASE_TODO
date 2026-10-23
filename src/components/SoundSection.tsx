import { useState } from 'react';
import { Card, Icon, Kicker, SegmentedControl, Slider, SoftButton, Switch, Well } from '../ui';
import { cue, setSoundPrefs, useSoundPrefs, type SoundStyle } from '../lib/sound';
import { buzz, canBuzz } from '../lib/haptics';

/**
 * Settings → App → Sound (29-1P3): BASE's own sounds and buzzes, on by default
 * everywhere (his call, 2026-09-30), one switch for both, the three styles from
 * the ideas page and a volume. Device-only, like Speed — a volume is about this
 * device's speaker.
 *
 * TEST BUZZ, because nobody knows yet whether his tablet has a motor (he was
 * "not sure", 2026-10-07). It plays the session-end rhythm, the longest, and
 * says plainly that feeling nothing means this device cannot buzz. It works
 * with the switch off too: it is a question about the device, not a setting.
 */
const STYLES: Array<{ value: SoundStyle; label: string }> = [
  { value: 'glass', label: 'Glass' },
  { value: 'wood', label: 'Wood' },
  { value: 'pop', label: 'Pop' },
];

export default function SoundSection() {
  const prefs = useSoundPrefs();
  const [tested, setTested] = useState(false);

  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
        <Kicker trail="this device only">Sound</Kicker>
        <Well pad="var(--sp-2) var(--sp-5)">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)', minHeight: 44, padding: 'var(--sp-3) 0' }}>
            <span style={{ display: 'flex', flex: '0 0 auto', marginTop: 2, color: 'var(--fg-4)' }}>
              <Icon name="volume-2" size={16} />
            </span>
            <div style={{ minWidth: 0, display: 'grid', gap: 2, flex: 1 }}>
              <span style={{ font: 'var(--type-body)', color: 'var(--fg-2)' }}>Sounds and buzzes</span>
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
                A tick, a done, a start, a delete, a drag, the chime when a session ends. Off turns every one of them off.
              </span>
            </div>
            <Switch
              size="sm"
              checked={prefs.enabled}
              onChange={(v) => { setSoundPrefs({ enabled: v }); if (v) cue('done'); }}
              aria-label="Sounds and buzzes"
            />
          </div>

          {prefs.enabled && (
            <>
              <div style={{ borderTop: '1px solid var(--line-faint)' }} />
              <div style={{ display: 'grid', gap: 'var(--sp-3)', padding: 'var(--sp-4) 0' }}>
                <span style={{ font: 'var(--type-body)', color: 'var(--fg-2)' }}>Style</span>
                <SegmentedControl
                  look="soft"
                  size="sm"
                  options={STYLES}
                  value={prefs.style}
                  onChange={(v) => { setSoundPrefs({ style: v as SoundStyle }); cue('done'); }}
                  style={{ justifySelf: 'start' }}
                />
              </div>
              <div style={{ borderTop: '1px solid var(--line-faint)' }} />
              <div style={{ display: 'grid', gap: 'var(--sp-3)', padding: 'var(--sp-4) 0' }}>
                <span style={{ font: 'var(--type-body)', color: 'var(--fg-2)' }}>Volume</span>
                <Slider
                  tone="teal"
                  label="Volume"
                  value={Math.round(prefs.volume * 100)}
                  min={0}
                  max={100}
                  step={5}
                  format={(v) => (v === 0 ? 'Buzz only' : `${v}%`)}
                  valueText={`${Math.round(prefs.volume * 100)} percent`}
                  onValueChange={(v) => setSoundPrefs({ volume: v / 100 })}
                />
              </div>
            </>
          )}

          <div style={{ borderTop: '1px solid var(--line-faint)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minHeight: 44, padding: 'var(--sp-3) 0', flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', flex: '0 0 auto', color: 'var(--fg-4)' }}>
              <Icon name="smartphone" size={16} />
            </span>
            <span style={{ minWidth: 0, flex: 1, font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
              {!canBuzz()
                ? 'This browser cannot buzz, so sound does the job here.'
                : tested
                  ? 'Felt a long buzz? Then you will feel each kind. Felt nothing: this device has no motor, and sound does the job.'
                  : 'Not every tablet can buzz. Press to find out on this one.'}
            </span>
            {canBuzz() && (
              <SoftButton size="sm" onClick={() => { buzz('sessionEnd'); setTested(true); }}>
                Test buzz
              </SoftButton>
            )}
          </div>
        </Well>
      </div>
    </Card>
  );
}
