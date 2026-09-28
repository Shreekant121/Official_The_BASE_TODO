/**
 * The app's top-level destinations, in one place — six in the nav, and the
 * eight that are reached from somewhere else.
 *
 * There are many things that draw this nav — the global `FloatingNav` and
 * every screen's own vertical rail — so the route table, icons, badge rules
 * and the "New Session clears the queue first" quirk all live here and those
 * copies cannot drift apart.
 *
 * Icon choice follows `design-system/screens/*.html`, which is why Home is
 * `house` rather than lucide's `home`, and Score is `award` rather than
 * `star`. The routes are unchanged.
 *
 * ITEM 13F — FOURTEEN BACK TO SIX
 * -------------------------------
 * The 2026-09-08 re-export rewrote `screens/atlas.html` whole, and its `NAV`
 * is six entries: Home · Atlas · New Session · Score · Notifications ·
 * Settings. That is the order below, entry for entry, and it is the same six
 * this file had before item 9A grew it to fourteen — with "Assistant" now
 * **Atlas**. 9A's fourteen is reversed; the previous version of this comment,
 * which argued which mockup to believe, is answered rather than deleted:
 * `atlas.html` was the file it trusted and `atlas.html` is what changed.
 *
 * **The eight that left are not deleted.** They are still destinations with
 * routes and screens; what changed is the way in, which is what `where` on
 * each entry now records:
 *
 *   - `where: 'nav'`      — one of the six cells.
 *   - `where: 'atlas'`    — Atlas's own working surface, reached from the
 *                           panel that opens off the Atlas button
 *                           (`AtlasNavPanel`). The design's own rationale:
 *                           *"The nav carries six things and nothing else.
 *                           Everything that used to crowd it is Atlas working
 *                           surface."*
 *   - `where: 'settings'` — reached from Settings. Trash and Dashboard, the
 *                           one part of 13F's cancelled first plan that
 *                           survived: *"Trash and the dashboard moved to
 *                           Settings."* This also restores the older settled
 *                           decision that Trash is a section in Settings,
 *                           which 9C had moved away from. `/trash` keeps its
 *                           screen and its route — only the door changed.
 *
 * `where` is also **which cell lights up** while you are on that route, which
 * is why it is one field rather than two. Shreekant's call, asked directly:
 * on Skills, The catalog, Action log and Atlas host the **Atlas** cell stays
 * lit, because those are Atlas's surfaces and that is where you came in from;
 * on Trash the **Settings** cell does. Without this the six-cell bar would
 * match nothing on those routes and `MiniNav` falls back to lighting its
 * first cell — Home would look selected on the Skills screen.
 *
 * THE ATLAS BUTTON DOES TWO DIFFERENT THINGS, ON PURPOSE
 * -----------------------------------------------------
 * In the mockup, clicking Atlas toggles the panel — but that file *is* the
 * Atlas screen, and its comment says the panel *"only happens while you are
 * on this page."* So: **on `/chat` the Atlas cell toggles the panel; on every
 * other screen it navigates to `/chat`.** It is not a menu everywhere — a nav
 * item that never navigates is the thing this design is removing.
 *
 * The open/closed flag lives in `useUIStore` rather than in the screen, so
 * that this rule can live here, in `go`, next to the route table it belongs
 * to. `ChatPage` only renders the panel and reads the flag.
 *
 * WHY `built`
 * -----------
 * Three destinations still have no screen. Shreekant's call was that they
 * stay **hidden until built** rather than showing greyed out: the table below
 * is the full destination list, and each later session flips one
 * `built: false` to `true` instead of re-deriving the nav. So the Atlas panel
 * ships with **five rows, not seven** — Inbox triage (item 23) and Contacts
 * (item 21) are not built. The fifth is **Dock mode**, added by v3's
 * `atlas.html` and built at DESIGN-1. `atlas.html` gives Inbox the note *"4 waiting"*;
 * that is mockup data, not a live count, and item 23 either makes it real or
 * drops it.
 *
 * `route` is filled in for all three unbuilt ones because `App.tsx` registers
 * them; they land on `ComingSoon`, reachable only by typing the URL.
 *
 * TWO THINGS THIS BUYS, RECORDED SO NOBODY RE-OPENS THEM
 * -----------------------------------------------------
 * `MiniNav.prompt.md`'s *"Four to six items. This is top-level navigation,
 * not a menu."* was a rule 9A broke knowingly. At six it is **no longer
 * broken**. And 9C's phone-overflow problem is gone: six cells measure
 * **310px** (6×48 + 5×2 gap + 12 padding) against the 354px that fitted at
 * 375. The sideways scroll `MiniNav` gained below 768px is now dead weight
 * rather than load-bearing; leaving it costs nothing and removing it was not
 * this item's job.
 */
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon, type IconName, type MiniNavItem } from '../ui';
import { useStore, taskNeedsAttention } from '../store/useStore';
import { usePriorityScores } from '../store/usePriorityScores';
import { useUIStore } from '../store/useUIStore';

