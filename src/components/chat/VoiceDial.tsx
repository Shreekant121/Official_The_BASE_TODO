/**
 * Which voice Atlas answers in, and whether it answers out loud (item 25).
 *
 * WHY THERE IS A PICKER AT ALL, WHICH WAS HIS CALL
 * -------------------------------------------------
 * Put the item's real question — *a generic voice that always works, or your
 * own voice through Chatterbox that needs the laptop awake and may not fit in
 * 8 GB* — Shreekant chose the device's own voices **and asked to choose which
 * one**, on 2026-09-14. So this is not a settings row somebody added for
 * completeness; it is the whole of his answer to item 25, and the reason
 * Chatterbox is not built.
 *
 * **The list itself is `VoicePicker`, and since DESIGN-1 it is shared with
 * dock mode.** Ninety-five voices, searched across all of them, tapped to
 * hear them, with a row for the one that has been uninstalled since he chose
 * it — that file holds the ordering, the search and the reasoning. Two places
 * choose a voice and there is one list.
 *
 * What stays here is everything around it: whether ordinary replies are read
 * aloud at all, and the way into dock mode.
 *
 * It renders into `Composer`'s `children` slot, which is documented there as
 * *"anything the page wants on the dial row"* — so the composer itself needed
 * no change to carry this, only for the microphone.
 */
import { useEffect, useRef, useState } from 'react';
import { Icon, MetaKicker, Switch } from '../../ui';
import { DialPill } from './Dial';
import { VoicePicker } from './VoicePicker';
import { stopSpeaking, type VoiceChoice } from '../../lib/voice/synthesis';

export interface VoiceDialProps {
  /** Every voice installed on this device. */
  all: VoiceChoice[];
  chosen: string | null;
  onChoose: (uri: string | null) => void;
  /** Whether ordinary replies are read aloud. Dock mode ignores this. */
  speaking: boolean;
  onSpeaking: (on: boolean) => void;
  /** Hand the screen over to dock mode. */
  onDock: () => void;
  /** False when the browser cannot speak; the pill is then not drawn. */
  supported: boolean;
}

export function VoiceDial({
  all,
  chosen,
  onChoose,
  speaking,
  onSpeaking,
  onDock,
  supported,
}: VoiceDialProps) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (wrapper.current && !wrapper.current.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  /* Closing the panel stops a preview mid-sentence. A voice still talking
     after its list has gone is the kind of thing that makes someone reach for
     the volume rocker rather than the app. */
  useEffect(() => {
    if (!open) stopSpeaking();
  }, [open]);

  if (!supported) return null;

  return (
    <div ref={wrapper} style={{ position: 'relative', display: 'inline-flex', flex: '0 0 auto' }}>
      <DialPill label="Voice" open={open} onClick={() => setOpen((cur) => !cur)}>
        <Icon name={speaking ? 'volume-2' : 'volume-x'} size={12} />
        Voice
      </DialPill>

      <div
        className="ag-scroll"
        role="dialog"
        aria-label="Voice"
        aria-hidden={!open}
        style={{
          position: 'absolute', bottom: 'calc(100% + var(--sp-4))', right: 0, width: 320, zIndex: 80,
          padding: 'var(--sp-7)', display: 'grid', gap: 'var(--sp-6)',
          maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', overscrollBehavior: 'contain',
          borderRadius: open ? 'var(--r-lg)' : 'var(--r-pill)',
          backgroundColor: 'oklch(0.145 0.004 260 / 0.97)', backgroundImage: 'var(--glass-fill-1)',
          border: '1px solid oklch(1 0 0 / 0.10)',
          backdropFilter: 'var(--glass-bd-lg)', WebkitBackdropFilter: 'var(--glass-bd-lg)',
          boxShadow: 'var(--glass-cast-3), var(--glass-inner-1)',
          transformOrigin: 'bottom right',
          transform: open ? 'scale(1) translateY(0)' : 'scale(0.86) translateY(10px)',
          opacity: open ? 1 : 0,
          visibility: open ? 'visible' : 'hidden',
          filter: open ? 'blur(0)' : 'blur(6px)',
          pointerEvents: open ? 'auto' : 'none',
          transition:
            'transform var(--dur-morph) var(--ease-morph),' +
            ' border-radius var(--dur-morph) var(--ease-morph),' +
            ' opacity var(--dur-fast) var(--ease-glass),' +
            ' filter var(--dur-fast) var(--ease-glass),' +
            ` visibility 0s linear ${open ? '0s' : 'var(--dur-fast)'}`,
        }}
      >
        <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
          <MetaKicker>Out loud</MetaKicker>
          <Switch
            checked={speaking}
            onChange={onSpeaking}
            label={<span style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)' }}>Read answers aloud</span>}
          />
          <p style={{ margin: 0, font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
            Off by default. Dock mode always speaks.
          </p>
        </div>

        {/* DESIGN-1 — the list is `VoicePicker` now, shared with dock mode:
            searchable across all 95, and it says so when a voice he chose is
            no longer installed. What used to be here was the same rows with
            no search and no answer to the second. */}
        <VoicePicker all={all} chosen={chosen} onChoose={onChoose} />

        <div style={{ display: 'grid', gap: 'var(--sp-4)', borderTop: '1px solid var(--stroke-1, oklch(1 0 0 / 0.08))', paddingTop: 'var(--sp-5)' }}>
          <MetaKicker>Hands-free</MetaKicker>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDock();
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', width: '100%',
              padding: 'var(--sp-4) var(--sp-5)', cursor: 'pointer', textAlign: 'left',
              borderRadius: 'var(--r-md)', border: 0,
              backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
              color: 'var(--fg-1)', font: 'var(--type-body)', fontSize: 'var(--text-sm)',
            }}
          >
            <Icon name="mic" size={16} />
            <span style={{ display: 'grid', gap: 2 }}>
              Dock mode
              <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
                Say “Atlas” and talk. Keep it plugged in.
              </span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
