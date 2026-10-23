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
 *
 * BIG-2 — a card counts everything inside it (his call, 2026-09-29): its
 * tasks, progress and value are the whole subtree's, through
 * `subtreeTasks`, while "lists" stays the lists on its own board — the
 * number you see when you open it. A mega project says how many projects
 * it holds, and a card another card is hovering over invites the drop.
 *
 * 29-1P8b — the card says how it is going (his picks, 2026-10-13): two weeks
 * of squares under the progress bar (idea 151), and, in place of "In
 * progress" only, On track / At risk / Off track / Quiet with one line of why
 * under the description (152). Both come from `useProjectPulse`, which the
 * Dashboard's project block reads too.
 *
 * 29-1P8c — a project with projects inside looks like a folder (idea 153, his
 * pick C, 2026-10-13): its cover is made of theirs, up to four tiles with
 * their names and "+N" past four, and its own cover is not drawn while it
 * holds any. Given `onToggleFolder` (Home's grid, and the row of cards inside
 * a mega project), pressing it unfolds what is inside instead of opening it —
 * his call; `FolderTray` is the row that unfolds, and it holds the way in.
 */
import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CoverImage, Icon, PROJECT_COVER_RATIO, IconButton, LitLine, MorphMenu, PulseSquares, SoftButton, StatusPill, useMotion, useTilt,
  type StatusName,
} from '../ui';
import {
  useStore, type Project, type Task, type TaskList, projectValueINR, formatINR,
} from '../store/useStore';
import { useAuth } from '../contexts/AuthContext';
import { makeShareId, shareProject, shareUrl, type ShareSettings } from '../lib/publicShare';
import { archiveProject } from '../lib/archive';
import { goesWith, subtreeListIds, subtreeTasks, type ProjectTree } from '../lib/projectTree';
import { ignoreSentence, isOwnSwitch } from '../lib/ignoredWork';
import { dustAttr } from '../lib/dust';
import { usePriorityScores } from '../store/usePriorityScores';
import { IgnoredMark } from './task-fields/TaskMarks';
import { useIgnoreItems } from './task-fields/ignoreMenu';
import { useWorkedItems } from './task-fields/workedMenu';
import ShareModal from './ShareModal';
import MoveProjectDialog from './MoveProjectDialog';
import OpenBesideDialog from './OpenBesideDialog';
import { useOpenProject } from './project/openProject';
import { HEALTH_PILL, useProjectPulse } from './project/useProjectPulse';
import ProjectIcon from './ProjectIcon';
import { MadeCover } from './ProjectCover';
import { FolderTiles } from './FolderParts';
import { resolveCover } from '../lib/projectCover';

