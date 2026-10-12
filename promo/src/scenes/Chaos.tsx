import React, { useMemo } from 'react';
import { AbsoluteFill } from 'remotion';
import { Backdrop, Center, Words } from '../components/primitives';
import { TaskCard, type TaskData } from '../components/app';
import { C, hue, type Hue } from '../theme';
import { ease, kf, lerp, rnd, tw, useT } from '../lib';

const TITLES = [
  'Reply to the CA',
  'Quarterly compliance review',
  'Rewrite the landing page copy',
  'File the incorporation paperwork',
  'Invoice Rahul',
  'Get the acoustic treatment quote',
  'Renew the domain',
  'Draft the launch-week invite list',
  'Pitch the podcast',
  'Fix the onboarding bug',
  'Call the bank',
  'Countersign the studio lease',
  'Book the photographer',
  'Update the pitch deck',
  'Pay the GST',
  'Upload to the MCA portal',
  'Open the current account',
  'Plan the offsite',
  'Answer 43 emails',
  'Prep the board update',
  'Order the microphones',
  'Chase the late invoices',
  'Hire a video editor',
  'Write the release notes',
];

const BADGES: { h: Hue; label: string }[][] = [
  [{ h: 'rose', label: 'Overdue' }],
  [{ h: 'amber', label: 'Due today' }],
  [{ h: 'rose', label: 'Red alert' }, { h: 'amber', label: 'Emergency 3' }],
  [{ h: 'cyan', label: 'Waiting on' }],
  [{ h: 'rose', label: 'Overdue 4d' }],
  [{ h: 'amber', label: 'Due in 2h' }],
];

const N = 44;

export const Chaos: React.FC = () => {
  const t = useT();
  const cards = useMemo(
    () =>
      Array.from({ length: N }, (_, i) => {
        const task: TaskData = {
          title: TITLES[i % TITLES.length],
          pills: BADGES[Math.floor(rnd(i + 7) * BADGES.length)],
          score: rnd(i + 3) > 0.5 ? (rnd(i + 9) * 20 + 1).toFixed(1) : undefined,
          scoreHue: 'amber',
        };
        const ang = rnd(i + 1) * Math.PI * 2;
        const rad = 300 + rnd(i + 2) * 700;
        return {
          task,
          at: 0.25 + i * 0.12 + rnd(i + 4) * 0.2,
          x: Math.cos(ang) * rad * 1.25,
          y: Math.sin(ang) * rad * 0.62,
          z: -500 + rnd(i + 5) * 650,
          rx: (rnd(i + 6) - 0.5) * 40,
          ry: (rnd(i + 8) - 0.5) * 50,
          rz: (rnd(i + 10) - 0.5) * 24,
          spin: (rnd(i + 11) > 0.5 ? 1 : -1) * (300 + rnd(i + 12) * 400),
          vortexAt: 6.55 + rnd(i + 13) * 0.4,
        };
      }),
    [],
  );

  const shake = tw(t, 2.8, 6.6, 0, 7, ease.inOut) * tw(t, 6.8, 7.4, 1, 0);
  const sx = Math.sin(t * 41) * shake + Math.sin(t * 17) * shake * 0.6;
  const sy = Math.cos(t * 37) * shake * 0.7;

  const count = Math.round(kf(t, [0.4, 2.6], [0, 128], ease.out));
  const stress = tw(t, 0.5, 5.5, 0, 1, ease.inOut);
  const coreGlow = tw(t, 6.9, 8.0, 0, 1, ease.in);

  return (
    <AbsoluteFill>
      <Backdrop
        pools={[
          { x: 50, y: 110, r: 70, a: 0.25 * (1 - stress) + 0.05 },
          { x: 50, y: 60, r: 65, a: 0.22 * stress * (1 - coreGlow), h: 'rose' },
          { x: 15, y: 10, r: 40, a: 0.12 * stress, h: 'amber' },
        ]}
        gridOpacity={tw(t, 0, 1.2)}
      />
      <AbsoluteFill style={{ transform: `translate(${sx}px, ${sy}px)`, perspective: 1100 }}>
        <AbsoluteFill style={{ transformStyle: 'preserve-3d', alignItems: 'center', justifyContent: 'center' }}>
          {cards.map((c, i) => {
            const pIn = tw(t, c.at, c.at + 1.1, 0, 1, ease.out);
            if (pIn <= 0) return null;
            const drift = (t - c.at) * 22;
            const v = tw(t, c.vortexAt, c.vortexAt + 0.85, 0, 1, ease.inOut);
            const x = lerp(c.x * (1 + (1 - pIn) * 0.6), 0, v);
            const y = lerp(c.y * (1 + (1 - pIn) * 0.6), 0, v);
            const z = lerp(lerp(-2400, c.z, pIn) + drift, -300, v);
            const rz = c.rz + v * c.spin;
            const op = pIn * (1 - tw(v, 0.7, 1, 0, 1, ease.in));
            const blur = Math.max(0, (1 - pIn) * 10) + v * 6;
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  transform: `translate3d(${x}px, ${y}px, ${z}px) rotateX(${c.rx * (1 - v)}deg) rotateY(${c.ry * (1 - v)}deg) rotateZ(${rz}deg) scale(${1 - v * 0.7})`,
                  opacity: op,
                  filter: blur > 0.2 ? `blur(${blur}px)` : undefined,
                }}
              >
                <TaskCard task={c.task} width={360} compact flat glowHue="rose" glowK={c.task.pills?.[0].h === 'rose' ? 0.25 * stress : 0} />
              </div>
            );
          })}
        </AbsoluteFill>
      </AbsoluteFill>

      {/* Darken behind the copy so it reads over the storm. */}
      <AbsoluteFill style={{ background: 'radial-gradient(40% 30% at 50% 50%, oklch(0 0 0 / 0.75), transparent 100%)', opacity: tw(t, 0.3, 1) * (1 - coreGlow) }} />

      <Center>
        {t < 3.25 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: tw(t, 2.9, 3.2, 1, 0, ease.in), filter: `blur(${tw(t, 2.9, 3.2, 0, 14)}px)` }}>
            <div
              style={{
                fontSize: 260,
                fontWeight: 800,
                letterSpacing: '-0.05em',
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
                color: C.fg1,
                opacity: tw(t, 0.35, 0.8),
                transform: `scale(${kf(t, [0.35, 0.8, 2.6], [1.4, 1, 1.06])})`,
                textShadow: `0 0 80px ${hue('rose', 0.35 * stress)}`,
              }}
            >
              {count}
            </div>
            <Words text="open tasks." at={0.75} size={64} weight={600} color={C.fg2} />
          </div>
        )}
        {t >= 3.25 && t < 5.6 && <Words text="Everything feels *urgent.*" at={3.3} size={110} accent="rose" out={5.2} />}
        {t >= 5.6 && <Words text="So what do you do *now?*" at={5.65} size={110} out={7.05} />}
      </Center>

      {/* The single point everything collapses into. */}
      <Center>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 99,
            background: 'white',
            opacity: coreGlow,
            transform: `scale(${0.2 + coreGlow * 1.2})`,
            boxShadow: `0 0 60px 20px ${hue('accent', 0.9, 0.85)}, 0 0 220px 80px ${hue('accent', 0.5)}`,
          }}
        />
      </Center>
    </AbsoluteFill>
  );
};
