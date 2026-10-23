import { useSyncExternalStore } from 'react';
import { Card, Icon, Kicker, Switch, Well, type IconName } from '../ui';
import { readSpeedPref, subscribeSpeedPrefs, writeSpeedPref, type SpeedPref } from '../lib/speedPrefs';

/**
 * Settings → App → Speed: the two device-only switches in `lib/speedPrefs.ts`.
 * The copy says what each one costs to look at, because the point is a fair
 * trade on one device, not a hidden downgrade.
 */
export default function SpeedSection() {
  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
        <Kicker trail="this device only">Speed</Kicker>
        <Well pad="var(--sp-2) var(--sp-5)">
          <SpeedRow
            pref="meter"
            icon="activity"
            label="Show frame rate"
            note="A small counter in the corner. Scroll a long screen and read it: 60 is smooth, and every “slow” is a hitch you can see."
          />
          <div style={{ borderTop: '1px solid var(--line-faint)' }} />
          <SpeedRow
            pref="blur"
            icon="layers"
            label="Glass blur"
            note="The frost behind glass. The glass is nearly solid now, so off looks almost the same and saves the most while scrolling."
          />
        </Well>
      </div>
    </Card>
  );
}

function SpeedRow({ pref, icon, label, note }: { pref: SpeedPref; icon: IconName; label: string; note: string }) {
  const on = useSyncExternalStore(subscribeSpeedPrefs, () => readSpeedPref(pref));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)', minHeight: 44, padding: 'var(--sp-3) 0' }}>
      <span style={{ display: 'flex', flex: '0 0 auto', marginTop: 2, color: 'var(--fg-4)' }}>
        <Icon name={icon} size={16} />
      </span>
      <div style={{ minWidth: 0, display: 'grid', gap: 2, flex: 1 }}>
        <span style={{ font: 'var(--type-body)', color: 'var(--fg-2)' }}>{label}</span>
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>{note}</span>
      </div>
      <Switch size="sm" checked={on} onChange={(v) => writeSpeedPref(pref, v)} aria-label={label} />
    </div>
  );
}
