import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Kanban, ListBullets, Plus, CaretDown } from '@phosphor-icons/react';
import { Backdrop, Caption, Cursor, Gel, Glass, Pill, Well, type CursorKey } from '../components/primitives';
import { AppWindow, NavRail, TaskCard, type TaskData } from '../components/app';
import { C, hue } from '../theme';
import { ease, kf, tw, useSpring, useT } from '../lib';

const WW = 1500;
const WH = 900;
const COL_X = [130, 590, 1050];
const COL_W = 420;
const SLOT_Y = [455, 655, 855];

const LISTS = [
  { name: 'Build', count: '0/2', money: '₹40,000' },
  { name: 'Operations', count: '0/2', money: '₹25,000' },
  { name: 'Money', count: '0/2', money: '₹10,000' },
];

const T: Record<string, TaskData> = {
  landing: { title: 'Rewrite the landing page copy', score: '21.3', scoreHue: 'rose', pills: [{ h: 'rose', label: 'Red alert' }, { h: 'amber', label: 'Emergency 3' }], meta: '16/03 · 150 min', sub: '0/3' },
  lease: { title: 'Countersign the studio lease', score: '3.6', pills: [{ h: 'cyan', label: 'Due in 5d' }], meta: '22/03 · 30 min' },
  incorp: { title: 'File the incorporation paperwork', score: '14.3', pills: [{ h: 'rose', label: 'Red alert' }, { h: 'accent', label: 'Running' }], progress: 0.61, meta: '1d left · 90 min', sub: '2/5' },
  mca: { title: 'Upload to the MCA portal', score: '4.5', pills: [{ h: 'cyan', label: 'Queued' }], meta: '20/03 · 30 min' },
  invoices: { title: 'Chase the late invoices', score: '2.1', pills: [{ h: 'amber', label: 'Review' }], meta: '25/03 · 45 min' },
  account: { title: 'Open the current account', score: '8.6', locked: true, desc: 'Needs the certificate of incorporation.', meta: '20/03 · 120 min' },
};

// Window camera: entrance from below, a 3D resting pose, then square-on for the demo.
const CAM_T = [0, 1.1, 4.7, 5.5, 7.4, 9.75, 10.5];
const cam = (t: number) => ({
  x: kf(t, CAM_T, [200, 280, 260, 0, 0, -110, -2700]),
  y: kf(t, CAM_T, [380, 30, 20, 0, 0, -70, -70]),
  z: kf(t, CAM_T, [-700, 0, 40, 0, 0, 0, 0]),
  rx: kf(t, CAM_T, [45, 8, 6, 0, 0, 0, 0]),
  ry: kf(t, CAM_T, [-8, -20, -15, 0, 0, 0, -18]),
  rz: kf(t, CAM_T, [5, 0, 0, 0, 0, 0, 0]),
  s: kf(t, CAM_T, [0.7, 0.74, 0.78, 1.06, 1.06, 1.16, 1.1]),
});
const S = 1.06;
/** Window coords → screen coords, valid once the camera is square-on. */
const toScreen = (x: number, y: number) => ({ x: 960 + (x - WW / 2) * S, y: 540 + (y - WH / 2) * S });

