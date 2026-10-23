/* The state behind the waiting-for-you tray and the front-door cards. Moved
   out of `pages/ChatPage.tsx` when it was split (BUILD-7); the
   panel itself is `Tray.tsx`. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { decideApproval, type AtlasApproval } from '../../lib/atlas/client';
import { loadApprovals, type MemorySource } from '../../lib/atlas/memorySource';
import { tabletAtlas } from '../../lib/atlas/engine/tabletAtlas';

export function useApprovalTray(
  showToast: (message: string) => void,
  /**
   * Where the tray is read from (BIG-4): the laptop, or with the lid shut the
   * cloud copy — so what is waiting is visible on the train. Since BIG-12
   * (27A-3) a tap with the lid shut runs here too, on Atlas in this page, and
   * the laptop takes the decision when it wakes.
   */
  source: MemorySource | null,
) {
  /*
   * ITEM 13 — THE "WAITING FOR YOU" TRAY (DESIGN.md §5.2).
   *
   * Held at page level rather than on a turn, because that is what it is: a
   * list of acts sitting on the laptop that never expires and belongs to no
   * conversation. A tap can be made from a different device a week after the
   * message that asked for it, and the pill in the header has to be right on a
   * fresh load with no turns on screen at all.
   */
  const [tray, setTray] = useState<AtlasApproval[]>([]);
  const [trayOpen, setTrayOpenState] = useState(false);
  /** Which approval is mid-decision, so its two buttons can wait rather than repeat. */
  const [deciding, setDeciding] = useState<string | null>(null);

  /*
   * BUILD-8 — WHAT A TAP DID, KEPT WHERE THE TAP WAS MADE.
   *
   * "The items do not do anything when he taps them" was three faults, and
   * none of them was the request: the answer went to the toast, which sits
   * under the composer and half behind the open tray; a failed approve left
   * the card exactly as it was; and a successful one made the card vanish
   * into "Nothing needs your tap". So the answer now lands on the card.
   *
   * `failures` is the last reason an act did not happen, by id — the laptop
   * leaves a failed approval waiting (`routes/approvals.ts`), so without this
   * a failure and a tap that never registered look identical. `decidedHere`
   * is what was answered since the tray was opened; those stay in it as a
   * receipt until it is closed, and the log is where they live after that.
   */
  const [failures, setFailures] = useState<Record<string, string>>({});
  const [decidedHere, setDecidedHere] = useState<string[]>([]);
  /* 29-1P6b (idea 126): cards he flicked out of the tray. A receipt flicked
     away is gone; a waiting card flicked away is discarded, and its receipt
     is not put back in the space it just flew out of. */
  const [thrown, setThrown] = useState<string[]>([]);

  /* Read by `decide` to choose between the card and the toast, without making
     every decision callback change identity when the tray opens. */
  const trayOpenRef = useRef(false);
  const setTrayOpen = useCallback((open: boolean) => {
    trayOpenRef.current = open;
    setTrayOpenState(open);
    if (!open) { setDecidedHere([]); setThrown([]); }
  }, []);

  /** What is still waiting for a tap. Everything else in the tray is history. */
  const waiting = useMemo(() => tray.filter((item) => item.state === 'waiting'), [tray]);

  /** What the tray draws: everything waiting, plus the receipts for what was answered in it. */
  const trayItems = useMemo(
    () => tray.filter((item) => item.state === 'waiting' || (decidedHere.includes(item.id) && !thrown.includes(item.id))),
    [tray, decidedHere, thrown],
  );

  const failureOf = useCallback((id: string): string | null => failures[id] ?? null, [failures]);

  /**
   * The live state of one act, by id (item 13).
   *
   * **`waiting` is the answer for an id the tray does not have**, and that is
   * the safe direction rather than a fallback: the tray may not have been read
   * yet, or this Atlas may be too old to have one, and in both cases showing
   * the card as still open is honest. Claiming something was already dealt
   * with when nobody knows is the one wrong answer here.
   */
  const approvalStateOf = useCallback(
    (id: string): 'waiting' | 'approved' | 'discarded' =>
      tray.find((item) => item.id === id)?.state ?? 'waiting',
    [tray],
  );

  /**
   * Re-reads the tray from the laptop (item 13).
   *
   * Read on mount (the effect below), and again when a turn asks for a tap
   * and after a decision — never on a timer. The tray changes only when Atlas asks for something or
   * Shreekant answers, and both are moments this page already knows about;
   * polling would be a request every few seconds for a list that is empty
   * almost all of the time.
   *
   * **A failure is silent and leaves the tray as it was.** An Atlas built
   * before this item answers 404 and one with no data directory answers 503;
   * both mean "no tray" here, and neither is worth a banner on a screen whose
   * job is the conversation. What must never happen is the opposite — a tray
   * drawn empty because a fetch failed, on a screen whose whole promise is
   * that nothing waiting is ever lost.
   */
  const refreshTray = useCallback(async () => {
    if (source === null) return;
    try {
      const index = await loadApprovals(source);
      setTray(index.approvals);
    } catch {
      // See above: no tray is a state, not an error.
    }
  }, [source]);

  /* The on-mount read, and again when the laptop's address changes. The same
     request as `refreshTray`, written out rather than called: the lint rule
     cannot see past the `await` in there and reads it as a state change in
     the effect's own body. Nothing is reset here, and nothing should be — a
     tray that outlives the laptop dropping off is the promise above. */
  useEffect(() => {
    if (source === null) return;
    const controller = new AbortController();
    void loadApprovals(source, controller.signal)
      .then((index) => setTray(index.approvals))
      .catch(() => {
        // As in `refreshTray`: no tray is a state, not an error.
      });
    return () => controller.abort();
  }, [source]);

  /**
   * The tap, and the one place in this app that performs something with no
   * undo.
   *
   * The tray is refetched rather than patched in place: approving *runs* the
   * act on the laptop, and what comes back is the tool's own account of what
   * happened. Trusting a local edit to match it would be this screen deciding
   * what an irreversible act did.
   *
   * **Whether it happened is read from the approval's state, not from `ok`.**
   * `ok: false` also comes back for "That was already approved" — a tap from
   * a second device — and that one did happen, so it gets the receipt; only
   * an approval still `waiting` afterwards is a failure (BUILD-8).
   */
  const decide = useCallback(
    async (id: string, choice: 'approve' | 'discard') => {
      if (source === null) return;
      setDeciding(id);
      let message: string;
      let failed: boolean;
      try {
        let result: { summary: string; approval: { state: string } | null };
        if (source.kind === 'cloud') {
          /* BIG-12 (27A-3): the laptop is shut, so Atlas in this page decides —
             with the laptop's own approve/discard, the app's tools as the
             server — and the queued cloud write is waited for, or the re-read
             below would still find it waiting. */
          const atlas = await tabletAtlas(source.uid);
          result = choice === 'approve' ? await atlas.approve(id) : await atlas.discard(id);
          await atlas.flush();
        } else {
          result = await decideApproval(source.baseUrl, id, choice);
        }
        await refreshTray();
        message = result.summary;
        failed = result.approval?.state === 'waiting';
      } catch (err) {
        message = err instanceof Error ? err.message : String(err);
        failed = true;
      } finally {
        setDeciding(null);
      }
      setFailures((prev) => {
        const next = { ...prev };
        if (failed) next[id] = message;
        else delete next[id];
        return next;
      });
      if (!failed) setDecidedHere((prev) => (prev.includes(id) ? prev : [...prev, id]));
      /* Open, the tray is where he is looking and the card says it; the toast
         would only repeat it half-hidden behind the panel. */
      if (!trayOpenRef.current) showToast(message);
    },
    [refreshTray, showToast, source],
  );

  /**
   * A card flicked out of the tray (29-1P6b, his call): a receipt just goes;
   * a card still waiting is Discarded — nothing is sent, the safe answer. If
   * the discard fails the card is still waiting, so it is drawn again with
   * the reason on it, as a pressed Discard's would be.
   */
  const throwAway = useCallback(
    (id: string) => {
      setThrown((prev) => (prev.includes(id) ? prev : [...prev, id]));
      if (tray.find((item) => item.id === id)?.state === 'waiting') void decide(id, 'discard');
    },
    [decide, tray],
  );

  return { trayOpen, setTrayOpen, deciding, waiting, trayItems, failureOf, approvalStateOf, refreshTray, decide, throwAway };
}
