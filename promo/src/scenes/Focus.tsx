import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Check, Pause, SkipForward, X, CaretDown } from '@phosphor-icons/react';
import { Backdrop, Burst, Caption, Cursor, Flash, Gel, Glass, Pill, Shockwave, Well, type CursorKey } from '../components/primitives';
import { Stepper } from '../components/app';
import { C, hue } from '../theme';
import { ease, fmtClock, kf, tw, useSpring, useT } from '../lib';

const SUBS: { title: string; min: number; depth: number; doneAt: number }[] = [
  { title: 'Sign the MOA', min: 15, depth: 0, doneAt: 1.9 },
  { title: 'Sign the AOA', min: 15, depth: 0, doneAt: 2.8 },
  { title: 'Upload to the MCA portal', min: 20, depth: 0, doneAt: 5.4 },
  { title: 'Scan the signed pages', min: 10, depth: 1, doneAt: 3.8 },
  { title: 'Attach the digital signature', min: 10, depth: 1, doneAt: 4.6 },
];

const DONE = 6.75;
const hms = (secs: number) => {
  const v = Math.floor(secs);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(v / 3600))}:${p(Math.floor((v % 3600) / 60))}:${p(v % 60)}`;
};
const BTN = { x: 815, y: 906 };
const CARD = { x: 110, y: 230, w: 1150, h: 790 };

export const Focus: React.FC = () => {
  const t = useT();
  const sp = useSpring();

  const cardIn = sp(0.05, { damping: 16, stiffness: 110 });
  // Time-lapse: 1h30 of work passes in a few seconds.
  const remaining = kf(t, [0.4, 6.4], [90 * 60, 4 * 60 + 12], ease.inOut);
  const lapse = tw(t, 0.6, 1.2) * (1 - tw(t, 5.9, 6.4));
  const doneN = SUBS.filter((s) => t >= s.doneAt).length;
  const press = kf(t, [DONE - 0.08, DONE, DONE + 0.25], [0, 1, 0]);
  const collapse = tw(t, DONE + 0.75, DONE + 1.25, 0, 1, ease.in);
  const check = sp(DONE + 0.05, { damping: 9, stiffness: 160 });
  const next = sp(DONE + 1.2, { damping: 15, stiffness: 120 });
  const exit = tw(t, 9.9, 10.5, 0, 1, ease.in);

  const keys: CursorKey[] = [
    { t: 4.4, x: 1500, y: 1060 },
    { t: DONE, x: BTN.x, y: BTN.y, click: true },
    { t: DONE + 1.1, x: BTN.x + 140, y: BTN.y + 120 },
  ];

  const pills = (
    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center' }}>
      <Pill h="accent" size={18}>
        Running
      </Pill>
      <Pill h="rose" size={18}>
        Red alert
      </Pill>
      <Pill h="amber" size={18} dot={false}>
        14.3 Priority
      </Pill>
      <span style={{ fontSize: 18, color: C.fg3, fontWeight: 600 }}>Operations</span>
    </div>
  );

  return (
    <AbsoluteFill>
      <Backdrop pools={[{ x: 35, y: 115, r: 55, a: 0.4 + Math.sin(t * 2) * 0.05 }, { x: 35, y: 50, r: 40, a: 0.12 }]} />

      <AbsoluteFill style={{ opacity: 1 - exit, filter: exit > 0 ? `blur(${exit * 20}px)` : undefined, transform: `scale(${1 - exit * 0.08})` }}>
        {/* Header */}
        <div style={{ position: 'absolute', right: 110, top: 64, opacity: tw(t, 0.3, 0.8) }}>
          <Stepper p={2} scale={1.05} />
        </div>
        <div style={{ position: 'absolute', left: 110, top: 70, width: 1100 }}>
          {t < DONE + 0.9 && <Caption kicker="Focus" title="Nothing else on *screen.*" at={0.5} out={DONE + 0.5} size={66} />}
          {t >= DONE + 0.9 && <Caption kicker="Mark done" title="Done. *Next.*" at={DONE + 1.0} size={66} />}
        </div>

        {/* Running task */}
        <div
          style={{
            position: 'absolute',
            left: CARD.x,
            top: CARD.y,
            transformOrigin: '50% 50%',
            opacity: Math.min(1, cardIn * 1.4) * (1 - collapse),
            transform: `translateY(${(1 - cardIn) * 120}px) scale(${(0.92 + cardIn * 0.08) * (1 - collapse * 0.15)}, ${(0.92 + cardIn * 0.08) * (1 - collapse * 0.6)})`,
            filter: collapse > 0 ? `blur(${collapse * 12}px)` : undefined,
          }}
        >
          <Glass radius={48} live clear={0.15} glowK={0.35 + check * 0.6 * (1 - collapse)} thick style={{ width: CARD.w, height: CARD.h, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 92 }}>
            {pills}
            <div style={{ fontSize: 78, fontWeight: 700, letterSpacing: '-0.04em', marginTop: 26, textAlign: 'center', lineHeight: 1.02, textDecoration: t > DONE ? 'line-through' : undefined, textDecorationColor: hue('accent', 0.8) }}>
              File the incorporation
              <br />
              paperwork
            </div>
            <div
              style={{
                fontSize: 190,
                fontWeight: 300,
                letterSpacing: '-0.02em',
                lineHeight: 1,
                marginTop: 34,
                fontVariantNumeric: 'tabular-nums',
                filter: lapse > 0.1 ? `blur(${lapse * 1.2}px)` : undefined,
                textShadow: `0 0 50px ${hue('accent', 0.35)}`,
                color: t > DONE ? C.accentLift : C.fg1,
              }}
            >
              {fmtClock(t > DONE ? 0 : remaining)}
            </div>
            <div style={{ width: 640, marginTop: 24 }}>
              <Well style={{ height: 6 }}>
                <div
                  style={{
                    width: `${t > DONE ? 100 : (1 - remaining / 5400) * 100}%`,
                    height: '100%',
                    borderRadius: 99,
                    background: C.accent,
                    boxShadow: `0 0 16px ${C.accent}`,
                  }}
                />
              </Well>
            </div>
            <div style={{ display: 'flex', gap: 22, marginTop: 20, fontSize: 19, color: C.fg3, fontVariantNumeric: 'tabular-nums' }}>
              <span>{hms(5400 - remaining)} elapsed</span>·<span>1h 30m allocated</span>
              <span style={{ color: C.fg1, fontWeight: 600, marginLeft: 20 }}>+5m</span>
              <span style={{ color: C.fg1, fontWeight: 600 }}>+15m</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginTop: 44 }}>
              <X size={28} weight="bold" color={C.fg3} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 66, padding: '0 32px', borderRadius: 99, background: 'oklch(1 0 0 / 0.05)', boxShadow: `inset 0 1px 1px oklch(1 0 0 / 0.14), inset 0 0 0 1px ${C.lineSoft}`, fontSize: 22, fontWeight: 600 }}>
                <Pause size={22} weight="fill" /> Pause
              </div>
              <Gel press={press} glowK={0.6 + press} style={{ height: 66, fontSize: 23 }}>
                <Check size={22} weight="bold" /> Mark done
              </Gel>
            </div>
            <div style={{ marginTop: 26, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 20px', borderRadius: 99, fontSize: 17, fontWeight: 600, color: hue('amber', 1, 0.85), background: hue('amber', 0.12), boxShadow: `inset 0 0 0 1px ${hue('amber', 0.3)}` }}>
              <SkipForward size={16} weight="fill" /> Defer: +1 avoided
            </div>
            <div style={{ marginTop: 16, fontSize: 17, color: C.fg4 }}>Next: Quarterly compliance review · 50m</div>
          </Glass>
          {/* Big check */}
          {t > DONE && (
            <div style={{ position: 'absolute', left: CARD.w / 2 - 110, top: 330, width: 220, height: 220, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(120% 100% at 22% 0%, oklch(0.90 0.11 165), oklch(0.72 0.16 162) 55%, oklch(0.50 0.12 165))', transform: `scale(${check})`, boxShadow: `0 0 120px 20px ${hue('accent', 0.6)}`, opacity: 1 - tw(t, DONE + 0.6, DONE + 0.8) * 0 }}>
              <Check size={130} weight="bold" color={C.onAccent} />
            </div>
          )}
        </div>

        {/* Next task arriving */}
        {next > 0.001 && (
          <div style={{ position: 'absolute', left: CARD.x, top: CARD.y + 120, opacity: Math.min(1, next * 1.4), transform: `translateY(${(1 - next) * 260}px) scale(${0.9 + next * 0.1})`, filter: next < 0.95 ? `blur(${(1 - next) * 14}px)` : undefined }}>
            <Glass radius={48} live clear={0.15} glowK={0.35} thick style={{ width: CARD.w, height: 560, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <Pill h="cyan" size={18}>
                  Up next
                </Pill>
                <Pill h="rose" size={18} dot={false}>
                  21.3 Priority
                </Pill>
              </div>
              <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: '-0.04em', marginTop: 24 }}>Quarterly compliance review</div>
              <div style={{ fontSize: 170, fontWeight: 300, marginTop: 18, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>50:00</div>
            </Glass>
          </div>
        )}

        {/* Subtasks */}
        <div style={{ position: 'absolute', left: 1300, top: CARD.y, opacity: tw(t, 0.4, 0.9), transform: `translateX(${tw(t, 0.4, 1.0, 80, 0)}px)` }}>
          <Glass radius={40} clear={0.12} style={{ width: 510, padding: '32px 32px 26px' }}>
            <div style={{ fontSize: 28, fontWeight: 700 }}>Subtasks</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 14 }}>
              <span style={{ fontSize: 32, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{doneN} / 5</span>
              <span style={{ fontSize: 17, color: C.fg3 }}>steps done</span>
            </div>
            <Well style={{ height: 6, marginTop: 14 }}>
              <div style={{ width: `${(doneN / 5) * 100}%`, height: '100%', borderRadius: 99, background: C.accent, boxShadow: `0 0 12px ${C.accent}` }} />
            </Well>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 22 }}>
              {[SUBS[0], SUBS[1], SUBS[2], SUBS[3], SUBS[4]].map((s) => {
                const d = sp(s.doneAt, { damping: 10, stiffness: 200 });
                const on = t >= s.doneAt;
                return (
                  <div key={s.title} style={{ display: 'flex', alignItems: 'center', gap: 16, height: 56, paddingLeft: s.depth * 36 }}>
                    {s.depth === 0 && s.title.startsWith('Upload') ? <CaretDown size={16} color={C.fg3} weight="bold" /> : <span style={{ width: 16 }} />}
                    <div
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 99,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: on ? hue('accent', 0.25) : 'transparent',
                        boxShadow: on ? `inset 0 0 0 2px ${hue('accent', 0.8)}, 0 0 ${18 * d}px ${hue('accent', 0.6)}` : `inset 0 0 0 2px ${C.lineStrong}`,
                        transform: `scale(${on ? 0.6 + d * 0.4 + Math.sin(d * Math.PI) * 0.25 : 1})`,
                      }}
                    >
                      {on && <Check size={17} weight="bold" color={C.accentLift} />}
                    </div>
                    <span style={{ flex: 1, fontSize: 20, fontWeight: 500, color: on ? C.fg3 : C.fg1, position: 'relative' }}>
                      {s.title}
                      <span style={{ position: 'absolute', left: 0, top: '52%', height: 2, width: `${(on ? d : 0) * 100}%`, background: C.fg3 }} />
                    </span>
                    <span style={{ fontSize: 16, color: on ? C.accentLift : C.fg4 }}>{s.min}m</span>
                  </div>
                );
              })}
            </div>
          </Glass>
          <Glass radius={40} clear={0.12} style={{ width: 510, marginTop: 22, padding: '26px 32px', display: 'flex', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>Task details</div>
              <div style={{ fontSize: 16, color: C.fg3, marginTop: 4 }}>Form INC-32 plus the MOA and AOA.</div>
            </div>
            <CaretDown size={20} color={C.fg3} weight="bold" />
          </Glass>
        </div>

        <Flash at={DONE} dur={0.3} peak={0.16} />
        <Shockwave x={685} y={625} at={DONE} dur={1.2} max={1600} width={6} />
        <Shockwave x={685} y={625} at={DONE + 0.15} dur={1.5} max={2000} width={2} />
        <Burst x={685} y={625} at={DONE} n={120} power={2600} gravity={500} seed={31} dur={2.2} />
        <Burst x={BTN.x} y={BTN.y} at={DONE} n={30} power={900} gravity={300} seed={33} dur={1} />
      </AbsoluteFill>

      <Cursor keys={keys} show={[4.4, DONE + 1.1]} />
    </AbsoluteFill>
  );
};
