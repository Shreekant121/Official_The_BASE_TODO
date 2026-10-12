import React from 'react';
import { AbsoluteFill } from 'remotion';
import {
  ArrowUp,
  ArrowCounterClockwise,
  Check,
  CircleNotch,
  Cloud,
  FolderOpen,
  ListPlus,
  Laptop,
  MagnifyingGlass,
  Microphone,
  Plus,
  Question,
  Sparkle,
  TreeStructure,
  ArrowsLeftRight,
} from '@phosphor-icons/react';
import { Backdrop, Burst, Caption, Cursor, Gel, Glass, Pill, Score, Shockwave, Well, type CursorKey } from '../components/primitives';
import { C, hue, type Hue } from '../theme';
import { clamp, ease, kf, tw, useSpring, useT } from '../lib';

/* ---------------- Timing ---------------- */
const PROMPT = 'Plan launch week, and pull anything overdue into today.';
const TYPE = [0.7, 2.3];
const SEND = 2.5;
const APPROVE = 9.35;
const REVERT = 12.25;

type Chip = { at: number; icon: React.ReactNode; label: string; meta: string };
const CHIPS: Chip[] = [
  { at: 3.15, icon: <MagnifyingGlass size={18} weight="bold" />, label: "Searched tasks 'launch'", meta: '14 results' },
  { at: 3.85, icon: <FolderOpen size={18} weight="fill" />, label: 'Read project · Studio Launch', meta: '3 lists' },
  { at: 4.55, icon: <ListPlus size={18} weight="bold" />, label: 'Created list ⚡ Launch week', meta: '1 list' },
  { at: 5.15, icon: <Plus size={18} weight="bold" />, label: 'Created 5 tasks in Launch week', meta: '5 tasks' },
  { at: 6.45, icon: <TreeStructure size={18} weight="fill" />, label: "Broke 'Pitch the podcast' into 4 steps", meta: '4 subtasks' },
  { at: 7.25, icon: <ArrowsLeftRight size={18} weight="bold" />, label: "Moved 2 overdue tasks to today's queue", meta: '2 moved' },
];
const ASK_AT = 8.15;
const ANSWER_AT = 9.95;
const FOOT_AT = 10.95;
const ANSWER =
  "Launch week is planned: 5 tasks in a new list, and the podcast pitch is in 4 steps. The 2 overdue tasks are in today's queue, and 3 low scorers went to Backburner.";

/* Undo order on Revert: newest change first. */
const UNDO = { backburner: REVERT + 0.15, moved: REVERT + 0.45, subtasks: REVERT + 0.7, tasks: REVERT + 0.85, list: REVERT + 1.45 };

/* ---------------- Chat layout (pinned to bottom) ---------------- */
const PANEL = { x: 110, y: 250, w: 900, h: 780 };
const VIEW = { top: PANEL.y + 96, h: 560, left: PANEL.x + 28, w: PANEL.w - 56 };
const GAP = 14;

type Item = { at: number; h: (t: number) => number };
const ITEMS: Item[] = [
  { at: SEND, h: () => 74 },
  ...CHIPS.map((c) => ({ at: c.at, h: () => 50 })),
  { at: ASK_AT, h: (t: number) => kf(t, [APPROVE + 0.15, APPROVE + 0.55], [244, 50]) },
  { at: ANSWER_AT, h: () => 112 },
  { at: FOOT_AT, h: () => 52 },
];

const grow = (t: number, at: number) => tw(t, at, at + 0.45, 0, 1, ease.out);

const layout = (t: number) => {
  const tops: number[] = [];
  let y = 0;
  ITEMS.forEach((it) => {
    const g = grow(t, it.at);
    tops.push(y);
    y += (it.h(t) + GAP) * g;
  });
  const offset = Math.max(0, y - VIEW.h);
  return { tops: tops.map((v) => VIEW.top + v - offset), total: y };
};

const approveAt = () => {
  const L = layout(APPROVE);
  return { x: VIEW.left + VIEW.w - 96, y: L.tops[7] + 244 - 48 };
};
const revertAt = () => {
  const L = layout(REVERT);
  return { x: VIEW.left + 84, y: L.tops[9] + 26 };
};

