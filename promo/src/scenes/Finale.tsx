import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Check, GithubLogo, Lightning } from '@phosphor-icons/react';
import { Backdrop, Burst, Center, Flash, Gel, Glass, Mark, Shockwave, Sweep, Words } from '../components/primitives';
import { CTA } from '../components/app';
import { C, hue, type Hue } from '../theme';
import { ease, kf, rnd, tw, useSpring, useT } from '../lib';

const BEAT = 0.62;
const BEATS: { word: string; h: Hue }[] = [
  { word: 'Score.', h: 'rose' },
  { word: 'Plan.', h: 'accent' },
  { word: 'Focus.', h: 'accent' },
  { word: 'Done.', h: 'accent' },
];
const LOCK = BEATS.length * BEAT + 0.05;

export const Finale: React.FC = () => {
  const t = useT();
  const sp = useSpring();
  const beat = Math.floor(t / BEAT);
  const bt = t - beat * BEAT;
  const inMontage = t < LOCK;
  const tile = sp(LOCK, { damping: 12, stiffness: 120 });
  const fade = tw(t, 6.35, 7.0, 0, 1, ease.in);

  return (
    <AbsoluteFill>
      {inMontage ? (
        <AbsoluteFill>
          <Backdrop pools={[{ x: 50, y: 50, r: 55, a: 0.4, h: BEATS[Math.min(beat, 3)].h }]} gridScale={1 + bt * 0.15} />
          <Center>
            <div style={{ transform: `scale(${1.18 - Math.min(1, bt / 0.25) * 0.18 + bt * 0.06})`, opacity: 0.5, filter: 'blur(3px)' }}>
              <BeatVisual i={Math.min(beat, 3)} bt={bt} t={t} />
            </div>
          </Center>
          <Center>
            <div
              style={{
                fontSize: 230,
                fontWeight: 800,
                letterSpacing: '-0.05em',
                color: 'white',
                textShadow: `0 0 60px oklch(0 0 0 / 0.9), 0 0 120px ${hue(BEATS[Math.min(beat, 3)].h, 0.6)}`,
                transform: `scale(${1.3 - Math.min(1, bt / 0.18) * 0.3})`,
                opacity: Math.min(1, bt / 0.08),
              }}
            >
              {BEATS[Math.min(beat, 3)].word}
            </div>
          </Center>
          {BEATS.map((b, i) => (
            <Flash key={b.word} at={i * BEAT} dur={0.22} peak={i === 0 ? 0.5 : 0.35} />
          ))}
          <Burst x={960} y={540} at={3 * BEAT + 0.05} n={80} power={2400} gravity={300} seed={51} dur={1} />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill>
          <Backdrop pools={[{ x: 50, y: 42, r: 45, a: 0.45 }, { x: 50, y: 120, r: 70, a: 0.35 }]} gridOpacity={0.8} />
          {/* Slow embers */}
          {Array.from({ length: 40 }, (_, i) => {
            const life = ((t - LOCK) * (0.12 + rnd(i) * 0.15) + rnd(i + 50)) % 1;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: `${rnd(i + 9) * 100}%`,
                  top: `${100 - life * 110}%`,
                  width: 3 + rnd(i + 3) * 4,
                  height: 3 + rnd(i + 3) * 4,
                  borderRadius: 9,
                  background: hue('accent', 1, 0.85),
                  boxShadow: `0 0 10px ${hue('accent', 0.9)}`,
                  opacity: Math.sin(life * Math.PI) * 0.7 * tw(t, LOCK, LOCK + 0.8),
                }}
              />
            );
          })}
          <Shockwave x={960} y={330} at={LOCK} dur={1.4} max={1600} width={5} />
          <Flash at={LOCK} dur={0.4} peak={0.25} />
          <Center>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: -40 }}>
              <div style={{ transform: `scale(${tile}) rotate(${(1 - tile) * 20}deg)` }}>
                <Glass radius={64} thick clear={0.35} refract="lens-strong" blur={10} glowK={0.7 + Math.sin(t * 2) * 0.1} style={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Mark size={142} style={{ filter: `drop-shadow(0 6px 18px oklch(0 0 0 / 0.5)) drop-shadow(0 0 30px ${hue('accent', 0.5)})` }} />
                  <Sweep at={LOCK + 0.5} dur={1.1} radius={64} strength={0.35} />
                </Glass>
              </div>
              <div
                style={{
                  marginTop: 44,
                  fontSize: 150,
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: `${0.4 - tw(t, LOCK + 0.15, LOCK + 1.0) * 0.38}em`,
                  marginRight: `${-(0.4 - tw(t, LOCK + 0.15, LOCK + 1.0) * 0.38)}em`,
                  opacity: tw(t, LOCK + 0.15, LOCK + 0.8),
                  filter: `blur(${tw(t, LOCK + 0.15, LOCK + 0.9, 16, 0)}px)`,
                  backgroundImage: 'linear-gradient(180deg, white 30%, oklch(0.8 0.02 165))',
                  WebkitBackgroundClip: 'text',
                  color: 'transparent',
                }}
              >
                BASE
              </div>
              <div style={{ height: 24 }} />
              <Words text={CTA.tagline.replace('One task at a time.', '*One task at a time.*')} at={LOCK + 0.7} size={46} weight={600} color={C.fg2} stagger={0.07} />
              <div style={{ display: 'flex', gap: 16, marginTop: 50, opacity: tw(t, LOCK + 1.4, LOCK + 1.9), transform: `translateY(${tw(t, LOCK + 1.4, LOCK + 1.9, 20, 0)}px)` }}>
                <Gel glowK={0.5} style={{ height: 62, fontSize: 22 }}>
                  {CTA.primary}
                </Gel>
                <Glass radius={99} clear={0.12} style={{ height: 62, display: 'flex', alignItems: 'center', gap: 12, padding: '0 28px', fontSize: 20, fontWeight: 600 }}>
                  <GithubLogo size={22} weight="fill" /> {CTA.secondary}
                </Glass>
              </div>
            </div>
          </Center>
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ background: 'black', opacity: fade }} />
    </AbsoluteFill>
  );
};

