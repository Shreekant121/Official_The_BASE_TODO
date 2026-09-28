/**
 * A project card on Home.
 * Mockup: design-system/screens/home.html (`ProjectCard`)
 *
 * Rebuilt on Aurora Glass. The shape is the mockup's: a 156px cover with
 * the status pill and the ⋯ menu floating on it, the project's own glyph
 * straddling the cover's bottom edge, then name, description, progress and
 * the stats row. (The mockup's next-task line was removed at his request,
 * 2026-09-23.)
 *
 * Everything underneath is the existing behaviour, unchanged:
 *   - the counts, progress and ₹ value are derived exactly as before,
 *     including the `sharedListIds` cross-link rule that makes a task
 *     shared into another project's list still count here;
 *   - the share flow still mints a `shareId`, pushes the public document
 *     and opens `ShareModal`;
 *   - the card is still its own drag handle, and still tells a click that
 *     ended a drag apart from a click that means "open this".
 *
 * Two changes worth naming:
 *   - Delete confirms INSIDE the menu (`MorphMenu` `confirm`) instead of
 *     firing immediately. The old card called `onDelete()` straight from
 *     the menu row — one click, no confirmation, on a control sitting a
 *     few pixels from "Edit". Deletion is soft and recoverable from the
 *     Trash, but it should still take two deliberate actions.
 *   - The menu carries a `header` restating the project's name, counts
 *     and budget. It overlays the card it acts on, so without that the
 *     user is choosing "Delete" against no visible subject.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Button, CoverImage, Icon, PROJECT_COVER_RATIO, IconButton, MorphMenu, StatusPill, useMotion, type StatusName,
} from '../ui';
import {
  useStore, type Project, type Task, type TaskList, projectValueINR, formatINR,
} from '../store/useStore';
import { useAuth } from '../contexts/AuthContext';
import { makeShareId, shareProject, shareUrl, type ShareSettings } from '../lib/publicShare';
import { archiveProject } from '../lib/archive';
import ShareModal from './ShareModal';
import AppIcon from './AppIcon';

interface ProjectCardProps {
  project: Project;
  tasks: Task[];
  lists: TaskList[];
  onEdit: () => void;
  onDelete: () => void;
  /** This card is the one being dragged (see `SortableRow`, which owns the grab). */
  isBeingDragged?: boolean;
  /** Some card in the grid is being dragged — `layout` has to be off while true. */
  isAnyDragging?: boolean;
}

/**
 * Where a project sits, in the design system's vocabulary. `running` is
 * the only one that ripples, and emerald means live — so a project earns
 * it by actually having work finished in it, not merely by existing.
 */
function projectStatus(listCount: number, taskCount: number, progress: number): {
  status: StatusName;
  label: string;
} {
  if (listCount === 0) return { status: 'archived', label: 'Empty' };
  if (taskCount > 0 && progress === 100) return { status: 'done', label: 'Complete' };
  if (progress > 0) return { status: 'running', label: 'In progress' };
  return { status: 'queued', label: 'Not started' };
}

