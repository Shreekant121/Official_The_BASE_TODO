/**
 * A row of project cards — Home's grid, and since BIG-2 the same grid inside a
 * mega project, above its lists. One component so the two cannot drift: a
 * card dragged here reorders among its siblings, and dropped onto the middle
 * of another card it goes inside that one (his call, 2026-09-29), which is
 * `SortableList`'s `onDropInto`.
 *
 * The tree is built once here and handed to every card, so each card's
 * roll-up is a filter over the backlog rather than a tree walk per card.
 *
 * 29-1P8c (idea 153, his call): a card that holds projects is a folder, and
 * pressing it unfolds them in a row under it (`FolderTray`) — one open at a
 * time, in this screen's memory only. The grid packs densely so the cards
 * after the folder in its row fill back in beside it and the row lands below
 * them; with no tray open every item is one cell and dense changes nothing.
 */
import { Fragment, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Icon } from '../ui';
import { useStore } from '../store/useStore';
import { buildProjectTree } from '../lib/projectTree';
import ProjectCard from './ProjectCard';
import { FolderTray } from './FolderParts';
import { SortableList, SortableRow } from './SortableList';

interface ProjectGridProps {
  /** Whose children to draw; `null` is Home's top level. */
  parentId: string | null;
  onEdit: (projectId: string) => void;
  onNewProject: () => void;
}

export default function ProjectGrid({ parentId, onEdit, onNewProject }: ProjectGridProps) {
  const projects = useStore((s) => s.projects);
  const backlogTasks = useStore((s) => s.backlogTasks);
  const taskLists = useStore((s) => s.taskLists);
  const reorderProjects = useStore((s) => s.reorderProjects);
  const moveProject = useStore((s) => s.moveProject);
  const deleteProject = useStore((s) => s.deleteProject);

  const tree = useMemo(() => buildProjectTree(projects), [projects]);
  const siblings = tree.childrenOf(parentId);
  const ids = useMemo(() => siblings.map((p) => p.id), [siblings]);
  const [openFolder, setOpenFolder] = useState<string | null>(null);

  return (
    <SortableList
      ids={ids}
      onReorder={reorderProjects}
      onDropInto={(id, targetId) => { moveProject(id, targetId); }}
      axis="xy"
      className="grid grid-flow-row-dense grid-cols-[repeat(auto-fill,minmax(316px,1fr))] gap-5"
    >
      <AnimatePresence>
        {siblings.map((project) => {
          const inside = tree.childrenOf(project.id);
          const open = openFolder === project.id && inside.length > 0;
          return (
            <Fragment key={project.id}>
              <SortableRow id={project.id}>
                {({ isDragging, isAnyDragging, isDropInto }) => (
                  <ProjectCard
                    project={project}
                    tree={tree}
                    tasks={backlogTasks}
                    lists={taskLists}
                    onEdit={() => onEdit(project.id)}
                    onDelete={() => deleteProject(project.id)}
                    isBeingDragged={isDragging}
                    isAnyDragging={isAnyDragging}
                    isDropInto={isDropInto}
                    folderOpen={open}
                    onToggleFolder={() => setOpenFolder(open ? null : project.id)}
                  />
                )}
              </SortableRow>
              {open && (
                <FolderTray
                  key={`tray:${project.id}`}
                  folder={project}
                  inside={inside}
                  ownLists={taskLists.filter((l) => l.projectId === project.id).length}
                  onClose={() => setOpenFolder(null)}
                />
              )}
            </Fragment>
          );
        })}
      </AnimatePresence>

      {/* New project tile — a dashed outline, never a glass pane:
          it is a slot waiting to be filled, not an object. */}
      <button
        type="button"
        onClick={onNewProject}
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
  );
}
