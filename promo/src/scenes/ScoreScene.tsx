import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Plus, Target, Warning } from '@phosphor-icons/react';
import { Backdrop, Burst, Caption, Flash, Glass, Pill, Score, Shockwave, Well } from '../components/primitives';
import { C, hue, type Hue } from '../theme';
import { ease, lerp, tw, useSpring, useT } from '../lib';

const FACTORS: [string, number, number][] = [
  ['Importance', 5, 9],
  ['Emergency', 3, 5],
  ['Deadline', 4.3, 5],
  ['Overdue', 0, 5],
  ['Bottleneck', 2, 5],
  ['Avoided', 1, 5],
  ['Duration', 0.5, 1],
];
const ADDED = FACTORS.reduce((a, f) => a + f[1], 0); // 15.8
const COMPOUNDED = 21.3;
const SLAM = 5.45;

const RANKED: { title: string; score: string; h: Hue; list: string }[] = [
  { title: 'File the incorporation paperwork', score: '14.3', h: 'amber', list: 'Operations' },
  { title: 'Rewrite the landing page copy', score: '12.1', h: 'amber', list: 'Build' },
  { title: 'Open the current account', score: '8.6', h: 'amber', list: 'Money' },
  { title: 'Quarterly compliance review', score: '9.8', h: 'amber', list: 'Operations' },
  { title: 'Upload to the MCA portal', score: '4.5', h: 'amber', list: 'Operations' },
  { title: 'Countersign the studio lease', score: '3.6', h: 'amber', list: 'Build' },
];
const HERO = 3;

