/**
 * BUILD-9 — search becomes the command palette.
 *
 * Ctrl+K anywhere in the app (Cmd+K on a Mac keyboard), or Home's magnifying
 * glass on the tablet. The palette is `ui/overlay/CommandPalette.tsx`; this
 * file is what it searches and what each row does. Mounted once, in
 * `App.tsx`, for a signed-in account and never on the public share view.
 *
 * WHAT IT FINDS — his scope, 2026-09-22, not to be widened without asking
 *   Tasks, lists and projects by name and description; the commands below;
 *   and one row that hands whatever was typed to Atlas. **Not the catalog and
 *   not chat history**: both live on the laptop, and a search that returns
 *   nothing because the laptop is asleep feels broken when it is not. The
 *   matching and ranking are `lib/paletteSearch.ts`, pure and tested.
 *
 * WHAT A ROW DOES — his three calls, 2026-09-24
 *   - A task opens its sheet **where you are**, over whatever screen the
 *     palette was opened on; closing it leaves you there. The sheet is held
 *     here, not on a screen, which is why it works from any of them.
 *   - Ask Atlas opens the chat, starts a **new** conversation and sends the
 *     question. The chat screen does the sending (`paletteHandoff` in
 *     `useUIStore`) because only it knows when the model list has landed —
 *     sent a beat too early, a question for the laptop would go to Gemini.
 *   - **Ctrl+K**, a real modifier, so it works with the caret in a text box.
 *     It is not in the `ShortcutsContext` registry, which is single keys only
 *     and ignores every keypress made with Ctrl held.
 *
 * A list opens its project; the three built-in lists have none and live on
 * New Session. A project opens its board. New project and Smart Start are
 * sheets that belong to Home, so they go there through the same hand-off.
 */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { CommandPalette, Icon, type CommandPaletteItem } from '../ui';
import { useStore, type Task } from '../store/useStore';
import { useUIStore } from '../store/useUIStore';
import { useOverlayDismiss } from '../lib/useOverlayDismiss';
import { Z } from '../lib/zLayers';
import { looksLikeQuestion, searchPalette, type PaletteEntry } from '../lib/paletteSearch';
import { useAccountAccess } from '../lib/accountAccess';
import { useOpenShortcutsHelp, useShortcuts } from '../contexts/ShortcutsContext';
import { useShortcutPrefs } from '../lib/shortcutPrefs';
import { NAV_ENTRIES, type NavEntry } from './navModel';
import { paletteCommandCatalog, type PaletteCommandMeta } from './paletteCommands';
import TaskDetailPanel from './TaskDetailPanel';

/** The ask row's value. No task, list, project or command id can take this shape. */
const ASK = 'ask:';

interface Command extends PaletteCommandMeta {
  run: () => void;
}