export default function ProjectCard({
  project, tasks, lists, onEdit, onDelete, isBeingDragged = false, isAnyDragging = false,
}: ProjectCardProps) {
  const navigate = useNavigate();
  const motionTokens = useMotion();
  const { user } = useAuth();
  const { updateProject } = useStore();
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Releasing after a drag still fires a click on the card; skip the navigate
  // that would otherwise open the project you just finished repositioning.
  const suppressClickRef = useRef(false);

  const [shareId, setShareId] = useState(project.shareId);
  const [shortUrlKeyword, setShortUrlKeyword] = useState(project.shortUrlKeyword);
  const [shortUrlDomain, setShortUrlDomain] = useState(project.shortUrlDomain);
  const [shareSettings, setShareSettings] = useState<ShareSettings>({
    shareAllowContributions: project.shareAllowContributions,
    shareShowPeople: project.shareShowPeople,
    shareExpiresOn: project.shareExpiresOn,
  });
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    if (!user || sharing) return;
    setSharing(true);
    try {
      let id = shareId;
      if (!id) {
        id = makeShareId();
        setShareId(id);
        updateProject(project.id, { shareId: id });
      }
      await shareProject(id, user.uid, { ...project, shareId: id }, lists, tasks);
      setShareModalOpen(true);
    } catch (err) {
      console.error('Failed to share project', err);
      alert(`Couldn't create the share link. ${err instanceof Error ? err.message : 'Please try again.'}`);
    } finally {
      setSharing(false);
    }
  };

  const handleShareKeywordChange = (keyword?: string, domain?: string) => {
    setShortUrlKeyword(keyword);
    setShortUrlDomain(domain);
    updateProject(project.id, { shortUrlKeyword: keyword, shortUrlDomain: domain });
  };

  const handleShareSettingsChange = async (patch: ShareSettings) => {
    if (!user || !shareId) return;
    const next = { ...shareSettings, ...patch };
    setShareSettings(next);
    updateProject(project.id, patch);
    try {
      // Re-push at once: the submissions rule keys off `allowContributions`,
      // and an end date should close the link without waiting for a sync.
      await shareProject(shareId, user.uid, { ...project, shareId, ...next }, lists, tasks);
    } catch (err) {
      console.error('Failed to update share settings', err);
    }
  };

  const projectLists = lists.filter((l) => l.projectId === project.id);
  const projectTasks = tasks.filter(
    (t) =>
      !t.parent &&
      (projectLists.some((l) => l.id === t.listId) ||
        (t.sharedListIds ?? []).some((id) => projectLists.some((l) => l.id === id)))
  );
  const completedCount = projectTasks.filter((t) => t.status === 'completed').length;
  const progress =
    projectTasks.length > 0
      ? Math.round((completedCount / projectTasks.length) * 100)
      : 0;
  const totalValueINR = projectValueINR(lists, tasks, project.id);
  const budget = totalValueINR > 0 ? formatINR(totalValueINR) : null;

  /* No "next task" line on the card (Shreekant, 2026-09-23: removed). It
     was the first unfinished task in the project, greyed with a lock when
     blocked (item 19); the board inside the project is where tasks are. */
  const empty = projectLists.length === 0;
  const { status, label: statusLabel } = projectStatus(projectLists.length, projectTasks.length, progress);

  // The card is its own drag handle *and* the link into the project, so the
  // click that ends a drag has to be told apart from a click that means "open
  // this". A pointer that moved far enough to start a drag sets the flag; it
  // is released a beat after the drag ends, because the click arrives after
  // the drop, not before it.
  useEffect(() => {
    if (isBeingDragged) {
      suppressClickRef.current = true;
      return;
    }
    if (!suppressClickRef.current) return;
    const timer = window.setTimeout(() => { suppressClickRef.current = false; }, 50);
    return () => window.clearTimeout(timer);
  }, [isBeingDragged]);

  /* The whole card is the door into the project. Anything that is itself a
     control (the ⋯ menu, the empty-state button) keeps its own click.
     Portalled children (the share modal) bubble their clicks up the React
     tree even though they live outside this element in the DOM, so only
     navigate for clicks that really happened inside the card. */
  const open = (target: EventTarget | null, currentTarget: HTMLElement) => {
    if (suppressClickRef.current) return;
    const node = target as Node | null;
    if (!node || !currentTarget.contains(node)) return;
    if (node instanceof Element && node.closest('button, a, [role="menu"]')) return;
    navigate(`/project/${project.id}`);
  };

  return (
    <motion.article
      layout={!isAnyDragging}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      /* V3 (V3-2): v4's `ag-land` — a short rise on the glass curve, no
         overshoot — from `useMotion()`. It was a spring (260 / 24) that
         rose 20px and bounced; V3's motion lets only a release settle. */
      transition={{ duration: motionTokens.dur.slow, ease: motionTokens.ease.glass }}
      className="ag-card cursor-grab active:cursor-grabbing"
      role="link"
      tabIndex={0}
      aria-label={`Open ${project.name}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => open(e.target, e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) navigate(`/project/${project.id}`);
      }}
      style={{
        position: 'relative',
        /* backdrop-filter makes every card its own stacking context, so the
           open panel has to be lifted by the CARD, not the panel. */
        zIndex: menuOpen ? 70 : 'auto',
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        minHeight: 396,
        borderRadius: 'var(--r-card-lg)',
        backgroundImage: hover && !isBeingDragged ? 'var(--glass-fill-3)' : 'var(--glass-fill-2)',
        backdropFilter: 'var(--glass-bd-md-refract)',
        WebkitBackdropFilter: 'var(--glass-bd-md)',
        boxShadow: [
          'var(--glass-rim-2)',
          'var(--glass-inner-1)',
          isBeingDragged || hover ? 'var(--glass-cast-3)' : 'var(--glass-cast-2)',
        ].join(', '),
        /*
         * Hover lift is a plain CSS transform, NOT a Framer `whileHover`.
         * Framer writes inline `style.transform`, which is the same property
         * dnd-kit's wrapper uses to move the card — see CLAUDE.md. Keeping
         * the lift in CSS leaves that property to the drag system alone.
         */
        transform: hover && !isBeingDragged ? 'translateY(-3px)' : 'translateY(0)',
        transition: 'var(--t-hover)',
      }}
    >
      {/* ── Cover ───────────────────────────────────────────────────── */}
      <div style={{ position: 'relative' }}>
        <div
          className="ag-cover"
          style={{
            position: 'relative',
            /* 1200×700, his size — see `PROJECT_COVER_RATIO`. Was a fixed
               156px, which made the cover 2.1–2.6:1 depending on the screen. */
            aspectRatio: PROJECT_COVER_RATIO,
            borderRadius: 'var(--r-card-lg) var(--r-card-lg) 0 0',
            overflow: 'hidden',
            boxShadow: 'inset 0 -1px 0 0 var(--line-faint)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          {project.imageUrl ? (
            /* COVERS RENDER AT FULL COLOUR. FIX-3, and it reverses a rule this
               file used to state: covers were `saturate(0.5) brightness(0.82)`
               so that "a wall of them can never out-shout the numbers
               underneath". Shreekant was shown that argument on 2026-09-15 and
               asked for his photographs undimmed anyway. **Do not reinstate
               the filter.** If a wall of full-strength covers ever does drown
               the board, the answer is a scrim *under the text* — the pattern
               `ui/layout/TaskSheet.tsx` already uses (`COVER_SCRIM`) — and not
               a filter on his picture. */
            <CoverImage src={project.imageUrl} />
          ) : null}
        </div>

        <div
          style={{
            position: 'absolute', top: 'var(--sp-5)', left: 'var(--sp-6)', right: 'var(--sp-5)',
            display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
          }}
        >
          <span
            style={{ width: 4, height: 4, borderRadius: '50%', background: project.color, flex: '0 0 auto' }}
          />
          <StatusPill status={status} size="sm">{statusLabel}</StatusPill>
          <span style={{ flex: 1 }} />
          <span className="ag-card-actions" data-open={menuOpen ? 'true' : 'false'}>
            <MorphMenu
              align="end"
              width={292}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              trigger={
                <IconButton label={`Actions for ${project.name}`} variant="ghost">
                  <Icon name="ellipsis" size={18} />
                </IconButton>
              }
              header={{
                title: project.name,
                meta: [
                  `${projectLists.length} list${projectLists.length === 1 ? '' : 's'}`,
                  `${projectTasks.length} task${projectTasks.length === 1 ? '' : 's'}`,
                  budget ?? 'no budget',
                ].join('  ·  '),
                /* The mockup's `DOT[p.status]`: this dot carries the STATUS,
                   not the project's own hue — that is already the 4px dot on
                   the cover, and repeating it here would leave the pill's
                   state unrepresented while an amber project wore the
                   emerald "running" glow. Written from the token name rather
                   than a second lookup table, so it cannot fall out of step
                   with `StatusName`. */
                badge: (
                  <span
                    style={{
                      width: 7, height: 7, borderRadius: '50%', flex: '0 0 auto',
                      background: `var(--status-${status})`,
                      boxShadow: status === 'running' ? '0 0 8px 0 var(--accent)' : 'none',
                    }}
                  />
                ),
              }}
              items={[
                {
                  value: 'edit',
                  label: 'Edit project',
                  icon: <Icon name="square-pen" size={18} />,
                  onSelect: onEdit,
                },
                {
                  value: 'share',
                  label: 'Share project',
                  icon: <Icon name="share-2" size={18} />,
                  // A short link already exists for this project.
                  meta: shortUrlKeyword ? <Icon name="link" size={14} /> : undefined,
                  onSelect: () => { void handleShare(); },
                },
                { divider: true },
                /* BUILD-11. Above Delete, never red, and confirming in the
                   row that offered it (`Archive.dc.html`). */
                {
                  value: 'archive',
                  label: 'Archive project',
                  icon: <Icon name="archive" size={18} />,
                  confirm: {
                    label: `Archive ${project.name}?`,
                    hint: empty
                      ? 'It leaves every board, count, queue, search and Atlas. Nothing ever purges it.'
                      : `It leaves every board, count, queue, search and Atlas. Its ${projectTasks.length} task${projectTasks.length === 1 ? '' : 's'} go with it. Nothing ever purges it.`,
                    action: 'Archive',
                    onConfirm: () => { archiveProject(project.id); },
                  },
                },
                {
                  value: 'delete',
                  label: 'Delete project',
                  icon: <Icon name="trash-2" size={18} />,
                  tone: 'danger',
                  confirm: {
                    label: `Delete ${project.name}?`,
                    hint: empty
                      ? 'Nothing in it yet.'
                      : `${projectLists.length} list${projectLists.length === 1 ? '' : 's'} and ${projectTasks.length} task${projectTasks.length === 1 ? '' : 's'} go with it. Recoverable from Trash for 30 days.`,
                    onConfirm: onDelete,
                  },
                },
              ]}
            />
          </span>
        </div>

        {/* The project's own glyph, on the cover's edge — the one place an
            emoji is allowed to be an identity rather than a label. */}
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', left: 'var(--sp-6)', bottom: -20,
            display: 'grid', placeItems: 'center', width: 48, height: 48,
            borderRadius: 'var(--r-md)', backgroundImage: 'var(--glass-fill-3)',
            backdropFilter: 'var(--glass-bd-md)', WebkitBackdropFilter: 'var(--glass-bd-md)',
            boxShadow: 'var(--glass-rim-2), var(--glass-cast-2)',
          }}
        >
          <AppIcon icon={project.icon} size={23} />
        </span>
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid', gridTemplateRows: 'auto auto 1fr', gap: 'var(--sp-5)',
          padding: 'var(--sp-10) var(--pad-card) var(--pad-card)',
        }}
      >
        <h3
          style={{
            font: 'var(--type-title)', fontSize: 'var(--text-xl)',
            letterSpacing: 'var(--tracking-title)', color: 'var(--fg-1)',
          }}
        >
          {project.name}
        </h3>

        <p
          className="ag-clamp-2"
          style={{
            font: 'var(--type-body)', fontSize: 'var(--text-sm)',
            color: 'var(--fg-3)', alignSelf: 'start',
          }}
        >
          {project.description}
        </p>

        {empty ? (
          <div
            style={{
              display: 'grid', gap: 'var(--sp-4)', paddingTop: 'var(--sp-4)',
              borderTop: '1px solid var(--line-faint)', alignContent: 'start',
            }}
          >
            <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>Nothing here yet.</span>
            <Button
              iconLeft={<Icon name="plus" size={16} />}
              style={{ justifySelf: 'start' }}
              onClick={() => navigate(`/project/${project.id}`)}
            >
              Add first list
            </Button>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--sp-5)', alignContent: 'end' }}>
            <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span className="ag-kicker">{completedCount} of {projectTasks.length} done</span>
                <span
                  style={{
                    font: 'var(--type-numeric)', fontSize: 'var(--text-xs)',
                    color: progress > 0 ? 'var(--accent)' : 'var(--fg-3)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {progress}%
                </span>
              </div>
              <div
                style={{
                  height: 5, borderRadius: 'var(--r-pill)',
                  backgroundImage: 'var(--glass-well)', boxShadow: 'var(--glass-well-shadow)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%', width: `${progress}%`, borderRadius: 'var(--r-pill)',
                    background: 'var(--accent)', boxShadow: '0 0 12px -1px var(--accent)',
                    transition: 'width var(--dur-slow) var(--ease-glass)',
                  }}
                />
              </div>
            </div>

            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--sp-5)',
                paddingTop: 'var(--sp-4)', borderTop: '1px solid var(--line-faint)', flexWrap: 'wrap',
              }}
            >
              <Stat value={projectLists.length} label={projectLists.length === 1 ? 'list' : 'lists'} />
              <Stat value={projectTasks.length} label={projectTasks.length === 1 ? 'task' : 'tasks'} />
              <span style={{ flex: 1 }} />
              {budget && (
                <span
                  title="Total ₹ value across this project"
                  style={{
                    font: 'var(--type-numeric)', fontSize: 'var(--text-xs)', color: 'var(--fg-2)',
                    padding: '4px var(--sp-4)', borderRadius: 'var(--r-pill)',
                    backgroundImage: 'var(--glass-fill-1)', boxShadow: 'var(--glass-rim-1)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {budget}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {shareModalOpen && shareId && (
          <ShareModal
            publicUrl={shareUrl(shareId)}
            entityType="project"
            currentKeyword={shortUrlKeyword}
            currentDomain={shortUrlDomain}
            onKeywordChange={handleShareKeywordChange}
            settings={shareSettings}
            onSettingsChange={(patch) => void handleShareSettingsChange(patch)}
            onClose={() => setShareModalOpen(false)}
          />
        )}
      </AnimatePresence>
    </motion.article>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5 }}>
      <span
        style={{
          font: 'var(--type-numeric)', fontSize: 'var(--text-sm)',
          color: 'var(--fg-1)', fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
      <span style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }}>{label}</span>
    </span>
  );
}
