/**
 * Home.
 * Mockup: design-system/screens/home.html
 *
 * Rebuilt on Aurora Glass. Three things changed shape:
 *
 *   - The header is no longer a `fixed` floating bar. It scrolls with the
 *     page, as the mockup has it, which retires the `overlayOpen` fade
 *     this screen used to need — a header that scrolls away cannot sit
 *     lit on top of a modal's backdrop.
 *   - Smart Start is its own band at the top of the page rather than a
 *     small pill in the header. It is the product's primary action and
 *     the only lit button on the screen; the design system allows exactly
 *     one per view.
 *   - Home draws its own `<MiniNav>` (vertical rail on a wide window, a
 *     floating bar below) and opts out of the global `FloatingNav`, the
 *     same pattern Settings uses.
 *
 * The backdrop was `--calm` until V3-2 (UI-34 took it from `home.html`'s
 * body class, reasoning that a wall of project cards is a dense data
 * screen). V3's Home sits on the full field instead — `Devices.dc.html`
 * draws its teal masses at full strength behind the laptop screen — and
 * there has to be something behind the glass.
 *
 * Unchanged underneath: the store wiring, project reorder by drag through
 * `SortableList`/`SortableRow`, the create/edit modal, and Smart Start's
 * contract — the queue is built once inside `SmartStartModal` and handed
 * here as an array. Do not rebuild it from the hours at this call site.
 *
 * V3 (V3-2, step 6) — HOME IS THE FIRST SCREEN ON V3. Design: the laptop
 * half of `design-system/Devices.dc.html`. The whole screen sits in one
 * `<V3Scope>`, so its glass, type, colour, icons and motion are V3, and so
 * are the two dialogs and every menu it opens (they carry the scope into
 * their portals). Shreekant's calls, 2026-09-23:
 *   - **Same Home, V3 look.** That file draws a dashboard — a live timer,
 *     a focus score, a streak, a focus-time chart, the Atlas orb — and no
 *     project cards at all. None of it is built here: V3 changes no
 *     features, and the dashboard is BIG-6, which he is designing himself.
 *     Home keeps exactly what it had: Smart Start and the project grid.
 *   - **No greeting and no date** (his BASE list, 2026-10-06: "it is just
 *     taking space"). They replaced the BASE wordmark at V3-2; the mark is
 *     at the head of the rail, and below 900px at the head of the header.
 * What else V3 changed here: the header's two icon controls are the
 * design's round glass buttons rather than ghosts, Smart Start is a gel
 * button (V3's one primary), the rail's live cell is a lit white plate,
 * and status pills read in sentence case. The tablet and phone layouts are
 * the ones they were, in the new material.
 *
 * 29-1P2 (BIG-15) put BASE's own buttons on: Smart Start is a plain orange
 * gel (go, without the Start tile — that is the Dashboard's), New project a
 * soft raised second action, the header's icons round soft buttons, and on
 * the tablet a floating + opens quick capture (his call).
 *
 * OPT-11 (2026-10-06) folded the header and the Smart Start band into one
 * island at the top — see the comment on it below.
 */
import { useRef, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GelButton, GlassFilters, Icon, LitLine, MiniNav, MorphMenu, SoftButton, SoftIconButton, V3Scope, useMedia,
} from '../ui';
import { useStore } from '../store/useStore';
import { useUIStore } from '../store/useUIStore';
import { useAuth } from '../contexts/AuthContext';
import { builtInShortcut, useShortcuts } from '../contexts/ShortcutsContext';
import { useNavModel } from './navModel';
import QuickCaptureFab from './QuickCaptureFab';
import { BrandMark, RailMark } from './BrandMark';
import ProjectGrid from './ProjectGrid';
import JumpBackRow from './JumpBackRow';
import CreateProjectModal from './CreateProjectModal';
import SmartStartModal from './SmartStartModal';
import { buildProjectTree } from '../lib/projectTree';
import { Z } from '../lib/zLayers';
import { usePullToSearch } from './PullToSearch';
import type { Task } from '../store/useStore';

/* The mockup switches the rail to a bottom bar at 900px, not at the 960px
   Settings uses — Home's card grid needs the width sooner. */
const HOME_WIDE = '(min-width: 900px)';

