import React from 'react';
import {
  ArrowRight,
  CalendarBlank,
  Check,
  Clock,
  GearSix,
  House,
  Lightning,
  LockSimple,
  Medal,
  Bell,
  Sparkle,
  ArrowElbowDownRight,
} from '@phosphor-icons/react';
import { C, hue, type Hue } from '../theme';
import { Glass, Mark, Pill, Score, Well } from './primitives';

/** Editable copy for the end card. */
export const CTA = {
  tagline: 'Strict focus. One task at a time.',
  primary: 'Open source · MIT',
  secondary: 'github.com/Shreekant121/Official_The_BASE_TODO',
};

export type TaskData = {
  title: string;
  list?: string;
  score?: string;
  scoreHue?: Hue;
  pills?: { h: Hue; label: string }[];
  meta?: string;
  sub?: string;
  progress?: number;
  locked?: boolean;
  desc?: string;
};

export const TaskCard: React.FC<{
  task: TaskData;
  width?: number;
  style?: React.CSSProperties;
  glowHue?: Hue;
  glowK?: number;
  done?: number;
  compact?: boolean;
  /** No backdrop sampling — for cards flying in 3D, where it is costly and invisible. */
  flat?: boolean;
}> = ({ task, width = 380, style, glowHue, glowK = 0, done = 0, compact, flat }) => (
  <Glass radius={22} clear={flat ? 0.04 : 0.1} glowHue={glowHue} glowK={glowK} style={{ width, padding: compact ? '16px 20px' : '20px 22px', ...style }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
      {task.locked ? (
        <LockSimple size={22} weight="fill" color={C.fg3} style={{ marginTop: 2, flexShrink: 0 }} />
      ) : (
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 99,
            flexShrink: 0,
            marginTop: 1,
            border: done > 0 ? 'none' : `2px solid ${C.lineStrong}`,
            background: done > 0 ? hue('accent', done) : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `scale(${1 + Math.sin(done * Math.PI) * 0.3})`,
            boxShadow: done > 0 ? `0 0 18px ${hue('accent', 0.7 * done)}` : undefined,
          }}
        >
          {done > 0.3 && <Check size={15} weight="bold" color={C.onAccent} />}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              flex: 1,
              fontSize: compact ? 19 : 21,
              fontWeight: 600,
              letterSpacing: '-0.01em',
              color: task.locked ? C.fg2 : C.fg1,
              textDecoration: done > 0.5 ? 'line-through' : undefined,
              opacity: done > 0.5 ? 0.6 : 1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {task.title}
          </div>
          {task.score && <Score value={task.score} h={task.scoreHue ?? 'amber'} size={15} />}
        </div>
        {task.pills && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {task.pills.map((p, i) => (
              <Pill key={i} h={p.h} size={14}>
                {p.label}
              </Pill>
            ))}
          </div>
        )}
        {task.desc && <div style={{ fontSize: 15, color: C.fg3, marginTop: 10, lineHeight: 1.4 }}>{task.desc}</div>}
        {task.progress !== undefined && (
          <div style={{ marginTop: 14 }}>
            <Well style={{ height: 6 }}>
              <div style={{ height: 6, width: `${task.progress * 100}%`, borderRadius: 99, background: C.accent, boxShadow: `0 0 12px ${hue('accent', 0.8)}` }} />
            </Well>
          </div>
        )}
        {task.meta && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, color: C.fg3, marginTop: 12, fontWeight: 500 }}>
            <CalendarBlank size={16} weight="fill" />
            {task.meta}
            {task.sub && (
              <>
                <ArrowElbowDownRight size={15} weight="bold" style={{ marginLeft: 8 }} />
                {task.sub}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  </Glass>
);

export const NavRail: React.FC<{ active?: number; style?: React.CSSProperties; scale?: number }> = ({ active = 0, style, scale = 1 }) => {
  const icons = [House, Sparkle, Lightning, Medal, Bell, GearSix];
  return (
    <Glass radius={40 * scale} clear={0.1} style={{ width: 64 * scale, padding: `${16 * scale}px 0`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22 * scale, ...style }}>
      <Mark size={34 * scale} />
      {icons.map((I, i) => (
        <div
          key={i}
          style={{
            width: 48 * scale,
            height: 48 * scale,
            borderRadius: 99,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: i === active ? 'oklch(1 0 0 / 0.08)' : undefined,
            boxShadow: i === active ? 'inset 0 1px 1px oklch(1 0 0 / 0.15), 0 6px 18px -6px black' : undefined,
          }}
        >
          <I size={22 * scale} weight="fill" color={i === active ? C.fg1 : C.fg3} />
        </div>
      ))}
    </Glass>
  );
};

/** Select → Deadlines → Focus. `p` runs 0..3. */
export const Stepper: React.FC<{ p: number; scale?: number }> = ({ p, scale = 1 }) => {
  const steps = [
    { n: 'Select', s: '3 chosen' },
    { n: 'Deadlines', s: '3h 20m' },
    { n: 'Focus', s: '0 done' },
  ];
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 * scale }}>
      {steps.map((st, i) => {
        const done = Math.min(1, Math.max(0, p - i));
        const current = p >= i && p < i + 1.0001;
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <div style={{ width: 54 * scale, height: 3 * scale, marginTop: 22 * scale, borderRadius: 9, background: C.lineSoft, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(1, Math.max(0, p - i + 1)) * 100}%`, background: C.accent, boxShadow: `0 0 10px ${C.accent}` }} />
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 * scale, width: 110 * scale }}>
              <div
                style={{
                  width: 46 * scale,
                  height: 46 * scale,
                  borderRadius: 99,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 18 * scale,
                  fontWeight: 700,
                  background: done >= 1 ? hue('accent', 0.2) : current ? hue('accent', 0.12) : 'oklch(1 0 0 / 0.04)',
                  boxShadow: done >= 1 || current ? `inset 0 0 0 2px ${hue('accent', 0.7)}, 0 0 24px ${hue('accent', 0.45)}` : `inset 0 0 0 1px ${C.lineSoft}`,
                  color: done >= 1 || current ? C.accentLift : C.fg3,
                }}
              >
                {done >= 1 ? <Check size={20 * scale} weight="bold" /> : i + 1}
              </div>
              <div style={{ fontSize: 17 * scale, fontWeight: 600, color: done >= 1 || current ? C.fg1 : C.fg3 }}>{st.n}</div>
              <div style={{ fontSize: 14 * scale, color: C.fg3 }}>{st.s}</div>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export const IconChip: React.FC<{ icon: React.ReactNode; style?: React.CSSProperties; size?: number }> = ({ icon, style, size = 48 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: 99,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(155deg, oklch(1 0 0 / 0.09), oklch(1 0 0 / 0.02))',
      boxShadow: 'inset 0 1px 1px oklch(1 0 0 / 0.18), 0 8px 20px -8px black',
      ...style,
    }}
  >
    {icon}
  </div>
);

export { ArrowRight, Clock };

/** The app's own page: void floor, measured grid, emerald pool — inside a rounded window. */
export const AppWindow: React.FC<{ w: number; h: number; children: React.ReactNode; style?: React.CSSProperties; poolX?: number; poolY?: number }> = ({ w, h, children, style, poolX = 20, poolY = -10 }) => (
  <div
    style={{
      position: 'relative',
      width: w,
      height: h,
      borderRadius: 44,
      overflow: 'hidden',
      background: C.void0,
      boxShadow: `0 0 0 1px oklch(1 0 0 / 0.10), inset 0 1px 1px oklch(1 0 0 / 0.2), 0 80px 160px -40px black, 0 0 120px -30px ${hue('accent', 0.35)}`,
      ...style,
    }}
  >
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(60% 50% at ${poolX}% ${poolY}%, ${hue('accent', 0.35, 0.55)}, transparent 70%), radial-gradient(50% 40% at 100% 110%, ${hue('accent', 0.18, 0.55)}, transparent 70%)`,
      }}
    />
    <div
      style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: 'linear-gradient(oklch(1 0 0 / 0.06) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.035) 1px, transparent 1px)',
        backgroundSize: '88px 88px',
      }}
    />
    {children}
  </div>
);
