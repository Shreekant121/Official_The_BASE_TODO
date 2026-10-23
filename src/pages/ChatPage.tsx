/**
 * The chat interface for the agent built in Step 4.
 *
 * Rebuilt on Aurora Glass (UI-8), RECONCILED against
 * `design-system/screens/assistant.html` at UI-33.
 *
 * UI-8 built this screen with the mockup unreachable — `DesignSync
 * list_projects` had returned an empty array for the seventh straight session
 * — so every shape on it was inferred from the tokens and the ported
 * components. UI-21 mirrored the real file. This is the diff.
 *
 * WHAT IS UNCHANGED — and this is the part that matters
 * -----------------------------------------------------
 * Nothing under `src/lib/agent/` behaves differently and every call out of
 * this page is where it was: `runAgentTurn` with the same
 * `onTextDelta`/`onToolCall` callbacks, the same `AbortController`, the same
 * `createLiveSession` and `createGeminiTransport`, the same `useSnapshotStore`
 * read-back on the error path. `toolChip.ts` gained two exports and changed no
 * existing answer.
 *
 * **The conversation is ephemeral (D11) — on the in-browser path, and only
 * there. ITEM 10 REVERSED IT FOR ATLAS.** The reasoning was never about
 * transcripts being disposable: `users/{uid}/data/main` is rewritten in full
 * on every task edit and capped at 1 MB (C1), and a transcript is exactly the
 * payload that would eat that budget. Atlas keeps history on the laptop
 * instead, where there is no cap and no rewrite amplification — so a
 * `conversationId` names a file, the chat list beside this screen lists them,
 * and closing the tab loses nothing.
 *
 * The module-scope `sessionTurns`/`sessionHistory` below are still the whole
 * conversation for the fallback, which has no laptop to keep one. Module scope
 * rather than component state so walking to another page and back does not
 * throw it away.
 *
 * **Every turn carries its undo.** `runAgentTurn` returns the snapshot turn it
 * wrote into, and Revert calls `revertTurn` with it (D6).
 *
 * FOUR THINGS THE MOCKUP HAS THAT WE DELIBERATELY DO NOT
 * -----------------------------------------------------
 * - **A back arrow to Home** in the header. The mockup is a static page whose
 *   `MiniNav` navigates by `href`; ours has Home as a nav entry two pixels
 *   from where that arrow would sit.
 * - **A glow on the resting header badge.** `elevation.css` and `readme.md`
 *   both ration emission to what is *live, selected, running or overrun*, and
 *   a header mark is none of those. The accent tint is taken; the
 *   `--glow-accent-sm` arrives only on `Thinking`, which is the one moment
 *   this screen is live.
 * - **`backlog restored` under a spent Revert.** Our revert can be partial (a
 *   task deleted since is skipped, a creation is left in place, D3), so that
 *   line would sometimes be a lie. `revertTurn`'s summary says exactly what
 *   happened and is already in the toast.
 * - **A spinner in the Send button while busy.** Ours becomes a rose Stop,
 *   because a turn here is a real multi-second agent loop that can be
 *   abandoned, and a spinner cannot be pressed.
 *
 * The heading is a literal `Atlas` since item 9A — `atlas.html` renames this
 * screen and the nav entry with it — and it is what the screenshot harness
 * waits for (`scripts/screenshots.ts`, `h1:has-text("Atlas")`, pinned to the
 * heading because the subtitle beneath it also says "Atlas" in most states).
 *
 * WHERE THE REST OF THIS NOTE WENT (BUILD-7)
 * ------------------------------------------
 * This page was 4,798 lines and was split so the sessions that redesign it
 * and add to it each edit one piece. Behaviour did not change; the essay did
 * not either, it moved beside the code it describes: what UI-33 took from the
 * mockup and how a turn is drawn are at the top of
 * `components/chat/TurnBlock.tsx`, items 6, 8 and 9 (which machine answers)
 * at the top of `runChatTurn.ts`, and 9D's header at the top of
 * `ChatHeader.tsx`. The page keeps the state that has to be shared and lays
 * the pieces out.
 *
 * V3 (V3-8) — `Atlas.dc.html`
 * ---------------------------
 * **His calls (2026-09-24): today's page in the V3 look**, not the design's
 * layout — the chat list, the header, the composer and every dial stay where he
 * put them on 2026-09-08 — **and the presence orb in three places**: small in
 * the header beside the chat's name (no "Ready / Thinking" words under it; he
 * took the status line out that same day), large on an empty chat in place of
 * the sparkle badge, and in dock mode in place of the glass disc. His own
 * messages stay dark glass rather than the design's emerald bubbles. The
 * default export is the scope and `ChatScreen` sits inside it.
 * `ui/data/AiPresence.tsx` is the orb and says how it degrades on the tablet.
 * **Not built, because V3 changes no features:** the design's Plan / Chat
 * switch, the suggestion chips standing above the composer, the attach button
 * and the recording timer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavModel } from '../components/navModel';
import { EdgeLight, Icon, Toast, useMedia, V3Scope, WIDE } from '../ui';
import { Z } from '../lib/zLayers';
import { CHAT_ID_KEY, LIST_DOCKED_KEY, readDeviceValue, writeDeviceValue } from '../lib/atlas/devicePrefs';
import { useFooterReserve } from '../lib/useFooterReserve';
import { useAuth } from '../contexts/AuthContext';
import { useApiKeyStore, atlasApiKey } from '../lib/agent/apiKeys';
import { atlasKeyOf } from '../lib/agent/keyRing';
import { resolveUserTimeZone } from '../lib/agent/dates';
import { selectEffectiveModel, useModelStore } from '../lib/agent/modelStore';
import {
  deleteConversation as deleteAtlasConversation,
  fetchConversation,
  patchConversation,
  type AtlasMode,
} from '../lib/atlas/client';
import { turnsFromHistory } from '../lib/atlas/transcript';
import { Composer } from '../components/chat/Composer';
import { TuningPopover } from '../components/chat/TuningPopover';
import { ChatHeader } from '../components/chat/ChatHeader';
import { ChatLists } from '../components/chat/ChatLists';
import { ChatBottomNav, ChatRail } from '../components/chat/ChatNav';
import { EmptyState } from '../components/chat/EmptyState';
import { TurnBlock } from '../components/chat/TurnBlock';
import { ResumeCard } from '../components/chat/TurnCards';
import { Tray } from '../components/chat/Tray';
import { whoIsAnswering } from '../components/chat/whoIsAnswering';
import { runChatTurn } from '../components/chat/runChatTurn';
import { useApprovalTray } from '../components/chat/useApprovalTray';
import { useAtlasSkills } from '../components/chat/useAtlasSkills';
import { useConversationList } from '../components/chat/useConversationList';
import { usePinToBottom } from '../components/chat/usePinToBottom';
import { useResumable } from '../components/chat/useResumable';
import { useTurnDials } from '../components/chat/useTurnDials';
import { useModelLists } from '../components/chat/useModelLists';
import { useSpokenReplies } from '../components/chat/useSpokenReplies';
import { useToast } from '../components/chat/useToast';
import { COLUMN_PX, type ChatTurn } from '../components/chat/chatShared';
/* Items 24 and 25 — the microphone, the voice picker and dock mode. All three
   were built only after the tablet was measured rather than reasoned about;
   `lib/voice/recognition.ts` carries what that measurement found. */
