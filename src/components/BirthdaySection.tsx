import { useSyncExternalStore } from 'react';
import { Card, Icon, IconButton, Input, Kicker, Well } from '../ui';
import { birthdayWords, readBirthday, setBirthday, subscribeBirthday } from '../lib/birthday';

/**
 * Settings → App → Your birthday (29-1P14b, idea 109): the one date the
 * Dashboard's greeting needs to dress up for him. The same on both devices
 * (`lib/birthdaySync.ts`), like the dark tint. Only the day and month are
 * kept; the picker's year is whatever he picks and is thrown away — shown as
 * 2000, a leap year, so 29 February can be picked back.
 */
export default function BirthdaySection() {
  const birthday = useSyncExternalStore(subscribeBirthday, readBirthday);
  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
        <Kicker trail="both devices">Your birthday</Kicker>
        <Well pad="var(--sp-3) var(--sp-5)">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)', flexWrap: 'wrap', padding: 'var(--sp-2) 0' }}>
            <span style={{ display: 'flex', flex: '0 0 auto', marginTop: 2, color: 'var(--fg-4)' }}>
              <Icon name="calendar" size={16} />
            </span>
            <div style={{ minWidth: 200, display: 'grid', gap: 2, flex: 1 }}>
              <span style={{ font: 'var(--type-body)', color: 'var(--fg-2)' }}>
                {birthday ? birthdayWords(birthday) : 'Not set'}
              </span>
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
                On the day, the Dashboard says happy birthday. Only the day and month are kept, never the year.
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
              <Input
                type="date"
                size="sm"
                block={false}
                aria-label="Your birthday"
                value={birthday ? `2000-${birthday}` : ''}
                onChange={(e) => setBirthday(e.target.value || null)}
              />
              {birthday && (
                <IconButton label="Clear your birthday" variant="ghost" size="sm" onClick={() => setBirthday(null)}>
                  <Icon name="x" size={16} />
                </IconButton>
              )}
            </div>
          </div>
        </Well>
      </div>
    </Card>
  );
}
