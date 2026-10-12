import React from 'react';
import { AbsoluteFill } from 'remotion';
import { ArrowRight, DotsSixVertical, HourglassHigh, Lightning, Play } from '@phosphor-icons/react';
import { Backdrop, Burst, Caption, Cursor, Flash, Gel, Glass, Score, Shockwave, Sweep, Well, type CursorKey } from '../components/primitives';
import { Stepper } from '../components/app';
import { C, hue } from '../theme';
import { ease, kf, lerp, rnd, tw, useSpring, useT } from '../lib';

type Cand = { title: string; score: string; x: number; y: number; pick?: number; min?: number; start?: string; list?: string };

// The candidate pool Smart Start draws from. `pick` = slot in today's queue.
const CANDS: Cand[] = [
  { title: 'Quarterly compliance review', score: '21.3', x: 1180, y: 360, pick: 1, min: 50, start: '11:00', list: 'Operations' },
  { title: 'File the incorporation paperwork', score: '14.3', x: 700, y: 470, pick: 0, min: 90, start: '09:30', list: 'Operations' },
  { title: 'Rewrite the landing page copy', score: '12.1', x: 1400, y: 600, pick: 2, min: 60, start: '11:50', list: 'Build' },
  { title: 'Open the current account', score: '8.6', x: 480, y: 690 },
  { title: 'Upload to the MCA portal', score: '4.5', x: 1010, y: 820 },
  { title: 'Countersign the studio lease', score: '3.6', x: 1530, y: 860 },
  { title: 'Chase the late invoices', score: '2.1', x: 420, y: 880 },
  { title: 'Pitch the podcast', score: '1.8', x: 1600, y: 480 },
  { title: 'Renew the domain', score: '1.2', x: 640, y: 340 },
  { title: 'Book the photographer', score: '0.9', x: 960, y: 700 },
];

const CLICK = 1.7;
const BTN = { x: 512, y: 548 };
const START = { x: 1668, y: 986 };
const GO = 9.15;