export default function Home() {
  const {
    projects, addProject, updateProject,
    backlogTasks, tasks, setTasks,
  } = useStore();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const wide = useMedia(HOME_WIDE);
  const nav = useNavModel();

  const [createProjectOpen, setShowCreateProject] = useState(false);
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [smartStartOpen, setShowSmartStart] = useState(false);

  /*
   * BUILD-9 — New project and Smart Start picked in the command palette,
   * perhaps from another screen. The palette leaves the request in
   * `useUIStore` and comes here; the sheet is open while it is waiting, and
   * closing the sheet (either way it closes) is what clears it. Read rather
   * than copied into this screen's state, so there is no effect to run and no
   * frame where Home is up and the sheet is not.
   */
  const setPaletteOpen = useUIStore((s) => s.setPaletteOpen);
  /* 29-1P13, idea 148: pull the page down from the top to search, on the tablet. */
  const scrollerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pull = usePullToSearch(scrollerRef, contentRef);
  const handoff = useUIStore((s) => s.paletteHandoff);
  const setHandoff = useUIStore((s) => s.setPaletteHandoff);
  const showCreateProject = createProjectOpen || handoff?.kind === 'new-project';
  const showSmartStart = smartStartOpen || handoff?.kind === 'smart-start';
  const clearHomeHandoff = () => {
    if (handoff?.kind === 'new-project' || handoff?.kind === 'smart-start') setHandoff(null);
  };

  const editProject = projects.find((p) => p.id === editingProject);

  // What the header counts is what the grid shows: the top level.
  const topLevelCount = useMemo(() => buildProjectTree(projects).childrenOf(null).length, [projects]);

  // How many tasks are actually open across every project — the one number
  // worth putting next to "Your projects".
  const openTaskCount = useMemo(
    () => backlogTasks.filter((t) => !t.parent && t.status !== 'completed').length,
    [backlogTasks],
  );

  // The queue arrives already built — the modal previewed it, and building it
  // again here would be a second, differently-timed answer to the same question.
  const handleSmartStart = (queue: Task[]) => {
    if (queue.length === 0) return;
    setTasks(queue);
    setShowSmartStart(false);
    clearHomeHandoff();
    navigate('/focus');
  };

  useShortcuts('home', [
    { ...builtInShortcut('new-project'), handler: () => setShowCreateProject(true) },
    { ...builtInShortcut('smart-start'), handler: () => setShowSmartStart(true) },
  ]);

  const displayName = user?.displayName ?? user?.email ?? 'You';
  const initial = displayName.trim().charAt(0).toUpperCase() || 'Y';

  return (
    <V3Scope>
    <div ref={scrollerRef} className="ag-page h-screen overflow-y-auto">
      {pull.layer}
      {/* Mounted once per document — every card's `--glass-bd-md-refract`
          resolves to a filter defined in here. Without it the cards fall
          back to a plain blur, silently. */}
      <GlassFilters />

      <div ref={contentRef} style={{ display: 'flex', minHeight: '100%', alignItems: 'flex-start' }}>

        {/*
          * Desktop rail — floats, never frames.
          *
          * `top: 0`, where the mockup writes `top: var(--sp-9)`. Checked in
          * UI-34 and kept deliberately: a sticky box is clamped in BOTH
          * directions, so that offset does not only park the scrolled rail
          * 32px down — it pushes the resting rail 32px down too, on top of
          * this element's own `--sp-9` of padding. The mockup's own numbers
          * then put the rail's first glyph at 64px against a header at 48px,
          * which lines up with nothing; Settings' `top: 0` + `--sp-9` pad
          * lands rail and header together at 32px, which is the alignment
          * the pair is clearly after. Taking it and diffing `desktop/home`
          * against the baseline is what showed the rest state moving.
          */}
        {wide && (
          <div
            style={{
              position: 'sticky', top: 0, flex: '0 0 auto',
              padding: 'var(--sp-9) 0 var(--sp-9) var(--sp-7)',
            }}
          >
            <MiniNav
              orientation="vertical"
              items={nav.items}
              value={nav.current}
              onChange={nav.go} screenLit
              lead={<RailMark />}
            />
          </div>
        )}

        <div
          style={{
            flex: 1, minWidth: 0, boxSizing: 'border-box',
            padding: wide
              /* `--sp-9` on top (OPT-11): the island is "fully up", level
                 with the rail's top edge rather than 16px below it. */
              ? 'var(--sp-9) var(--gutter-page) var(--sp-13)'
              : 'var(--sp-9) var(--gutter-page-sm) 140px',
          }}
        >
          {/* ── The island ───────────────────────────────────────────
              OPT-11 (his BASE list, 2026-10-06): "Remove all the text from
              the smart start Island, move it fully up to the header". One
              glass bar is the header now, his pick of three (A): Smart Start
              on the left, Search and the account on the right. The keyboard
              button went to Settings → App; the account is the picture alone,
              both his calls. A rounded rectangle, not a pill
              (`--r-md`, his rule for top bars). */}
          <header
            style={{
              /* Its backdrop-filter makes the island a stacking context, so
                 the account menu inside it would open UNDER New project and
                 the cards; lifted above its later siblings (a local rung,
                 not one of `Z`'s). */
              position: 'relative', zIndex: 2,
              display: 'flex', alignItems: 'center', gap: 'var(--sp-5)',
              marginBottom: 'var(--gap-section)',
              padding: 'var(--sp-3)', borderRadius: 'var(--r-md)',
              backgroundImage: 'var(--glass-fill-2)',
              backdropFilter: 'var(--glass-bd-lg-refract)',
              WebkitBackdropFilter: 'var(--glass-bd-lg)',
              boxShadow: 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-2), var(--glow-accent-sm)',
            }}
          >
            {/* The screen's name, for a screen reader: the greeting that
                was the visible heading is gone (his call, 2026-10-06). */}
            <h1 className="sr-only">Home</h1>
            {/* Below the 900px break there is no rail to carry the mark. */}
            {!wide && <BrandMark />}
            <GelButton
              colour="orange"
              tile={false}
              icon={<Icon name="zap" size={18} />}
              onClick={() => setShowSmartStart(true)}
            >
              Smart Start
            </GelButton>
            <span style={{ flex: 1 }} />
            {/* The glass opens the command palette (BUILD-9) — Ctrl+K on the
                laptop, and this is the way in on the tablet, which has no key
                to press. */}
            <SoftIconButton label="Search" onClick={() => setPaletteOpen(true)}>
              <Icon name="search" size={18} />
            </SoftIconButton>

            <MorphMenu
              align="end"
              width={220}
              trigger={
                <button
                  type="button"
                  aria-label={`Account: ${displayName}`}
                  title={displayName}
                  style={{
                    display: 'grid', placeItems: 'center', width: 44, height: 44, padding: 0,
                    border: 0, cursor: 'pointer', borderRadius: '50%',
                    backgroundImage: 'var(--glass-fill-2)',
                    backdropFilter: 'var(--glass-bd-md)', WebkitBackdropFilter: 'var(--glass-bd-md)',
                    boxShadow: 'var(--glass-rim-2), var(--glass-cast-1)',
                    color: 'var(--fg-1)',
                  }}
                >
                  {user?.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt=""
                      referrerPolicy="no-referrer"
                      style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }}
                    />
                  ) : (
                    <span
                      style={{
                        display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: '50%',
                        backgroundImage: 'var(--glass-tint-accent)', boxShadow: 'var(--glass-rim-2)',
                        font: 'var(--type-numeric)', fontSize: 'var(--text-sm)',
                      }}
                    >
                      {initial}
                    </span>
                  )}
                </button>
              }
              items={[
                {
                  value: 'settings',
                  label: 'Settings',
                  icon: <Icon name="settings" size={16} />,
                  onSelect: () => navigate('/settings'),
                },
                { divider: true },
                {
                  value: 'signout',
                  label: 'Sign out',
                  icon: <Icon name="log-out" size={16} />,
                  tone: 'danger',
                  onSelect: () => { void logout(); },
                },
              ]}
            />
          </header>

          <div style={{ display: 'grid', gap: 'var(--gap-section)' }}>

            {/* ── Jump back in (29-1P8c, idea 154) — nothing until a project
                has been opened on this device ─────────────────────── */}
            <JumpBackRow />

            {/* ── Projects ─────────────────────────────────────────── */}
            <section style={{ display: 'grid', gap: 'var(--sp-7)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
                  <h2 style={{ font: 'var(--type-title)', fontSize: 'var(--text-xl)', color: 'var(--fg-1)' }}>
                    Your projects
                  </h2>
                  <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
                    {projects.length === 0
                      ? <LitLine text="**One project** is all it takes. Press **New project** to start." />
                      : `${topLevelCount} project${topLevelCount === 1 ? '' : 's'} · ${openTaskCount} task${openTaskCount === 1 ? '' : 's'} open`}
                  </span>
                </div>
                <span style={{ flex: 1 }} />
                <SoftButton icon={<Icon name="plus" size={16} />} onClick={() => setShowCreateProject(true)}>
                  New project
                </SoftButton>
              </div>

              {/* Only the top level (BIG-2, his call): a mega project's
                  card says how many projects it holds, and they are inside
                  it. Drop a card on another's middle to put it there. */}
              <ProjectGrid
                parentId={null}
                onEdit={setEditingProject}
                onNewProject={() => setShowCreateProject(true)}
              />
            </section>
          </div>
        </div>
      </div>

      {/* Tablet — the rail moves to a floating bottom bar */}
      {!wide && (
        <div
          style={{
            position: 'fixed', left: 0, right: 0, bottom: 'calc(var(--sp-6) + var(--safe-b))',
            display: 'grid', placeItems: 'center',
            zIndex: Z.nav, pointerEvents: 'none',
          }}
        >
          <span style={{ pointerEvents: 'auto' }}>
            <MiniNav items={nav.items} value={nav.current} onChange={nav.go} screenLit />
          </span>
        </div>
      )}
      {!wide && <QuickCaptureFab />}

      <CreateProjectModal
        isOpen={showCreateProject}
        onClose={() => { setShowCreateProject(false); clearHomeHandoff(); }}
        onSave={(data) => addProject(data)}
      />

      {editProject && (
        <CreateProjectModal
          isOpen={!!editingProject}
          onClose={() => setEditingProject(null)}
          onSave={(data) => updateProject(editProject.id, data)}
          project={editProject}
        />
      )}

      <SmartStartModal
        isOpen={showSmartStart}
        onClose={() => { setShowSmartStart(false); clearHomeHandoff(); }}
        backlogTasks={backlogTasks}
        currentQueueCount={tasks.length}
        onStart={handleSmartStart}
      />
    </div>
    </V3Scope>
  );
}