export const Board: React.FC = () => {
  const t = useT();
  const sp = useSpring();
  const c = cam(t);
  const enterOp = tw(t, 0, 0.3);
  const exitBlur = tw(t, 9.75, 10.5, 0, 24, ease.in);

  // Drag: lease card from Build slot 1 → Operations slot 1.
  const grab = 6.0;
  const drop = 7.05;
  const lift = tw(t, grab, grab + 0.15) * (1 - tw(t, drop, drop + 0.2));
  const move = tw(t, grab + 0.1, drop, 0, 1, ease.inOut);
  const settle = sp(drop, { damping: 9, stiffness: 220 });
  const leaseX = COL_X[0] + (COL_X[1] - COL_X[0]) * move;
  const leaseY = SLOT_Y[1] + (t > drop ? (1 - settle) * -6 : 0) - lift * 14;
  const mcaShift = sp(6.55, { damping: 13, stiffness: 160 });

  const g = toScreen(COL_X[0] + 210, SLOT_Y[1] + 40);
  const d = toScreen(COL_X[1] + 210, SLOT_Y[1] + 40);
  const keys: CursorKey[] = [
    { t: 5.2, x: 1500, y: 1000 },
    { t: 5.95, x: g.x, y: g.y, click: true },
    { t: grab + 0.1, x: g.x, y: g.y },
    { t: drop, x: d.x, y: d.y, click: true },
    { t: 7.9, x: d.x + 220, y: d.y + 160 },
    { t: 9.4, x: d.x + 260, y: d.y + 180 },
  ];

  // "Waiting on" link: incorporation → current account.
  const linkP = tw(t, 7.75, 8.6, 0, 1, ease.inOut);
  const p0 = { x: COL_X[1] + COL_W, y: SLOT_Y[0] + 60 };
  const p1 = { x: COL_X[2], y: SLOT_Y[1] + 50 };
  const path = `M ${p0.x} ${p0.y} C ${p0.x + 80} ${p0.y}, ${p1.x - 80} ${p1.y}, ${p1.x} ${p1.y}`;
  const travel = ((t - 8.6) * 0.8) % 1;

  const colIn = (i: number) => tw(t, 0.55 + i * 0.12, 1.25 + i * 0.12);
  const cardIn = (col: number, slot: number) => {
    const p = sp(0.8 + col * 0.12 + slot * 0.1, { damping: 15, stiffness: 140 });
    return { opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 60}px) scale(${0.94 + p * 0.06})` };
  };
  const place = (x: number, y: number, extra?: React.CSSProperties): React.CSSProperties => ({ position: 'absolute', left: x, top: y, ...extra });

  return (
    <AbsoluteFill>
      <Backdrop pools={[{ x: 70, y: 110, r: 70, a: 0.35 }, { x: 0, y: 0, r: 40, a: 0.12 }]} />

      <AbsoluteFill style={{ perspective: 1800, alignItems: 'center', justifyContent: 'center', opacity: enterOp * tw(t, 10.1, 10.5, 1, 0), filter: exitBlur > 0.3 ? `blur(${exitBlur}px)` : undefined }}>
        <div style={{ transform: `translate3d(${c.x}px, ${c.y}px, ${c.z}px) rotateX(${c.rx}deg) rotateY(${c.ry}deg) rotateZ(${c.rz}deg) scale(${c.s})` }}>
          <AppWindow w={WW} h={WH}>
            <NavRail style={{ position: 'absolute', left: 26, top: 26 }} />

            {/* Header + project hero */}
            <div style={place(130, 34, { display: 'flex', gap: 14, fontSize: 18, color: C.fg3, fontWeight: 500 })}>
              Projects <span style={{ color: C.fg4 }}>/</span> <span style={{ color: C.fg1 }}>Shreekant Empire</span>
            </div>
            <div style={place(130, 82, { opacity: tw(t, 0.25, 0.75) })}>
              <Glass radius={36} clear={0.1} style={{ width: 1340, height: 180, padding: '34px 40px', display: 'flex', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 46, fontWeight: 700, letterSpacing: '-0.03em' }}>Shreekant Empire</div>
                  <div style={{ fontSize: 19, color: C.fg3, marginTop: 10 }}>The holding company: incorporation, compliance and the first two revenue lines.</div>
                </div>
                <Ring p={0.2 * tw(t, 1.0, 2.2)} />
                {[
                  ['3 lists', 'project'],
                  ['1 of 6', 'tasks done'],
                  ['465 min', 'work left'],
                  ['₹1.6L', 'value'],
                ].map(([a, b]) => (
                  <div key={a} style={{ marginLeft: 44, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ fontSize: 22, fontWeight: 700 }}>{a}</div>
                    <div style={{ fontSize: 15, color: C.fg3 }}>{b}</div>
                  </div>
                ))}
              </Glass>
            </div>

            {/* Toolbar */}
            <div style={place(130, 296, { display: 'flex', alignItems: 'center', gap: 10, opacity: tw(t, 0.45, 0.95) })}>
              <Well style={{ display: 'flex', padding: 5, gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 99, background: 'oklch(1 0 0 / 0.1)', fontSize: 17, fontWeight: 600 }}>
                  <Kanban size={18} weight="fill" /> Board
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', fontSize: 17, color: C.fg3 }}>
                  <ListBullets size={18} weight="bold" /> List
                </div>
              </Well>
            </div>
            <div style={place(1286, 292, { opacity: tw(t, 0.45, 0.95) })}>
              <Gel glowK={0.35} style={{ height: 50, fontSize: 18, padding: '0 24px' }}>
                <Plus size={18} weight="bold" /> New task
              </Gel>
            </div>

            {/* Columns */}
            {LISTS.map((l, i) => (
              <div key={l.name} style={place(COL_X[i] - 10, 370, { opacity: colIn(i), transform: `translateY(${(1 - colIn(i)) * 40}px)` })}>
                <Glass radius={30} clear={0.14} style={{ width: COL_W + 20, height: 620, padding: '22px 24px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 7, height: 7, borderRadius: 9, background: C.violet }} />
                    <span style={{ fontSize: 21, fontWeight: 700 }}>{l.name}</span>
                    <span style={{ fontSize: 16, color: C.fg4 }}>{l.count}</span>
                    <span style={{ flex: 1 }} />
                    <Pill h="grey" size={14} dot={false}>
                      {l.money}
                    </Pill>
                    <Plus size={20} color={C.fg3} weight="bold" />
                    <CaretDown size={18} color={C.fg3} weight="bold" />
                  </div>
                </Glass>
              </div>
            ))}

            {/* Cards */}
            <div style={place(COL_X[0], SLOT_Y[0], cardIn(0, 0))}>
              <TaskCard task={T.landing} width={COL_W} compact />
            </div>
            <div style={place(COL_X[1], SLOT_Y[0], cardIn(1, 0))}>
              <TaskCard task={T.incorp} width={COL_W} compact glowK={linkP > 0 ? 0.35 * linkP : 0} />
            </div>
            <div style={place(COL_X[1], SLOT_Y[1] + mcaShift * 200, cardIn(1, 1))}>
              <TaskCard task={T.mca} width={COL_W} compact />
            </div>
            <div style={place(COL_X[2], SLOT_Y[0], cardIn(2, 0))}>
              <TaskCard task={T.invoices} width={COL_W} compact />
            </div>
            <div style={place(COL_X[2], SLOT_Y[1], cardIn(2, 1))}>
              <TaskCard
                task={{ ...T.account, pills: linkP >= 1 ? [{ h: 'cyan', label: 'Waiting on: File the incorporation…' }] : undefined }}
                width={COL_W}
                compact
                glowHue="cyan"
                glowK={tw(t, 8.5, 8.9, 0, 0.4)}
              />
            </div>

            {/* Dependency link */}
            <svg width={WW} height={WH} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
              <path d={path} fill="none" stroke={hue('cyan', 0.35)} strokeWidth={10} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - linkP} style={{ filter: 'blur(6px)' }} />
              <path d={path} fill="none" stroke={hue('cyan', 1, 0.82)} strokeWidth={3} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - linkP} />
              {linkP >= 1 && (
                <circle r={7} fill="white" style={{ filter: `drop-shadow(0 0 10px ${C.cyan})`, offsetPath: `path('${path}')`, offsetDistance: `${travel * 100}%` } as React.CSSProperties} />
              )}
            </svg>

            {/* The dragged card, above everything */}
            <div
              style={place(leaseX, leaseY, {
                ...cardIn(0, 1),
                ...(lift > 0 || move > 0
                  ? { transform: `scale(${1 + lift * 0.05}) rotate(${lift * 2.5 * (1 - move * 0.6)}deg)`, filter: `drop-shadow(0 ${30 * lift}px ${40 * lift}px oklch(0 0 0 / 0.7))` }
                  : null),
              })}
            >
              <TaskCard task={T.lease} width={COL_W} compact glowK={lift * 0.5} />
            </div>
          </AppWindow>
        </div>
      </AbsoluteFill>

      {/* Captions */}
      <div style={{ position: 'absolute', left: 110, top: 300, width: 640 }}>
        <Caption kicker="Projects → Lists → Tasks" title="Everything in its *place.*" sub="Board or list. Drag by mouse, finger or keyboard." at={1.3} out={4.4} size={80} />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 340,
          background: 'linear-gradient(transparent, oklch(0 0 0 / 0.85))',
          opacity: tw(t, 7.8, 8.3) * tw(t, 9.6, 10.0, 1, 0),
        }}
      />
      <div style={{ position: 'absolute', left: 110, bottom: 90, width: 1100 }}>
        <Caption kicker="Dependencies" title="Know what's *waiting on* what." at={7.95} out={9.6} size={72} h="cyan" />
      </div>

      <Cursor keys={keys} show={[5.2, 9.6]} />
    </AbsoluteFill>
  );
};

const Ring: React.FC<{ p: number }> = ({ p }) => {
  const r = 30;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: 'relative', width: 76, height: 76, marginLeft: 20 }}>
      <svg width={76} height={76} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={38} cy={38} r={r} fill="none" stroke="oklch(1 0 0 / 0.08)" strokeWidth={6} />
        <circle cx={38} cy={38} r={r} fill="none" stroke={C.accent} strokeWidth={6} strokeLinecap="round" strokeDasharray={`${circ * p} ${circ}`} style={{ filter: `drop-shadow(0 0 6px ${C.accent})` }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700 }}>{Math.round(p * 100)}%</div>
    </div>
  );
};