const BeatVisual: React.FC<{ i: number; bt: number; t: number }> = ({ i, bt }) => {
  if (i === 0)
    return (
      <div style={{ fontSize: 520, fontWeight: 800, letterSpacing: '-0.05em', color: hue('rose', 0.9, 0.7), textShadow: `0 0 120px ${hue('rose', 0.7)}`, fontVariantNumeric: 'tabular-nums' }}>
        21.3
      </div>
    );
  if (i === 1)
    return (
      <Gel glowK={1.4} style={{ height: 200, fontSize: 80, padding: '0 90px', gap: 30 }}>
        <Lightning size={80} weight="fill" /> Smart Start
      </Gel>
    );
  if (i === 2)
    return (
      <div style={{ fontSize: 420, fontWeight: 200, letterSpacing: '-0.03em', color: hue('accent', 0.75, 0.82), textShadow: `0 0 100px ${hue('accent', 0.6)}`, fontVariantNumeric: 'tabular-nums' }}>
        {`1:29:${String(59 - Math.floor(bt * 10)).padStart(2, '0')}`}
      </div>
    );
  return (
    <div
      style={{
        width: 460,
        height: 460,
        borderRadius: 999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(120% 100% at 22% 0%, oklch(0.90 0.11 165), oklch(0.72 0.16 162) 55%, oklch(0.50 0.12 165))',
        boxShadow: `0 0 200px 40px ${hue('accent', 0.6)}`,
        transform: `scale(${kf(bt, [0, 0.2], [0.6, 1])})`,
      }}
    >
      <Check size={280} weight="bold" color={C.onAccent} />
    </div>
  );
};
