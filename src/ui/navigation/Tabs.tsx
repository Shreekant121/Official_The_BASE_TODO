/**
 * Aurora Glass — Tabs
 * Ported from design-system/components/navigation/Tabs.{jsx,d.ts}.
 * Guidance: design-system/components/navigation/Tabs.prompt.md
 *
 * Text-led tabs with an underline that slides. For in-page section
 * switching where SegmentedControl would be too heavy.
 *
 * The design system draws a firm line between the three exclusive
 * controls, and it is worth not re-litigating:
 *   Tabs              → content SECTIONS, sliding underline.
 *   SegmentedControl  → MODES (Daily / Weekly), recessed trough.
 *   MiniNav           → top-level navigation, floats.
 *
 * Works controlled (`value` + `onChange`) or uncontrolled.
 */
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

export interface Tab {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  /** Mono count shown after the label. */
  count?: number;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  tabs: Array<string | Tab>;
  value?: string;
  onChange?: (value: string) => void;
}

export function Tabs({ tabs = [], value, onChange, className = '', style, ...rest }: TabsProps) {
  const items: Tab[] = tabs.map((t) => (typeof t === 'string' ? { value: t, label: t } : t));
  const [internal, setInternal] = useState<string>(items[0]?.value ?? '');
  const current = value !== undefined ? value : internal;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [bar, setBar] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const el = refs.current[current];
    if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth });
  }, [current, items.length]);

  const pick = (v: string) => {
    if (value === undefined) setInternal(v);
    onChange?.(v);
  };

  const shell: CSSProperties = {
    position: 'relative',
    display: 'flex',
    gap: 'var(--sp-7)',
    borderBottom: '1px solid var(--line-soft)',
    ...style,
  };

  return (
    <div role="tablist" className={className} style={shell} {...rest}>
      {items.map((t) => {
        const on = t.value === current;
        return (
          <button
            key={t.value}
            role="tab"
            type="button"
            aria-selected={on}
            ref={(el) => { refs.current[t.value] = el; }}
            onClick={() => pick(t.value)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--sp-3)',
              padding: 'var(--sp-4) 0',
              border: 0,
              background: 'transparent',
              color: on ? 'var(--fg-1)' : 'var(--fg-3)',
              font: 'var(--type-label)',
              fontSize: 'var(--text-md)',
              cursor: 'pointer',
              transition: 'color var(--dur-base) var(--ease-glass)',
            }}
          >
            {t.icon}
            {t.label}
            {t.count != null && (
              <span
                style={{
                  font: 'var(--type-numeric)',
                  fontSize: 'var(--text-xs)',
                  color: on ? 'var(--accent)' : 'var(--fg-4)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          bottom: -1,
          left: bar.left,
          width: bar.width,
          height: 2,
          borderRadius: 'var(--r-pill)',
          background: 'var(--accent)',
          boxShadow: '0 0 12px -1px var(--accent)',
          transition: 'left var(--dur-base) var(--ease-morph), width var(--dur-base) var(--ease-morph)',
        }}
      />
    </div>
  );
}
