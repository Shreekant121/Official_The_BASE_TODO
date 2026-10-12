import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { ArrowsClockwise, Check, Eye, LinkSimple, Copy, Handshake, ListChecks, Repeat, WifiSlash, ShareNetwork } from '@phosphor-icons/react';
import { Backdrop, Caption, Cursor, Gel, Glass, Mark, Pill, Shockwave, Well, type CursorKey } from '../components/primitives';
import { C, hue, type Hue } from '../theme';
import { ease, fmtClock, kf, tw, useSpring, useT } from '../lib';

const PICK = 1.95;
const OPTS = [
  { label: 'Read-only list', icon: <ListChecks size={22} weight="bold" />, x: 1010 },
  { label: 'Client view', icon: <Eye size={22} weight="fill" />, x: 1330 },
  { label: 'Outsourcing board', icon: <Handshake size={22} weight="fill" />, x: 1655 },
];
const POP_Y = 300;

export const Everywhere: React.FC = () => {
  const t = useT();
  const sp = useSpring();
  const partA = 1 - tw(t, 3.45, 3.9, 0, 1, ease.in);
  const partB = tw(t, 3.6, 4.1) * (1 - tw(t, 6.6, 7.0, 0, 1, ease.in));
  const exit = tw(t, 9.95, 10.5, 0, 1, ease.in);

  const keys: CursorKey[] = [
    { t: 0.2, x: 1500, y: 700 },
    { t: 0.85, x: 1340, y: POP_Y + 6, click: true },
    { t: PICK, x: OPTS[1].x + 10, y: POP_Y + 6, click: true },
    { t: 3.0, x: 1500, y: 640 },
  ];

  return (
    <AbsoluteFill>
      <Backdrop pools={[{ x: 70, y: 110, r: 60, a: 0.3 }, { x: 10, y: 0, r: 45, a: 0.15 }]} />
      <AbsoluteFill style={{ opacity: 1 - exit, filter: exit > 0 ? `blur(${exit * 20}px)` : undefined }}>
        {/* ---------------- A: share links ---------------- */}
        {partA > 0 && (
          <AbsoluteFill style={{ opacity: partA, transform: `translateX(${(1 - partA) * -300}px)`, filter: partA < 1 ? `blur(${(1 - partA) * 16}px)` : undefined }}>
            <div style={{ position: 'absolute', left: 110, top: 380, width: 720 }}>
              <Caption kicker="Share links" title="Share it. *Live.*" sub="A read-only list, a live client view, or a board people claim work from." at={0.2} size={86} />
            </div>
            <ShareMorph t={t} />
            <ClientView t={t} sp={sp} />
          </AbsoluteFill>
        )}

        {/* ---------------- B: calendar + push ---------------- */}
        {partB > 0 && (
          <AbsoluteFill style={{ opacity: partB, transform: `translateX(${(1 - tw(t, 3.6, 4.2, 0, 1, ease.out)) * 300}px)` }}>
            <div style={{ position: 'absolute', left: 110, top: 380, width: 600 }}>
              <Caption kicker="Google Calendar · Push" title="Synced to your *calendar.*" sub="Every deadline becomes a block of work. A reminder fires when work has to start." at={3.75} size={78} />
            </div>
            <Calendar t={t} sp={sp} />
            <Push t={t} sp={sp} />
          </AbsoluteFill>
        )}

        {/* ---------------- C: devices ---------------- */}
        {t > 6.6 && <Devices t={t} sp={sp} />}
      </AbsoluteFill>
      <Cursor keys={keys} show={[0.2, 3.1]} />
    </AbsoluteFill>
  );
};

type Sp = ReturnType<typeof useSpring>;