/** Where a destination is reached from — and which nav cell lights on it. */
export type NavPlace = 'nav' | 'atlas' | 'settings';

export interface NavEntry {
  value: string;
  /** The accessible name, and what the vertical rail announces. */
  label: string;
  /**
   * What a labelled bottom bar would print under the icon. Only needed where
   * the real name is too long for a cell — see MiniNav's `shortLabel`.
   *
   * Nothing passes `showLabels` since item 9A, but at six cells a labelled
   * bar is 76px a cell = 466px and would fit both photographed viewports
   * again, so these are worth more than they were.
   */
  short?: string;
  icon: IconName;
  route: string;
  match: (path: string) => boolean;
  /** Nav cell, Atlas panel row, or a Settings destination. */
  where: NavPlace;
  /**
   * The one-line note under the label in the Atlas panel. `atlas.html`'s
   * `ATLAS_SUB`, word for word. Only meaningful for `where: 'atlas'`.
   */
  note?: string;
  /**
   * Does this destination have a screen yet? Unbuilt entries keep their route
   * (it serves `ComingSoon`) and stay out of both the nav and the panel.
   */
  built: boolean;
  /**
   * What the screen is for, and which queue item builds it. `ComingSoon`
   * prints both, so a typed URL answers its own question rather than showing
   * a blank page. Only meaningful while `built` is false.
   *
   * `item` is absent where no session owns the screen yet — today only
   * Dashboard, which cannot be built before it has been designed.
   */
  soon?: { item?: string; what: string };
}