interface ProjectCardProps {
  project: Project;
  /** Built once by the grid; every roll-up on the card reads it. */
  tree: ProjectTree;
  tasks: Task[];
  lists: TaskList[];
  onEdit: () => void;
  onDelete: () => void;
  /** This card is the one being dragged (see `SortableRow`, which owns the grab). */
  isBeingDragged?: boolean;
  /** Some card in the grid is being dragged — `layout` has to be off while true. */
  isAnyDragging?: boolean;
  /** Another card is over this one's middle: releasing puts it inside (BIG-2). */
  isDropInto?: boolean;
  /** A folder (it holds projects) whose row of projects is unfolded under it (idea 153). */
  folderOpen?: boolean;
  /** Pressing a folder unfolds it rather than opening it. Left out, it opens. */
  onToggleFolder?: () => void;
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
  project, tree, tasks, lists, onEdit, onDelete,
  isBeingDragged = false, isAnyDragging = false, isDropInto = false,
  folderOpen = false, onToggleFolder,
}: ProjectCardProps) {
  /* BIG-5: inside one of two boards side by side, a card opens in that board. */
  const openProject = useOpenProject();
  const motionTokens = useMotion();
  const { user } = useAuth();
  const { updateProject } = useStore();
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Releasing after a drag still fires a click on the card; skip the navigate
  // that would otherwise open the project you just finished repositioning.
  const suppressClickRef = useRef(false);
  /* Idea 25 (29-1P6c): the card leans toward the mouse, laptop only. Held
     flat while any card is dragged and while its menu is open. */
  const cardRef = useRef<HTMLElement>(null);
  useTilt(cardRef, { enabled: !isAnyDragging && !menuOpen });

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
  const [moving, setMoving] = useState(false);
  const [openingBeside, setOpeningBeside] = useState(false);

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
  // The whole subtree's tasks, each once — shared-in cross-links included,
  // exactly as the card always counted them for its own lists.
  const projectTasks = subtreeTasks(tree, lists, tasks, project.id);
  const subtree = tree.subtreeIds(project.id);
  const inside = subtree.length - 1;
  const insideLabel = `${inside} project${inside === 1 ? '' : 's'}`;
  const completedCount = projectTasks.filter((t) => t.status === 'completed').length;
  const progress =
    projectTasks.length > 0
      ? Math.round((completedCount / projectTasks.length) * 100)
      : 0;
  /* A folder's cover is the projects inside it (idea 153), whatever its own. */
  const folderOf = tree.childrenOf(project.id);
  const isFolder = folderOf.length > 0;
  const unfolds = isFolder && !!onToggleFolder;
  /* The style drawn when there is no photo (idea 149); a photo always wins. */
  const cover = resolveCover(project.id, project.cover);
  const noCover = !isFolder && !project.imageUrl && cover.kind === 'none';
  const iconIsCover = !isFolder && !project.imageUrl && cover.kind === 'icon';
  const totalValueINR = subtree.reduce((sum, id) => sum + projectValueINR(lists, tasks, id), 0);
  const budget = totalValueINR > 0 ? formatINR(totalValueINR) : null;

  /* No "next task" line on the card (Shreekant, 2026-09-23: removed). It
     was the first unfinished task in the project, greyed with a lock when
     blocked (item 19); the board inside the project is where tasks are. */
  // Empty means nothing anywhere inside it — a mega project that holds only
  // projects is not "Empty" and should not offer "Add first list".
  const empty = inside === 0 && subtreeListIds(tree, lists, project.id).size === 0;
  const { status, label: statusLabel } = projectStatus(empty ? 0 : 1, projectTasks.length, progress);
  /* 29-1P8b: the pulse under the progress bar (151) and, in place of "In
     progress" only, the word with its line of why (152) — his picks, B and D.
     Not started, Empty and Complete keep their own pill. */
  const { days: pulse, health } = useProjectPulse(project.id, tree, lists, tasks);
  const word = status === 'running' ? health : null;
  /* BIG-3. Marked on the card only by its own switch: a card inside an ignored
     mega project is ignored by that one, which says so on its own head. */
  const ignoreReason = usePriorityScores().ignored.projectReason(project.id);
  const ignoreItems = useIgnoreItems({ kind: 'project', id: project.id }, project.name);
  const workedItems = useWorkedItems({ kind: 'project', id: project.id });

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
    if (unfolds) onToggleFolder?.();
    else openProject(project.id);
  };
  const lit = (hover || folderOpen) && !isBeingDragged;

  return (
    <motion.article
      ref={cardRef}
      {...dustAttr('project', project.id)}
      layout={!isAnyDragging}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      /* V3 (V3-2): v4's `ag-land` — a short rise on the glass curve, no
         overshoot — from `useMotion()`. It was a spring (260 / 24) that
         rose 20px and bounced; V3's motion lets only a release settle. */
      transition={{ duration: motionTokens.dur.slow, ease: motionTokens.ease.glass }}
      className="ag-card ag-licon-host cursor-grab active:cursor-grabbing"
      role={unfolds ? 'button' : 'link'}
      tabIndex={0}
      aria-label={unfolds ? `${project.name}: ${insideLabel} inside` : `Open ${project.name}`}
      aria-expanded={unfolds ? folderOpen : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => open(e.target, e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.target !== e.currentTarget) return;
        if (unfolds) onToggleFolder?.();
        else openProject(project.id);
      }}
      style={{
        position: 'relative',
        /* backdrop-filter makes every card its own stacking context, so the
           open panel has to be lifted by the CARD, not the panel. */
        zIndex: menuOpen ? 70 : 'auto',
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        /* F has no cover, so nothing to hold the card up to a covered one's
           height; a row of cards still stretches it to the tallest. */
        minHeight: noCover ? undefined : 396,
        borderRadius: 'var(--r-card-lg)',
        /* Lit while pointed at, and while its row is unfolded under it. */
        backgroundImage: lit ? 'var(--glass-fill-3)' : 'var(--glass-fill-2)',
        backdropFilter: 'var(--glass-bd-md-refract)',
        WebkitBackdropFilter: 'var(--glass-bd-md)',
        boxShadow: [
          /* A ring while another card hovers its middle: let go and it goes
             inside. `--line-strong`, the ring a list card gives a hovering
             task (`ListColumn`), and never emerald — that would say LIVE. */
          isDropInto ? '0 0 0 2px var(--line-strong)' : 'var(--glass-rim-2)',
          'var(--glass-inner-1)',
          isBeingDragged || hover || isDropInto ? 'var(--glass-cast-3)' : 'var(--glass-cast-2)',
        ].join(', '),
        /*
         * Hover lift is the plain CSS `translate` property, NOT a Framer
         * `whileHover` and NOT `transform`. Framer owns this card's inline
         * `transform` (its arrival animates `y`) and writes `none` over
         * anything React puts there — measured 2026-10-13: the lift written
         * as `transform: translateY(-3px)` had never shown. `translate` is
         * a property of its own, and so is `rotate`, which carries the lean
         * (idea 25, `.ag-card[data-tilt]` in `motionPieces.css`).
         */
        translate: hover && !isBeingDragged ? '0 -3px' : undefined,
        transition: 'var(--t-hover), translate var(--dur-fast) var(--ease-glass), rotate var(--dur-fast) var(--ease-glass)',
      }}
    >
      {/* ── Cover ───────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'relative',
          /* F, no cover: the icon, status and menu make one row along the top. */
          ...(noCover ? { display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', padding: 'var(--sp-6) var(--sp-5) 0 var(--pad-card)' } : {}),
        }}
      >
        {!noCover && <div
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
          {/* His photo, else the style he chose for this project (idea 149,
              `ProjectCover`). */}
          {isFolder ? <FolderTiles projects={folderOf} /> : project.imageUrl ? (
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
          ) : <MadeCover project={project} style={cover} />}
        </div>}

        <div
          style={{
            ...(noCover
              ? { flex: 1, minWidth: 0 }
              : { position: 'absolute', top: 'var(--sp-5)', left: 'var(--sp-6)', right: 'var(--sp-5)' }),
            display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
          }}
        >
          {word
            ? <StatusPill status={HEALTH_PILL[word.state]} size="sm" title={word.why}>{word.word}</StatusPill>
            : <StatusPill status={status} size="sm">{statusLabel}</StatusPill>}
          {ignoreReason && isOwnSwitch(ignoreReason, { kind: 'project', id: project.id }) && (
            <IgnoredMark title={ignoreSentence(ignoreReason, { kind: 'project', id: project.id })} />
          )}
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
                  ...(inside > 0 ? [insideLabel] : []),
                  `${projectLists.length} list${projectLists.length === 1 ? '' : 's'}`,
                  `${projectTasks.length} task${projectTasks.length === 1 ? '' : 's'}`,
                  budget ?? 'no budget',
                ].join('  ·  '),
                /* The mockup's `DOT[p.status]`: this dot carries the STATUS
                   (projects have no colour of their own since OPT-4). Written
                   from the token name rather
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
                /* BIG-2. Dragging onto another card does the same; this is
                   the way back out ("Top level"), and the way on a phone. */
                {
                  value: 'move',
                  label: 'Move into…',
                  icon: <Icon name="corner-down-right" size={18} />,
                  onSelect: () => setMoving(true),
                },
                /* BIG-5 — this board and another, side by side. */
                {
                  value: 'beside',
                  label: 'Open beside…',
                  icon: <Icon name="panel-right-open" size={18} />,
                  onSelect: () => setOpeningBeside(true),
                },
                ...ignoreItems,
                ...workedItems,
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
                      : `It leaves every board, count, queue, search and Atlas. ${goesWith(inside, projectTasks.length)} go with it. Nothing ever purges it.`,
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
                      : inside > 0
                        ? `${goesWith(inside, projectTasks.length)} go with it. Recoverable from Trash for 30 days.`
                        : `${projectLists.length} list${projectLists.length === 1 ? '' : 's'} and ${projectTasks.length} task${projectTasks.length === 1 ? '' : 's'} go with it. Recoverable from Trash for 30 days.`,
                    onConfirm: onDelete,
                    /* Held, never tapped (29-1P2), as on the board's own menu. */
                    hold: true,
                  },
                },
              ]}
            />
          </span>
        </div>

        {/* The project's own icon on the cover's edge: white on frosted glass
            with the cover's colour behind it (29-1P8a2, idea 150), parting
            when the card is pointed at (the card is an `ag-licon-host`). Not
            on B, whose cover already is the icon; first in the row on F.
            It replaced a 48px glass tile with a live backdrop blur — the
            layered icon's frost is a still picture, one blur fewer a card. */}
        {!iconIsCover && <span
          style={{
            ...(noCover ? { order: -1 } : { position: 'absolute', left: 'var(--sp-6)', bottom: -24 }),
            display: 'grid', placeItems: 'center',
          }}
        >
          <ProjectIcon project={project} size={56} />
        </span>}
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid', gridTemplateRows: 'auto auto 1fr', gap: 'var(--sp-5)',
          /* Room under the cover for the icon tile hanging off its edge;
             less where there is no tile there (B) or no cover at all (F). */
          padding: `${noCover ? 'var(--sp-6)' : iconIsCover ? 'var(--sp-8)' : 'var(--sp-10)'} var(--pad-card) var(--pad-card)`,
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

        {/* The description and the word's line of why share the grid's middle
            row, so the progress block below keeps the card's foot. */}
        <div style={{ display: 'grid', gap: 'var(--sp-3)', alignContent: 'start' }}>
          <p
            className="ag-clamp-2"
            style={{
              font: 'var(--type-body)', fontSize: 'var(--text-sm)',
              color: 'var(--fg-3)', alignSelf: 'start',
            }}
          >
            {project.description}
          </p>
          {word && (
            <p style={{ font: 'var(--type-caption)', fontSize: 'var(--text-xs)', color: 'var(--fg-2)' }}>
              {word.why}
            </p>
          )}
        </div>

        {empty ? (
          <div
            style={{
              display: 'grid', gap: 'var(--sp-4)', paddingTop: 'var(--sp-4)',
              borderTop: '1px solid var(--line-faint)', alignContent: 'start',
            }}
          >
            <LitLine text="**An empty project.** Give it **a first list**." style={{ font: 'var(--type-caption)', color: 'var(--fg-3)' }} />
            <SoftButton
              icon={<Icon name="plus" size={16} />}
              style={{ justifySelf: 'start' }}
              onClick={() => openProject(project.id)}
            >
              Add first list
            </SoftButton>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 'var(--sp-5)', alignContent: 'end' }}>
            <div style={{ display: 'grid', gap: 'var(--sp-3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span className="ag-kicker">{completedCount} of {projectTasks.length} done</span>
                <span
                  style={{
                    font: 'var(--type-numeric)', fontSize: 'var(--text-xs)',
                    color: progress > 0 ? 'var(--job-lime)' : 'var(--fg-3)',
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
                    background: 'var(--job-lime)', boxShadow: '0 0 12px -1px var(--job-lime)',
                    transition: 'width var(--dur-slow) var(--ease-glass)',
                  }}
                />
              </div>
            </div>

            <PulseSquares days={pulse} />

            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 'var(--sp-5)',
                paddingTop: 'var(--sp-4)', borderTop: '1px solid var(--line-faint)', flexWrap: 'wrap',
              }}
            >
              {inside > 0 && <Stat value={inside} label={inside === 1 ? 'project' : 'projects'} />}
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

      {/* Another card is resting on this one's middle: let go and it goes
          inside (2026-09-29). Said in words, not only as a ring, because the
          ring alone read as "selected" — and along the top edge, because the
          held card sits over the middle, where a label in the centre was
          covered by the very card it was talking about. Built only while it
          is true, never one hidden per card. */}
      {isDropInto && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute', insetInline: 0, top: 'var(--sp-5)', display: 'grid', placeItems: 'center',
            pointerEvents: 'none', zIndex: 2,
          }}
        >
          <span
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-3)',
              padding: 'var(--sp-3) var(--sp-5)', borderRadius: 'var(--r-pill)',
              backgroundImage: 'var(--glass-fill-3)', boxShadow: 'var(--glass-rim-2), var(--glass-cast-2)',
              font: 'var(--type-label)', color: 'var(--fg-1)', whiteSpace: 'nowrap',
            }}
          >
            <Icon name="folder-plus" size={16} />
            Put inside {project.name}
          </span>
        </div>
      )}

      {moving && <MoveProjectDialog projectId={project.id} onClose={() => setMoving(false)} />}
      {openingBeside && <OpenBesideDialog projectId={project.id} onClose={() => setOpeningBeside(false)} />}

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
      {/* Idea 25: the light that slides across a leaning card (`motionPieces.css`). */}
      <span className="ag-tilt-shine" aria-hidden="true" />
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