/* ---------------- Board data ---------------- */
const LAUNCH = ['Send the invite list', 'Book the venue walkthrough', 'Pitch the podcast', 'Write the press note', 'Schedule the launch posts'];
const OVERDUE = ['Chase the late invoices', 'Reply to the CA'];
const BACK = ['Renew the domain', 'Book the photographer', 'Order the microphones'];
const BOARD = { x: 1060, y: 250, w: 750, h: 780 };

export const Agent: React.FC = () => {
  const t = useT();
  const sp = useSpring();
  const L = layout(t);

  const panelIn = sp(0, { damping: 16, stiffness: 110 });
  const boardIn = sp(0.15, { damping: 16, stiffness: 110 });
  const typed = Math.round(tw(t, TYPE[0], TYPE[1], 0, PROMPT.length, (x) => x));
  const sent = t >= SEND;
  const working = t >= SEND + 0.3 && t < ANSWER_AT;
  const reverting = t >= REVERT && t < REVERT + 1.9;
  const reverted = t >= UNDO.list + 0.4;
  const exit = tw(t, 15.9, 16.5, 0, 1, ease.in);

  const ap = approveAt();
  const rv = revertAt();
  const keys: CursorKey[] = [
    { t: 7.6, x: 1500, y: 1060 },
    { t: APPROVE, x: ap.x, y: ap.y, click: true },
    { t: 10.4, x: ap.x - 80, y: ap.y + 160 },
    { t: REVERT, x: rv.x, y: rv.y, click: true },
    { t: 13.4, x: rv.x + 300, y: rv.y + 90 },
  ];

  /** Visibility of a board change: born at `at`, unborn again when reverted. */
  const life = (at: number, undo: number, d = 14) => {
    const born = sp(at, { damping: d, stiffness: 150 });
    const gone = tw(t, undo, undo + 0.35, 0, 1, ease.in);
    return { born, gone, v: clamp(born) * (1 - gone) };
  };

  const listLife = life(4.75, UNDO.list);
  const askCollapse = tw(t, APPROVE + 0.15, APPROVE + 0.5);

  return (
    <AbsoluteFill>
      <Backdrop pools={[{ x: 25, y: 110, r: 60, a: 0.25 }, { x: 80, y: -5, r: 50, a: 0.22, h: 'violet' }, { x: 80, y: 60, r: 40, a: reverting ? 0.18 : 0.06, h: 'violet' }]} />

      <AbsoluteFill style={{ opacity: 1 - exit, filter: exit > 0 ? `blur(${exit * 20}px)` : undefined, transform: `scale(${1 + exit * 0.1})` }}>
        {/* Captions */}
        <div style={{ position: 'absolute', left: 110, top: 70, width: 1000 }}>
          {t < 11.2 && <Caption kicker="AI assistant" title="Ask once. *It does the work.*" at={0.35} out={10.8} size={66} h="violet" />}
          {t >= 11.2 && t < 13.9 && <Caption kicker="Revert" title="Every turn, *one click to undo.*" at={11.25} out={13.6} size={66} h="violet" />}
          {t >= 13.9 && <Caption kicker="Your model, your machine" title="Gemini, or *fully local.*" at={13.95} size={66} h="violet" />}
        </div>
        <ModelMorph t={t} />

        {/* ---------- Chat panel ---------- */}
        <div style={{ position: 'absolute', left: PANEL.x, top: PANEL.y, opacity: Math.min(1, panelIn * 1.4), transform: `translateY(${(1 - panelIn) * 200}px)` }}>
          <Glass radius={44} clear={0.1} style={{ width: PANEL.w, height: PANEL.h }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '26px 30px' }}>
              <AtlasOrb size={38} spin={t} busy={working} />
              <span style={{ fontSize: 25, fontWeight: 700 }}>Plan launch week</span>
              <span style={{ flex: 1 }} />
              <Pill h="violet" size={15}>
                Agent
              </Pill>
            </div>
            <div style={{ position: 'absolute', left: 28, right: 28, top: 92, height: 1, background: C.lineFaint }} />
          </Glass>
        </div>

        {/* Messages, clipped to the chat viewport */}
        <div style={{ position: 'absolute', left: VIEW.left, top: VIEW.top, width: VIEW.w, height: VIEW.h, overflow: 'hidden', opacity: panelIn, maskImage: 'linear-gradient(transparent 0, black 40px, black 100%)' }}>
          <div style={{ position: 'absolute', left: 0, top: -VIEW.top, width: VIEW.w }}>
            {/* user bubble */}
            {sent && (
              <Row top={L.tops[0]} g={grow(t, SEND)} align="right">
                <div style={{ padding: '20px 28px', borderRadius: 30, fontSize: 21, fontWeight: 500, background: 'linear-gradient(155deg, oklch(1 0 0 / 0.12), oklch(1 0 0 / 0.05))', boxShadow: 'inset 0 1px 1px oklch(1 0 0 / 0.18)' }}>{PROMPT}</div>
              </Row>
            )}
            {CHIPS.map((c, i) => {
              if (t < c.at) return null;
              const done = t > c.at + 0.5;
              const undone = reverted;
              return (
                <Row key={c.label} top={L.tops[i + 1]} g={grow(t, c.at)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {i === 0 ? <AtlasOrb size={30} spin={t} busy={working} /> : <span style={{ width: 30 }} />}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        height: 46,
                        padding: '0 20px',
                        borderRadius: 99,
                        fontSize: 18,
                        fontWeight: 600,
                        background: 'oklch(1 0 0 / 0.04)',
                        boxShadow: `inset 0 0 0 1px ${done ? hue('violet', 0.3) : C.lineSoft}`,
                        color: undone ? C.fg4 : C.fg1,
                        textDecoration: undone ? 'line-through' : undefined,
                      }}
                    >
                      <span style={{ color: hue('violet', 1, 0.82), display: 'flex' }}>{c.icon}</span>
                      {c.label}
                      <span style={{ color: C.fg3, fontWeight: 500 }}>{c.meta}</span>
                      {done ? (
                        <Check size={16} weight="bold" color={undone ? C.fg4 : C.accentLift} />
                      ) : (
                        <CircleNotch size={16} weight="bold" color={hue('violet', 1, 0.8)} style={{ transform: `rotate(${t * 720}deg)` }} />
                      )}
                    </div>
                  </div>
                </Row>
              );
            })}
            {/* Approval (question) card */}
            {t >= ASK_AT && (
              <Row top={L.tops[7]} g={grow(t, ASK_AT)}>
                <div style={{ marginLeft: 42, position: 'relative' }}>
                  {askCollapse < 1 && (
                    <Glass
                      radius={30}
                      tint="violet"
                      tintA={0.16}
                      clear={0.1}
                      glowHue="violet"
                      glowK={0.25 * (1 - askCollapse)}
                      style={{ width: VIEW.w - 42, height: 244, padding: '22px 26px', opacity: 1 - askCollapse, transform: `scaleY(${1 - askCollapse * 0.6})`, transformOrigin: 'top' }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 700, color: hue('violet', 1, 0.85) }}>
                        <Question size={20} weight="fill" /> Needs your OK
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 600, marginTop: 10 }}>Move 3 low-score tasks to 🧊 Backburner?</div>
                      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                        {BACK.map((b) => (
                          <Pill key={b} h="grey" size={14} dot={false}>
                            {b}
                          </Pill>
                        ))}
                      </div>
                      <div style={{ position: 'absolute', right: 26, bottom: 22, display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div style={{ height: 52, padding: '0 26px', borderRadius: 99, display: 'flex', alignItems: 'center', fontSize: 19, fontWeight: 600, boxShadow: `inset 0 0 0 1px ${C.lineStrong}` }}>Deny</div>
                        <Gel press={kf(t, [APPROVE - 0.08, APPROVE, APPROVE + 0.25], [0, 1, 0])} glowK={0.4} style={{ height: 52, fontSize: 19, padding: '0 28px' }}>
                          <Check size={18} weight="bold" /> Approve
                        </Gel>
                      </div>
                    </Glass>
                  )}
                  {askCollapse > 0 && (
                    <div style={{ position: 'absolute', top: 0, left: 0, whiteSpace: 'nowrap', opacity: askCollapse, display: 'flex', alignItems: 'center', gap: 12, height: 46, padding: '0 20px', borderRadius: 99, fontSize: 18, fontWeight: 600, background: hue('accent', 0.1), boxShadow: `inset 0 0 0 1px ${hue('accent', 0.35)}`, color: reverted ? C.fg4 : C.fg1, textDecoration: reverted ? 'line-through' : undefined }}>
                      <Check size={18} weight="bold" color={C.accentLift} /> Approved · moved 3 tasks to 🧊 Backburner
                    </div>
                  )}
                </div>
              </Row>
            )}
            {/* Answer */}
            {t >= ANSWER_AT && (
              <Row top={L.tops[8]} g={grow(t, ANSWER_AT)}>
                <div style={{ marginLeft: 42, fontSize: 21, lineHeight: 1.5, color: C.fg2 }}>
                  {ANSWER.split(' ')
                    .slice(0, Math.ceil(tw(t, ANSWER_AT, ANSWER_AT + 0.9, 0, ANSWER.split(' ').length, (x) => x)))
                    .join(' ')}
                </div>
              </Row>
            )}
            {/* Footer: change count + Revert */}
            {t >= FOOT_AT && (
              <Row top={L.tops[9]} g={grow(t, FOOT_AT)}>
                <div style={{ marginLeft: 42, display: 'flex', alignItems: 'center', gap: 18, fontSize: 17, color: C.fg3 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      height: 50,
                      padding: '0 22px',
                      borderRadius: 99,
                      fontSize: 18,
                      fontWeight: 700,
                      color: reverted ? C.fg3 : hue('violet', 1, 0.88),
                      background: hue('violet', reverted ? 0.05 : 0.14),
                      boxShadow: `inset 0 0 0 1px ${hue('violet', 0.4)}, 0 0 ${tw(t, 11.4, 12.0) * (reverted ? 0 : 30)}px ${hue('violet', 0.6)}`,
                      transform: `scale(${1 - kf(t, [REVERT - 0.08, REVERT, REVERT + 0.25], [0, 1, 0]) * 0.06})`,
                    }}
                  >
                    <ArrowCounterClockwise size={19} weight="bold" style={{ transform: `rotate(${-tw(t, REVERT, REVERT + 1.6, 0, 720, ease.inOut)}deg)` }} />
                    {reverted ? 'Reverted' : 'Revert'}
                  </div>
                  <span>{reverted ? '7 changes undone' : '7 changes'} · gemini · 4,812 tokens · 6.2s</span>
                </div>
              </Row>
            )}
          </div>
        </div>

        {/* Composer */}
        <div style={{ position: 'absolute', left: PANEL.x + 24, top: PANEL.y + PANEL.h - 100, opacity: panelIn }}>
          <Well radius={99} style={{ width: PANEL.w - 48, height: 76, display: 'flex', alignItems: 'center', padding: '0 14px 0 28px', gap: 12 }}>
            <div style={{ flex: 1, fontSize: 21, color: typed > 0 && !sent ? C.fg1 : C.fg4, whiteSpace: 'nowrap', overflow: 'hidden' }}>
              {!sent && typed > 0 ? PROMPT.slice(0, typed) : 'Message the assistant'}
              {!sent && typed > 0 && <span style={{ display: 'inline-block', width: 2, height: 24, marginLeft: 2, verticalAlign: 'middle', background: C.accentLift, opacity: Math.floor(t * 3) % 2 ? 1 : 0.2 }} />}
            </div>
            <div style={{ width: 48, height: 48, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'oklch(1 0 0 / 0.06)' }}>
              <Microphone size={20} weight="fill" color={C.fg2} />
            </div>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 99,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: typed > 5 && !sent ? 'radial-gradient(120% 100% at 22% 0%, oklch(0.90 0.11 165), oklch(0.72 0.16 162) 55%, oklch(0.50 0.12 165))' : 'oklch(1 0 0 / 0.06)',
                transform: `scale(${1 - kf(t, [SEND - 0.08, SEND, SEND + 0.2], [0, 1, 0]) * 0.15})`,
              }}
            >
              <ArrowUp size={20} weight="bold" color={typed > 5 && !sent ? C.onAccent : C.fg2} />
            </div>
          </Well>
        </div>

        {/* ---------- Live board ---------- */}
        <div style={{ position: 'absolute', left: BOARD.x, top: BOARD.y, opacity: Math.min(1, boardIn * 1.4), transform: `translateX(${(1 - boardIn) * 500}px)` }}>
          <Glass radius={44} clear={0.1} style={{ width: BOARD.w, height: BOARD.h, padding: '26px 28px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 25, fontWeight: 700 }}>Studio Launch</span>
              <span style={{ fontSize: 17, color: C.fg3 }}>live</span>
              <span style={{ width: 9, height: 9, borderRadius: 9, background: C.accent, boxShadow: `0 0 10px ${C.accent}`, opacity: 0.5 + Math.sin(t * 6) * 0.5 }} />
              <span style={{ flex: 1 }} />
              {reverting && (
                <Pill h="violet" size={15} solid>
                  <ArrowCounterClockwise size={14} weight="bold" /> Reverting
                </Pill>
              )}
            </div>

            {/* Today's queue column */}
            <Column x={0} title="Today's queue" count={`${1 + Math.round(2 * life(7.45, UNDO.moved).v)}`}>
              <MiniCard title="Quarterly compliance review" score="21.3" sh="rose" y={0} />
              {OVERDUE.map((o, i) => {
                const l = life(7.45 + i * 0.12, UNDO.moved + i * 0.06);
                if (l.v <= 0.001) return null;
                const arrived = t > 7.9 + i * 0.12 && !(t > UNDO.moved);
                return (
                  <MiniCard
                    key={o}
                    title={o}
                    y={84 * (i + 1)}
                    pill={arrived ? { h: 'cyan', l: 'Today' } : { h: 'rose', l: 'Overdue' }}
                    style={{ opacity: l.v, transform: `translate(${(1 - l.born) * 200 + l.gone * 120}px, ${(1 - l.born) * 260}px)` }}
                    glow={(1 - tw(t, 8.0, 8.8)) * l.v}
                    gh={l.gone > 0 ? 'rose' : 'violet'}
                  />
                );
              })}
            </Column>

            {/* Launch week column (created by the agent) */}
            {listLife.v > 0.001 && (
              <div style={{ opacity: listLife.v, transform: `scale(${0.9 + listLife.v * 0.1})`, transformOrigin: 'top left' }}>
                <Column x={358} title="⚡ Launch week" count={`${Math.round(LAUNCH.reduce((a, _, i) => a + life(5.35 + i * 0.2, UNDO.tasks + (4 - i) * 0.08).v, 0))}`} glow={(1 - tw(t, 5.0, 6.2)) * listLife.v}>
                  {LAUNCH.map((l, i) => {
                    const lf = life(5.35 + i * 0.2, UNDO.tasks + (4 - i) * 0.08, 12);
                    if (lf.v <= 0.001) return null;
                    const isPitch = i === 2;
                    const subs = isPitch ? life(6.65, UNDO.subtasks).v : 0;
                    return (
                      <MiniCard
                        key={l}
                        title={l}
                        y={84 * i + (i > 2 ? subs * 46 : 0)}
                        extra={isPitch && subs > 0.01 ? subs : 0}
                        style={{ opacity: lf.v, transform: `translateY(${(1 - lf.born) * 40}px) scale(${0.85 + lf.born * 0.15})` }}
                        glow={(1 - tw(t, 5.6 + i * 0.2, 6.6 + i * 0.2)) * lf.v + (isPitch ? (1 - tw(t, 6.8, 7.6)) * subs : 0)}
                        gh={lf.gone > 0 ? 'rose' : 'violet'}
                      />
                    );
                  })}
                </Column>
              </div>
            )}

            {/* Backburner */}
            <div style={{ position: 'absolute', left: 28, right: 28, bottom: 26, height: 120 }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.fg3, marginBottom: 12 }}>🧊 Backburner</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {BACK.map((b, i) => {
                  const l = life(APPROVE + 0.35 + i * 0.1, UNDO.backburner + i * 0.05);
                  if (l.v <= 0.001) return null;
                  return (
                    <div key={b} style={{ opacity: l.v * 0.75, transform: `translateY(${(1 - l.born) * -200}px)` }}>
                      <Pill h="violet" size={15} dot={false}>
                        {b}
                      </Pill>
                    </div>
                  );
                })}
              </div>
            </div>
          </Glass>
        </div>

        {/* Rewind wash over the board while reverting */}
        {reverting && (
          <div
            style={{
              position: 'absolute',
              left: BOARD.x,
              top: BOARD.y,
              width: BOARD.w,
              height: BOARD.h,
              borderRadius: 44,
              pointerEvents: 'none',
              background: `repeating-linear-gradient(180deg, ${hue('violet', 0.06)} 0 2px, transparent 2px 6px)`,
              boxShadow: `inset 0 0 80px ${hue('violet', 0.35)}`,
              opacity: kf(t, [REVERT, REVERT + 0.2, REVERT + 1.6, REVERT + 1.9], [0, 1, 1, 0]),
            }}
          />
        )}
        <Shockwave x={ap.x} y={ap.y} at={APPROVE} dur={0.9} max={700} width={3} />
        <Burst x={ap.x} y={ap.y} at={APPROVE} n={30} power={900} seed={41} gravity={300} dur={1} />
        <Shockwave x={rv.x} y={rv.y} at={REVERT} dur={1.0} max={900} width={3} h="violet" />
      </AbsoluteFill>
      <Cursor keys={keys} show={[7.6, 13.4]} />
    </AbsoluteFill>
  );
};

