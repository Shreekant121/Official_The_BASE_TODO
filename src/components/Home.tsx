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
 *     the only `variant="solid"` button on the screen; the design system
 *     allows exactly one per view.
 *   - Home draws its own `<MiniNav>` (vertical rail on a wide window, a
 *     floating bar below) and opts out of the global `FloatingNav`, the
 *     same pattern Settings uses.
 *
 * The backdrop was `--calm` until V3-2 (UI-34 took it from `home.html`'s
 * body class, reasoning that a wall of project cards is a dense data
 * screen). V3's Home sits on the full field instead — `Devices.dc.html`
 * draws its teal masses at full strength behind the laptop screen — and
 * V3's glass is clear enough that there has to be something behind it to
 * bend, or the lens has nothing to show.
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
 *   - **The greeting and date replace the BASE wordmark**, as the design's
 *     header has it; the mark moves to the head of the rail, which is where
 *     the design puts it. No "4 of 7 done" beside the date — that number
 *     belongs to the dashboard, not to this screen.
 * What else V3 changed here: the header's two icon controls are the
 * design's round glass buttons rather than ghosts, Smart Start is a gel
 * button (V3's one primary), the rail's live cell is a lit white plate,
 * and status pills read in sentence case. The tablet and phone layouts are
 * the ones they were, in the new material.
 */
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import {
  Button, GlassFilters, Icon, IconButton, MiniNav, MorphMenu, V3Scope, useMedia,
} from '../ui';
import { useStore } from '../store/useStore';
import { useUIStore } from '../store/useUIStore';
import { useAuth } from '../contexts/AuthContext';
import { builtInShortcut, useShortcuts, useOpenShortcutsHelp } from '../contexts/ShortcutsContext';
import { useNavModel } from './navModel';
import { BrandMark, RailMark } from './BrandMark';
import ProjectCard from './ProjectCard';
import CreateProjectModal from './CreateProjectModal';
import SmartStartModal from './SmartStartModal';
import { SortableList, SortableRow } from './SortableList';
import { Z } from '../lib/zLayers';
import type { Task } from '../store/useStore';

/* The mockup switches the rail to a bottom bar at 900px, not at the 960px
   Settings uses — Home's card grid needs the width sooner. */
const HOME_WIDE = '(min-width: 900px)';

/** "Good evening" — by the hour on this device's clock. */
function greetingFor(now: Date): string {
  const h = now.getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** "Wednesday, 23 September", the design's header line. Built in two parts
    because en-GB's own long form leaves the comma out. */
function headerDate(now: Date): string {
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long' });
  const day = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  return `${weekday}, ${day}`;
}

export default function Home() {
  const {
    projects, addProject, updateProject, deleteProject, reorderProjects,
    backlogTasks, taskLists, tasks, setTasks,
  } = useStore();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const wide = useMedia(HOME_WIDE);
  const nav = useNavModel();
  const openHelp = useOpenShortcutsHelp();

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
  const handoff = useUIStore((s) => s.paletteHandoff);
  const setHandoff = useUIStore((s) => s.setPaletteHandoff);
  const showCreateProject = createProjectOpen || handoff?.kind === 'new-project';
  const showSmartStart = smartStartOpen || handoff?.kind === 'smart-start';
  const clearHomeHandoff = () => {
    if (handoff?.kind === 'new-project' || handoff?.kind === 'smart-start') setHandoff(null);
  };

  const editProject = projects.find((p) => p.id === editingProject);

  const sortedProjects = useMemo(
    () => projects.slice().sort((a, b) => a.order - b.order),
    [projects],
  );

  const projectIds = useMemo(() => sortedProjects.map((p) => p.id), [sortedProjects]);

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
  /* First name only, and only from a real name: an email address is not a
     thing to greet. With no name set it is just "Good evening". */
  const firstName = user?.displayName?.trim().split(/\s+/)[0];
  const now = new Date();
  const greeting = firstName ? `${greetingFor(now)}, ${firstName}` : greetingFor(now);

  return (
    <V3Scope>
    <div className="ag-page h-screen overflow-y-auto">
      {/* Mounted once per document — every card's `--glass-bd-md-refract`
          resolves to a filter defined in here. Without it the cards fall
          back to a plain blur, silently. */}
      <GlassFilters />

      <div style={{ display: 'flex', minHeight: '100%', alignItems: 'flex-start' }}>

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
              onChange={nav.go}
              lead={<RailMark />}
            />
          </div>
        )}

        <div
          style={{
            flex: 1, minWidth: 0, boxSizing: 'border-box',
            padding: wide
              ? 'var(--sp-11) var(--gutter-page) var(--sp-13)'
              : 'var(--sp-9) var(--gutter-page-sm) 140px',
          }}
        >
          {/* ── Header ─────────────────────────────────────────────── */}
          <header
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--sp-5)',
              flexWrap: 'wrap', marginBottom: 'var(--sp-11)',
            }}
          >
            {/* Below the 900px break there is no rail to carry the mark. */}
            {!wide && <BrandMark />}
            {/* A 200px basis, not its full width: on a phone the greeting
                then wraps beside the mark instead of pushing it onto a line
                of its own, and the buttons take the next line. */}
            <div style={{ display: 'grid', gap: 2, minWidth: 0, flex: '1 1 200px' }}>
              <h1
                style={{
                  font: 'var(--weight-bold) var(--text-2xl) / var(--leading-tight) var(--font-display)',
                  letterSpacing: 'var(--tracking-display)', color: 'var(--fg-1)',
                }}
              >
                {greeting}
              </h1>
              <span style={{ font: 'var(--type-label)', fontSize: 'var(--text-md)', color: 'var(--fg-3)' }}>
                {headerDate(now)}
              </span>
            </div>
            {/* One group, so on a narrow window the three wrap together
                rather than one of them staying beside the greeting. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', marginLeft: 'auto' }}>
              {/* The design's round glass buttons. The glass opens the command
                  palette (BUILD-9) — Ctrl+K on the laptop, and this is the way
                  in on the tablet, which has no key to press. */}
              <IconButton label="Search" onClick={() => setPaletteOpen(true)}>
                <Icon name="search" size={18} />
              </IconButton>

              {/* `?` opens this too, but there is no key to press on the tablet. */}
              <IconButton label="Keyboard shortcuts" onClick={openHelp}>
                <Icon name="keyboard" size={18} />
              </IconButton>

              <MorphMenu
                align="end"
                width={220}
                trigger={
                  <button
                    type="button"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-4)', height: 44,
                      padding: '0 var(--sp-5) 0 var(--sp-3)', border: 0, cursor: 'pointer',
                      borderRadius: 'var(--r-pill)',
                      backgroundImage: 'var(--glass-fill-2)',
                      backdropFilter: 'var(--glass-bd-md)', WebkitBackdropFilter: 'var(--glass-bd-md)',
                      boxShadow: 'var(--glass-rim-2), var(--glass-cast-1)',
                      color: 'var(--fg-1)', font: 'var(--type-label)',
                    }}
                  >
                    {user?.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt=""
                        referrerPolicy="no-referrer"
                        style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover' }}
                      />
                    ) : (
                      <span
                        style={{
                          display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: '50%',
                          backgroundImage: 'var(--glass-tint-accent)', boxShadow: 'var(--glass-rim-2)',
                          font: 'var(--type-numeric)', fontSize: 'var(--text-xs)',
                        }}
                      >
                        {initial}
                      </span>
                    )}
                    <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {displayName}
                    </span>
                    <Icon name="chevron-down" size={15} />
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
            </div>
          </header>

          <div style={{ display: 'grid', gap: 'var(--gap-section)' }}>

            {/* ── Smart Start ──────────────────────────────────────── */}
            <section
              style={{
                display: 'grid', gap: 'var(--sp-7)', justifyItems: 'start',
                padding: 'var(--pad-card-lg)', borderRadius: 'var(--r-card-lg)',
                backgroundImage: 'var(--glass-fill-2)',
                backdropFilter: 'var(--glass-bd-lg-refract)',
                WebkitBackdropFilter: 'var(--glass-bd-lg)',
                boxShadow: 'var(--glass-rim-2), var(--glass-inner-1), var(--glass-cast-2), var(--glow-accent-sm)',
              }}
            >
              <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
                <span className="ag-kicker" style={{ color: 'var(--accent)' }}>Start here</span>
                <h2
                  style={{
                    font: 'var(--type-metric)', fontSize: 'var(--text-2xl)',
                    letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)',
                  }}
                >
                  Strict focus. One task at a time.
                </h2>
              </div>
              <Button
                variant="gel"
                size="lg"
                iconLeft={<Icon name="zap" size={18} />}
                onClick={() => setShowSmartStart(true)}
              >
                Smart Start
              </Button>
            </section>

            {/* ── Projects ─────────────────────────────────────────── */}
            <section style={{ display: 'grid', gap: 'var(--sp-7)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
                <div style={{ display: 'grid', gap: 'var(--sp-2)' }}>
                  <h2 style={{ font: 'var(--type-title)', fontSize: 'var(--text-xl)', color: 'var(--fg-1)' }}>
                    Your projects
                  </h2>
                  <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>
                    {projects.length === 0
                      ? 'Create your first project to get started.'
                      : `${projects.length} project${projects.length === 1 ? '' : 's'} · ${openTaskCount} task${openTaskCount === 1 ? '' : 's'} open`}
                  </span>
                </div>
                <span style={{ flex: 1 }} />
                <Button iconLeft={<Icon name="plus" size={16} />} onClick={() => setShowCreateProject(true)}>
                  New project
                </Button>
              </div>

              <SortableList
                ids={projectIds}
                onReorder={reorderProjects}
                axis="xy"
                className="grid grid-cols-[repeat(auto-fill,minmax(316px,1fr))] gap-5"
              >
                <AnimatePresence>
                  {sortedProjects.map((project) => (
                    <SortableRow key={project.id} id={project.id}>
                      {({ isDragging, isAnyDragging }) => (
                        <ProjectCard
                          project={project}
                          tasks={backlogTasks}
                          lists={taskLists}
                          onEdit={() => setEditingProject(project.id)}
                          onDelete={() => deleteProject(project.id)}
                          isBeingDragged={isDragging}
                          isAnyDragging={isAnyDragging}
                        />
                      )}
                    </SortableRow>
                  ))}
                </AnimatePresence>

                {/* New project tile — a dashed outline, never a glass pane:
                    it is a slot waiting to be filled, not an object. */}
                <button
                  type="button"
                  onClick={() => setShowCreateProject(true)}
                  style={{
                    display: 'grid', placeItems: 'center', alignContent: 'center', gap: 'var(--sp-4)',
                    minHeight: 250, padding: 'var(--pad-card)', cursor: 'pointer',
                    borderRadius: 'var(--r-card-lg)',
                    border: '1px dashed var(--line-strong)',
                    background: 'transparent', color: 'var(--fg-3)',
                    transition: 'var(--t-hover)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--glass-fill-1)';
                    e.currentTarget.style.color = 'var(--fg-1)';
                    e.currentTarget.style.borderColor = 'var(--accent-hairline)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--fg-3)';
                    e.currentTarget.style.borderColor = 'var(--line-strong)';
                  }}
                >
                  <span
                    style={{
                      display: 'grid', placeItems: 'center', width: 46, height: 46, borderRadius: '50%',
                      backgroundImage: 'var(--glass-fill-2)', boxShadow: 'var(--glass-rim-2)',
                    }}
                  >
                    <Icon name="plus" size={20} />
                  </span>
                  <span style={{ font: 'var(--type-label)', whiteSpace: 'nowrap' }}>New project</span>
                </button>
              </SortableList>
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
            <MiniNav items={nav.items} value={nav.current} onChange={nav.go} />
          </span>
        </div>
      )}

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
