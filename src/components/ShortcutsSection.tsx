import { Card, Icon, Kicker, SoftButton, Well } from '../ui';
import { useOpenShortcutsHelp } from '../contexts/ShortcutsContext';

/**
 * Settings → App → Keyboard shortcuts (OPT-11, his call 2026-10-06): the
 * keyboard button left Home's island and lives here. It opens the same `?`
 * sheet, where the keys are still edited (BUILD-10); `?` and Ctrl+K →
 * "Keyboard shortcuts" still open it from anywhere.
 */
export default function ShortcutsSection() {
  const openHelp = useOpenShortcutsHelp();
  return (
    <Card>
      <div style={{ display: 'grid', gap: 'var(--sp-5)' }}>
        <Kicker trail="this device only">Keyboard shortcuts</Kicker>
        <Well pad="var(--sp-2) var(--sp-5)">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minHeight: 44, padding: 'var(--sp-3) 0' }}>
            <span style={{ display: 'flex', flex: '0 0 auto', color: 'var(--fg-4)' }}>
              <Icon name="keyboard" size={16} />
            </span>
            <div style={{ minWidth: 0, display: 'grid', gap: 2, flex: 1 }}>
              <span style={{ font: 'var(--type-body)', color: 'var(--fg-2)' }}>See and change your keys</span>
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
                Press ? anywhere for the same list.
              </span>
            </div>
            <SoftButton onClick={openHelp}>Open</SoftButton>
          </div>
        </Well>
      </div>
    </Card>
  );
}