/* ---------------- Pieces ---------------- */
const Row: React.FC<{ top: number; g: number; children: React.ReactNode; align?: 'left' | 'right' }> = ({ top, g, children, align = 'left' }) => (
  <div
    style={{
      position: 'absolute',
      top,
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
      opacity: g,
      transform: `translateY(${(1 - g) * 24}px) scale(${0.97 + g * 0.03})`,
      transformOrigin: align === 'right' ? 'right' : 'left',
      filter: g < 1 ? `blur(${(1 - g) * 8}px)` : undefined,
    }}
  >
    {children}
  </div>
);

const AtlasOrb: React.FC<{ size: number; spin: number; busy?: boolean }> = ({ size, spin, busy }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: 99,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: `conic-gradient(from ${spin * (busy ? 300 : 40)}deg, ${hue('violet', 1, 0.75)}, ${hue('accent', 1, 0.75)}, ${hue('cyan', 1, 0.75)}, ${hue('violet', 1, 0.75)})`,
      boxShadow: `0 0 ${busy ? 26 : 12}px ${hue('violet', busy ? 0.8 : 0.4)}`,
    }}
  >
    <Sparkle size={size * 0.52} weight="fill" color="white" />
  </div>
);

const Column: React.FC<{ x: number; title: string; count: string; children: React.ReactNode; glow?: number }> = ({ x, title, count, children, glow = 0 }) => (
  <div style={{ position: 'absolute', left: 28 + x, top: 96, width: 336, height: 500 }}>
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: 28,
        background: 'oklch(1 0 0 / 0.025)',
        boxShadow: `inset 0 0 0 1px ${glow > 0 ? hue('violet', 0.2 + glow * 0.5) : C.lineFaint}, 0 0 ${glow * 50}px ${hue('violet', glow * 0.5)}`,
      }}
    />
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '18px 20px', fontSize: 19, fontWeight: 700 }}>
      {title} <span style={{ color: C.fg4, fontWeight: 500, fontSize: 16 }}>{count}</span>
    </div>
    <div style={{ position: 'relative', margin: '0 14px' }}>{children}</div>
  </div>
);