export default function CommandPaletteHost() {
  const open = useUIStore((s) => s.paletteOpen);
  const setOpen = useUIStore((s) => s.setPaletteOpen);
  const setHandoff = useUIStore((s) => s.setPaletteHandoff);
  const setDockOpen = useUIStore((s) => s.setDockOpen);
  const setAtlasPanelOpen = useUIStore((s) => s.setAtlasPanelOpen);
  const setTasks = useStore((s) => s.setTasks);
  const dockOpen = useUIStore((s) => s.dockOpen);
  const projects = useStore((s) => s.projects);
  const taskLists = useStore((s) => s.taskLists);
  const backlogTasks = useStore((s) => s.backlogTasks);
  const updateBacklogTask = useStore((s) => s.updateBacklogTask);
  const deleteBacklogTask = useStore((s) => s.deleteBacklogTask);
  const owner = useAccountAccess((s) => s.owner);
  const openHelp = useOpenShortcutsHelp();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const [query, setQuery] = useState('');
  /* A snapshot, as every other caller of the sheet holds one — the draft is
     seeded from it once, and a live record changing under an open sheet is
     the sheet's business (it reads the live copy where it has to). */
  const [sheetTask, setSheetTask] = useState<Task | null>(null);

  /* Every opening starts empty. Adjusted during render on the way in, like
     `Dialog`'s own `open`, so the last search never flashes up first. */
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setQuery('');
  }

  const close = () => setOpen(false);
  useOverlayDismiss(open, close);

  /*
   * Ctrl+K toggles. On `window` like the registry's own listener, and it
   * answers even in a text field — that is the point of a modifier. Not while
   * dock mode is up: dock mode is the whole screen and sits above this rung.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== 'k') return;
      if (useUIStore.getState().dockOpen) return;
      e.preventDefault();
      setOpen(!useUIStore.getState().paletteOpen);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  const commands = useMemo<Command[]>(() => {
    /*
     * `navModel`'s `go`, minus the one thing it does that is wrong here (on
     * the chat it toggles the Atlas panel instead of going anywhere). Not
     * `useNavModel()` itself: that scores the whole backlog for its badges on
     * every render, and this is mounted over every screen in the app.
     */
    const goTo = (entry: NavEntry) => {
      setAtlasPanelOpen(false);
      if (entry.value === 'dock') setDockOpen(true);
      /* New Session starts from an empty queue — `go`'s own rule — unless
         he is already on it, choosing, when emptying it would lose his picks. */
      if (entry.value === 'session') {
        if (pathname === '/select') return;
        setTasks([]);
      }
      if (pathname !== entry.route) navigate(entry.route);
    };
    const home = (kind: 'new-project' | 'smart-start') => {
      setHandoff({ kind });
      if (pathname !== '/') navigate('/');
    };
    const runFor = (id: string): (() => void) | undefined => {
      if (id === 'smart-start') return () => home('smart-start');
      if (id === 'new-project') return () => home('new-project');
      if (id === 'shortcuts') return openHelp;
      /* New session is the nav's session entry under its own name. */
      const value = id === 'new-session' ? 'session' : id.startsWith('go-') ? id.slice(3) : undefined;
      const entry = NAV_ENTRIES.find((e) => e.value === value);
      return entry ? () => goTo(entry) : undefined;
    };
    return paletteCommandCatalog(owner).flatMap((meta) => {
      const run = runFor(meta.id);
      return run ? [{ ...meta, run }] : [];
    });
  }, [pathname, navigate, owner, openHelp, setHandoff, setAtlasPanelOpen, setDockOpen, setTasks]);

  /*
   * BUILD-10 — his own shortcuts, each a command above on a key of his. Live
   * on every screen because this is. Registered here rather than in the
   * registry because only this file knows what a command does; the registry
   * and the sheet know the key (`lib/shortcutBindings.ts`).
   */
  const custom = useShortcutPrefs((s) => s.prefs.custom);
  useShortcuts('custom', custom.flatMap((c) => {
    const command = commands.find((cmd) => cmd.id === c.command);
    return command ? [{ key: c.key, label: command.name, handler: command.run }] : [];
  }));

  /* Built only while open — the backlog can run to hundreds of tasks and
     nothing needs this list while the palette is shut. */
  const entries = useMemo<PaletteEntry[]>(() => {
    if (!open) return [];
    const out: PaletteEntry[] = [];
    for (const t of backlogTasks) {
      /* A subtask-proxy row is the focus queue's copy of a subtask, not a
         task of its own. BUILD-11's archive, when it lands, drops out here. */
      if (t.parent) continue;
      out.push({ id: t.id, kind: 'task', name: t.title, description: t.description, done: t.status === 'completed' });
    }
    for (const p of projects) out.push({ id: p.id, kind: 'project', name: p.name, description: p.description });
    for (const l of taskLists) out.push({ id: l.id, kind: 'list', name: l.title });
    for (const c of commands) out.push({ id: c.id, kind: 'command', name: c.name, description: c.detail, keywords: `${c.keywords} ${c.group}` });
    return out;
  }, [open, backlogTasks, projects, taskLists, commands]);

  const items = useMemo<CommandPaletteItem[]>(() => {
    if (!open) return [];
    const projectName = new Map(projects.map((p) => [p.id, p.name]));
    const listOf = new Map(taskLists.map((l) => [l.id, l]));
    const whereList = (listId?: string) => {
      const l = listId ? listOf.get(listId) : undefined;
      if (!l) return undefined;
      const p = l.projectId ? projectName.get(l.projectId) : undefined;
      return p ? `${p} · ${l.title}` : l.title;
    };
    const commandOf = new Map(commands.map((c) => [c.id, c]));

    const rows: CommandPaletteItem[] = searchPalette(entries, query).map((e) => {
      switch (e.kind) {
        case 'task': {
          const where = whereList(backlogTasks.find((t) => t.id === e.id)?.listId);
          return {
            value: `task:${e.id}`, label: e.name, group: 'Task',
            detail: e.done ? (where ? `Done · ${where}` : 'Done') : where,
            icon: <Icon name={e.done ? 'check' : 'circle'} size={16} />,
          };
        }
        case 'project':
          return {
            value: `project:${e.id}`, label: e.name, group: 'Project', detail: e.description || undefined,
            icon: <Icon name="folder" size={16} />,
          };
        case 'list': {
          const l = listOf.get(e.id);
          return {
            value: `list:${e.id}`, label: e.name, group: 'List',
            detail: (l?.projectId && projectName.get(l.projectId)) || 'New Session',
            icon: <Icon name="list" size={16} />,
          };
        }
        case 'command': {
          const c = commandOf.get(e.id);
          return {
            value: `command:${e.id}`, label: e.name, group: c?.group, detail: c?.detail,
            icon: c ? <Icon name={c.icon} size={16} /> : undefined,
          };
        }
      }
    });

    const asked = query.trim();
    if (asked !== '') {
      const ask: CommandPaletteItem = {
        value: `${ASK}${asked}`, label: `Ask Atlas: “${asked}”`, group: 'Atlas',
        detail: 'Opens a new chat and sends it', icon: <Icon name="sparkles" size={16} />,
      };
      /* First when it reads as a question or an instruction, last otherwise.
         Either way it is always there, and alone when nothing else matched. */
      if (looksLikeQuestion(asked)) rows.unshift(ask);
      else rows.push(ask);
    }
    return rows;
  }, [open, entries, query, projects, taskLists, backlogTasks, commands]);

  const run = (item: CommandPaletteItem) => {
    const v = item.value;
    close();
    if (v.startsWith(ASK)) {
      setHandoff({ kind: 'ask', text: v.slice(ASK.length) });
      if (pathname !== '/chat') navigate('/chat');
      return;
    }
    const [kind, ...rest] = v.split(':');
    const id = rest.join(':');
    if (kind === 'task') {
      const task = useStore.getState().backlogTasks.find((t) => t.id === id);
      if (task) setSheetTask(task);
    } else if (kind === 'project') {
      navigate(`/project/${id}`);
    } else if (kind === 'list') {
      const projectId = taskLists.find((l) => l.id === id)?.projectId;
      if (projectId) navigate(`/project/${projectId}`);
      else commands.find((c) => c.id === 'new-session')?.run();
    } else if (kind === 'command') {
      commands.find((c) => c.id === id)?.run();
    }
  };

  return (
    <>
      <CommandPalette
        open={open && !dockOpen}
        onClose={close}
        query={query}
        onQueryChange={setQuery}
        items={items}
        onRun={run}
        placeholder="Search tasks, projects and commands"
        zIndex={Z.palette}
      />
      <AnimatePresence>
        {sheetTask && (
          <TaskDetailPanel
            task={sheetTask}
            onClose={() => setSheetTask(null)}
            onSave={(updates) => {
              updateBacklogTask(sheetTask.id, updates);
              setSheetTask(null);
            }}
            onDelete={() => {
              deleteBacklogTask(sheetTask.id);
              setSheetTask(null);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