/* A share pill that splits like liquid into three options, then pulls the other two back in. */
const ShareMorph: React.FC<{ t: number }> = ({ t }) => {
  const appear = tw(t, 0.1, 0.5);
  const split = kf(t, [0.9, 1.5], [0, 1], ease.out);
  const wob = Math.sin(Math.max(0, t - 0.9) * 14) * Math.exp(-Math.max(0, t - 0.9) * 4) * 18;
  const back = tw(t, PICK + 0.1, PICK + 0.55, 0, 1, ease.inOut);
  const settle = tw(t, PICK + 0.45, PICK + 0.8);
  const cx = 1330;
  const pos = (i: number) => {
    const spread = cx + (OPTS[i].x - cx) * split + (i !== 1 ? wob * (i - 1) : 0);
    return i === 1 ? spread : spread + (cx - spread) * back;
  };
  const w = (i: number) => (split < 0.05 ? 220 : 300) * (i === 1 ? 1 : 1 - back * 0.7);
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 600, opacity: appear * (1 - tw(t, 3.0, 3.3) * 0) }}>
      <div style={{ position: 'absolute', inset: 0, filter: 'url(#goo)' }}>
        {OPTS.map((_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: pos(i) - w(i) / 2,
              top: POP_Y - 34 - (i === 1 ? settle * 0 : 0),
              width: w(i),
              height: 68,
              borderRadius: 99,
              background: i === 1 && t > PICK ? hue('accent', 1, 0.42) : 'oklch(0.26 0.02 165)',
              opacity: i === 1 ? 1 : 1 - tw(back, 0.85, 1),
            }}
          />
        ))}
      </div>
      {/* Labels ride above the goo layer */}
      {split < 0.3 && (
        <div style={{ position: 'absolute', left: cx - 110, top: POP_Y - 34, width: 220, height: 68, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 22, fontWeight: 600, opacity: 1 - split / 0.3 }}>
          <ShareNetwork size={22} weight="fill" /> Share
        </div>
      )}
      {OPTS.map((o, i) => {
        const op = tw(split, 0.4, 1) * (i === 1 ? 1 : 1 - tw(back, 0, 0.4));
        if (op <= 0) return null;
        return (
          <div key={o.label} style={{ position: 'absolute', left: pos(i) - 150, top: POP_Y - 34, width: 300, height: 68, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 21, fontWeight: 600, opacity: op, color: i === 1 && t > PICK ? C.fg1 : C.fg1 }}>
            {o.icon} {o.label}
          </div>
        );
      })}
      <Shockwave x={OPTS[1].x} y={POP_Y} at={PICK} dur={0.9} max={600} width={3} />
    </div>
  );
};

const ClientView: React.FC<{ t: number; sp: Sp }> = ({ t, sp }) => {
  const p = sp(PICK + 0.3, { damping: 15, stiffness: 120 });
  if (p <= 0.001) return null;
  const live = 25 * 60 + Math.max(0, t - PICK) * 60;
  const prog = tw(t, PICK + 0.6, PICK + 1.4, 0, 1 / 6);
  return (
    <div style={{ position: 'absolute', left: 940, top: 380, opacity: Math.min(1, p * 1.4), transform: `translateY(${(1 - p) * 80}px) scale(${0.94 + p * 0.06})`, transformOrigin: 'top center' }}>
      <Glass radius={40} clear={0.1} glowK={0.2} style={{ width: 860, padding: '30px 34px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, background: 'oklch(1 0 0 / 0.06)' }}>SH</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em' }}>Shreekant Empire</div>
            <div style={{ fontSize: 16, color: C.fg3 }}>Client view</div>
          </div>
          <Pill h="accent" size={15}>
            Updated just now
          </Pill>
        </div>
        <div style={{ display: 'flex', marginTop: 26, gap: 10 }}>
          {[
            ['Progress', '1 / 6', 'tasks delivered'],
            ['Next deadline', '18 Mar', 'Incorporation, in 6 days'],
            ['Estimate', '9.3 h', 'of work left'],
            ['Budget', '₹1.9L', '₹22,000 delivered'],
          ].map(([a, b, c]) => (
            <div key={a} style={{ flex: 1 }}>
              <div style={{ fontSize: 15, color: C.fg3 }}>{a}</div>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6 }}>{b}</div>
              <div style={{ fontSize: 14, color: C.fg3, marginTop: 4 }}>{c}</div>
            </div>
          ))}
        </div>
        <Well style={{ height: 7, marginTop: 22 }}>
          <div style={{ width: `${prog * 100}%`, height: '100%', borderRadius: 99, background: C.accent, boxShadow: `0 0 12px ${C.accent}` }} />
        </Well>
        <div style={{ fontSize: 15, color: C.fg3, marginTop: 22, fontWeight: 600 }}>Working now</div>
        <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', borderRadius: 99, background: hue('accent', 0.1), boxShadow: `inset 0 0 0 1px ${hue('accent', 0.3)}` }}>
          <div style={{ width: 44, height: 44, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15, background: C.accent, color: C.onAccent }}>SH</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>Shreekant</div>
            <div style={{ fontSize: 15, color: C.fg3 }}>on File the incorporation paperwork</div>
          </div>
          <span style={{ width: 9, height: 9, borderRadius: 9, background: C.accent, boxShadow: `0 0 10px ${C.accent}`, opacity: 0.4 + Math.abs(Math.sin(t * 4)) * 0.6 }} />
          <span style={{ fontSize: 22, fontWeight: 700, color: C.accentLift, fontVariantNumeric: 'tabular-nums', marginRight: 10 }}>0:{fmtClock(live)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 22, opacity: tw(t, PICK + 0.9, PICK + 1.3) }}>
          <Well style={{ flex: 1, height: 52, display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', fontSize: 17, color: C.fg2 }}>
            <LinkSimple size={18} weight="bold" /> Read-only · expires in 7 days
          </Well>
          <Gel glowK={0.3} style={{ height: 52, fontSize: 18, padding: '0 24px' }}>
            <Copy size={18} weight="bold" /> Copy link
          </Gel>
        </div>
      </Glass>
    </div>
  );
};

