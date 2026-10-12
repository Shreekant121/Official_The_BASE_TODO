import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Backdrop, Burst, Center, Flash, Glass, Mark, Shockwave, Sweep, Words } from '../components/primitives';
import { CTA } from '../components/app';
import { C, GLASS, hue } from '../theme';
import { ease, tw, useSpring, useT } from '../lib';

const W = 1920;
const H = 1080;

export const Logo: React.FC = () => {
  const t = useT();
  const sp = useSpring();
  const POP = 1.55;

  // Six gel droplets spiral in and fuse (goo filter) into one sphere.
  const merge = tw(t, 0.15, 1.35, 0, 1, ease.inOut);
  const blobs = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 + merge * 2.4;
    const r = (1 - merge) * 280;
    const s = 70 + merge * 80 + (i % 2) * 20 * (1 - merge);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r, s };
  });
  const wobble = sp(1.2, { damping: 6, stiffness: 180 });
  const sphereScale = (t < POP ? 1 : tw(t, POP, POP + 0.12, 1, 0, ease.in)) * tw(t, 0, 0.3, 0.3, 1);
  const sq = 1 + Math.sin(wobble * Math.PI * 3) * 0.12 * (1 - wobble);

  const tile = sp(POP, { damping: 11, stiffness: 140 });
  const exit = tw(t, 5.6, 6.5, 0, 1, ease.in);
  const word = tw(t, 2.15, 3.1, 0, 1, ease.out);
  const glowPulse = 0.6 + Math.sin(t * 2.2) * 0.1;

  return (
    <AbsoluteFill>
      <Backdrop
        pools={[
          { x: 50, y: 50, r: 30 + tw(t, POP, POP + 1.2, 0, 40), a: 0.45 * tw(t, POP - 0.2, POP + 0.4) },
          { x: 50, y: 115, r: 70, a: 0.3 },
        ]}
        gridScale={1 + tw(t, POP, POP + 0.8, 0.08, 0, ease.out)}
        gridOpacity={0.4 + tw(t, POP, POP + 0.5, 0, 0.6)}
      />

      <AbsoluteFill style={{ transform: `scale(${1 + exit * 7})`, opacity: 1 - tw(exit, 0.5, 1), filter: exit > 0 ? `blur(${exit * 20}px)` : undefined }}>
        {/* Gel droplets */}
        {sphereScale > 0.001 && (
          <AbsoluteFill style={{ filter: 'url(#goo)' }}>
            <Center>
              <div style={{ position: 'relative', width: 0, height: 0, transform: `scale(${sphereScale}) scale(${sq}, ${2 - sq})` }}>
                {blobs.map((b, i) => (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      left: b.x - b.s,
                      top: b.y - b.s,
                      width: b.s * 2,
                      height: b.s * 2,
                      borderRadius: '50%',
                      background: GLASS.gel,
                    }}
                  />
                ))}
              </div>
            </Center>
          </AbsoluteFill>
        )}
        {/* Specular highlight riding on the merged sphere */}
        {sphereScale > 0.001 && merge > 0.6 && (
          <Center>
            <div
              style={{
                width: 300,
                height: 300,
                borderRadius: '50%',
                transform: `scale(${sphereScale * merge})`,
                background: 'radial-gradient(40% 30% at 35% 25%, oklch(1 0 0 / 0.7), transparent 70%)',
                boxShadow: `0 0 120px 30px ${hue('accent', 0.5 * merge)}`,
              }}
            />
          </Center>
        )}

        <Flash at={POP} dur={0.5} peak={0.55} />
        <Shockwave x={W / 2} y={H / 2} at={POP} dur={1.3} max={1300} width={5} />
        <Shockwave x={W / 2} y={H / 2} at={POP + 0.12} dur={1.6} max={1700} width={2} />
        <Burst x={W / 2} y={H / 2} at={POP} n={90} power={2200} gravity={200} dur={2} seed={3} />

        {/* App tile + wordmark */}
        <Center>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `translateY(${-tw(t, 2.1, 2.9, 0, 70, ease.inOut)}px)` }}>
            {t >= POP && (
              <div style={{ transform: `scale(${tile}) rotate(${(1 - tile) * -25}deg)`, opacity: Math.min(1, tile * 2) }}>
                <Glass radius={72} thick clear={0.35} refract="lens-strong" blur={10} glowK={glowPulse} style={{ width: 260, height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Mark size={168} style={{ filter: `drop-shadow(0 6px 18px oklch(0 0 0 / 0.5)) drop-shadow(0 0 30px ${hue('accent', 0.5)})` }} />
                  <Sweep at={POP + 0.45} dur={1} radius={72} strength={0.35} />
                </Glass>
              </div>
            )}
            <div
              style={{
                marginTop: 60,
                fontSize: 170,
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: `${0.5 - word * 0.48}em`,
                marginRight: `${-(0.5 - word * 0.48)}em`,
                opacity: word,
                filter: word < 1 ? `blur(${(1 - word) * 18}px)` : undefined,
                backgroundImage: 'linear-gradient(180deg, white 30%, oklch(0.8 0.02 165))',
                WebkitBackgroundClip: 'text',
                color: 'transparent',
              }}
            >
              BASE
            </div>
            <div style={{ height: 30 }} />
            <Words text={CTA.tagline.replace('One task at a time.', '*One task at a time.*')} at={3.2} size={50} weight={600} color={C.fg2} stagger={0.09} />
          </div>
        </Center>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
