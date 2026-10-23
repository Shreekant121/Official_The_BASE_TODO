/**
 * `/design`'s "Waiting and notices" (29-1P14d1): the offline pill driven by a
 * pretend Wi-Fi switch, and a pile of pretend notices. Local state only —
 * nothing here touches the real connection, the real notices or his data.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BACK_HOLD_MS, PILL_IDLE, stepPill, type PillEvent, type PillState } from '../lib/connectionPill';
import { ConnectionPillView } from './OfflinePill';
import { Card, Icon, NoticeStack, NotificationCard, SoftButton, type IconName } from '../ui';

const kicker: CSSProperties = { font: 'var(--type-caption)', color: 'var(--fg-3)' };
const stage: CSSProperties = {
  padding: 'var(--sp-6)', borderRadius: 'var(--r-lg)', backgroundColor: 'var(--void-1)',
  boxShadow: 'var(--glass-rim-1)', display: 'grid', gap: 'var(--sp-4)', overflow: 'hidden',
};

const NOTICES: Array<{ icon: IconName; tone?: 'overrun'; title: string; body: string }> = [
  { icon: 'cloud-off', tone: 'overrun', title: 'Not connected to the cloud', body: 'Your changes are saved on this device only.' },
  { icon: 'calendar', tone: undefined, title: '2 deadlines moved', body: 'A prerequisite now finishes later, so each one was pushed to the day after it.' },
  { icon: 'refresh-cw', tone: undefined, title: 'A new version of BASE is ready', body: 'Reload when you are ready; nothing is lost.' },
  { icon: 'triangle-alert', tone: 'overrun', title: "Reminder didn't reach Google Calendar", body: 'The fourth waits its turn: at most three are piled.' },
];

export function NoticesSpecimen() {
  const [pill, setPill] = useState<PillState>(PILL_IDLE);
  const hide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showing, setShowing] = useState(3);

  useEffect(() => () => { if (hide.current) clearTimeout(hide.current); }, []);

  const send = (...events: PillEvent[]) => setPill((s) => events.reduce(stepPill, s));
  const toggleWifi = () => {
    if (hide.current) clearTimeout(hide.current);
    if (pill.phase === 'offline') {
      send({ type: 'online' }, { type: 'synced' });
      hide.current = setTimeout(() => send({ type: 'hide' }), BACK_HOLD_MS);
    } else {
      send({ type: 'offline' });
    }
  };

  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--sp-8)' }}>
        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <span style={kicker}>Offline, and it’s fine</span>
          <div style={{ ...stage, minHeight: 96, alignContent: 'start' }}>
            <ConnectionPillView state={pill} />
          </div>
          <span style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <SoftButton icon={<Icon name={pill.phase === 'offline' ? 'cloud-check' : 'wifi-off'} size={14} />} onClick={toggleWifi}>
              {pill.phase === 'offline' ? 'Wi-Fi back' : 'Lose the Wi-Fi'}
            </SoftButton>
            {pill.phase === 'offline' && (
              <SoftButton onClick={() => send({ type: 'change' })}>Make a change ({pill.changes})</SoftButton>
            )}
          </span>
        </div>

        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <span style={kicker}>Notices that stack</span>
          <div style={{ ...stage, minHeight: 240, alignContent: 'start' }}>
            <NoticeStack max={3} gap={12}>
              {NOTICES.map((n, i) => (
                <AnimatePresence key={n.title}>
                  {i < showing && (
                    <motion.div
                      initial={{ y: -40, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -40, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                      className="pointer-events-auto"
                    >
                      <NotificationCard
                        tone={n.tone}
                        icon={<Icon name={n.icon} size={16} />}
                        title={n.title}
                        body={n.body}
                        style={{ animation: 'none' }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              ))}
            </NoticeStack>
          </div>
          <span style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap' }}>
            <SoftButton icon={<Icon name="plus" size={14} />} disabled={showing >= NOTICES.length} onClick={() => setShowing((n) => n + 1)}>Another notice</SoftButton>
            <SoftButton icon={<Icon name="minus" size={14} />} disabled={showing <= 0} onClick={() => setShowing((n) => n - 1)}>One fewer</SoftButton>
          </span>
        </div>
      </div>
    </Card>
  );
}
