/**
 * Diagnostics — every Google connection and sync attempt, in order (OPT-8).
 *
 * Moved whole from the foot of Notifications, his words: *"Take diagnostics in
 * the notification page and put it into settings page."* It sits on Settings →
 * Connections because it is the Google connection's log. The log itself is
 * `lib/googleDiagnostics.ts`, unchanged. Its `INFO` / `WARN` / `ERROR` keep
 * their capitals: that is a machine's log line, not a label.
 *
 * Notifications used to open it by itself when a reconnect failed; the failure
 * line there now says where the log is instead.
 */
import { useEffect, useState } from 'react';
import { Button, Card, Icon, IconButton, StatusPill, Well } from '../ui';
import {
  subscribeDiagnostics,
  clearDiagnostics,
  formatDiagnosticsForCopy,
  type DiagEntry,
} from '../lib/googleDiagnostics';

/** Diagnostics level → the token that carries it. Info is deliberately hueless. */
const DIAG_LOOK: Record<DiagEntry['level'], string> = {
  info: 'var(--fg-4)',
  warn: 'var(--status-warn)', /* quiet: grey, 29-1P2c2 */
  error: 'var(--status-overrun)',
};

export default function GoogleDiagnosticsCard() {
  const [diagEntries, setDiagEntries] = useState<DiagEntry[]>([]);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [copiedDiag, setCopiedDiag] = useState(false);

  useEffect(() => subscribeDiagnostics(setDiagEntries), []);

  const handleCopyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(formatDiagnosticsForCopy());
      setCopiedDiag(true);
      setTimeout(() => setCopiedDiag(false), 1800);
    } catch {
      setCopiedDiag(false);
    }
  };

  const diagIssueCount = diagEntries.filter((e) => e.level !== 'info').length;

  return (
    <Card>
      <div style={{ display: 'grid' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setShowDiagnostics((v) => !v)}
            aria-expanded={showDiagnostics}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-5)',
              flex: 1, minWidth: 200, border: 0, padding: 0,
              background: 'transparent', textAlign: 'left', cursor: 'pointer',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: 'grid', placeItems: 'center', width: 34, height: 34, flex: '0 0 auto',
                borderRadius: '50%', backgroundImage: 'var(--glass-fill-2)',
                boxShadow: 'var(--glass-rim-1)', color: 'var(--fg-3)',
              }}
            >
              <Icon name="stethoscope" size={17} />
            </span>
            <span style={{ display: 'grid', gap: 'var(--sp-2)', minWidth: 0, flex: 1 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
                <span style={{ font: 'var(--type-label)', color: 'var(--fg-1)' }}>Diagnostics</span>
                {diagIssueCount > 0 && (
                  <StatusPill size="sm" status="overrun">
                    {diagIssueCount} issue{diagIssueCount === 1 ? '' : 's'}
                  </StatusPill>
                )}
              </span>
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)', textWrap: 'pretty' }}>
                Detailed log of every Google connection &amp; sync attempt — pinpoints exactly what failed.
              </span>
            </span>
            <span
              aria-hidden="true"
              style={{
                display: 'flex', flex: '0 0 auto', color: 'var(--fg-4)',
                transform: showDiagnostics ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform var(--dur-base) var(--ease-glass)',
              }}
            >
              <Icon name="chevron-down" size={16} />
            </span>
          </button>

          {diagEntries.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flex: '0 0 auto' }}>
              <Button
                variant="ghost"
                size="sm"
                iconLeft={<Icon name={copiedDiag ? 'check' : 'copy'} size={15} />}
                onClick={handleCopyDiagnostics}
                title="Copy the full diagnostics log to share"
              >
                {copiedDiag ? 'Copied' : 'Copy'}
              </Button>
              <IconButton
                label="Clear the diagnostics log"
                title="Clear the diagnostics log"
                variant="ghost"
                size="sm"
                onClick={() => clearDiagnostics()}
              >
                <Icon name="trash-2" size={15} />
              </IconButton>
            </div>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateRows: showDiagnostics ? '1fr' : '0fr',
            transition: 'grid-template-rows var(--dur-base) var(--ease-glass)',
          }}
        >
          <div style={{ overflow: 'hidden', minHeight: 0 }}>
            <div style={{ paddingTop: 'var(--sp-6)' }}>
              {diagEntries.length === 0 ? (
                <Well pad="var(--sp-8)">
                  <p style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textAlign: 'center', textWrap: 'pretty' }}>
                    No diagnostics yet — connection and sync events will be logged here as they happen.
                  </p>
                </Well>
              ) : (
                <div
                  className="ag-scroll ag-fade"
                  style={{
                    display: 'grid', gap: 'var(--sp-3)',
                    maxHeight: 320, overflowY: 'auto', overscrollBehavior: 'contain',
                  }}
                >
                  {[...diagEntries].reverse().map((e) => (
                    <Well key={e.id} pad="var(--sp-4) var(--sp-5)" style={{ borderRadius: 'var(--r-sm)' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-4)' }}>
                        <span
                          aria-hidden="true"
                          style={{
                            flex: '0 0 auto', marginTop: 6, width: 6, height: 6, borderRadius: '50%',
                            background: DIAG_LOOK[e.level],
                          }}
                        />
                        <div style={{ minWidth: 0, flex: 1, display: 'grid', gap: 2 }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
                            <span
                              style={{
                                font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)',
                                textTransform: 'uppercase', color: DIAG_LOOK[e.level],
                              }}
                            >
                              {e.level}
                            </span>
                            <span style={{ font: 'var(--type-kicker)', color: 'var(--fg-4)' }}>
                              {e.phase}/{e.code}
                            </span>
                            <span
                              style={{
                                marginLeft: 'auto', font: 'var(--type-kicker)', color: 'var(--fg-4)',
                                fontVariantNumeric: 'tabular-nums',
                              }}
                            >
                              {new Date(e.time).toLocaleString(undefined, {
                                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit',
                              })}
                            </span>
                          </div>
                          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-2)', textWrap: 'pretty', overflowWrap: 'anywhere' }}>
                            {e.message}
                          </span>
                          {e.detail && (
                            <span
                              style={{
                                font: 'var(--type-kicker)', color: 'var(--fg-4)',
                                textWrap: 'pretty', overflowWrap: 'anywhere',
                              }}
                            >
                              {e.detail}
                            </span>
                          )}
                        </div>
                      </div>
                    </Well>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
