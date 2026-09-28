/**
 * The global floating nav.
 *
 * Migrated to Aurora Glass: the pill bar, its glass and its morphing active
 * indicator are now `<MiniNav>` from `src/ui`, and the route table lives in
 * `navModel.tsx` alongside Settings' own rail. Everything that made this
 * component behave the way it does is unchanged — the hide rules, the
 * `overlayOpen` fade, the spring, and `Z.nav`.
 *
 * Two things that moved with the design system:
 *   - The indigo `#818cf8` count badge and the amber reconnect dot are now
 *     one thing: MiniNav's status dot on `--status-overrun`. Emerald is
 *     rationed to mean "live" and was never right for an alert.
 *   - The active pill is emerald-tinted glass rather than white glass,
 *     because the selected destination IS the live one.
 *
 * ITEM 9A — THE TEXT LABELS ARE GONE
 * ----------------------------------
 * This was the only nav in the app passing `showLabels`; every screen's own
 * rail has always been icon-only. At 9A's fourteen destinations, fourteen
 * labelled cells were 1102px wide against a 820px tablet, so the bar would
 * have run off both edges. Icon-only it fitted both viewports and matched
 * what the rest of the app already draws.
 *
 * **Item 13F cut the nav to six, so the arithmetic no longer forbids it** —
 * six labelled cells are 466px and fit everywhere. Labels are still off,
 * because every other nav in the app is icon-only and one labelled bar in the
 * corner of `/oauth/callback` would be the odd one out; `NavEntry.short` is
 * kept for the day a labelled bar returns deliberately rather than by
 * arithmetic.
 *
 * `/oauth/callback` is the only route left that draws this bar — everything
 * else is in `HIDDEN_ROUTES` or draws its own rail — plus the three
 * `ComingSoon` placeholder routes, which have no rail of their own.
 *
 * **The Atlas panel is not here.** 13F's rule is that the Atlas cell toggles
 * its panel only on `/chat`, and `/chat` is in `HIDDEN_ROUTES` — it draws its
 * own nav. Everywhere this bar appears, Atlas is a plain destination.
 */
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MiniNav } from '../ui';
import { useUIStore } from '../store/useUIStore';
import { Z } from '../lib/zLayers';
import { useNavModel } from './navModel';

/*
 * Pages that already have their own top navigation — the floating bottom nav
 * would be redundant clutter here, so it hides itself.
 *
 * `/settings` joins them now that Settings draws its own MiniNav: a vertical
 * rail on a wide window, a floating bar below that. As each remaining screen
 * migrates to Aurora Glass it takes the same opt-in and joins this list.
 *
 * A project is the one of these with a parameter in its path, so it cannot be
 * a member of the table — it is matched by prefix below (UI-17).
 */
const HIDDEN_ROUTES = [
  '/', '/select', '/deadlines', '/focus', '/notifications', '/chat', '/settings', '/scoring',
  '/atlas-host', '/trash', '/archive', '/catalog', '/skills', '/log', '/admin',
];

export default function FloatingNav() {
  const location = useLocation();
  const overlayOpen = useUIStore((s) => s.overlayOpen);
  const { items, current, go } = useNavModel();

  const isHidden =
    location.pathname === '/login' ||
    location.pathname.startsWith('/s/') ||
    location.pathname.startsWith('/project/') ||
    HIDDEN_ROUTES.includes(location.pathname) ||
    overlayOpen;

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 pointer-events-none"
      /* `bottom-6` was 1.5rem, which is `--sp-7`; it is written out here so
         Android's gesture bar can be added to it (APP-2). `--safe-b` is 0
         everywhere but the installed app, so the bar has not moved. */
      style={{ zIndex: Z.nav, bottom: 'calc(var(--sp-7) + var(--safe-b))' }}
    >
      <motion.div
        initial={false}
        animate={isHidden ? { y: 110, opacity: 0, scale: 0.92 } : { y: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        className="pointer-events-auto"
        style={{ pointerEvents: isHidden ? 'none' : 'auto' }}
      >
        <MiniNav items={items} value={current} onChange={go} />
      </motion.div>
    </div>
  );
}
