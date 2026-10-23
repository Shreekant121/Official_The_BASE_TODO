/**
 * Where the event sheets are drawn (29-2a): one host in `App.tsx`, opened
 * through `useEventSheet` from the Countdown widget, Capture and Ctrl+K.
 *
 * The sheets' code is fetched the first time one opens (Performance rules 2
 * and 7): nothing on startup pays for a form most opens never show.
 *
 * 29-2c2: an event alert's push lands on `?event=<id>` (the Dashboard's
 * address, `pushPlan.ts`), and this host opens that event's sheet and takes
 * the word off the address, so Back does not open it again. An event that is
 * not here (deleted since the alert went out) just leaves the screen showing.
 *
 * **Read once, from `window.location`, never through the router.** A tap
 * always loads the page (the worker's `navigate` or `openWindow`), so the
 * host's first render is the only one that can see the word. Subscribed to the
 * router it re-rendered on every change of screen, and that alone moved two
 * baselines (Home's folder, the Hours sheet): it shifts the screen
 * crossfade's timing.
 */
import { lazy, Suspense, useEffect } from 'react';
import { useEventSheet } from '../../store/useEventSheet';
import { useEventStore } from '../../store/useEventStore';

const EventSheet = lazy(() => import('./EventSheet'));
const EventArchiveSheet = lazy(() => import('./EventArchiveSheet'));

export default function EventSheetHost() {
  const open = useEventSheet((s) => s.open);
  const close = useEventSheet((s) => s.close);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('event');
    if (!id) return;
    params.delete('event');
    const rest = params.toString();
    /* The router's own state is kept, so its history entry stays its own. */
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
    if (useEventStore.getState().events.some((e) => e.id === id)) useEventSheet.getState().openEvent(id);
  }, []);

  if (!open) return null;
  return (
    <Suspense fallback={null}>
      {open.kind === 'event'
        /* Keyed, so a second event opened over the first starts from its own fields. */
        ? <EventSheet key={open.eventId ?? 'new'} eventId={open.eventId} draft={open.draft} onClose={close} />
        : <EventArchiveSheet onClose={close} />}
    </Suspense>
  );
}
