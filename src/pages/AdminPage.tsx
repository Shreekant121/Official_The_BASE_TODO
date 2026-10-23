/**
 * `/admin` — every account that has signed up, and the two switches he sets
 * on each. BUILD-6. Mockup: `design-system/screens/admin.html`.
 *
 * WHAT GUARDS WHAT
 * ----------------
 * **This screen guards nothing.** It is hidden from everyone but the admin
 * (the Settings door and the redirect below), and that is a courtesy. The
 * locks are elsewhere, and each thing on the screen is fetched through one:
 *
 *   - the account list — `api/admin-accounts.ts`, which checks the caller is
 *     the admin before it asks Firebase Auth;
 *   - another account's board — `users/{uid}/data/main`, which
 *     `firestore.rules` lets the admin read and nobody but its owner write;
 *   - the switches — `accountAccess/{uid}`, which only the admin can write;
 *   - the turn counts — `keyUsage/{uid}`, which only the proxy writes.
 *
 * A board is read with one `getDoc` into this screen's own state and never
 * goes near `useStore`, so nothing here can be synced back anywhere — and if
 * it tried, the rules would refuse it.
 *
 * WHERE IT DEPARTS FROM THE MOCKUP
 * --------------------------------
 * The mockup's numbers are invented (see the memory note on mockup data), and
 * three of its columns describe things nothing records:
 *
 *   - **"AI turns"** is *turns on my key*. Turns on an account's own key go
 *     from that browser straight to Google and are never seen; the proxy
 *     counts what it spends, which is the number that costs him money.
 *   - **The "Live" pill is gone.** Firebase keeps the last sign-in and the last
 *     token refresh (about hourly while the app is open), which is "last
 *     active" to within the hour and not "live" at all.
 *   - **"Quiet day"** is the mockup's own demo switch, labelled "Not product
 *     UI", and is not built. The empty state it drew is, when a filter matches
 *     nothing.
 *
 * The Admin entry is behind Settings rather than in the nav: the nav carries
 * six things (`navModel.tsx`), and this is a door one account will ever see.
 *
 * "My key" is frost, the loudest surface in the system, because it is the
 * only row state that costs him money. Emerald is not used for it: emerald
 * means live, not on.
 */
import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  BlurAcross, Button,
  Icon,
  Input,
  MiniNav,
  SegmentedControl,
  SoftIconButton,
  SparkBars,
  Switch,
  TravellingTrack,
  useMedia,
  WhiteButton,
  WIDE,
} from '../ui';
import { RailMark } from '../components/BrandMark';
import { useNavModel } from '../components/navModel';
import { useAuth } from '../contexts/AuthContext';
import { db } from '../lib/firebase';
import {
  NO_ACCESS,
  readAccess,
  readUsage,
  usageSeries,
  type AccountAccess,
  type AccountSummary,
  type KeyUsage,
} from '../lib/adminAccess';
import { recheckOwnerVerification, sendOwnerVerification, useAccountAccess } from '../lib/accountAccess';
import { devAdminFixture, type AdminBoardDoc } from '../lib/devAdminFixture';
import { Z } from '../lib/zLayers';

const EMPTY_USAGE: KeyUsage = { total: 0, days: {}, lastAt: null };
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// ─── Small readers ──────────────────────────────────────────────────────────