import { MicButton } from '../components/chat/MicButton';
import { ModelSideSwitch } from '../components/chat/ModelSideSwitch';
import { DockMode } from '../components/chat/DockMode';
import { devDockFixture } from '../lib/devDockFixture';
import { useDictation, useVoiceChoice } from '../lib/voice/useVoice';
import { useAtlasStore } from '../lib/atlas/atlasStore';
import { loadConversation, useMemorySource } from '../lib/atlas/memorySource';
import { atlasModelId, cloudRoutingOf, routesToAtlas } from '../lib/atlas/routing';
import { copyHandoff } from '../lib/atlas/handoff';
import type { AgentMessage } from '../lib/agent/types';
import { parseAnswerMessage } from '../lib/askCard';
import { devChatFixture } from '../lib/devChatFixture';
import { useStore } from '../store/useStore';
import { useUIStore } from '../store/useUIStore';
import { cue } from '../lib/sound';


/*
 * D11 — session only, and since item 10 that is the FALLBACK's answer rather
 * than the app's. On the Atlas path these are a cache of a conversation that
 * lives on the laptop and is re-read on reload; on the in-browser path they
 * are the whole of it, and a reload is a new conversation exactly as the
 * decision chose. Nothing below is persisted anywhere either way.
 */
let sessionTurns: ChatTurn[] = [];
let sessionHistory: AgentMessage[] = [];
let sessionUid: string | null = null;



/**
 * Where the conversation list docks (item 10).
 *
 * `atlas.html`'s own 1100, not this app's `WIDE`. The two answer different
 * questions — `WIDE` is "is there room for a vertical rail", this is "is there
 * room for a rail AND a 268px list AND an 880px column" — and 1100 is where
 * the third stops squeezing the transcript. Below it the list is a drawer over
 * the conversation, opened from the header.
 *
 * It sits above the harness's tablet (820) and below its desktop (1440), so
 * the two photographed sizes show both states.
 *
 * **Item 13G moves it to the re-exported mockup's own 1180**, which is the
 * same answer to the same question with the new column measured rather than
 * the old one: 1180 is where a rail, a 264px list and an 820px transcript stop
 * squeezing each other. It is still between the two photographed sizes, so
 * both baselines keep showing the state they showed.
 */
const LISTED = '(min-width: 1180px)';


export default function ChatPage() {
  return (
    <V3Scope>
      <ChatScreen />
    </V3Scope>
  );
}

