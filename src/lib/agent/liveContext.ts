import { useStore, type Task } from '../../store/useStore';
import { useTrashStore } from '../../store/useTrashStore';
import { restoreFromTrash } from '../trash';
import { useSnapshotStore } from '../../store/useSnapshotStore';
import type { AgentStore, AgentStoreState, SnapshotCapture } from './types';

/**
 * Binds the tool layer to the real app. Everything in `tools/` talks to the
 * `AgentStore` / `SnapshotCapture` interfaces instead of importing the Zustand
 * singletons directly, which is what makes the whole action surface runnable
 * against an in-memory fake with no React, no browser and no model in the loop.
 */

export const liveAgentStore: AgentStore = {
  getState: (): AgentStoreState => {
    const state = useStore.getState();
    return {
      projects: state.projects,
      taskLists: state.taskLists,
      backlogTasks: state.backlogTasks,
      tasks: state.tasks,
    };
  },

  /**
   * `useStore.addBacklogTask` mints its own id, which would leave the tool with
   * nothing to snapshot before the write. Inserting an already-formed task is
   * the same operation — newest first, exactly as that action does it — with
   * the id decided by the caller. `firestoreSync` pushes on any store change,
   * so this syncs identically to a hand edit.
   */
  addBacklogTask: (task: Task) => {
    useStore.setState((state) => ({ backlogTasks: [task, ...state.backlogTasks] }));
  },

  updateBacklogTask: (id, updates) => useStore.getState().updateBacklogTask(id, updates),
  updateFocusTask: (id, updates) => useStore.getState().updateTask(id, updates),
  setFocusQueue: (tasks) => useStore.getState().setTasks(tasks),
  updateTaskList: (id, updates) => useStore.getState().updateTaskList(id, updates),
  updateProject: (id, updates) => useStore.getState().updateProject(id, updates),

  /*
   * BUILD-3. The store's `addProject`/`addTaskList` mint their own ids and
   * `order`, which would leave the tool nothing to snapshot before the write —
   * the same reason `addBacklogTask` above inserts a formed record. Appended,
   * exactly where those actions put one.
   */
  addProject: (project) => {
    useStore.setState((state) => ({ projects: [...state.projects, project] }));
  },
  addTaskList: (list) => {
    useStore.setState((state) => ({ taskLists: [...state.taskLists, list] }));
  },
  renameTaskList: (id, title) => useStore.getState().renameTaskList(id, title),
  deleteProject: (id) => useStore.getState().deleteProject(id),
  deleteTaskList: (id) => useStore.getState().deleteTaskList(id),

  /*
   * Straight through to the store's own actions rather than to
   * `cascadeDelete`/`trashModel` directly. Those are the pure halves; the
   * store action is the one that also records the Trash entry and announces
   * the deletion, and `lib/trash.ts` is the one that writes both stores on the
   * way back. Reaching past either would be exactly the hand-rolled cleanup
   * CLAUDE.md warns about.
   */
  deleteBacklogTask: (id) => useStore.getState().deleteBacklogTask(id),
  trashEntries: () => useTrashStore.getState().entries,
  restoreFromTrash: (entryId) => restoreFromTrash(entryId),
};

export const liveSnapshotCapture: SnapshotCapture = {
  captureTask: (handle, taskId) => useSnapshotStore.getState().captureTask(handle, taskId),
  captureList: (handle, listId) => useSnapshotStore.getState().captureList(handle, listId),
  captureProject: (handle, projectId) => useSnapshotStore.getState().captureProject(handle, projectId),
  captureEvent: (handle, eventId) => useSnapshotStore.getState().captureEvent(handle, eventId),
};