export const ScoreScene: React.FC = () => {
  const t = useT();
  const sp = useSpring();

  const enter = tw(t, 0, 0.7, 0, 1, ease.out);
  const fill = (i: number) => tw(t, 0.9 + i * 0.3, 1.45 + i * 0.3, 0, 1, ease.out);
  const added = FACTORS.reduce((a, f, i) => a + f[1] * fill(i), 0);
  const compound = tw(t, SLAM - 0.3, SLAM, 0, 1, ease.in);
  const score = t < SLAM - 0.3 ? added : lerp(ADDED, COMPOUNDED, compound);
  const hot = t >= SLAM;
  const punch = hot ? 1 + Math.exp(-(t - SLAM) * 7) * 0.22 * Math.cos((t - SLAM) * 30) : 1;
  const shake = hot ? Math.exp(-(t - SLAM) * 6) * 14 : 0;
  const danger = tw(t, 4.4, 4.9);

  // Phase C: panel steps aside for the ranked list.
  const aside = tw(t, 7.1, 8.0, 0, 1, ease.inOut);
  const exit = tw(t, 11.8, 12.5, 0, 1, ease.in);

  // Ranked list reorder.
  const heroScoreFlip = t >= 8.35;
  const heroMove = tw(t, 8.65, 9.45, 0, 1, ease.inOut);
  const rowY = (i: number) => 230 + i * 104;
  const rowPos = (i: number) => {
    if (i === HERO) return rowY(HERO) + (rowY(0) - rowY(HERO)) * heroMove;
    if (i < HERO) return rowY(i) + sp(8.85 + i * 0.06, { damping: 13, stiffness: 150 }) * 104;
    return rowY(i);
  };

  return (
    <AbsoluteFill style={{ transform: `translate(${Math.sin(t * 60) * shake}px, ${Math.cos(t * 53) * shake}px)` }}>
      <Backdrop
        pools={[
          { x: 30, y: 60, r: 55, a: 0.22 * (1 - compound), h: 'amber' },
          { x: 30, y: 60, r: 60, a: 0.28 * compound * (1 - aside * 0.6), h: 'rose' },
          { x: 80, y: 110, r: 60, a: 0.25 },
        ]}
      />

      <AbsoluteFill
        style={{
          opacity: 1 - exit,
          transform: `translateX(${(1 - enter) * 1400}px) scale(${1 + exit * 0.5})`,
          filter: enter < 1 || exit > 0 ? `blur(${(1 - enter) * 30 + exit * 20}px)` : undefined,
        }}
      >
        {/* Score panel */}
        <div
          style={{
            position: 'absolute',
            left: 110,
            top: 150,
            transformOrigin: '0 0',
            transform: `translate(${aside * -20}px, ${aside * 200}px) scale(${1 - aside * 0.36})`,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 600, color: C.fg3, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, opacity: 1 - aside }}>
            Operations <span style={{ color: C.fg4 }}>›</span> <Pill h="cyan" size={15}>To Do</Pill>
          </div>
          <div style={{ fontSize: 58, fontWeight: 700, letterSpacing: '-0.035em', marginBottom: 30, opacity: 1 - aside }}>Quarterly compliance review</div>
          <Glass
            radius={40}
            tint={hot ? 'rose' : 'amber'}
            tintA={0.2 + (hot ? Math.exp(-(t - SLAM) * 3) * 0.25 : 0)}
            clear={0.2}
            glowHue={hot ? 'rose' : 'amber'}
            glowK={hot ? 0.5 + Math.exp(-(t - SLAM) * 3) * 0.8 : 0.15 + danger * 0.2}
            style={{ width: 1000, padding: '38px 44px', display: 'flex', gap: 50 }}
          >
            <div style={{ width: 300 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 20, fontWeight: 600, color: hue(hot ? 'rose' : 'amber', 1, 0.85) }}>
                <Target size={22} weight="fill" /> Priority score
              </div>
              <div
                style={{
                  fontSize: 168,
                  fontWeight: 700,
                  lineHeight: 1.05,
                  letterSpacing: '-0.04em',
                  fontVariantNumeric: 'tabular-nums',
                  color: hue(hot ? 'rose' : 'amber', 1, 0.85),
                  transform: `scale(${punch})`,
                  transformOrigin: '20% 60%',
                  textShadow: `0 0 ${hot ? 70 : 40}px ${hue(hot ? 'rose' : 'amber', 0.6)}`,
                }}
              >
                {score.toFixed(1)}
              </div>
              <div style={{ fontSize: 18, color: C.fg3, marginTop: 6 }}>{hot ? 'Top of everything you have.' : 'Seven capped factors.'}</div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {FACTORS.map(([name, v, max], i) => {
                const f = fill(i);
                const turn = tw(t, 4.85 + i * 0.06, 5.25 + i * 0.06, 0, 45, ease.inOut);
                const active = v > 0;
                return (
                  <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 16, opacity: tw(t, 0.7 + i * 0.05, 1.1 + i * 0.05) }}>
                    <div style={{ width: 130, fontSize: 19, fontWeight: 500, color: active ? C.fg1 : C.fg4 }}>{name}</div>
                    <Well style={{ flex: 1, height: 12, overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${(v / max) * f * 100}%`,
                          borderRadius: 99,
                          background: `linear-gradient(90deg, ${hue(hot ? 'rose' : 'amber', 0.7)}, ${hue(hot ? 'rose' : 'amber', 1, 0.85)})`,
                          boxShadow: `0 0 14px ${hue(hot ? 'rose' : 'amber', 0.8)}`,
                        }}
                      />
                    </Well>
                    <Plus size={18} weight="bold" color={active ? hue(hot ? 'rose' : 'amber', 1, 0.85) : C.fg4} style={{ transform: `rotate(${active ? turn : 0}deg) scale(${1 + (active ? Math.sin((turn / 45) * Math.PI) * 0.5 : 0)})` }} />
                    <div style={{ width: 46, textAlign: 'right', fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: active ? C.fg1 : C.fg4 }}>{(v * f).toFixed(1).replace('.0', '')}</div>
                    <div style={{ width: 34, fontSize: 17, color: C.fg4 }}>/{max}</div>
                  </div>
                );
              })}
              {/* Danger zone strip */}
              <div
                style={{
                  marginTop: 8,
                  height: 50 * danger,
                  opacity: danger,
                  overflow: 'hidden',
                  borderRadius: 99,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '0 20px',
                  fontSize: 19,
                  fontWeight: 700,
                  color: hue('rose', 1, 0.88),
                  background: `repeating-linear-gradient(-45deg, ${hue('rose', 0.22)} 0 14px, ${hue('rose', 0.08)} 14px 28px)`,
                  backgroundPosition: `${t * 40}px 0`,
                  boxShadow: `inset 0 0 0 1px ${hue('rose', 0.4)}`,
                }}
              >
                <Warning size={20} weight="fill" /> Danger zone: compounding <span style={{ flex: 1 }} /> <span style={{ color: C.fg2 }}>Latest start in 18 min</span>
              </div>
            </div>
          </Glass>
        </div>

        <Flash at={SLAM} dur={0.35} peak={0.16} color={hue('rose', 1, 0.8)} />
        <Shockwave x={300} y={470} at={SLAM} dur={1.1} max={1400} h="rose" width={5} />
        <Burst x={300} y={470} at={SLAM} n={50} power={1600} h="rose" seed={7} gravity={300} />

        {/* Ranked list */}
        {aside > 0 && (
          <div style={{ position: 'absolute', left: 960, top: 0 }}>
            {RANKED.map((r, i) => {
              const inP = sp(7.5 + i * 0.07, { damping: 15, stiffness: 120 });
              const isHero = i === HERO;
              const flip = isHero && heroScoreFlip;
              const lift = isHero ? tw(t, 8.5, 8.7) * (1 - tw(t, 9.4, 9.7)) : 0;
              const arc = isHero ? Math.sin(heroMove * Math.PI) * -70 : 0;
              const nextUp = isHero ? tw(t, 9.6, 10.0) : 0;
              const rank = isHero ? (heroMove > 0.5 ? 1 : 4) : i < HERO ? (t > 8.9 ? i + 2 : i + 1) : i + 1;
              return (
                <div
                  key={r.title}
                  style={{
                    position: 'absolute',
                    top: rowPos(i),
                    left: arc,
                    zIndex: isHero ? 2 : 1,
                    opacity: inP,
                    transform: `translateX(${(1 - inP) * 500}px) scale(${1 + lift * 0.06})`,
                  }}
                >
                  <Glass
                    radius={28}
                    clear={0.12}
                    tint={flip ? 'rose' : undefined}
                    tintA={0.18}
                    glowHue={nextUp > 0 ? 'accent' : 'rose'}
                    glowK={flip ? 0.25 + lift * 0.6 + nextUp * 0.3 : 0}
                    style={{ width: 840, height: 86, display: 'flex', alignItems: 'center', gap: 22, padding: '0 28px' }}
                  >
                    <div style={{ width: 34, fontSize: 22, fontWeight: 700, color: C.fg4, fontVariantNumeric: 'tabular-nums' }}>{String(rank).padStart(2, '0')}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 23, fontWeight: 600 }}>{r.title}</div>
                      <div style={{ fontSize: 16, color: C.fg3, marginTop: 4 }}>{r.list}</div>
                    </div>
                    {nextUp > 0 && (
                      <div style={{ opacity: nextUp, transform: `scale(${0.6 + nextUp * 0.4})` }}>
                        <Pill h="accent" size={16} solid>
                          Next up
                        </Pill>
                      </div>
                    )}
                    <div style={{ transform: flip ? `scale(${1 + Math.exp(-(t - 8.35) * 6) * 0.5})` : undefined }}>
                      <Score value={flip ? '21.3' : r.score} h={flip ? 'rose' : r.h} size={20} />
                    </div>
                  </Glass>
                </div>
              );
            })}
          </div>
        )}
        <Burst x={1820} y={273} at={8.35} n={26} power={700} h="rose" seed={11} gravity={200} dur={1.1} />

        {/* Captions */}
        <div style={{ position: 'absolute', left: 1210, top: 330, width: 640 }}>
          {t < 5.3 && <Caption kicker="Priority score" title="Seven factors. *One number.*" sub="Importance, emergency, deadline, overdue, bottleneck, times avoided, duration." at={0.6} out={4.85} size={70} h="amber" />}
          {t >= 5.3 && <Caption kicker="Danger zone" title="Near the deadline, they *multiply.*" at={5.6} out={6.95} size={70} h="rose" />}
        </div>
        <div style={{ position: 'absolute', left: 110, top: 80, width: 800 }}>
          <Caption kicker="Needs attention" title="The right task *rises.*" sub="A small task blocking a big one inherits its urgency." at={8.0} out={11.5} size={74} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