function joinedLabel(ms: number | null): string {
  if (ms === null) return '—';
  return new Date(ms).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function agoLabel(ms: number | null, now: number): string {
  if (ms === null) return 'never';
  const gap = Math.max(0, now - ms);
  if (gap < 5 * 60_000) return 'now';
  if (gap < HOUR) return `${Math.round(gap / 60_000)} min`;
  if (gap < DAY) return `${Math.round(gap / HOUR)} h`;
  return `${Math.round(gap / DAY)} d`;
}

function displayName(a: AccountSummary): string {
  if (a.owner) return 'You';
  return a.name?.trim() || a.email?.split('@')[0] || a.uid.slice(0, 8);
}

interface BoardTask {
  id: string;
  title: string;
  minutes: number | null;
  status: string;
}

interface BoardList {
  id: string;
  title: string;
  project: string | null;
  tasks: BoardTask[];
}

interface Board {
  projects: number;
  tasks: number;
  lists: BoardList[];
}

/**
 * Another account's document, read defensively. It is somebody else's data
 * written by whatever version of the app they last opened, so nothing about
 * its shape is assumed beyond "an array might be there".
 */
function readBoard(data: AdminBoardDoc | undefined): Board {
  const arr = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const projects = arr(data?.projects);
  const lists = arr(data?.taskLists);
  const tasks = arr(data?.backlogTasks).filter((t) => !t.parent);
  const projectName = new Map(projects.map((p) => [str(p.id), str(p.name)]));

  const byList = new Map<string, BoardTask[]>();
  for (const t of tasks) {
    const listId = str(t.listId);
    const minutes =
      typeof t.allocatedTime === 'number' ? t.allocatedTime : typeof t.estimatedTime === 'number' ? t.estimatedTime : null;
    const row = { id: str(t.id), title: str(t.title) || 'Untitled', minutes, status: str(t.status) };
    byList.set(listId, [...(byList.get(listId) ?? []), row]);
  }

  return {
    projects: projects.length,
    tasks: tasks.length,
    lists: lists
      .map((l) => ({
        id: str(l.id),
        title: str(l.title) || 'Untitled list',
        project: projectName.get(str(l.projectId)) || null,
        tasks: byList.get(str(l.id)) ?? [],
      }))
      .filter((l) => l.tasks.length > 0),
  };
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

/** A label's case: sentence case under V3, capitals outside it (V3-9). */
const KICKER_CASE = 'var(--kicker-transform)' as CSSProperties['textTransform'];

function Kick({ children, color = 'var(--fg-4)', align }: { children: ReactNode; color?: string; align?: 'right' }) {
  return (
    <span
      style={{
        font: 'var(--type-kicker)', letterSpacing: 'var(--tracking-kicker)', textTransform: KICKER_CASE,
        color, textAlign: align,
      }}
    >
      {children}
    </span>
  );
}

function Num({ children, size = 'var(--text-xs)', color = 'var(--fg-2)' }: { children: ReactNode; size?: string; color?: string }) {
  return (
    <span style={{ font: 'var(--type-numeric)', fontSize: size, color, fontVariantNumeric: 'tabular-nums' }}>
      {children}
    </span>
  );
}

/**
 * The one decision this screen exists to make. Two states in a trough, so the
 * alternative is always visible and switching back is the same gesture.
 */
function KeyControl({
  mine,
  locked,
  onChange,
}: {
  mine: boolean;
  locked?: boolean;
  onChange: (mine: boolean) => void;
}) {
  const options: [boolean, string][] = [[false, 'Their own key'], [true, 'My key']];
  return (
    <div
      role="group"
      aria-label="Which AI key this account spends"
      style={{
        display: 'inline-grid', gridAutoFlow: 'column', gap: 2, padding: 3,
        borderRadius: 'var(--r-pill)', backgroundImage: 'var(--glass-well)',
        boxShadow: 'var(--glass-well-shadow)', opacity: locked ? 0.5 : 1,
      }}
    >
      {options.map(([value, label]) => {
        const on = value === mine;
        return (
          <button
            key={label}
            type="button"
            disabled={locked}
            aria-pressed={on}
            onClick={(e) => {
              e.stopPropagation();
              if (!locked && !on) onChange(value);
            }}
            style={{
              height: 32, padding: '0 var(--sp-5)', border: 0,
              cursor: locked ? 'default' : 'pointer',
              borderRadius: 'var(--r-pill)', whiteSpace: 'nowrap',
              font: 'var(--type-numeric)', fontSize: 'var(--text-xs)',
              backgroundColor: 'transparent',
              backgroundImage: on ? (value ? 'var(--glass-frost)' : 'var(--glass-fill-2)') : 'none',
              boxShadow: on ? 'var(--glass-rim-2), var(--glass-cast-1)' : 'none',
              color: on ? (value ? 'var(--void-0)' : 'var(--fg-1)') : 'var(--fg-4)',
              transition: 'var(--t-hover)',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

interface RowModel {
  account: AccountSummary;
  access: AccountAccess;
  usage: KeyUsage;
  week: number;
  board: Board | null;
}

const GRID = '2.1fr 0.9fr 0.8fr 0.9fr 0.8fr 15.2rem 4.4rem';

function HeadRow() {
  return (
    <div
      style={{
        display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 'var(--sp-5)',
        padding: '0 var(--sp-6) var(--sp-4)',
      }}
    >
      {['Account', 'Joined', 'Last active', 'Projects · tasks', 'My key · 7d', 'Key', 'Assistant'].map((h, i) => (
        <Kick key={h} align={i >= 1 && i <= 4 ? 'right' : undefined}>{h}</Kick>
      ))}
    </div>
  );
}

function AccountRow({
  row,
  wide,
  now,
  onOpen,
  onSet,
}: {
  row: RowModel;
  wide: boolean;
  now: number;
  onOpen: (uid: string) => void;
  onSet: (uid: string, next: AccountAccess) => void;
}) {
  const { account: a, access } = row;
  const locked = a.owner;
  const mine = locked || access.ownerKey;
  const assistant = locked || access.assistant;
  const counts = row.board ? `${row.board.projects} · ${row.board.tasks}` : '…';
  const open = () => { if (!locked) onOpen(a.uid); };

  const identity = (
    <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', minWidth: 0 }}>
        <span
          style={{
            font: 'var(--type-label)', color: 'var(--fg-1)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {displayName(a)}
        </span>
        {locked && <Kick>you</Kick>}
        {a.disabled && <Kick color="var(--status-overrun)">disabled</Kick>}
      </span>
      <span
        style={{
          font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-3)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {a.email ?? a.uid}
      </span>
    </span>
  );

  const keyControl = (
    <KeyControl mine={mine} locked={locked} onChange={(v) => onSet(a.uid, { ...access, ownerKey: v })} />
  );
  const assistantSwitch = (
    <span onClick={(e) => e.stopPropagation()} style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <Switch
        size="sm"
        checked={assistant}
        disabled={locked}
        aria-label={`Assistant for ${displayName(a)}`}
        onChange={(v) => onSet(a.uid, { ...access, assistant: v })}
      />
    </span>
  );

  const shell = {
    borderRadius: 'var(--r-lg)',
    cursor: locked ? 'default' : 'pointer',
    backgroundImage: 'var(--glass-fill-1)',
    /* The mockup's marker for an account that costs him money: a bright
       inner edge, not a colour. */
    boxShadow: mine && !locked ? 'var(--glass-rim-1), inset 2px 0 0 var(--fg-1)' : 'var(--glass-rim-1)',
    transition: 'var(--t-hover)',
  } as const;

  if (wide) {
    return (
      <div
        role={locked ? undefined : 'button'}
        tabIndex={locked ? undefined : 0}
        onClick={open}
        onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
        className={locked ? undefined : 'admin-row'}
        style={{
          ...shell,
          display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 'var(--sp-5)',
          padding: 'var(--sp-5) var(--sp-6)',
        }}
      >
        {identity}
        <span style={{ textAlign: 'right' }}><Num color="var(--fg-3)">{joinedLabel(a.createdAt)}</Num></span>
        <span style={{ textAlign: 'right' }}><Num>{agoLabel(a.lastActiveAt, now)}</Num></span>
        <span style={{ textAlign: 'right' }}><Num>{counts}</Num></span>
        <span style={{ textAlign: 'right' }}>
          <Num color={row.week ? 'var(--fg-1)' : 'var(--fg-4)'}>{row.week.toLocaleString()}</Num>
        </span>
        <span onClick={(e) => e.stopPropagation()}>{keyControl}</span>
        {assistantSwitch}
      </div>
    );
  }

  return (
    <div
      role={locked ? undefined : 'button'}
      tabIndex={locked ? undefined : 0}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
      style={{ ...shell, display: 'grid', gap: 'var(--sp-5)', padding: 'var(--sp-6)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--sp-5)' }}>
        <span style={{ flex: 1, minWidth: 0 }}>{identity}</span>
        {assistantSwitch}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 'var(--sp-4)' }}>
        {([
          ['joined', joinedLabel(a.createdAt)],
          ['last active', agoLabel(a.lastActiveAt, now)],
          ['proj · tasks', counts],
          ['my key · 7d', row.week.toLocaleString()],
        ] as const).map(([k, v]) => (
          <span key={k} style={{ display: 'grid', gap: 3, minWidth: 0 }}>
            <Kick>{k}</Kick>
            <Num>{v}</Num>
          </span>
        ))}
      </div>
      <div onClick={(e) => e.stopPropagation()}>{keyControl}</div>
    </div>
  );
}

/** Someone else's account, read-only. */
function AccountDetail({
  row,
  wide,
  now,
  onBack,
  onSet,
}: {
  row: RowModel;
  wide: boolean;
  now: number;
  onBack: () => void;
  onSet: (uid: string, next: AccountAccess) => void;
}) {
  const { account: a, access, usage, board } = row;
  const series = usageSeries(usage, now);
  const peak = Math.max(0, ...series.map((d) => d.count));
  const dayLetter = (day: string) => 'SMTWTFS'[new Date(`${day}T00:00:00Z`).getUTCDay()];

  return (
    <div style={{ width: '100%', maxWidth: 1000, margin: '0 auto', display: 'grid', gap: 'var(--sp-7)' }}>
      {/* The marker. Sticky, plain grey, and says whose data this is. */}
      <div
        style={{
          position: 'sticky', top: 0, zIndex: 2, display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
          padding: 'var(--sp-4) var(--sp-4) var(--sp-4) var(--sp-6)', borderRadius: 'var(--r-pill)',
          backgroundImage: 'var(--glass-fill-2)',
          WebkitBackdropFilter: 'var(--glass-bd-md)', backdropFilter: 'var(--glass-bd-md)',
          boxShadow: 'var(--glass-rim-2), var(--glass-cast-1)',
        }}
      >
        <span style={{ display: 'flex', color: 'var(--fg-3)' }}><Icon name="lock" size={15} /></span>
        <span style={{ font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-2)', flex: 1, minWidth: 0 }}>
          Read-only — {displayName(a)}'s account. Nothing on this screen can be edited.
        </span>
        <Button size="sm" variant="ghost" iconLeft={<Icon name="arrow-left" size={14} />} onClick={onBack}>
          All accounts
        </Button>
      </div>

      <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
        <Kick color="var(--fg-3)">Account</Kick>
        <h1
          style={{
            font: 'var(--type-display)', fontSize: 'var(--text-2xl)',
            letterSpacing: 'var(--tracking-display)', color: 'var(--fg-1)', margin: 0,
            overflowWrap: 'anywhere',
          }}
        >
          {displayName(a)}
        </h1>
        <Num size="var(--text-sm)" color="var(--fg-3)">{a.email ?? a.uid}</Num>
      </div>

      <section
        style={{
          display: 'grid', gap: 'var(--sp-7)', padding: 'var(--pad-card)', borderRadius: 'var(--r-card)',
          backgroundImage: 'var(--glass-fill-2)',
          WebkitBackdropFilter: 'var(--glass-bd-md)', backdropFilter: 'var(--glass-bd-md)',
          boxShadow: 'var(--glass-rim-2), var(--glass-cast-1)',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: wide ? 'repeat(5, minmax(0, 1fr))' : 'repeat(2, minmax(0, 1fr))', gap: 'var(--sp-6)' }}>
          {([
            ['joined', joinedLabel(a.createdAt)],
            ['last active', agoLabel(a.lastActiveAt, now)],
            ['projects', board ? board.projects : '…'],
            ['tasks', board ? board.tasks : '…'],
            ['on my key, ever', usage.total.toLocaleString()],
          ] as const).map(([k, v]) => (
            <span key={k} style={{ display: 'grid', gap: 'var(--sp-3)' }}>
              <Kick>{k}</Kick>
              <Num size="var(--text-xl)" color="var(--fg-1)">{v}</Num>
            </span>
          ))}
        </div>

        <div style={{ height: 1, background: 'var(--line-faint)' }} />

        {/* The two controls that are NOT read-only, and it says so. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-6)', flexWrap: 'wrap' }}>
          <span style={{ display: 'grid', gap: 'var(--sp-3)' }}>
            <Kick color="var(--fg-3)">Spends</Kick>
            <KeyControl mine={access.ownerKey} onChange={(v) => onSet(a.uid, { ...access, ownerKey: v })} />
          </span>
          <span style={{ display: 'grid', gap: 'var(--sp-3)' }}>
            <Kick color="var(--fg-3)">Assistant</Kick>
            <Switch
              checked={access.assistant}
              onChange={(v) => onSet(a.uid, { ...access, assistant: v })}
              label={access.assistant ? 'Available' : 'Off'}
            />
          </span>
          <span style={{ flex: 1 }} />
          <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', maxWidth: '36ch', textWrap: 'pretty' }}>
            {access.ownerKey && !access.assistant
              ? 'On my key, but with the assistant off nothing is spent.'
              : 'These two are mine to set. Everything else below is theirs.'}
          </span>
        </div>
      </section>

      <section
        style={{
          display: 'grid', gap: 'var(--sp-6)', padding: 'var(--pad-card)', borderRadius: 'var(--r-card)',
          backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
          <Kick color="var(--fg-3)">Turns on my key · last 7 days</Kick>
          <span style={{ flex: 1 }} />
          <Num size="var(--text-sm)" color="var(--fg-3)">peak {peak} / day</Num>
        </div>
        <SparkBars
          data={series.map((d) => d.count)}
          activeIndex={series.length - 1}
          labels={series.map((d) => dayLetter(d.day))}
          height={104}
          thickness={12}
          gap={wide ? 32 : 18}
        />
      </section>

      {/* Their board. Flat rows: no checkbox, no menu, no add. */}
      <section style={{ display: 'grid', gap: 'var(--sp-5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
          <Kick color="var(--fg-3)">Their board</Kick>
          <span style={{ flex: 1, height: 1, background: 'var(--line-faint)' }} />
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', color: 'var(--fg-4)' }}>
            <Icon name="eye" size={14} />
            <Kick>view only</Kick>
          </span>
        </div>

        {board === null ? (
          <TravellingTrack width={160} />
        ) : board.lists.length === 0 ? (
          <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>
            Nothing on their board yet.
          </span>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: wide ? 'repeat(3, minmax(0, 1fr))' : '1fr', gap: 'var(--sp-5)' }}>
            {board.lists.map((list) => (
              <div
                key={list.id}
                style={{
                  display: 'grid', gap: 'var(--sp-4)', alignContent: 'start', padding: 'var(--sp-6)',
                  borderRadius: 'var(--r-card)', backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
                  minWidth: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--sp-4)', minWidth: 0 }}>
                  <span style={{ display: 'grid', gap: 2, flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        font: 'var(--type-label)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {list.title}
                    </span>
                    {list.project && <Kick>{list.project}</Kick>}
                  </span>
                  <Num color="var(--fg-4)">{list.tasks.length}</Num>
                </div>
                {list.tasks.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
                      padding: 'var(--sp-4) var(--sp-5)', borderRadius: 'var(--r-md)',
                      backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
                      cursor: 'default', userSelect: 'none',
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 5, height: 5, flex: '0 0 auto', borderRadius: '50%',
                        background: t.status === 'in-progress' ? 'var(--accent)' : 'var(--fg-4)',
                      }}
                    />
                    <span
                      style={{
                        font: 'var(--type-body)', fontSize: 'var(--text-sm)',
                        color: t.status === 'completed' ? 'var(--fg-4)' : 'var(--fg-2)',
                        textDecoration: t.status === 'completed' ? 'line-through' : undefined,
                        flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {t.title}
                    </span>
                    <Num color="var(--fg-4)">{t.minutes ? `${t.minutes} min` : '—'}</Num>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)' }}>
          Their tasks, their calendar, their allocations. BASE has no write path into another account.
        </span>
      </section>
    </div>
  );
}

/** His address, not yet proved — the rules will not open anything until it is. */
function VerifyFirst() {
  const [state, setState] = useState<'idle' | 'sent' | 'checking' | 'still' | 'failed'>('idle');
  return (
    <div
      style={{
        display: 'grid', gap: 'var(--sp-5)', justifyItems: 'start', maxWidth: 560,
        padding: 'var(--sp-8) var(--sp-7)', borderRadius: 'var(--r-card)',
        backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
      }}
    >
      <Kick color="var(--fg-3)">One step first</Kick>
      <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-2)', textWrap: 'pretty' }}>
        Admin opens for your address only once it is verified — otherwise anyone who typed it into the sign-up form
        would pass the same check. Send yourself the link, open it, then come back here.
      </span>
      <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
        {/* The card's yes: solid white since 29-1P2. */}
        <WhiteButton
          icon={<Icon name="mail" size={15} />}
          onClick={() => {
            sendOwnerVerification().then(() => setState('sent'), () => setState('failed'));
          }}
        >
          Send the link
        </WhiteButton>
        <Button
          variant="ghost"
          onClick={() => {
            setState('checking');
            recheckOwnerVerification().then((ok) => setState(ok ? 'idle' : 'still'), () => setState('failed'));
          }}
        >
          I opened it
        </Button>
      </div>
      {state !== 'idle' && (
        <span style={{ font: 'var(--type-caption)', color: state === 'failed' ? 'var(--status-overrun)' : 'var(--fg-3)' }}>
          {state === 'sent' && 'Sent. Check your inbox, and the spam folder.'}
          {state === 'checking' && 'Checking…'}
          {state === 'still' && 'Not verified yet. Open the link in the email first.'}
          {state === 'failed' && 'That did not go through. Try again in a minute.'}
        </span>
      )}
    </div>
  );
}

// ─── The screen ─────────────────────────────────────────────────────────────

type Sort = 'active' | 'new' | 'key';

export default function AdminPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const wide = useMedia(WIDE);
  const nav = useNavModel();
  const { user } = useAuth();
  const owner = useAccountAccess((s) => s.owner);
  const unverifiedOwner = useAccountAccess((s) => s.unverifiedOwner);
  /* The store is filled by an effect in `AuthProvider`, which runs after this
     screen's first render on a direct load — so until it has caught up with
     this user, "not the owner" means "not known yet", not "redirect". */
  const synced = useAccountAccess((s) => s.uid !== null && s.uid === user?.uid);

  const [fixture] = useState(() => devAdminFixture(location.search));
  const [now] = useState(() => Date.now());

  const [accounts, setAccounts] = useState<AccountSummary[] | null>(fixture?.accounts ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [access, setAccess] = useState<Record<string, AccountAccess>>(fixture?.access ?? {});
  const [usage, setUsage] = useState<Record<string, KeyUsage>>(fixture?.usage ?? {});
  const [boards, setBoards] = useState<Record<string, Board>>(() =>
    fixture ? Object.fromEntries(Object.entries(fixture.boards).map(([uid, d]) => [uid, readBoard(d)])) : {},
  );
  const [writeError, setWriteError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(fixture?.open ?? null);
  const [sort, setSort] = useState<Sort>('active');
  const [query, setQuery] = useState('');

  const live = owner && !fixture;

  /* The list — the one fetch that has to go through a server. */
  useEffect(() => {
    if (!live || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin-accounts', {
          headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        });
        const body = (await res.json().catch(() => null)) as { accounts?: AccountSummary[]; error?: string } | null;
        if (!res.ok || !body?.accounts) throw new Error(body?.error ?? `status ${res.status}`);
        if (!cancelled) setAccounts(body.accounts);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => { cancelled = true; };
  }, [live, user]);

  /* The switches and the counts, live — through the rules. */
  useEffect(() => {
    if (!live) return;
    const offAccess = onSnapshot(collection(db, 'accountAccess'), (snap) => {
      setAccess(Object.fromEntries(snap.docs.map((d) => [d.id, readAccess(d.data())])));
    });
    const offUsage = onSnapshot(collection(db, 'keyUsage'), (snap) => {
      setUsage(Object.fromEntries(snap.docs.map((d) => [d.id, readUsage(d.data())])));
    });
    return () => { offAccess(); offUsage(); };
  }, [live]);

  /* Each board, once. Read into this screen and nowhere else. */
  useEffect(() => {
    if (!live || !accounts) return;
    let cancelled = false;
    for (const a of accounts) {
      getDoc(doc(db, 'users', a.uid, 'data', 'main')).then(
        (snap) => { if (!cancelled) setBoards((b) => ({ ...b, [a.uid]: readBoard(snap.data()) })); },
        () => { if (!cancelled) setBoards((b) => ({ ...b, [a.uid]: readBoard(undefined) })); },
      );
    }
    return () => { cancelled = true; };
  }, [live, accounts]);

  const setSwitches = (uid: string, next: AccountAccess) => {
    const before = access[uid] ?? NO_ACCESS;
    setAccess((m) => ({ ...m, [uid]: next }));
    setWriteError(null);
    if (!live) return;
    setDoc(
      doc(db, 'accountAccess', uid),
      { assistant: next.assistant, ownerKey: next.ownerKey, updatedAt: serverTimestamp() },
      { merge: true },
    ).catch((err: unknown) => {
      setAccess((m) => ({ ...m, [uid]: before }));
      setWriteError(err instanceof Error ? err.message : String(err));
    });
  };

  const rows: RowModel[] = useMemo(
    () =>
      (accounts ?? []).map((account) => {
        const u = usage[account.uid] ?? EMPTY_USAGE;
        return {
          account,
          access: access[account.uid] ?? NO_ACCESS,
          usage: u,
          week: usageSeries(u, now).reduce((sum, d) => sum + d.count, 0),
          board: boards[account.uid] ?? null,
        };
      }),
    [accounts, access, usage, boards, now],
  );

  if (!user || !synced) return null;
  if (!owner && !unverifiedOwner) return <Navigate to="/" replace />;

  const onMyKey = (r: RowModel) => !r.account.owner && r.access.ownerKey && r.access.assistant;
  const totals = {
    accounts: rows.length,
    week: rows.filter((r) => r.account.lastActiveAt !== null && now - r.account.lastActiveAt < 7 * DAY).length,
    mine: rows.filter(onMyKey).length,
  };

  const needle = query.trim().toLowerCase();
  let list = rows.filter(
    (r) => !needle || displayName(r.account).toLowerCase().includes(needle) || (r.account.email ?? '').toLowerCase().includes(needle),
  );
  if (sort === 'key') list = list.filter(onMyKey);
  list = [...list].sort((x, y) =>
    sort === 'new'
      ? (y.account.createdAt ?? 0) - (x.account.createdAt ?? 0)
      : (y.account.lastActiveAt ?? 0) - (x.account.lastActiveAt ?? 0),
  );
  /* His own row leads whatever the order, as the mockup draws it. */
  list = [...list.filter((r) => r.account.owner), ...list.filter((r) => !r.account.owner)];

  const detail = open ? rows.find((r) => r.account.uid === open && !r.account.owner) ?? null : null;

  let body: ReactNode;
  if (unverifiedOwner) {
    body = <VerifyFirst />;
  } else if (detail) {
    body = <AccountDetail row={detail} wide={wide} now={now} onBack={() => setOpen(null)} onSet={setSwitches} />;
  } else {
    body = (
      <div style={{ width: '100%', maxWidth: 1180, margin: '0 auto', display: 'grid', gap: 'var(--sp-8)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', padding: 'var(--sp-6) var(--sp-7)', borderRadius: 'var(--r-card)', backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)' }}>
          {([['accounts', totals.accounts], ['active this week', totals.week], ['on my key', totals.mine]] as const).map(([k, v], i) => (
            <span
              key={k}
              style={{
                display: 'grid', gap: 'var(--sp-3)', minWidth: 0,
                paddingLeft: i ? 'var(--sp-7)' : 0, borderLeft: i ? '1px solid var(--line-faint)' : 'none',
              }}
            >
              <Kick>{k}</Kick>
              <Num size={wide ? 'var(--text-3xl)' : 'var(--text-2xl)'} color="var(--fg-1)">
                {accounts ? String(v).padStart(2, '0') : '—'}
              </Num>
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
          <span style={{ flex: '1 1 240px', maxWidth: 340 }}>
            <Input
              size="sm"
              placeholder="Name or email"
              aria-label="Search accounts"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              iconLeft={<Icon name="search" size={15} />}
            />
          </span>
          <span style={{ flex: '0 0 auto', maxWidth: '100%', overflowX: 'auto' }}>
            {/* The soft pressed-in switch since 29-1P2, as every view switch. */}
            <SegmentedControl
              size="sm"
              look="soft"
              value={sort}
              onChange={(v) => setSort(v as Sort)}
              options={[
                { value: 'active', label: 'Recently active' },
                { value: 'new', label: 'Newest' },
                { value: 'key', label: 'Spending my key' },
              ]}
            />
          </span>
          <span style={{ flex: 1 }} />
          <Num color="var(--fg-4)">{list.length} shown</Num>
        </div>

        {writeError && (
          <span role="alert" style={{ font: 'var(--type-caption)', color: 'var(--status-overrun)' }}>
            That switch did not save, and has been put back: {writeError}
          </span>
        )}

        {/* 29-1P5c, idea 60: a new order blurs across. */}
        <BlurAcross value={sort} index={['active', 'new', 'key'].indexOf(sort)} style={{ display: 'grid', gap: 'var(--sp-8)' }}>
        {loadError ? (
          <span role="alert" style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--status-overrun)' }}>
            Could not load the accounts ({loadError}).
          </span>
        ) : accounts === null ? (
          <TravellingTrack width={160} />
        ) : list.length === 0 ? (
          <div
            style={{
              display: 'grid', gap: 'var(--sp-4)', justifyItems: 'start',
              padding: 'var(--sp-9) var(--sp-7)', borderRadius: 'var(--r-card)',
              backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
            }}
          >
            <Kick>nothing matches</Kick>
            <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-sm)', color: 'var(--fg-3)' }}>
              {sort === 'key' ? 'No account is spending my key right now.' : 'No account by that name or email.'}
            </span>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: wide ? 'var(--sp-3)' : 'var(--sp-4)' }}>
            {wide && <HeadRow />}
            {list.map((r) => (
              <AccountRow key={r.account.uid} row={r} wide={wide} now={now} onOpen={setOpen} onSet={setSwitches} />
            ))}
          </div>
        )}
        </BlurAcross>

        <span style={{ font: 'var(--type-caption)', color: 'var(--fg-4)', textWrap: 'pretty' }}>
          Signup is open: a new account gets its own tasks and its own calendar, on its own key, with the assistant off.
          Switching an account onto my key takes effect on its next turn, and switching it back does the same.
        </span>
      </div>
    );
  }

  return (
    <div className="ag-page h-screen overflow-y-auto">
      <style>{'.admin-row:hover { background-image: var(--glass-fill-2) !important; }'}</style>
      <div style={{ display: 'flex', minHeight: '100%', alignItems: 'stretch' }}>
        {wide && (
          <div
            style={{
              position: 'sticky', top: 0, alignSelf: 'flex-start', flex: '0 0 auto',
              padding: 'var(--sp-9) 0 var(--sp-9) var(--sp-7)',
            }}
          >
            <MiniNav orientation="vertical" items={nav.items} value={nav.current} onChange={nav.go} screenLit lead={<RailMark />} />
          </div>
        )}

        <div
          style={{
            flex: 1, minWidth: 0, boxSizing: 'border-box',
            padding: wide ? 'var(--sp-9) var(--gutter-page) var(--sp-13)' : 'var(--sp-8) var(--gutter-page-sm) 128px',
            display: 'grid', gap: 'var(--sp-8)', alignContent: 'start',
          }}
        >
          {!detail && (
            <header style={{ width: '100%', maxWidth: 1180, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 'var(--sp-5)' }}>
              {/* Round soft since 29-1P2, as every header's icon button. */}
              <SoftIconButton label="Back" onClick={() => navigate(-1)}>
                <Icon name="arrow-left" size={18} />
              </SoftIconButton>
              <div style={{ display: 'grid', gap: 'var(--sp-2)', minWidth: 0 }}>
                <Kick color="var(--fg-3)">Visible to your account only</Kick>
                <h1
                  style={{
                    font: 'var(--type-display)', fontSize: 'var(--text-2xl)',
                    letterSpacing: 'var(--tracking-display)', color: 'var(--fg-1)', margin: 0,
                  }}
                >
                  Admin
                </h1>
              </div>
            </header>
          )}
          {body}
        </div>
      </div>

      {!wide && (
        <div
          style={{
            position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--sp-5) + var(--safe-b))',
            display: 'grid', placeItems: 'center', zIndex: Z.nav, pointerEvents: 'none',
          }}
        >
          <span style={{ pointerEvents: 'auto' }}>
            <MiniNav items={nav.items} value={nav.current} onChange={nav.go} screenLit />
          </span>
        </div>
      )}
    </div>
  );
}
