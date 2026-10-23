/**
 * Settings → Atlas (OPT-8): the models behind Local and Cloud, and the voice.
 *
 * His words, from the BASE list: *"On the Ai page take voice below the chat
 * box and put it in settings"*, and *"there is a Ai model selector … shift it
 * to settings and in settings allow me to select a default local Ai model and
 * a Default Cloud Ai model"*. So the chat keeps a Local | Cloud switch
 * (`chat/ModelSideSwitch.tsx`) and this tab says which model each side means;
 * the composer's Voice pill — read answers aloud, which voice, Dock mode —
 * moved here whole, Dock mode as a button that opens the chat in it (his call
 * when asked, over an icon on the chat's header).
 *
 * **Everything here is this device only**, as it was on the chat: which models
 * the laptop can reach and which voices are installed are facts about the
 * machine in front of him (`modelStore.ts`, `devicePrefs.ts`). The two lists
 * are fetched when the tab opens, through the chat's own `useModelLists`, so
 * the harness's model fixture reaches this tab too.
 */
import { useNavigate } from 'react-router-dom';
import { Card, Icon, Kicker, SoftButton, Switch, Well, type IconName } from '../ui';
import ModelPicker from './ModelPicker';
import { VoicePicker } from './chat/VoicePicker';
import { useModelLists } from './chat/useModelLists';
import { useApiKeyStore } from '../lib/agent/apiKeys';
import { useUIStore } from '../store/useUIStore';
import { useVoiceChoice, useVoicePrefs } from '../lib/voice/useVoice';
import type { ModelSide } from '../lib/agent/models';

const SIDES: { side: ModelSide; icon: IconName; title: string; note: string }[] = [
  {
    side: 'local',
    icon: 'laptop',
    title: 'Local',
    note: 'Runs on your laptop, free, while it is awake.',
  },
  {
    side: 'cloud',
    icon: 'globe',
    title: 'Cloud',
    note: 'Gemini, Claude or ChatGPT. Works with the laptop shut.',
  },
];

/** One line of a card: glyph, words, and the control on the right. */
function Row({ icon, title, note, children }: { icon: IconName; title: string; note: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap', minHeight: 44, padding: 'var(--sp-3) 0' }}>
      <span style={{ display: 'flex', flex: '0 0 auto', color: 'var(--fg-4)' }}>
        <Icon name={icon} size={16} />
      </span>
      <div style={{ minWidth: 0, display: 'grid', gap: 2, flex: '1 1 180px' }}>
        <span style={{ font: 'var(--type-body)', color: 'var(--fg-2)' }}>{title}</span>
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>{note}</span>
      </div>
      <div style={{ flex: '1 1 240px', minWidth: 0, maxWidth: 360, display: 'flex', justifyContent: 'flex-end' }}>
        {children}
      </div>
    </div>
  );
}

export default function AtlasSettingsSection() {
  const navigate = useNavigate();
  useModelLists(useApiKeyStore((s) => s.activeId));

  const voice = useVoiceChoice();
  const speakReplies = useVoicePrefs((s) => s.speakReplies);
  const chooseSpeakReplies = useVoicePrefs((s) => s.chooseSpeakReplies);
  const setDockOpen = useUIStore((s) => s.setDockOpen);

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-7)' }}>
      <Card>
        <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
          <Kicker trail="this device only">Models</Kicker>
          <p style={{ margin: 0, font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
            The Local and Cloud switch under Atlas's chat box answers with these.
          </p>
          <Well pad="var(--sp-2) var(--sp-5)">
            {SIDES.map((one) => (
              <Row key={one.side} icon={one.icon} title={`Default ${one.title.toLowerCase()} model`} note={one.note}>
                <ModelPicker side={one.side} />
              </Row>
            ))}
          </Well>
        </div>
      </Card>

      {/* The Voice pill's popover, unchanged in substance: the switch, the
          one shared list (`VoicePicker`, also dock mode's), and the way into
          dock mode. Not drawn on a browser that cannot speak, as the pill
          was not. */}
      {voice.supported && (
        <Card>
          <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
            <Kicker trail="this device only">Voice</Kicker>
            <Well pad="var(--sp-2) var(--sp-5)">
              <Row icon={speakReplies ? 'volume-2' : 'volume-x'} title="Read answers aloud" note="Off by default. Dock mode always speaks.">
                <Switch size="sm" checked={speakReplies} onChange={chooseSpeakReplies} aria-label="Read answers aloud" />
              </Row>
            </Well>
            <VoicePicker all={voice.all} chosen={voice.chosen} onChoose={voice.choose} />
            <Well pad="var(--sp-2) var(--sp-5)">
              <Row icon="mic" title="Dock mode" note="Say “Atlas” and talk. Keep it plugged in.">
                <SoftButton
                  size="sm"
                  icon={<Icon name="mic" size={14} />}
                  onClick={() => {
                    setDockOpen(true);
                    navigate('/chat');
                  }}
                >
                  Open dock mode
                </SoftButton>
              </Row>
            </Well>
          </div>
        </Card>
      )}
    </div>
  );
}
