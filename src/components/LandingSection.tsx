import { useSyncExternalStore } from 'react';
import { Card, Icon, Kicker, Switch, Well } from '../ui';
import { readLanding, subscribeLanding, writeLanding } from '../lib/landingPref';

/**
 * Settings → App → Opens on (BIG-6): the Dashboard or Home, per device.
 * `lib/landingPref.ts` holds the rule.
 */
export default function LandingSection() {
  const landing = useSyncExternalStore(subscribeLanding, readLanding);
  const label = 'Open on the Dashboard';
  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
        <Kicker trail="this device only">Opens on</Kicker>
        <Well pad="var(--sp-2) var(--sp-5)">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)', minHeight: 44, padding: 'var(--sp-3) 0' }}>
            <span style={{ display: 'flex', flex: '0 0 auto', marginTop: 2, color: 'var(--fg-4)' }}>
              <Icon name="layout-dashboard" size={16} />
            </span>
            <div style={{ minWidth: 0, display: 'grid', gap: 2, flex: 1 }}>
              <span style={{ font: 'var(--type-body)', color: 'var(--fg-2)' }}>{label}</span>
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
                {landing === 'dashboard'
                  ? 'BASE opens on your Dashboard. Turn this off to open on Home, with your projects.'
                  : 'BASE opens on Home, with your projects. The Dashboard is the first button in the nav.'}
              </span>
            </div>
            <Switch
              size="sm"
              checked={landing === 'dashboard'}
              onChange={(on) => writeLanding(on ? 'dashboard' : 'home')}
              aria-label={label}
            />
          </div>
        </Well>
      </div>
    </Card>
  );
}