const rowY = (slot: number) => 400 + slot * 135;
const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` : `${m}m`);

export const SmartStart: React.FC = () => {
  const t = useT();
  const sp = useSpring();

  const heroIn = tw(t, 0, 0.6);
  const heroOut = tw(t, CLICK + 0.1, CLICK + 0.55, 0, 1, ease.in);
  const press = kf(t, [CLICK - 0.08, CLICK, CLICK + 0.25], [0, 1, 0]);
  const stepP = (t > 4.8 ? tw(t, 4.8, 5.3) : 0) + tw(t, GO, GO + 0.5);
  const toRows = tw(t, 4.0, 4.9, 0, 1, ease.inOut);
  const widen = tw(t, 4.9, 5.5, 0, 1, ease.inOut);
  const allocated = tw(t, 5.3, 6.6, 0, 200, ease.inOut);
  const runIn = sp(5.3, { damping: 16, stiffness: 120 });
  const ends = kf(t, [5.6, 7.0], [9.5 * 60, 12 * 60 + 50], ease.out);
  const barIn = sp(6.4, { damping: 16, stiffness: 120 });
  const goPress = kf(t, [GO - 0.08, GO, GO + 0.25], [0, 1, 0]);
  const exit = tw(t, 10.35, 11.3, 0, 1, ease.in);

  const keys: CursorKey[] = [
    { t: 0.5, x: 1250, y: 900 },
    { t: CLICK, x: BTN.x + 10, y: BTN.y + 6, click: true },
    { t: 2.6, x: BTN.x - 160, y: BTN.y + 260 },
    { t: 7.6, x: 1250, y: 1010 },
    { t: GO, x: START.x, y: START.y, click: true },
    { t: 10.4, x: START.x + 60, y: START.y + 40 },
  ];

  return (
    <AbsoluteFill>
      <Backdrop pools={[{ x: 30, y: -10, r: 60, a: 0.35 }, { x: 80, y: 115, r: 60, a: 0.25 + tw(t, CLICK, CLICK + 0.3) * 0.15 }]} />

      <AbsoluteFill style={{ transform: `scale(${1 + exit * 0.35})`, opacity: 1 - tw(exit, 0.4, 1), filter: exit > 0 ? `blur(${exit * 22}px)` : undefined }}>
        {/* Home hero */}
        {heroOut < 1 && (
          <div style={{ position: 'absolute', left: 310, top: 250, opacity: heroIn * (1 - heroOut), transform: `scale(${0.94 + heroIn * 0.06 + heroOut * 0.08})`, filter: heroOut > 0 ? `blur(${heroOut * 16}px)` : undefined }}>
            <div style={{ fontSize: 50, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 6 }}>Good morning, Shreekant</div>
            <div style={{ fontSize: 22, color: C.fg3, marginBottom: 34 }}>Thursday, 12 March</div>
            <Glass radius={40} clear={0.1} glowK={0.25} style={{ width: 1300, height: 270, padding: '40px 48px' }}>
              <div style={{ fontSize: 19, fontWeight: 600, color: C.accentLift }}>Start here</div>
              <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: '-0.03em', marginTop: 12 }}>Strict focus. One task at a time.</div>
            </Glass>
          </div>
        )}
        {heroOut < 1 && (
          <div style={{ position: 'absolute', left: BTN.x - 128, top: BTN.y - 36, opacity: heroIn * (1 - heroOut) }}>
            <Gel press={press} glowK={0.6 + press * 0.8} style={{ height: 72, fontSize: 25, padding: '0 38px' }}>
              <Lightning size={24} weight="fill" /> Smart Start
              <Sweep at={0.7} dur={0.8} radius={99} strength={0.45} />
            </Gel>
          </div>
        )}
        <Shockwave x={BTN.x} y={BTN.y} at={CLICK} dur={1.1} max={1500} width={4} />
        <Burst x={BTN.x} y={BTN.y} at={CLICK} n={50} power={1500} gravity={250} seed={21} dur={1.3} />
        <Flash at={CLICK} dur={0.35} peak={0.2} />

        {/* Candidate chips → today's queue → allocation rows */}
        {CANDS.map((c, i) => {
          const born = sp(CLICK + 0.15 + i * 0.045, { damping: 13, stiffness: 110 });
          if (born <= 0.001) return null;
          const picked = c.pick !== undefined;
          const hl = picked ? tw(t, 3.2 + c.pick! * 0.22, 3.45 + c.pick! * 0.22) : 0;
          const reject = picked ? 0 : tw(t, 3.75 + rnd(i) * 0.3, 4.45 + rnd(i) * 0.3, 0, 1, ease.in);
          if (reject >= 1) return null;
          const bob = Math.sin(t * 1.6 + i) * 6 * (1 - toRows);
          let x = lerp(BTN.x, c.x, born);
          let y = lerp(BTN.y, c.y, born) + bob;
          let w = 470;
          if (picked) {
            const m = tw(t, 4.0 + c.pick! * 0.08, 4.85 + c.pick! * 0.08, 0, 1, ease.inOut);
            x = lerp(x, 110, m);
            y = lerp(y, rowY(c.pick!), m) - Math.sin(m * Math.PI) * 80;
            w = lerp(470, 880, widen);
          } else {
            x += reject * 260;
          }
          const extra = picked ? tw(t, 5.2 + c.pick! * 0.12, 5.7 + c.pick! * 0.12) : 0;
          return (
            <div
              key={c.title}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: w,
                transform: `translate(${picked ? 0 : -235}px, -40px) scale(${Math.min(1, born) * (1 + hl * 0.04 * (1 - toRows))})`,
                transformOrigin: picked ? '0 50%' : '50% 50%',
                opacity: Math.min(1, born * 2) * (1 - reject) * (picked ? 1 : 1 - tw(t, 3.5, 3.9, 0, 0.55)),
                filter: reject > 0 ? `blur(${reject * 14}px)` : undefined,
                zIndex: picked ? 3 : 1,
              }}
            >
              <Glass radius={picked ? lerp(99, 28, widen) : 99} clear={0.12} glowK={hl * 0.6 * (1 - widen * 0.7)} style={{ height: lerp(80, 112, widen), display: 'flex', alignItems: 'center', gap: 18, padding: '0 26px' }}>
                {picked && widen > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: widen, width: 110 * widen, overflow: 'hidden' }}>
                    <DotsSixVertical size={24} color={C.fg4} weight="bold" />
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ fontSize: 15, color: C.fg4 }}>0{c.pick! + 1}</span>
                      <span style={{ fontSize: 20, fontWeight: 600, color: C.fg2, fontVariantNumeric: 'tabular-nums' }}>{c.start}</span>
                    </div>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 22, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</div>
                  {picked && widen > 0 && <div style={{ fontSize: 16, color: C.fg3, marginTop: 4, opacity: widen }}>{c.list}</div>}
                </div>
                <Score value={c.score} h={picked && hl > 0.5 ? 'accent' : 'amber'} size={17} />
                {picked && extra > 0 && (
                  <Well style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '12px 20px', opacity: extra, transform: `translateX(${(1 - extra) * 30}px)`, fontVariantNumeric: 'tabular-nums' }}>
                    <span style={{ fontSize: 24, fontWeight: 700 }}>{String(Math.floor(c.min! / 60)).padStart(2, '0')}</span>
                    <span style={{ fontSize: 14, color: C.fg4 }}>h</span>
                    <span style={{ fontSize: 24, fontWeight: 700, marginLeft: 8 }}>{String(c.min! % 60).padStart(2, '0')}</span>
                    <span style={{ fontSize: 14, color: C.fg4 }}>m</span>
                  </Well>
                )}
              </Glass>
            </div>
          );
        })}

        {/* Allocation header */}
        <div style={{ position: 'absolute', left: 110, top: 278, width: 880, opacity: tw(t, 5.0, 5.5) }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
            <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.02em' }}>Allocation</span>
            <span style={{ fontSize: 18, color: C.fg3 }}>
              Allocated <b style={{ color: C.fg1, fontSize: 24 }}>{fmtMin(Math.round(allocated))}</b> of a 4h window
            </span>
          </div>
          <Well style={{ height: 8, marginTop: 18 }}>
            <div style={{ height: '100%', width: `${(allocated / 240) * 100}%`, borderRadius: 99, background: C.accent, boxShadow: `0 0 14px ${C.accent}` }} />
          </Well>
        </div>

        {/* The run */}
        {runIn > 0.001 && (
          <div style={{ position: 'absolute', left: 1090, top: 278, opacity: Math.min(1, runIn * 1.5), transform: `translateX(${(1 - runIn) * 400}px)` }}>
            <Glass radius={40} clear={0.1} style={{ width: 720, padding: '30px 34px' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 30, fontWeight: 700, flex: 1 }}>The run</span>
                <Play size={16} weight="fill" color={C.fg3} />
                <span style={{ fontSize: 17, color: C.fg3, marginLeft: 8 }}>Starts</span>
                <span style={{ fontSize: 20, fontWeight: 700, marginLeft: 10 }}>09:30</span>
              </div>
              <Glass radius={30} live clear={0.2} glowK={0.35} style={{ marginTop: 22, padding: '24px 30px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 17, fontWeight: 600, color: C.accentLift }}>
                  <Play size={15} weight="fill" /> Session ends
                </div>
                <div style={{ fontSize: 112, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
                  {String(Math.floor(ends / 60)).padStart(2, '0')}:{String(Math.floor(ends % 60)).padStart(2, '0')}
                </div>
                <div style={{ fontSize: 17, color: C.fg2 }}>40m of the window still unplanned.</div>
              </Glass>
              <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {CANDS.filter((c) => c.pick !== undefined)
                  .sort((a, b) => a.pick! - b.pick!)
                  .map((c, i) => {
                    const g = tw(t, 5.8 + i * 0.25, 6.3 + i * 0.25);
                    return (
                      <div key={c.title} style={{ display: 'flex', alignItems: 'center', gap: 18, opacity: g, transform: `translateY(${(1 - g) * 20}px)` }}>
                        <span style={{ width: 60, fontSize: 17, color: C.fg3, fontVariantNumeric: 'tabular-nums' }}>{c.start}</span>
                        <div
                          style={{
                            flex: 1,
                            height: 30 + c.min! * 0.32,
                            borderRadius: 18,
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0 20px',
                            fontSize: 18,
                            fontWeight: 500,
                            background: i === 0 ? hue('accent', 0.16) : 'oklch(1 0 0 / 0.04)',
                            boxShadow: i === 0 ? `inset 0 0 0 1px ${hue('accent', 0.45)}, 0 0 24px -6px ${hue('accent', 0.5)}` : `inset 0 0 0 1px ${C.lineSoft}`,
                          }}
                        >
                          <span style={{ flex: 1 }}>{c.title}</span>
                          <span style={{ color: i === 0 ? C.accentLift : C.fg3 }}>{fmtMin(c.min!)}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </Glass>
          </div>
        )}

        {/* Work session bar */}
        {barIn > 0.001 && (
          <div style={{ position: 'absolute', left: 110, top: 940, opacity: Math.min(1, barIn * 1.5), transform: `translateY(${(1 - barIn) * 140}px)` }}>
            <Glass radius={99} clear={0.1} style={{ width: 1700, height: 92, display: 'flex', alignItems: 'center', gap: 22, padding: '0 14px 0 30px' }}>
              <HourglassHigh size={22} weight="fill" color={C.fg3} />
              <span style={{ fontSize: 19, fontWeight: 600, color: C.fg2 }}>Work session</span>
              <Well style={{ padding: '10px 22px', fontSize: 26, fontWeight: 700 }}>
                04 <span style={{ fontSize: 14, color: C.fg4 }}>h</span> 00 <span style={{ fontSize: 14, color: C.fg4 }}>m</span>
              </Well>
              <div style={{ width: 300, position: 'relative' }}>
                <Well style={{ height: 8 }}>
                  <div style={{ width: '62%', height: '100%', borderRadius: 99, background: C.accent }} />
                </Well>
                <div style={{ position: 'absolute', left: '62%', top: -9, width: 26, height: 26, borderRadius: 99, background: 'white', transform: 'translateX(-50%)', boxShadow: '0 4px 10px black' }} />
              </div>
              <span style={{ fontSize: 18, color: C.fg3, flex: 1 }}>3h 20m allocated · ends 12:50</span>
              <Gel press={goPress} glowK={0.5 + goPress} style={{ height: 66, fontSize: 22 }}>
                Start Protocol <ArrowRight size={22} weight="bold" />
              </Gel>
            </Glass>
          </div>
        )}
        <Shockwave x={START.x} y={START.y} at={GO} dur={1} max={1300} width={4} />
        <Burst x={START.x} y={START.y} at={GO} n={40} power={1300} seed={23} gravity={300} dur={1.2} />

        {/* Stepper */}
        <div style={{ position: 'absolute', right: 110, top: 64, opacity: tw(t, 2.2, 2.8) }}>
          <Stepper p={stepP} scale={1.05} />
        </div>

        {/* Captions */}
        <div style={{ position: 'absolute', left: 110, top: 70, width: 1150 }}>
          {t < 4.9 && <Caption kicker="Smart Start" title="One button builds *your day.*" sub="The highest scores that fit your hours. Blockers come first." at={2.1} out={4.55} size={66} />}
          {t >= 4.9 && <Caption kicker="Set deadlines" title="Time-box it. *The clock does the rest.*" at={5.0} out={10.0} size={66} />}
        </div>
      </AbsoluteFill>

      <Flash at={11.05} dur={0.5} peak={0.4} />
      <Cursor keys={keys} show={[0.5, 10.4]} />
    </AbsoluteFill>
  );
};