export const NAV_ENTRIES: NavEntry[] = [
  /* ── The six. `atlas.html`'s `NAV`, in its order. ─────────────────── */
  { value: 'home',      label: 'Home',                                  icon: 'house',            route: '/',              match: (p) => p === '/',              where: 'nav', built: true  },
  { value: 'atlas',     label: 'Atlas',                                 icon: 'sparkles',         route: '/chat',          match: (p) => p === '/chat',          where: 'nav', built: true  },
  /* Set Deadlines and Focus are the second and third steps of New Session,
     not destinations of their own, so the rails they drew for themselves in
     UI-10 and UI-11 light this entry rather than nothing — which MiniNav
     would otherwise render as "Home". */
  { value: 'session',   label: 'New Session',   short: 'Session',       icon: 'zap',              route: '/select',        match: (p) => p === '/select' || p === '/deadlines' || p === '/focus', where: 'nav', built: true },
  { value: 'score',     label: 'Score',                                 icon: 'award',            route: '/scoring',       match: (p) => p === '/scoring',       where: 'nav', built: true  },
  { value: 'alerts',    label: 'Notifications', short: 'Alerts',        icon: 'bell',             route: '/notifications', match: (p) => p === '/notifications', where: 'nav', built: true  },
  { value: 'settings',  label: 'Settings',                              icon: 'settings',         route: '/settings',      match: (p) => p === '/settings',      where: 'nav', built: true  },

  /* ── Atlas's own surfaces. `atlas.html`'s `ATLAS_SUB`, in its order. ─ */
  /* DESIGN-1 — v3's `atlas.html` added this row and it leads the list. It is
     the one entry that is **not** a route: dock mode is drawn by `ChatPage`,
     over the chat screen, because it needs that screen's send/reply pipeline
     (`useUIStore.dockOpen` is the flag, and `go` below is what sets it). The
     route is `/chat` so that picking it from anywhere still lands somewhere
     sensible, and `match` is never true because no URL is dock mode. */
  { value: 'dock',      label: 'Dock mode',                             icon: 'mic',              route: '/chat',          match: () => false,                   where: 'atlas', built: true,
    note: 'Talk to it across the room' },
  { value: 'skills',    label: 'Skills',                                icon: 'wrench',           route: '/skills',        match: (p) => p === '/skills',        where: 'atlas', built: true,
    note: 'What Atlas can do' },
  { value: 'inbox',     label: 'Inbox triage',  short: 'Inbox',         icon: 'inbox',            route: '/inbox',         match: (p) => p === '/inbox',         where: 'atlas', built: false,
    note: 'Mail that needs you',
    soon: { item: 'item 23', what: 'Mail that arrived, sorted into what needs a reply, what became a task, and what can go.' } },
  { value: 'people',    label: 'Contacts',                              icon: 'users',            route: '/contacts',      match: (p) => p === '/contacts',      where: 'atlas', built: false,
    note: 'People it can reach',
    soon: { item: 'item 21', what: 'The people behind the work — who a task is waiting on, and how to reach them.' } },
  { value: 'catalog',   label: 'The catalog',   short: 'Catalog',       icon: 'book-open',        route: '/catalog',       match: (p) => p === '/catalog',       where: 'atlas', built: true,
    note: 'Everything it knows' },
  { value: 'log',       label: 'Action log',    short: 'Log',           icon: 'scroll-text',      route: '/log',           match: (p) => p === '/log',           where: 'atlas', built: true,
    note: 'Every write, undoable' },
  { value: 'host',      label: 'Atlas host',    short: 'Host',          icon: 'server',           route: '/atlas-host',    match: (p) => p === '/atlas-host',    where: 'atlas', built: true,
    note: 'Where it runs' },

  /* ── Behind Settings. ─────────────────────────────────────────────── */
  { value: 'trash',     label: 'Trash',                                 icon: 'trash-2',          route: '/trash',         match: (p) => p === '/trash',         where: 'settings', built: true  },
  /* BUILD-11 — the Trash's neighbour, never its twin. */
  { value: 'archive',   label: 'Archive',                               icon: 'library',          route: '/archive',       match: (p) => p === '/archive',       where: 'settings', built: true  },
  /* BUILD-6 — behind Settings, where the door is shown to his account only.
     Not a seventh nav cell: one account will ever see it. */
  { value: 'admin',     label: 'Admin',                                 icon: 'shield-check',     route: '/admin',         match: (p) => p === '/admin',         where: 'settings', built: true  },
  /* No `dashboard.html` was exported — not in `design-system/screens/`, and
     not in the v2 zip either. Every nav in the bundle listed it and the old
     `atlas.html` pointed it at `home.html` as a stand-in. Shreekant's call: it
     is a missing screen rather than another name for Home, so it holds its
     place here and waits for a re-export. It takes its Settings entry when it
     takes its screen. */
  { value: 'dashboard', label: 'Dashboard',                             icon: 'layout-dashboard', route: '/dashboard',     match: (p) => p === '/dashboard',     where: 'settings', built: false,
    soon: { what: 'A screen the design bundle names in every nav but never exported, so there is nothing to build from yet.' } },
];

/** The destinations `App.tsx` points at `ComingSoon`. Three, since item 13. */
export const UNBUILT_ENTRIES = NAV_ENTRIES.filter((e) => !e.built);

/**
 * The rows of the Atlas panel — built ones only, so it ships with five.
 * Exported as the entries rather than as rendered items because the panel
 * wants the note and the icon name, not a `ReactNode`.
 */
export const ATLAS_SUB_ENTRIES = NAV_ENTRIES.filter((e) => e.where === 'atlas' && e.built);

export interface NavModel {
  /** Ready to hand straight to `<MiniNav items={...} />`. The six. */
  items: MiniNavItem[];
  /** The `value` of the cell to light for the current route, or '' off-nav. */
  current: string;
  /** Navigate by entry `value` — or toggle the Atlas panel, on `/chat`. */
  go: (value: string) => void;
}