const BLOCKS: { day: number; from: number; to: number; title: string; h: Hue; repeat?: boolean }[] = [
  { day: 0, from: 9.5, to: 11, title: 'File the incorporation paperwork', h: 'accent' },
  { day: 0, from: 11, to: 11.83, title: 'Quarterly compliance review', h: 'accent' },
  { day: 0, from: 11.83, to: 12.83, title: 'Rewrite the landing page copy', h: 'accent' },
  { day: 1, from: 10, to: 11, title: 'Countersign the studio lease', h: 'cyan' },
  { day: 2, from: 9, to: 10.5, title: 'Send the invite list', h: 'violet' },
  { day: 3, from: 13, to: 14, title: 'Pitch the podcast', h: 'violet' },
  { day: 4, from: 9.5, to: 10.25, title: 'Invoice Rahul', h: 'amber', repeat: true },
  { day: 2, from: 12, to: 13.5, title: 'Upload to the MCA portal', h: 'cyan' },
];
const CAL = { x: 790, y: 250, w: 1020, colW: 186, rowH: 104, top: 100, h0: 9 };

const Calendar: React.FC<{ t: number; sp: Sp }> = ({ t, sp }) => {
  const synced = t > 5.6;
  return (
    <div style={{ position: 'absolute', left: CAL.x, top: CAL.y }}>
      <Glass radius={40} clear={0.1} style={{ width: CAL.w, height: 760, padding: '26px 30px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 28, fontWeight: 700 }}>March · Week 11</span>
          <span style={{ flex: 1 }} />
          <Pill h={synced ? 'accent' : 'cyan'} size={16}>
            {synced ? <Check size={15} weight="bold" /> : <ArrowsClockwise size={15} weight="bold" style={{ transform: `rotate(${t * 400}deg)` }} />}
            {synced ? 'Google Calendar · synced' : 'Syncing 8 blocks'}
          </Pill>
        </div>
        {['Mon 9', 'Tue 10', 'Wed 11', 'Thu 12', 'Fri 13'].map((d, i) => (
          <div key={d} style={{ position: 'absolute', left: 100 + i * CAL.colW, top: 78, width: CAL.colW, textAlign: 'center', fontSize: 17, fontWeight: 600, color: i === 0 ? C.accentLift : C.fg3 }}>
            {d}
          </div>
        ))}
        {[9, 10, 11, 12, 13, 14].map((h, i) => (
          <React.Fragment key={h}>
            <div style={{ position: 'absolute', left: 30, top: 116 + i * CAL.rowH, fontSize: 15, color: C.fg4, fontVariantNumeric: 'tabular-nums' }}>{h}:00</div>
            <div style={{ position: 'absolute', left: 96, right: 30, top: 126 + i * CAL.rowH, height: 1, background: C.lineFaint }} />
          </React.Fragment>
        ))}
        {BLOCKS.map((b, i) => {
          const p = sp(4.0 + i * 0.16, { damping: 11, stiffness: 150 });
          if (p <= 0.001) return null;
          const top = 126 + (b.from - CAL.h0) * CAL.rowH;
          const height = (b.to - b.from) * CAL.rowH - 6;
          return (
            <div
              key={b.title}
              style={{
                position: 'absolute',
                left: 100 + b.day * CAL.colW + 4,
                top: top + 3,
                width: CAL.colW - 8,
                height,
                borderRadius: 16,
                padding: '10px 12px',
                fontSize: 15,
                fontWeight: 600,
                lineHeight: 1.25,
                overflow: 'hidden',
                background: `linear-gradient(155deg, ${hue(b.h, 0.42)}, ${hue(b.h, 0.18)})`,
                boxShadow: `inset 0 1px 1px oklch(1 0 0 / 0.25), inset 0 0 0 1px ${hue(b.h, 0.5)}, 0 0 ${(1 - Math.min(1, p)) * 40 + 10}px ${hue(b.h, 0.35)}`,
                opacity: Math.min(1, p * 1.5),
                transform: `translateY(${(1 - p) * -120}px) scale(${0.8 + Math.min(1, p) * 0.2})`,
              }}
            >
              {b.title}
              {b.repeat && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.fg2, marginTop: 4 }}>
                  <Repeat size={13} weight="bold" /> Every month
                </div>
              )}
            </div>
          );
        })}
        {/* Now line */}
        <div style={{ position: 'absolute', left: 96, right: 30, top: 126 + 0.42 * CAL.rowH, height: 2, background: hue('rose', 0.9), boxShadow: `0 0 10px ${hue('rose', 0.8)}`, opacity: tw(t, 4.4, 4.8) }} />
      </Glass>
    </div>
  );
};