const MiniCard: React.FC<{
  title: string;
  y: number;
  score?: string;
  sh?: Hue;
  pill?: { h: Hue; l: string };
  style?: React.CSSProperties;
  glow?: number;
  gh?: Hue;
  extra?: number;
}> = ({ title, y, score, sh = 'amber', pill, style, glow = 0, gh = 'violet', extra = 0 }) => (
  <div style={{ position: 'absolute', top: y, left: 0, right: 0, ...style }}>
    <div
      style={{
        borderRadius: 20,
        padding: '0 16px',
        minHeight: 72,
        background: 'linear-gradient(155deg, oklch(1 0 0 / 0.07), oklch(1 0 0 / 0.02)), oklch(0.14 0.003 260 / 0.9)',
        boxShadow: `inset 0 1px 1px oklch(1 0 0 / 0.14), 0 10px 24px -12px black, inset 0 0 0 1px ${hue(gh, glow * 0.7)}, 0 0 ${glow * 34}px ${hue(gh, glow * 0.6)}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 72 }}>
        <span style={{ width: 18, height: 18, borderRadius: 99, flexShrink: 0, boxShadow: `inset 0 0 0 2px ${C.lineStrong}` }} />
        <span style={{ flex: 1, fontSize: 17, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
        {score && <Score value={score} h={sh} size={14} />}
        {pill && (
          <Pill h={pill.h} size={13}>
            {pill.l}
          </Pill>
        )}
      </div>
      {extra > 0 && (
        <div style={{ height: 46 * extra, overflow: 'hidden', opacity: extra, display: 'flex', alignItems: 'flex-start', gap: 8, paddingLeft: 28 }}>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} style={{ height: 8, flex: 1, borderRadius: 99, marginTop: 6, background: hue('violet', 0.35), boxShadow: `0 0 8px ${hue('violet', 0.4)}` }} />
          ))}
          <span style={{ fontSize: 14, color: hue('violet', 1, 0.85), fontWeight: 700, marginLeft: 6 }}>0/4</span>
        </div>
      )}
    </div>
  </div>
);

/** A pill that liquid-morphs from the cloud model to a local one (goo filter). */
const ModelMorph: React.FC<{ t: number }> = ({ t }) => {
  const show = tw(t, 14.2, 14.6);
  if (show <= 0) return null;
  const m = tw(t, 14.9, 15.6, 0, 1, ease.inOut);
  const X0 = 0;
  const X1 = 430;
  return (
    <div style={{ position: 'absolute', left: 1080, top: 110, width: 760, height: 90, opacity: show }}>
      <div style={{ position: 'absolute', inset: 0, filter: 'url(#goo)' }}>
        <div style={{ position: 'absolute', left: X0 + m * (X1 - X0) * 0.85, top: 10, width: 300 - m * 140, height: 64, borderRadius: 99, background: hue('violet', 0.9, 0.45), opacity: 1 - tw(m, 0.8, 1) }} />
        <div style={{ position: 'absolute', left: X1 - (1 - m) * 120, top: 10 + (1 - m) * 12, width: 40 + m * 290, height: 64 - (1 - m) * 24, borderRadius: 99, background: hue('accent', 0.9, 0.42), opacity: tw(m, 0, 0.2) }} />
      </div>
      <div style={{ position: 'absolute', left: X0 + 26, top: 10, height: 64, display: 'flex', alignItems: 'center', gap: 12, fontSize: 21, fontWeight: 600, opacity: 1 - tw(m, 0, 0.3) }}>
        <Cloud size={22} weight="fill" /> Gemini · cloud
      </div>
      <div style={{ position: 'absolute', left: X1 + 26, top: 10, height: 64, display: 'flex', alignItems: 'center', gap: 12, fontSize: 21, fontWeight: 600, opacity: tw(m, 0.7, 1) }}>
        <Laptop size={22} weight="fill" /> gemma4 · on your laptop
      </div>
      <div style={{ position: 'absolute', left: 0, top: 96, fontSize: 18, color: C.fg3, opacity: tw(t, 15.5, 16) }}>Plus an MCP server, so any agent can drive BASE.</div>
    </div>
  );
};