export function useNavModel(): NavModel {
  const navigate = useNavigate();
  const location = useLocation();
  const setTasks = useStore((s) => s.setTasks);
  const backlogTasks = useStore((s) => s.backlogTasks);
  const notificationsNeedReconnect = useUIStore((s) => s.notificationsNeedReconnect);
  const setAtlasPanelOpen = useUIStore((s) => s.setAtlasPanelOpen);
  const setDockOpen = useUIStore((s) => s.setDockOpen);

  const needsAttentionCount = backlogTasks.filter((t) => !t.parent && taskNeedsAttention(t)).length;
  /*
   * ITEM 16 — HOW MANY TASKS ARE INSIDE THEIR DANGER ZONE.
   *
   * It lands on **Home**, not on Score. Score's badge counts tasks missing a
   * field, which is a queue you sit down and work through; Red Alert counts
   * work that has to be started today, and Home is where the day is. Two
   * counts on one cell would also be one dot saying two different things.
   */
  const redAlertCount = usePriorityScores().redAlertCount;

  const items: MiniNavItem[] = NAV_ENTRIES.filter((entry) => entry.where === 'nav' && entry.built).map((entry) => ({
    value: entry.value,
    label: entry.label,
    shortLabel: entry.short,
    icon: <Icon name={entry.icon} size={20} />,
    /*
     * MiniNav renders any non-null badge as a DOT, not a number — that is
     * the design system's contract, and the Score mockup passes a count to
     * it knowingly. The count itself is on the Score screen, and since item
     * 16 also in `badgeNote` below, which is the tooltip and the accessible
     * name rather than a second visual treatment.
     *
     * The amber "Google needs reconnecting" cue keeps its old rule: it is
     * the only place besides the Notifications page that this is surfaced,
     * and deliberately never a banner or a toast.
     */
    badge:
      entry.value === 'score'
        ? (needsAttentionCount > 0 ? needsAttentionCount : undefined)
        : entry.value === 'home'
          ? (redAlertCount > 0 ? redAlertCount : undefined)
          : entry.value === 'alerts'
            ? (notificationsNeedReconnect ? true : undefined)
            : undefined,
    /*
     * The dot cannot print a number, so the number goes in the title and in
     * the accessible name (`MiniNav` builds both off `badgeNote`). That is the
     * whole of "the nav shows how many there are" that this component's
     * contract allows — and it is more than the Score badge had, which said
     * nothing at all.
     */
    badgeNote:
      entry.value === 'score' && needsAttentionCount > 0
        ? `${needsAttentionCount} need attention`
        : entry.value === 'home' && redAlertCount > 0
          ? `${redAlertCount} on red alert`
          : entry.value === 'alerts' && notificationsNeedReconnect
            ? 'Google needs reconnecting'
            : undefined,
  }));

  /* `where` doubles as the lit cell — see the header. */
  const hit = NAV_ENTRIES.find((e) => e.match(location.pathname));
  const current = hit ? (hit.where === 'nav' ? hit.value : hit.where) : '';

  const go = (value: string) => {
    const entry = NAV_ENTRIES.find((e) => e.value === value);
    /* An unbuilt destination is in neither the nav nor the panel, so nothing
       can ask for it — but `go` is exported through the model and the guard
       costs one line. */
    if (!entry || !entry.built) return;

    /*
     * The Atlas button's two behaviours. On the chat screen it opens its own
     * surfaces; anywhere else it goes to the chat screen, where they are.
     */
    if (entry.value === 'atlas' && location.pathname === '/chat') {
      setAtlasPanelOpen(!useUIStore.getState().atlasPanelOpen);
      return;
    }

    /* Anything else is a navigation, and the panel is a nav attachment — it
       does not survive the screen it was opened on. */
    setAtlasPanelOpen(false);

    /*
     * DESIGN-1 — Dock mode is a mode, not a place. It is drawn over `/chat`,
     * so this turns it on and goes there; from `/chat` itself, which is the
     * only screen the Atlas panel opens on, the navigate is a no-op and the
     * flag is the whole of it.
     */
    if (entry.value === 'dock') {
      setDockOpen(true);
      if (location.pathname !== '/chat') navigate(entry.route);
      return;
    }

    /*
     * New Session starts from an empty queue. This is not cosmetic: `tasks`
     * is today's focus queue and `/select` builds it up, so arriving with
     * yesterday's still in it silently pre-selects the wrong work.
     */
    if (entry.value === 'session') setTasks([]);
    navigate(entry.route);
  };

  return { items, current, go };
}