const Push: React.FC<{ t: number; sp: Sp }> = ({ t, sp }) => {
  const p = sp(5.0, { damping: 14, stiffness: 140 });
  if (p <= 0.001) return null;
  return (
    <div style={{ position: 'absolute', left: 1250, top: 70, opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * -260}px)` }}>
      <Glass radius={32} thick clear={0.25} glowK={0.25} style={{ width: 580, padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 11, background: C.void2, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 1px 1px oklch(1 0 0 / 0.2)' }}>
            <Mark size={26} />
          </div>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.fg2, letterSpacing: '0.04em' }}>BASE</span>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: 15, color: C.fg3 }}>now</span>
        </div>
        <div style={{ fontSize: 21, fontWeight: 700, marginTop: 12 }}>Start now: File the incorporation paperwork</div>
        <div style={{ fontSize: 17, color: C.fg2, marginTop: 4 }}>90 min of work left to finish on time.</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          <div style={{ flex: 1, height: 44, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 600, background: 'oklch(1 0 0 / 0.07)' }}>Snooze 5 min</div>
          <div style={{ flex: 1, height: 44, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 700, background: hue('accent', 0.25), color: C.accentLift }}>Start</div>
        </div>
      </Glass>
    </div>
  );
};

/* ---------------- Devices ---------------- */
const Devices: React.FC<{ t: number; sp: Sp }> = ({ t, sp }) => {
  const ry = kf(t, [6.7, 10.5], [26, -10], ease.inOut);
  const lap = sp(6.75, { damping: 16, stiffness: 90 });
  const tab = sp(7.0, { damping: 16, stiffness: 90 });
  const ph = sp(7.2, { damping: 16, stiffness: 90 });
  const off = tw(t, 8.55, 8.95);
  const timer = 49 * 60 + 12 - Math.max(0, t - 7.2);
  return (
    <AbsoluteFill>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 70 }}>
        <Caption kicker="Installable · Offline" title="Phone. Tablet. Desktop. *Even offline.*" at={6.85} size={70} align="center" />
      </div>
      {/* Floor glow */}
      <div style={{ position: 'absolute', left: 260, right: 260, top: 860, height: 220, borderRadius: '50%', background: `radial-gradient(50% 50% at 50% 50%, ${hue('accent', 0.35)}, transparent 70%)`, opacity: lap }} />
      <AbsoluteFill style={{ perspective: 2200, alignItems: 'center', justifyContent: 'center', paddingTop: 170 }}>
        <div style={{ position: 'relative', width: 0, height: 0, transformStyle: 'preserve-3d', transform: `rotateX(6deg) rotateY(${ry}deg) translateY(${Math.sin(t * 1.4) * 8}px)` }}>
          {/* Laptop */}
          <div style={{ position: 'absolute', left: -480, top: -330, transform: `translate3d(0, ${(1 - lap) * 500}px, -120px)`, opacity: Math.min(1, lap * 1.4), transformStyle: 'preserve-3d' }}>
            <div style={{ width: 960, height: 600, borderRadius: 26, padding: 14, background: 'linear-gradient(160deg, oklch(0.32 0.004 260), oklch(0.16 0.003 260))', boxShadow: '0 0 0 1px oklch(1 0 0 / 0.12), 0 60px 120px -30px black' }}>
              <Img src={staticFile('shots/focus.png')} style={{ width: '100%', height: '100%', borderRadius: 14, objectFit: 'cover', display: 'block' }} />
            </div>
            <div style={{ width: 1100, height: 28, marginLeft: -70, borderRadius: '0 0 26px 26px', background: 'linear-gradient(180deg, oklch(0.40 0.004 260), oklch(0.20 0.003 260))', boxShadow: '0 30px 60px -10px black' }} />
          </div>
          {/* Tablet */}
          <div style={{ position: 'absolute', left: -790, top: -230, transform: `translate3d(0, ${(1 - tab) * 600}px, 160px) rotateY(16deg)`, opacity: Math.min(1, tab * 1.4) }}>
            <div style={{ width: 400, height: 568, borderRadius: 36, padding: 12, background: 'linear-gradient(160deg, oklch(0.34 0.004 260), oklch(0.14 0.003 260))', boxShadow: '0 0 0 1px oklch(1 0 0 / 0.14), 0 60px 120px -30px black' }}>
              <Img src={staticFile('shots/tablet-home.png')} style={{ width: '100%', height: '100%', borderRadius: 26, objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
            </div>
          </div>
          {/* Phone */}
          <div style={{ position: 'absolute', left: 430, top: -200, transform: `translate3d(0, ${(1 - ph) * 700}px, 260px) rotateY(-14deg)`, opacity: Math.min(1, ph * 1.4) }}>
            <div style={{ width: 270, height: 560, borderRadius: 46, padding: 10, background: 'linear-gradient(160deg, oklch(0.36 0.004 260), oklch(0.14 0.003 260))', boxShadow: '0 0 0 1px oklch(1 0 0 / 0.16), 0 60px 120px -30px black' }}>
              <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 38, overflow: 'hidden', background: C.void0 }}>
                <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(90% 50% at 50% 110%, ${hue('accent', 0.45, 0.55)}, transparent 70%)` }} />
                <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(oklch(1 0 0 / 0.05) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.03) 1px, transparent 1px)', backgroundSize: '44px 44px' }} />
                <div style={{ position: 'absolute', left: '50%', top: 10, width: 80, height: 22, borderRadius: 99, background: 'black', transform: 'translateX(-50%)' }} />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 70 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.3em', color: C.fg3 }}>FOCUS</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 30 }}>
                    <Pill h="accent" size={11}>
                      Running
                    </Pill>
                    <Pill h="rose" size={11} dot={false}>
                      21.3
                    </Pill>
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, textAlign: 'center', letterSpacing: '-0.03em', marginTop: 14, lineHeight: 1.1 }}>
                    Quarterly
                    <br />
                    compliance review
                  </div>
                  <div style={{ fontSize: 62, fontWeight: 300, marginTop: 24, fontVariantNumeric: 'tabular-nums' }}>{fmtClock(timer)}</div>
                  <div style={{ width: 170, height: 4, borderRadius: 9, background: 'oklch(1 0 0 / 0.08)', marginTop: 10 }}>
                    <div style={{ width: '18%', height: '100%', borderRadius: 9, background: C.accent }} />
                  </div>
                  <Gel glowK={0.4} style={{ height: 46, fontSize: 16, padding: '0 22px', marginTop: 40, gap: 8 }}>
                    <Check size={16} weight="bold" /> Mark done
                  </Gel>
                </div>
                {/* Offline toast */}
                <div style={{ position: 'absolute', left: 16, right: 16, bottom: 26, opacity: off, transform: `translateY(${(1 - off) * 40}px)` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 99, fontSize: 12, fontWeight: 600, background: 'oklch(0.2 0.003 260 / 0.95)', boxShadow: `inset 0 0 0 1px ${C.lineSoft}` }}>
                    <WifiSlash size={14} weight="bold" color={hue('amber', 1, 0.85)} /> Offline · changes saved
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