function ChatScreen() {
  const { user } = useAuth();
  const [turns, setTurns] = useState<ChatTurn[]>(sessionTurns);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  /*
   * ITEM 10 — THE CONVERSATION HAS A HOME, AND IT IS NOT THIS TAB.
   *
   * `conversationId` names a file on the laptop. It is remembered per device
   * so a reload reopens what was open, and it is the whole of "closing the tab
   * and coming back shows the conversation still there": the transcript below
   * is rebuilt from Atlas's copy, not from anything this browser kept.
   *
   * The module-scope `sessionTurns`/`sessionHistory` above are NOT dead — they
   * are still the whole conversation on the in-browser fallback, which has no
   * laptop to keep one. D11's reasoning is reversed for Atlas and unchanged
   * for the assistant that answers when the lid is shut.
   */
  const [conversationId, setConversationId] = useState<string | null>(() => readDeviceValue(CHAT_ID_KEY));
  const [listOpen, setListOpen] = useState(false);
  /*
   * ITEM 12 — THE DOCKED LIST CAN BE PUT AWAY, WHICH `atlas.html` ALWAYS DREW
   * AND ITEM 10 DID NOT BUILD.
   *
   * The mockup keeps one `panel-left` button in the header and gives it two
   * jobs by width: below its 1100 it opens the list as a sheet, at and above it
   * hides and shows the docked column. Item 10 built only the first half, so on
   * a wide window the list was permanent — which is wrong on a laptop reading a
   * long answer, where 268px of chat titles is the least useful column on the
   * screen.
   *
   * Separate state from `listOpen` rather than one flag doing both, because
   * they have opposite defaults for good reasons: the sheet starts **closed**
   * (it covers the conversation) and the docked column starts **open** (it
   * costs nothing and it is how the screen has always looked). One flag would
   * have to be wrong at one of the two sizes.
   *
   * Remembered per device for `devicePrefs.ts`'s reason — how much room there
   * is beside the conversation is a fact about the machine you are sitting at.
   */
  const [listDocked, setListDocked] = useState<boolean>(() => readDeviceValue(LIST_DOCKED_KEY) !== '0');

  /*
   * ITEMS 24 AND 25 — SPEAKING AND LISTENING.
   *
   * Both were written believing the tablet had no speech of its own and both
   * carried a note assuming Chrome; it is Brave, and the whole thing was
   * therefore **measured on his tablet before a line was written**. It hears,
   * it speaks, it has 95 voices, and none of it costs VRAM — so Whisper and
   * Chatterbox are both absent and the laptop is not involved in either
   * direction. `lib/voice/recognition.ts` holds what the measurement found,
   * including the one quirk that decides how the transcript is assembled.
   *
   * **Dictation lands in the field rather than sending.** The engine mishears
   * names — his own comes back as "Srikanth" — and a spoken task that posts
   * itself gives him nothing to correct. Dock mode is the surface that sends
   * without asking, and it is entered deliberately.
   */
  const voice = useVoiceChoice();
  /* DESIGN-1 — dock mode's flag lives in `useUIStore`, not here: v3's
     `atlas.html` puts Dock mode in the Atlas nav, so `navModel`'s `go` is
     one of the two things that turn it on and this screen is only what
     draws it. */
  const docked = useUIStore((s) => s.dockOpen);
  /* Dev only — `null` in every build that ships. The harness opens dock mode
     from the URL because it is the only way to photograph a screen whose
     states all come from a live microphone (`lib/devDockFixture.ts`). */
  const dockFixture = devDockFixture();
  const setDocked = useUIStore((s) => s.setDockOpen);

  useEffect(() => {
    if (dockFixture !== null) setDocked(true);
  }, [dockFixture, setDocked]);

  /** True while a stored conversation is being fetched, so the openers do not flash. */
  const [restoring, setRestoring] = useState(false);

  const historyRef = useRef<AgentMessage[]>(sessionHistory);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  /* Item 24. Declared here rather than beside the other voice state because it
     puts its result in the field, and the field's ref is above. */
  const dictation = useDictation(
    useCallback((text: string) => {
      /* Appended, not replaced: he may have typed half a sentence and then
         reached for the microphone, and throwing that away would be the more
         surprising of the two behaviours. */
      setInput((current) => (current.trim() === '' ? text : `${current.trim()} ${text}`));
      inputRef.current?.focus();
    }, []),
  );

  const { lastReply } = useSpokenReplies(turns, busy, docked, voice);

  const wide = useMedia(WIDE);
  /** Room for the rail, the 268px chat list and the 880px column together. */
  /*
   * ITEM 13G, second pass - `chatCost` is gone with the readout it fed.
   *
   * It summed the visible turns and marked the total partial with a `+` where
   * a turn had no recorded price, which was careful work for a line Shreekant
   * asked to delete outright: *"remove the text this chat - ceiling 5/turn
   * giving it more space"*. Per-turn cost is untouched - `TurnFooter` still
   * prints what each turn spent, which is the figure that can actually be
   * acted on - and the ceiling still stops a turn on the laptop whether or not
   * this screen quotes it.
   */

  const listed = useMedia(LISTED);
  /** Docked and not put away. What actually renders the column. */
  const showList = listed && listDocked;

  const toggleList = useCallback(() => {
    // One button, two jobs, decided by whether there is room to dock. The
    // mockup's own split — see `listDocked`.
    if (listed) {
      setListDocked((open) => {
        writeDeviceValue(LIST_DOCKED_KEY, open ? '0' : null);
        return !open;
      });
    } else {
      setListOpen(true);
    }
  }, [listed]);
  const nav = useNavModel();
  /*
   * BUILD-1 — on a narrow window this composer fills the strip directly
   * above the nav, which is the lane the app-level focus pill floats in.
   * Publishing where it starts lifts the pill above it rather than onto
   * it; measured rather than typed, because the composer grows as he
   * writes. Off on a wide window, where the pill is in the bottom-left
   * corner and the composer is a centred column that never reaches it.
   */
  const composerRef = useRef<HTMLDivElement>(null);
  useFooterReserve(composerRef, !wide);

  /* ITEM 13F — the Atlas panel. The nav dropped to six and Atlas's own
     surfaces fold in behind its button, which is a menu *here* and a plain
     destination everywhere else. `navModel.go` owns that rule and this flag;
     this screen only draws the panel beside whichever nav it is showing. */
  /* It is a nav attachment, not a screen of its own — leaving the chat by any
     route (a picked row, the browser's Back) closes it. */
  const setAtlasPanelOpen = useUIStore((s) => s.setAtlasPanelOpen);
  useEffect(() => () => setAtlasPanelOpen(false), [setAtlasPanelOpen]);

  const activeKeyId = useApiKeyStore((s) => s.activeId);

  const timezone = useMemo(() => resolveUserTimeZone(), []);

  /* Which model answers, and therefore **where the loop runs** (item 8). This
     is the one branch in the app on where an answer comes from, and item 8
     widened what it decides: it used to pick between two transports handed to
     the same in-browser loop, and it now picks between two *machines*.

     - the laptop, whenever it can take the pick (`lib/atlas/routing.ts`);
     - otherwise Atlas in this page (BIG-12), for any cloud pick.

     The basic assistant that used to be the second branch is retired, his
     call on 2026-09-29 — "Retire it, Atlas for all". With no key of his own a
     Gemini turn here answers on the owner's key through `api/chat`, which is
     what the basic assistant used. */
  const model = useModelStore(selectEffectiveModel);
  const refreshModels = useModelStore((s) => s.refresh);

  const atlasStatus = useAtlasStore((s) => s.status);
  const atlasBase = useAtlasStore((s) => s.baseUrl);
  const probeAtlasHost = useAtlasStore((s) => s.probe);
  /* BIG-1: a cloud pick runs on the laptop too, when the laptop takes cloud
     turns and there is a key for it — `lib/atlas/routing.ts` says why. */
  const atlasHealth = useAtlasStore((s) => s.health);
  const geminiKeyInSheet = useApiKeyStore((s) => atlasKeyOf(s, 'gemini') !== null);
  const cloud = useMemo(() => cloudRoutingOf(atlasHealth, geminiKeyInSheet), [atlasHealth, geminiKeyInSheet]);
  const onAtlas = routesToAtlas(model, atlasStatus, atlasBase, cloud);
  /* BIG-12: a cloud pick the laptop does not take — it is shut, or has no key
     for this provider — runs on Atlas in this page, with every tool, the
     catalog, skills and the action log. Any signed-in account: with no key of
     his own a Gemini turn answers on the owner's key through `api/chat`, as the
     retired basic assistant did (27A-5, "Retire it, Atlas for all"). */
  const uid = user?.uid ?? null;
  const onTablet = !onAtlas && uid !== null && model.provider !== 'ollama';
  /** Atlas is answering, on either machine. */
  const atlasAnswering = onAtlas || onTablet;
  /* BIG-4: with the lid shut, the chats are read from the cloud copy. Keyed on
     where the memory is read, not on who answers: Atlas may be running here
     while the laptop is awake, and then the laptop's list is the list. */
  const memorySource = useMemorySource();
  const lidShut = memorySource?.kind === 'cloud' ? memorySource : null;

  const { skillList, activeSkill, setActiveSkill, pendingSkillRef, chooseSkill } = useAtlasSkills(
    atlasAnswering,
    memorySource,
  );

  /*
   * A local model with no Atlas to run it on.
   *
   * This should not be reachable: the local list *comes from* Atlas, so a
   * sleeping laptop empties it and `resolveSelection` falls through to Gemini
   * on its own. It is checked anyway because of what the alternative failure
   * looks like — the Gemini branch would post `gemma4:e4b` to Google and come
   * back with a 404 about an unknown model, which points at the wrong machine
   * entirely and would cost an hour to read correctly.
   */
  const strandedLocally = model.provider !== 'gemini' && !onAtlas && !onTablet;

  /*
   * Whether Atlas can actually act, as Atlas itself reports it (item 9).
   *
   * `stage.tools` is true only when at least one MCP server is connected right
   * now, so a laptop whose service-account key is missing says so instead of
   * promising hands it does not have. Read rather than inferred from the item
   * number, which is the whole reason that field exists.
   */
  const atlasHasTools = useAtlasStore((s) => s.health?.stage.tools ?? false);
  const atlasCanAct = (onAtlas && atlasHasTools) || onTablet;
  const answering = whoIsAnswering(onAtlas, atlasStatus, atlasHasTools, busy, onTablet, uid !== null);

  useEffect(() => {
    sessionTurns = turns;
  }, [turns]);

  const { conversations, setConversations, chatQuery, setChatQuery, listProblem, listWaiting, setListProblem, reloadConversations } =
    useConversationList(memorySource?.kind === 'laptop', atlasBase, atlasStatus, lidShut);

  /*
   * Reopen what was open (item 10's "Done when").
   *
   * Runs once a conversation id and a reachable Atlas are both in hand — the
   * probe lands after the first render, so this cannot be a mount effect. The
   * transcript is rebuilt from the stored messages by `turnsFromHistory`; what
   * a rebuilt turn cannot have is written down there.
   *
   * `restoredRef` stops it running twice for one id, which would otherwise
   * throw away anything typed since.
   */
  const restoredRef = useRef<string | null>(null);
  useEffect(() => {
    if (memorySource?.kind !== 'laptop' || atlasBase === null || conversationId === null) return;
    if (restoredRef.current === conversationId) return;
    restoredRef.current = conversationId;

    let live = true;
    setRestoring(true);
    void (async () => {
      try {
        const conversation = await fetchConversation(atlasBase, conversationId);
        if (!live) return;
        historyRef.current = conversation.history;
        sessionHistory = conversation.history;
        /* The skill this chat was left running, back on the chip.
           `pendingSkillRef` stays `undefined`: this is Atlas telling the app
           what is already in force, not the app asking for a change, and
           echoing it back would announce a skill the laptop already has. */
        setActiveSkill(conversation.activeSkill ?? null);
        pendingSkillRef.current = undefined;
        setTurns(
          turnsFromHistory(conversation.history).map((rebuilt) => ({
            ...rebuilt,
            status: 'done' as const,
            ranOnAtlas: true,
          })),
        );
      } catch {
        // The chat was deleted from another device, or the laptop went to
        // sleep between the probe and here. Start clean rather than showing a
        // half-loaded conversation; the next turn creates a new one.
        if (!live) return;
        setConversationId(null);
        writeDeviceValue(CHAT_ID_KEY, null);
      } finally {
        if (live) setRestoring(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [atlasBase, conversationId, memorySource?.kind, pendingSkillRef, setActiveSkill]);

  /*
   * BIG-4 — the same reopening with the lid shut, from the cloud copy.
   *
   * To read: `viewingCloudRef` makes the next message start a new chat (see
   * `send`). The laptop waking with this chat still open takes it from here
   * without a second read — `restoredRef` already names it, and what is on
   * screen is exactly what the laptop holds.
   */
  const viewingCloudRef = useRef(false);
  useEffect(() => {
    if (lidShut === null || conversationId === null) return;
    if (restoredRef.current === conversationId) return;
    restoredRef.current = conversationId;

    let live = true;
    setRestoring(true);
    void (async () => {
      try {
        const conversation = await loadConversation(lidShut, conversationId);
        if (!live) return;
        historyRef.current = conversation.history;
        sessionHistory = conversation.history;
        viewingCloudRef.current = true;
        /* BIG-12: with the lid shut this chat can be carried on here, so the
           skill it was left running goes back on the chip — as the laptop's
           own reopening does, and for the same reason not echoed back. */
        setActiveSkill(conversation.activeSkill ?? null);
        pendingSkillRef.current = undefined;
        setTurns(
          turnsFromHistory(conversation.history).map((rebuilt) => ({
            ...rebuilt,
            status: 'done' as const,
            ranOnAtlas: true,
          })),
        );
      } catch {
        // Not in the cloud copy (never synced, or deleted). Start clean, as
        // the laptop's own reopening does.
        if (!live) return;
        setConversationId(null);
        writeDeviceValue(CHAT_ID_KEY, null);
      } finally {
        if (live) setRestoring(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [conversationId, lidShut, pendingSkillRef, setActiveSkill]);

  useModelLists(activeKeyId);

  /*
   * The screenshot harness's way in. A conversation needs a live Gemini call
   * and the harness aborts everything off localhost, so the transcript — which
   * is most of this screen — had no baseline at all before UI-33. Guarded and
   * proved out of `dist/` exactly like `devAuth.ts` and `devShareFixture.ts`;
   * see that file for the whole mechanism. The snapshot ring is seeded too, so
   * the Revert button in the shot is the real one and pressing it runs the
   * real `revertTurn`.
   */
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const fixture = devChatFixture(window.location.search);
    if (!fixture) return;
    setTurns(fixture.turns as ChatTurn[]);
    /* Item 10 — the third blocked fetch. The chats are on the laptop and the
       harness cannot reach it, so without this the sidebar's only
       photographable state is the one saying so. Only the Atlas fixture
       carries them; the in-browser path genuinely has no list. */
    if (fixture.conversations) {
      setConversations(fixture.conversations);
      setListProblem(null);
      setConversationId(fixture.currentConversationId ?? null);
      // The fixture IS the conversation. Without this, the restore effect
      // would chase `c-lease` over a tailnet that is not there and blank the
      // transcript the fixture just seeded.
      restoredRef.current = fixture.currentConversationId ?? null;
    }
  }, [setConversations, setListProblem]);

  // Reverting a turn captured under one account would write that user's data
  // into another's store, so an account change starts over. The snapshot ring
  // itself is cleared by `AuthContext` on sign-out.
  useEffect(() => {
    const uid = user?.uid ?? null;
    if (sessionUid === uid) return;
    sessionUid = uid;
    sessionHistory = [];
    historyRef.current = [];
    setTurns([]);
  }, [user?.uid]);

  /* ITEM 13G — the autoscroll rule, and why it pins three times and only
     while he is near the bottom: `usePinToBottom.ts`. */
  usePinToBottom(scrollRef, turns, busy, conversationId);

  const { toast, setToast, showToast } = useToast();

  const { trayOpen, setTrayOpen, deciding, waiting, trayItems, failureOf, approvalStateOf, refreshTray, decide, throwAway } = useApprovalTray(
    showToast,
    memorySource,
  );

  const patchTurn = useCallback((id: string, update: (turn: ChatTurn) => ChatTurn) => {
    setTurns((prev) => prev.map((turn) => (turn.id === id ? update(turn) : turn)));
  }, []);

  const [resumable, setResumable] = useResumable(onAtlas, atlasBase, conversationId, busy);

  const { mode, chooseMode, effectiveContextK, chooseContextK } = useTurnDials(
    model.provider === 'ollama' ? model.id : null,
  );

  const send = useCallback(
    /**
     * `runFor` is item 12's one addition, and it exists for exactly one
     * gesture: **Go ahead**.
     *
     * Planning and Ask-first end a turn holding what they would have written.
     * Approving it has to run the *next* turn in Auto — the plan and the held
     * arguments are already in the conversation, so the model simply carries
     * them out — without changing the segment Shreekant chose. A mode passed
     * here overrides the dial for one request and does not touch it, which is
     * the difference between approving a plan and switching off planning.
     */
    async (raw: string, runFor?: AtlasMode, carryOn?: { resumeTurnId?: string }) => {
      const message = raw.trim();
      /*
       * ITEM 13A: A CARRY-ON HAS NO MESSAGE OF ITS OWN (§5.5).
       *
       * `resumeTurnId` names a turn in Atlas's log and the ask is read back
       * from there, so the empty-message guard has to let it through. What is
       * passed as `raw` on that path is the original ask, purely so the turn
       * on screen is labelled with the thing he actually asked for.
       */
      if ((message === '' && carryOn?.resumeTurnId === undefined) || busy) return;

      /*
       * BIG-4: a chat read from the cloud copy is not continued by the basic
       * assistant. It keeps no conversation, and sending the laptop's history
       * to it would fork the chat into a copy the laptop never sees. So the
       * message starts a new one, and says so.
       *
       * BIG-12: Atlas running here does keep it — it reads the chat from the
       * cloud copy and writes the turn back — so with Atlas here it goes on.
       */
      if (viewingCloudRef.current) {
        viewingCloudRef.current = false;
        if (!onAtlas && !onTablet) {
          sessionHistory = [];
          historyRef.current = [];
          restoredRef.current = null;
          setConversationId(null);
          writeDeviceValue(CHAT_ID_KEY, null);
          setTurns([]);
          showToast('This starts a new chat. The one you were reading is unchanged.');
        }
      }

      const id = crypto.randomUUID();
      setTurns((prev) => [
        ...prev,
        {
          id, userText: message, assistantText: '', toolCalls: [],
          status: 'running',
          startedAt: Date.now(),
          // Pinned at send, because the answer to "who is running this" can
          // change before it comes back. See `ChatTurn.ranOnAtlas`.
          ranOnAtlas: atlasAnswering,
        },
      ]);
      setInput('');
      setBusy(true);

      /* The turn's own clock (item 9D). Measured here for `probeAtlas`'s
         reason — the client is the only end that knows when the request left —
         and `performance.now()` rather than `Date.now()` because it is
         monotonic: a system clock that steps mid-turn would otherwise print a
         negative duration. */
      const startedAt = performance.now();

      const controller = new AbortController();
      abortRef.current = controller;

      if (strandedLocally) {
        cue('error');
        patchTurn(id, (turn) => ({
          ...turn,
          status: 'error',
          error:
            model.provider === 'ollama'
              ? `${model.id} runs on your laptop, and Atlas is not answering. Wake the laptop, or pick a Gemini model.`
              : `${model.label} answers through your laptop, and Atlas is not answering. Wake the laptop, or pick a Gemini model.`,
        }));
        void probeAtlasHost().then(() => refreshModels());
        abortRef.current = null;
        setBusy(false);
        return;
      }

      try {
        const result = await runChatTurn({
          atlasBase: onAtlas ? atlasBase : null,
          /* BIG-12. The laptop is shut and Atlas runs in this page. */
          tablet: onTablet && uid !== null ? { uid } : null,
          message,
          history: historyRef.current,
          /* `gemini:<id>` for a cloud pick; the laptop reads that spelling
             as a cloud turn. */
          model: { id: atlasAnswering ? atlasModelId(model) : model.id, label: model.label },
          /* BIG-1: the key for a cloud pick, from the key sheet. Atlas uses it
             for this turn and keeps it nowhere. */
          apiKey: atlasAnswering && model.provider !== 'ollama' ? atlasApiKey(model.provider) : null,
          timezone,
          conversationId,
          contextK: effectiveContextK,
          mode,
          runFor,
          /* OPT-8 — thinking is always Max, his call: the dial is gone. */
          effort: 'hard',
          carryOn,
          takeSkill: () => {
            const asked = pendingSkillRef.current;
            pendingSkillRef.current = undefined;
            return asked;
          },
          signal: controller.signal,
          patch: (update) => patchTurn(id, update),
          onConversation: (id) => {
            /*
             * ITEM 12 FOUND AN ITEM 10 BUG HERE, AND THIS LINE IS THE FIX.
             *
             * Adopting the id makes `conversationId` change, which wakes
             * the restore effect above — and at this instant Atlas has
             * created the conversation but has not yet saved the turn that
             * is still streaming into it. So the effect fetched an empty
             * history and called `setTurns([])` **over the running turn**,
             * and the first message of every new chat vanished as it was
             * being answered. The answer itself was never lost: it saved
             * on the laptop and came back on the next reload, which is
             * presumably why this survived item 10.
             *
             * Claiming the id here says what is true — this tab already
             * holds the live transcript for that conversation, so there is
             * nothing to restore — and the effect skips it on its own
             * guard rather than needing a second flag.
             */
            restoredRef.current = id;
            setConversationId(id);
            writeDeviceValue(CHAT_ID_KEY, id);
          },
          /* Item 13. The act is now on the laptop and the pill in the
             header has to say so even if this turn is abandoned. */
          onApproval: () => void refreshTray(),
        });

        historyRef.current = result.history;
        sessionHistory = result.history;
        patchTurn(id, (turn) => ({
          ...turn,
          // Keep what streamed: `result.text` is only the last round trip's
          // words, and an answer that began before a tool call would lose its
          // opening if it were overwritten.
          assistantText: turn.assistantText.trim() === '' ? result.text : turn.assistantText,
          status: 'done',
          usage: result.usage,
          model: result.model,
          elapsedMs: performance.now() - startedAt,
        }));

        // A new chat has just been named after this message, and a continued
        // one has just moved to the top of "recent". Either way the list is a
        // beat stale and this is the only moment that is known.
        if (result.conversationTitle !== null) void reloadConversations(chatQuery);
      } catch (err) {
        const aborted = err instanceof DOMException && err.name === 'AbortError';
        /* 29-1P3: a turn that failed sounds; one he stopped himself does not. */
        if (!aborted) cue('error');

        patchTurn(id, (turn) => ({
          ...turn,
          status: 'error',
          error: aborted
            ? 'Stopped. Anything the agent had already done is still done — revert it below if you did not want it.'
            : err instanceof Error
              ? err.message
              : String(err),
        }));

        /* A turn that died on the Atlas path usually means the lid closed
           mid-answer. Ask again, so the *next* message routes to the fallback
           and the banner says why, instead of failing the same way twice. */
        if (!aborted && onAtlas) void probeAtlasHost().then(() => refreshModels());
      } finally {
        abortRef.current = null;
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [
      busy,
      patchTurn,
      showToast,
      model,
      onAtlas,
      onTablet,
      atlasAnswering,
      uid,
      strandedLocally,
      atlasBase,
      timezone,
      probeAtlasHost,
      refreshModels,
      conversationId,
      effectiveContextK,
      chatQuery,
      reloadConversations,
      mode,
      refreshTray,
      pendingSkillRef,
    ],
  );

  /**
   * Take the last thing you said back, to change it (item 12).
   *
   * *"Edit-and-resend on the last message"* — the third of the item's three
   * "what an advanced chat needs", and the only one of the three this screen
   * did not already have (the stop button has been in the composer since 9D).
   *
   * **It puts the text back in the composer and drops the turn**, rather than
   * opening an editor over the bubble. `atlas.html` does the same, and the
   * reason to prefer it here is that the composer is the one control on this
   * screen that already handles multi-line text, Enter-to-send and the model
   * picker sitting above it.
   *
   * **What it does NOT do is un-write anything.** A resent turn is a new turn;
   * if the one being taken back created a task, that task still exists. The
   * changes container is the thing that undoes work, and it stays visible on
   * the turn until the moment this drops it — so the button is deliberately
   * offered only on a turn that wrote nothing or failed, and never on one
   * holding a Revert that has not been used.
   */
  const editAndResend = useCallback(() => {
    setTurns((prev) => {
      const last = prev[prev.length - 1];
      if (last === undefined) return prev;
      setInput(last.userText);
      return prev.slice(0, -1);
    });
    // The history has to lose the same turn, or the model answers the resent
    // message with its own previous answer still in front of it. Two messages
    // per turn on the way out: what he said, and what came back.
    historyRef.current = historyRef.current.slice(0, -2);
    sessionHistory = historyRef.current;
    inputRef.current?.focus();
  }, []);


  /**
   * Start a fresh conversation.
   *
   * **Nothing is created on the laptop here**, and that is deliberate: a chat
   * made by pressing the button and then abandoned would be an empty "New
   * chat" row in the list for ever. Atlas creates one on the first message,
   * names it after that message, and reports the id on `start`. Pressing this
   * only forgets which one this tab was reading.
   */
  const newConversation = useCallback(() => {
    abortRef.current?.abort();
    sessionHistory = [];
    historyRef.current = [];
    restoredRef.current = null;
    setConversationId(null);
    writeDeviceValue(CHAT_ID_KEY, null);
    setTurns([]);
    setListOpen(false);
  }, []);

  /*
   * BUILD-9 — a question asked from the command palette. His call: it opens
   * a **new** chat and is sent, not left in the box.
   *
   * It waits for two things before it goes, because either one missing
   * changes who answers: the probe (until it lands the laptop counts as not
   * there), and the model list (the local models *come from* the laptop, so
   * before they are listed `resolveSelection` falls through to Gemini). Sent a
   * beat early from a cold start, a question for gemma would go to Google.
   * Then it clears what is open, and sends on the next pass, once `send` has
   * been rebuilt without the old conversation's id in it.
   *
   * **The question is taken from the store at the moment of sending, not from
   * this render's copy.** React runs a new screen's effects twice in
   * development, and the second run still held the copy the first had just
   * cleared — the question went out twice.
   */
  const paletteHandoff = useUIStore((s) => s.paletteHandoff);
  const setPaletteHandoff = useUIStore((s) => s.setPaletteHandoff);
  const modelsListed = useModelStore(
    (s) => !s.loading && (s.hosted.length + s.local.length > 0 || s.hostedError !== null || s.localError !== null),
  );
  const asked = paletteHandoff?.kind === 'ask' ? paletteHandoff.text : null;
  useEffect(() => {
    if (asked === null || atlasStatus === 'unknown' || !modelsListed) return;
    if (conversationId !== null || turns.length > 0) {
      newConversation();
      return;
    }
    if (busy || restoring) return;
    const taken = useUIStore.getState().paletteHandoff;
    if (taken?.kind !== 'ask') return;
    setPaletteHandoff(null);
    void send(taken.text);
  }, [asked, atlasStatus, modelsListed, conversationId, turns.length, busy, restoring, newConversation, send, setPaletteHandoff]);

  /* OPT-9 — the chat search's "Ask Atlas", for a search that found no chat.
     The palette's own road in (above): a new chat, sent once the probe and
     the models have landed. The search is cleared so the list is whole again
     when he comes back to it, and the drawer shuts to show the answer. */
  const askFromSearch = useCallback(
    (text: string) => {
      setChatQuery('');
      setListOpen(false);
      setPaletteHandoff({ kind: 'ask', text });
    },
    [setChatQuery, setPaletteHandoff],
  );

  const openConversation = useCallback((id: string) => {
    abortRef.current?.abort();
    setConversationId(id);
    writeDeviceValue(CHAT_ID_KEY, id);
    setListOpen(false);
  }, []);

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      if (atlasBase === null) return;
      // Painted first, then written. A rename that waited for the laptop would
      // feel broken over a tailnet, and the reload below is the correction if
      // the write failed.
      setConversations((prev) => prev.map((row) => (row.id === id ? { ...row, title, untitled: false } : row)));
      try {
        await patchConversation(atlasBase, id, { title });
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err));
      }
      void reloadConversations(chatQuery);
    },
    [atlasBase, chatQuery, reloadConversations, setConversations, showToast],
  );

  const removeConversation = useCallback(
    async (id: string) => {
      if (atlasBase === null) return;
      try {
        await deleteAtlasConversation(atlasBase, id);
        showToast('Conversation deleted. It is gone from the laptop — chats have no Trash.');
        if (id === conversationId) newConversation();
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err));
      }
      void reloadConversations(chatQuery);
    },
    [atlasBase, chatQuery, conversationId, newConversation, reloadConversations, showToast],
  );


  /*
   * `restoring` counts as "not empty" (item 10).
   *
   * A reload with a stored conversation paints before the fetch lands, and
   * without this the empty state's heading and its three openers flash up for
   * a beat and are then replaced by the conversation. On a tailnet that beat
   * is long enough to read.
   */
  const isEmpty = turns.length === 0 && !restoring;

  /* BUILD-12: the hand-off prompt, built from the laptop's copy of this chat
     (`lib/atlas/handoff.ts`). Only on the Atlas path and only once the chat
     is saved there — the in-browser assistant keeps no conversation. */
  const copyHandoffPrompt = useCallback(() => {
    if (atlasBase === null || conversationId === null) return;
    void copyHandoff(atlasBase, conversationId)
      .then(() => showToast('Hand-off prompt copied. Paste it into any other AI chat.'))
      .catch((err: unknown) => showToast(err instanceof Error ? err.message : String(err)));
  }, [atlasBase, conversationId, showToast]);

  /*
   * ITEM 13G — the number in the empty state's question.
   *
   * `Home`'s own count, and deliberately the same expression: top-level tasks
   * that are not completed. Two screens printing two different totals for "how
   * much is open" would be the app contradicting itself where he can see both.
   */
  const backlogTasks = useStore((state) => state.backlogTasks);
  const openCount = useMemo(
    () => backlogTasks.filter((task) => !task.parent && task.status !== 'completed').length,
    [backlogTasks],
  );

  /*
   * The heading is the chat's name (item 10, and `atlas.html`'s own).
   *
   * "Atlas" until there is a conversation with a name, which is what a new
   * chat and the whole in-browser path both look like. The name comes from the
   * list rather than being held separately, so a rename lands here too.
   */
  const conversationTitle =
    conversations.find((row) => row.id === conversationId && !row.untitled)?.title ?? 'Atlas';

  return (
    /* `ag-page` rather than the old opaque wrapper, so the grid backdrop shows
       through and the panes above it have something to refract. Its own
       `::before` is the pool of accent light low on the page, which is what
       the hand-rolled indigo floor glow used to be. */
    <div className="ag-page" style={{ height: '100dvh', display: 'flex', overflow: 'hidden' }}>

      {wide && <ChatRail nav={nav} />}

      <ChatLists
        listed={listed}
        showList={showList}
        listOpen={listOpen}
        setListOpen={setListOpen}
        conversations={conversations}
        conversationId={conversationId}
        chatQuery={chatQuery}
        setChatQuery={setChatQuery}
        listProblem={listProblem}
        listWaiting={listWaiting}
        openConversation={openConversation}
        newConversation={newConversation}
        renameConversation={renameConversation}
        removeConversation={removeConversation}
        askFromSearch={askFromSearch}
      />

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          boxSizing: 'border-box',
          padding: wide ? `0 var(--gutter-page)` : `0 var(--gutter-page-sm)`,
          /* 29-1P15b: the empty chat's horizon is as wide as this column
             (`100cqw`), not the narrower message column inside it. Nothing
             in here is `position: fixed` (dock mode, the tray and the edge
             light sit outside it), so the containment moves nothing else. */
          containerType: 'inline-size',
        }}
      >
        <ChatHeader
          wide={wide}
          showList={showList}
          toggleList={toggleList}
          conversationTitle={conversationTitle}
          answering={answering}
          waiting={waiting}
          setTrayOpen={setTrayOpen}
          isEmpty={isEmpty}
          newConversation={newConversation}
          busy={busy}
          docked={docked}
          copyHandoff={onAtlas && conversationId !== null ? copyHandoffPrompt : undefined}
        />

        {/* ── Transcript ─────────────────────────────────────────────—
            A flex column rather than a plain block, so the empty state can
            take the whole height and centre in it. `flex: 1 0 auto` on the
            inner column is the half that matters: `1` lets it fill an empty
            screen, `0` stops it shrinking a long conversation back into the
            viewport instead of scrolling it. */}
        <div
          ref={scrollRef}
          /* ITEM 13G — `ag-transcript` is the mask, and it is most of the
             answer to *"it's out of several view"*. Turns dissolve into the
             page under the composer instead of being sliced flat by its edge;
             `ag-scroll` takes the browser scrollbar off the glass. Both are in
             `ui/screens.css` with the mockup's own numbers. */
          className="ag-scroll ag-transcript"
          style={{
            flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain',
            display: 'flex', flexDirection: 'column',
          }}
        >
          <div
            style={{
              flex: '1 0 auto', display: 'flex', flexDirection: 'column',
              width: '100%', maxWidth: COLUMN_PX, margin: '0 auto',
              /* The mask eats `--sp-7` at the top and `--sp-8` at the bottom,
                 so the column owes itself that much padding or the first and
                 last turns are drawn into the fade. */
              paddingTop: 'var(--sp-6)', paddingBottom: 'var(--sp-9)',
            }}
          >
            {isEmpty ? (
              <EmptyState onPick={send} onAtlas={atlasAnswering} atlasCanAct={atlasCanAct} openCount={openCount} docked={docked} />
            ) : (
              /* `--sp-11` between turns, `--sp-7` inside one, `--sp-6` inside
                 an Atlas turn: the redrawn mockup's three gaps, and the
                 differences between them are what stop a long conversation
                 reading as one column of paragraphs. The outer gap grew from
                 `--sp-10` because the turns themselves got taller — a tool
                 result is six rows now, not a chip.
                 One fixed column (OPT-1): with none, the grid's `auto` column
                 is as wide as the widest thing in ANY turn, so one long link
                 pushed every turn on the page off the right edge. */
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 'var(--sp-11)' }}>
                {turns.map((turn, index) => (
                  <TurnBlock
                    key={turn.id}
                    turn={turn}
                    timezone={timezone}
                    isLast={index === turns.length - 1}
                    answeredBelow={parseAnswerMessage(turns[index + 1]?.userText ?? '') !== null}
                    busy={busy}
                    onSend={(text, runFor) => void send(text, runFor)}
                    onEdit={editAndResend}
                    approvalStateOf={approvalStateOf}
                    failureOf={failureOf}
                    deciding={deciding}
                    onDecide={decide}
                  />
                ))}
              </div>
            )}

            {/* ── ITEM 13A — Atlas was in the middle of something (§5.5) ────
                At the foot of the transcript rather than pinned to the top,
                because it is the *next* thing to decide and everything above
                it already happened. It sits where a new turn would appear,
                which is where his eyes are.

                Drawn whether the conversation is empty or long: an interrupted
                turn on a chat he has not opened since is exactly the case §5.5
                describes, and that chat may well look empty here because the
                turn was never saved to it — `runChat` writes the conversation
                at the end, and this one never got there. */}
            {resumable !== null && !busy && (
              <div
                style={{
                  width: '100%', maxWidth: COLUMN_PX, margin: '0 auto',
                  padding: 'var(--sp-6) var(--sp-6) 0',
                  boxSizing: 'border-box',
                }}
              >
                <ResumeCard
                  turn={resumable}
                  onCarryOn={() => {
                    const carrying = resumable;
                    /* Cleared before the turn starts rather than after it: the
                       card is an offer, and an offer that is still on screen
                       while it is being taken up invites a second tap that
                       would resume the same turn twice. */
                    setResumable(null);
                    void send(carrying.ask ?? '', undefined, { resumeTurnId: carrying.turnId });
                  }}
                  /* "Leave it" hides the card and changes nothing on the
                     laptop. Deliberately not a delete: the turn stays in the
                     action log, where §5.3 says everything Atlas did stays,
                     and the offer comes back if he opens the chat again. It is
                     a dismissal of the question, not of the record. */
                  onDismiss={() => setResumable(null)}
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Composer ───────────────────────────────────────────────—
            `position: relative` because the toast hangs off the top of this
            block rather than being fixed to the viewport: the one thing it
            must never cover is the composer, and anchoring it here says so
            without a measured offset that both breakpoints would have to
            agree on. Local stacking, not a rung on `lib/zLayers.ts`. */}
        <div
          ref={composerRef}
          style={{
            position: 'relative',
            flex: '0 0 auto',
            width: '100%', maxWidth: COLUMN_PX, margin: '0 auto',
            /* Room for the floating MiniNav below it on a narrow window —
               108px, which is the redrawn mockup's own figure for the bottom
               pill plus its `--sp-5` inset. `zIndex` because the transcript's
               mask fades the turns out over this block rather than above it,
               so the composer has to be the thing on top of that overlap. */
            zIndex: 10,
            padding: wide ? 'var(--sp-6) 0 var(--sp-7)' : 'var(--sp-6) 0 108px',
          }}
        >
          {toast && (
            <div
              style={{
                position: 'absolute', left: 0, right: 0, bottom: '100%',
                display: 'grid', placeItems: 'center',
                paddingBottom: 'var(--sp-5)', pointerEvents: 'none', zIndex: 1,
              }}
            >
              <span style={{ pointerEvents: 'auto' }}>
                {/* `revertTurn`'s summary is already a whole sentence naming
                    the turn and what came back, so it IS the title — a
                    "Reverted" headline above it would only say it twice. */}
                <Toast
                  icon={<Icon name="undo-2" size={16} />}
                  title={toast}
                  onDismiss={() => setToast(null)}
                />
              </span>
            </div>
          )}

          {/* ITEM 13G — THE COMPOSER, REDRAWN. See `components/chat/Composer.tsx`
              for the three moves and for why the raised pill is not the thing
              `Input.prompt.md` forbids. What left this file with it: the
              `Textarea` and its trailing Send slot, the 132px cap, and the
              sentence underneath — the modes say their own piece inside the
              Mode dial now, and the standing sentence survives on the fallback,
              which is the only path that still has nothing else to say. */}
          <Composer
            fieldRef={inputRef}
            value={input}
            onChange={setInput}
            onSend={() => send(input)}
            onStop={() => abortRef.current?.abort()}
            busy={busy}
            mode={mode}
            onMode={chooseMode}
            narrow={!wide}
            /* ITEM 24 — THE MICROPHONE, and it is drawn on both paths rather
               than only Atlas's. Dictation is the browser's, not the
               assistant's: speaking a task into the field works exactly as
               well when the laptop is shut and the in-browser fallback is
               answering, and taking the microphone away at the moment typing
               is least convenient would be the wrong way round. */
            mic={
              dictation.supported ? (
                <MicButton
                  listening={dictation.listening}
                  heard={dictation.heard}
                  error={dictation.error}
                  startedAt={dictation.startedAt}
                  landedAt={dictation.landedAt}
                  disabled={busy}
                  onToggle={() => {
                    if (dictation.error !== null) dictation.dismiss();
                    if (dictation.listening) dictation.stop();
                    else dictation.start();
                  }}
                />
              ) : undefined
            }
            /* `/` is Atlas's too — the in-browser fallback has no skills
               folder, and an empty list is what disables the picker. */
            skills={atlasAnswering ? skillList : []}
            activeSkill={activeSkill}
            onSkill={chooseSkill}
            /* Mode is Atlas's. With nothing able to answer — no account, or a
               local pick with the laptop away (the basic assistant is retired,
               BIG-12) — a dial that changes nothing would be worse than none,
               so the composer says what fixes it. */
            dials={atlasAnswering}
            fallbackNote={
              uid === null
                ? 'Sign in to talk to Atlas.'
                : 'Wake the laptop for a local model, or switch to Cloud.'
            }
          >
            {/* OPT-8 — Local | Cloud, which replaced the model picker at the
                foot of the chat list; which model each side means is picked
                in Settings → Atlas. Drawn whenever there is an account, even
                with the dials off, because it is how a stranded local pick
                is moved to the cloud. */}
            {uid !== null && <ModelSideSwitch />}

            {/* ITEM 13G, second pass — **Customize moved here**, his call. It
                was a sliders button on the header's instrument bar, two hundred
                pixels above the words it applies to; the context window inside
                it decides how the next turn runs, which is exactly what this
                row is for. It draws
                itself as a `DialPill` and opens upward, beside Mode.

                Only on the Atlas path: a context slider needs a local model's
                declared maximum. */}
            {onAtlas && (
              <TuningPopover
                model={model.provider === 'ollama' ? model.id : null}
                contextK={effectiveContextK}
                onContextK={chooseContextK}
              />
            )}

            {/* OPT-8 — the Voice pill that sat here (read answers aloud,
                which voice, and the way into dock mode) moved to Settings →
                Atlas, his call. The microphone beside Send stays. */}
          </Composer>
        </div>
      </div>

      {!wide && <ChatBottomNav nav={nav} />}

      {/* ITEM 13 — the tray. Mounted always and moved off-screen when closed,
          rather than unmounted: it slides, and a panel that did not exist a
          frame ago has nowhere to slide from. */}
      <Tray
        open={trayOpen}
        items={trayItems}
        deciding={deciding}
        failureOf={failureOf}
        onClose={() => setTrayOpen(false)}
        onDecide={decide}
        onThrow={throwAway}
      />

      {/* ITEMS 24 + 25 — DOCK MODE. Mounted only while it is on, which is the
          opposite of the tray above and deliberately so: the tray slides and
          needs to exist to slide from, while this holds a live microphone and
          a screen wake lock. Something that keeps the tablet awake and listens
          to the room must not linger off-screen — unmounting is what
          guarantees both are released. `DockMode`'s own effects do the
          releasing; this decides when.

          It reads `lastReply` rather than being pushed an answer, so a turn
          that finished while he was reading the screen is still spoken. */}
      {/* 29-1P15a, idea 67: the window's edges glow while Atlas works on a
          turn, and fade when it has answered. A turn the page did not send
          (the "working" fixture, a resumed one) still counts as working. */}
      <EdgeLight on={busy || turns[turns.length - 1]?.status === 'running'} fixed zIndex={Z.edgeLight} />

      {docked && (
        <DockMode
          onAsk={(text) => void send(text)}
          busy={busy}
          reply={lastReply}
          voiceUri={voice.chosen}
          /* DESIGN-1 — the same list the Voice dial opens, on the screen it is
             actually operated from. */
          voices={voice.all}
          onChooseVoice={voice.choose}
          assistant="Atlas"
          fixture={dockFixture}
          onExit={() => setDocked(false)}
        />
      )}
    </div>
  );
}
