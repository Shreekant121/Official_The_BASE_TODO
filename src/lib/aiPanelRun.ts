/**
 * The AI panel's conversations, and the one function that runs a turn in one
 * (BUILD-4).
 *
 * WHY A STORE AND NOT COMPONENT STATE
 * -----------------------------------
 * The panel docks and undocks as he works, and a turn on a 4B model takes
 * long enough to close the panel in the middle of one. So an exchange lives
 * here, keyed by its subject (`subjectKey`), and a turn writes into the store
 * rather than into a component that may already be gone: close the panel on
 * a task, reopen it, and the answer is there. **In memory only, like
 * `useSnapshotStore`** — the conversation itself is kept on the laptop, and
 * nothing here is task data, so none of it goes near `data/main`.
 *
 * THE TWO MACHINES, EXACTLY AS `/chat` PICKS THEM
 * -----------------------------------------------
 * A local model runs on Atlas (`runAtlasTurn`); a Gemini model runs in this
 * browser on `runAgentTurn`, the labelled fallback for a shut laptop. The
 * choice is the same selector `ChatPage` reads, so the panel never answers
 * from a different machine than the chat screen would. A local model with no
 * Atlas to run it is refused with a sentence, for `ChatPage`'s reason: the
 * Gemini branch would post `gemma4:e4b` to Google.
 *
 * UNDO RIDES ON THE TURN
 * ----------------------
 * `AIPanel.prompt.md` puts Undo on the change itself. What can actually be
 * undone is a *turn*: Atlas's action log reverts one (`revertLogTurn`), and
 * the in-browser ring reverts one (`revertTurn`). So every `did` item carries
 * its turn's key, and Undo on any of them puts back the whole turn — and
 * every item from that turn says so.
 */
import { create } from 'zustand';
import {
  AtlasMonthlyCeilingReached,
  decideApproval,
  patchConversation,
  revertLogTurn,
  runAtlasTurn,
  type AtlasHeldCall,
} from './atlas/client';
import { useAtlasStore } from './atlas/atlasStore';
import { atlasModelId, downshiftOn, routesToAtlas } from './atlas/routing';
import { runAgentTurn } from './agent/core';
import { getActiveApiKey } from './agent/apiKeys';
import { resolveUserTimeZone } from './agent/dates';
import { createLiveSession } from './agent/liveContext';
import { selectEffectiveModel, useModelStore } from './agent/modelStore';
import { fallbackTools } from './agent/tools';
import { createGeminiTransport } from './agent/transports/geminiTransport';
import type { AgentMessage, AgentToolCall, ToolDef } from './agent/types';
import { useSnapshotStore } from '../store/useSnapshotStore';
import {
  didFromToolCall,
  fieldsInPatch,
  fillsFromHeldCall,
  scoreContinue,
  scoreKickoff,
  subjectKey,
  withPreface,
  type DidSummary,
  type PanelSubject,
  type ScoreDraftPatch,
  type ScoreField,
} from './aiPanel';
import { parseAnswerMessage, type AnswerReceipt, type AskCard } from './askCard';

// ─── Items ──────────────────────────────────────────────────────────────────

export type ApprovalState = 'waiting' | 'deciding' | 'yes' | 'no';

export type PanelItem =
  | { kind: 'you'; id: string; text: string }
  | { kind: 'ai'; id: string; text: string }
  /** The question card (BUILD-16). The side panel's compact one, `ui/data/AskCard`. */
  | { kind: 'ask'; id: string; card: AskCard }
  /** His answers to a card, drawn as its receipt rather than as his words. */
  | { kind: 'answered'; id: string; receipt: AnswerReceipt }
  | { kind: 'did'; id: string; did: DidSummary; turn: string }
  | {
      kind: 'approve';
      id: string;
      approvalId: string;
      title: string;
      note?: string;
      hard: boolean;
      state: ApprovalState;
      done?: string;
    }
  | { kind: 'filled'; id: string; field: string; value: string }
  /** Something the panel itself has to say: a failure, or a fact about the turn. */
  | { kind: 'note'; id: string; text: string; tone: 'error' | 'quiet' };

export type UndoState =
  | { status: 'ready'; via: 'atlas'; logTurnId: string }
  | { status: 'ready'; via: 'ring'; snapshotTurnId: string }
  | { status: 'busy' }
  | { status: 'done'; summary: string }
  | { status: 'unavailable'; reason: string };

export interface PanelWorking {
  label: string;
  tool?: string;
}

export interface PanelSession {
  items: PanelItem[];
  working: PanelWorking | null;
  /** The conversation on the laptop. `null` until Atlas names one, and always on the fallback. */
  conversationId: string | null;
  /** The fallback's history, which this browser holds because nobody else does. */
  history: AgentMessage[];
  /** Whether the laptop's copy has been renamed after the subject yet. */
  titled: boolean;
  undos: Record<string, UndoState>;
  /** Hidden nudges sent on `/scoring` in a row, so a model that never asks cannot loop. */
  nudges: number;
}

const EMPTY_SESSION: PanelSession = {
  items: [],
  working: null,
  conversationId: null,
  history: [],
  titled: false,
  undos: {},
  nudges: 0,
};

interface PanelStore {
  sessions: Record<string, PanelSession>;
}

export const usePanelStore = create<PanelStore>()(() => ({ sessions: {} }));

/** A selector-safe read: the same empty object every time, so it never re-renders on its own. */
export function selectSession(key: string) {
  return (state: PanelStore): PanelSession => state.sessions[key] ?? EMPTY_SESSION;
}

function patchSession(key: string, update: (session: PanelSession) => PanelSession): void {
  usePanelStore.setState((state) => ({
    sessions: { ...state.sessions, [key]: update(state.sessions[key] ?? EMPTY_SESSION) },
  }));
}

function pushItem(key: string, item: PanelItem): void {
  patchSession(key, (s) => ({ ...s, items: [...s.items, item] }));
}

/** Dev-only: `lib/devPanelFixture.ts` seeds a photographable exchange. */
export function seedSession(key: string, session: Partial<PanelSession>): void {
  patchSession(key, (s) => ({ ...s, ...session }));
}

let counter = 0;
function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/** What he sent, as the panel draws it: a card's answers as its receipt, anything else as his words. */
function shownItem(message: string): PanelItem {
  const receipt = parseAnswerMessage(message);
  return receipt !== null
    ? { kind: 'answered', id: nextId('answered'), receipt }
    : { kind: 'you', id: nextId('you'), text: message };
}

// ─── The Score screen's half ────────────────────────────────────────────────

/**
 * What `/scoring` hands the panel: somewhere to put a fill, and what is still
 * missing. Registered by the page while it is showing that task, and looked
 * up at the moment a fill arrives — the turn may outlive a render, and it must
 * not write into a draft the page has already moved past.
 */
export interface FillHost {
  apply(patch: ScoreDraftPatch): void;
  missing(): ScoreField[];
}

const fillHosts = new Map<string, FillHost>();

export function registerFillHost(key: string, host: FillHost): () => void {
  fillHosts.set(key, host);
  return () => {
    if (fillHosts.get(key) === host) fillHosts.delete(key);
  };
}

/**
 * The in-browser half of Atlas's Ask-first mode: every write is recorded and
 * not run. The sentence the model reads back is written for this screen —
 * the value is on his screen and he saves it — so it carries straight on.
 */
function holdingTools(tools: ToolDef[], onHold: (call: AtlasHeldCall) => void): ToolDef[] {
  return tools.map((tool) =>
    tool.mutates
      ? {
          ...tool,
          execute: async (args) => {
            onHold({ name: tool.name, args, description: tool.description });
            return {
              ok: true,
              summary:
                `Not written: ${tool.name} put the value on Shreekant's screen, and he saves it himself. ` +
                'Do not call it again for the same field.',
              data: { held: true },
            };
          },
        }
      : tool,
  );
}

// ─── Running a turn ─────────────────────────────────────────────────────────

const inFlight = new Map<string, AbortController>();

export function isRunning(key: string): boolean {
  return inFlight.has(key);
}

export function stopTurn(key: string): void {
  inFlight.get(key)?.abort();
}

let geminiTransport: ReturnType<typeof createGeminiTransport> | null = null;
let liveSession: ReturnType<typeof createLiveSession> | null = null;

/**
 * Has anything asked the laptop yet? `/chat` probes on mount; a panel can be
 * the first thing in a session to need an answer, so it asks too — and lists
 * the models, because which machine answers is decided from that list.
 */
let catalogueReady: Promise<void> | null = null;

export function ensureCatalogue(): Promise<void> {
  /* One promise for everyone who asks, and that is the fix for a race that
     was real: the panel asks on open and the Score screen's first question
     asks a tick later, and the second caller used to see `loading` and skip
     straight past an empty list — which resolves to Gemini. */
  catalogueReady ??= (async () => {
    if (useAtlasStore.getState().status === 'unknown') await useAtlasStore.getState().probe();
    const models = useModelStore.getState();
    if (models.local.length === 0 && models.hosted.length === 0) await models.refresh();
  })().finally(() => {
    catalogueReady = null;
  });
  return catalogueReady;
}

/**
 * Who answers the next turn, in the words the empty panel prints — or `null`
 * while that is not known yet. Before the laptop has been asked, the
 * selector falls through to Gemini on an empty list, and printing that would
 * name a machine the turn is not going to run on.
 */
export function whoAnswers(): string | null {
  const models = useModelStore.getState();
  const atlas = useAtlasStore.getState();
  if (atlas.status === 'unknown' || models.loading) return null;
  const model = selectEffectiveModel(models);
  if (model.provider === 'ollama') {
    return atlas.status === 'awake' ? `${model.label}, on the laptop` : `${model.label} — the laptop is not answering`;
  }
  /* BUILD-12: Downshift sends a Gemini pick to the laptop, which runs its
     own default model instead. */
  if (routesToAtlas(model, atlas.status, atlas.baseUrl, downshiftOn(atlas.health))) {
    return `${atlas.health?.defaultModel ?? 'The local model'}, on the laptop — Downshift is on`;
  }
  return `${model.label}, in this browser`;
}

export interface SendOptions {
  /** `fill` is `/scoring`: writes are held and read as fields. */
  mode: 'auto' | 'fill';
  /** False for the panel's own messages (the Score screen's opener and nudges). */
  shown: boolean;
}

/** Everything he types, taps or picks goes through here. */
export function sendMessage(subject: PanelSubject, text: string, options: SendOptions): void {
  void runTurn(subject, text, options);
}

const scoringStarted = new Set<string>();

/** `/scoring`'s opener: asked once per task, when the panel first opens on it. */
export function startScoring(subject: PanelSubject, missing: ScoreField[]): void {
  const key = subjectKey(subject.ref);
  if (scoringStarted.has(key) || (usePanelStore.getState().sessions[key]?.items.length ?? 0) > 0) return;
  scoringStarted.add(key);
  void runTurn(subject, scoreKickoff(subject, missing), { mode: 'fill', shown: false }, true);
}

async function runTurn(subject: PanelSubject, text: string, options: SendOptions, prefaced = false): Promise<void> {
  const key = subjectKey(subject.ref);
  const message = text.trim();
  if (message === '' || inFlight.has(key)) return;

  const controller = new AbortController();
  inFlight.set(key, controller);
  const turn = nextId('turn');
  const fill = options.mode === 'fill';
  const timezone = resolveUserTimeZone();

  patchSession(key, (s) => ({
    ...s,
    items: options.shown ? [...s.items, shownItem(message)] : s.items,
    working: { label: 'Working' },
    nudges: options.shown ? 0 : s.nudges,
  }));

  /* The answer streams into one `ai` item until something else is said —
     a tool result, a question — and the next words start a new one. */
  let openText: string | null = null;
  const appendText = (delta: string) => {
    if (delta === '') return;
    patchSession(key, (s) => {
      if (openText !== null) {
        return {
          ...s,
          working: s.working && { label: 'Writing' },
          items: s.items.map((item) =>
            item.id === openText && item.kind === 'ai' ? { ...item, text: item.text + delta } : item,
          ),
        };
      }
      openText = nextId('ai');
      return { ...s, working: s.working && { label: 'Writing' }, items: [...s.items, { kind: 'ai', id: openText, text: delta }] };
    });
  };

  const onToolCall = (call: AgentToolCall) => {
    openText = null;
    /* A held write arrives here too, on both paths, and AT THE MOMENT it was
       asked for — which is where its fill belongs. Atlas's own `held` event
       only comes at the end of the turn, after the next question has already
       been written, so a fill drawn from that one lands below the question
       it answered. */
    if ((call.data as { held?: boolean } | undefined)?.held) {
      if (fill) applyHeld([{ name: call.name, args: call.args, description: '' }]);
      return;
    }
    const did = didFromToolCall(call, timezone, new Date());
    if (did === null) {
      patchSession(key, (s) => ({ ...s, working: { label: 'Reading', tool: call.name } }));
      return;
    }
    patchSession(key, (s) => ({
      ...s,
      working: { label: 'Working', tool: call.name },
      items: [...s.items, { kind: 'did', id: nextId('did'), did, turn }],
    }));
  };

  let filledThisTurn = 0;
  let askedThisTurn = false;
  /* Each held call is applied once, whichever of its two reports arrives
     first — the tool event, or the end-of-turn list (and on the fallback, the
     wrapped tool itself). Keyed by what was asked, not by arrival. */
  const applied = new Set<string>();
  const applyHeld = (calls: AtlasHeldCall[]) => {
    openText = null;
    for (const call of calls) {
      const seen = `${call.name}:${JSON.stringify(call.args)}`;
      if (applied.has(seen)) continue;
      applied.add(seen);
      const { patch, filled } = fillsFromHeldCall(call, subject.ref.id, new Date(), timezone);
      const host = fillHosts.get(key);
      if (filled.length === 0 || !host) {
        pushItem(key, {
          kind: 'note',
          id: nextId('note'),
          tone: 'quiet',
          text: `Not done: ${call.name}. On this screen the answers only fill the fields — nothing else is changed.`,
        });
        continue;
      }
      host.apply(patch);
      filledThisTurn += fieldsInPatch(patch).length;
      for (const row of filled) pushItem(key, { kind: 'filled', id: nextId('filled'), ...row });
    }
  };

  try {
    await ensureCatalogue();
    const model = selectEffectiveModel(useModelStore.getState());
    const atlas = useAtlasStore.getState();
    const onAtlas = routesToAtlas(model, atlas.status, atlas.baseUrl, downshiftOn(atlas.health));

    if (model.provider === 'ollama' && !onAtlas) {
      pushItem(key, {
        kind: 'note',
        id: nextId('note'),
        tone: 'error',
        text: `${model.label} runs on your laptop, and Atlas is not answering. Wake the laptop, or pick a Gemini model on the chat screen.`,
      });
      return;
    }

    const userMessage = prefaced ? message : withPreface(subject, message);
    const session = usePanelStore.getState().sessions[key] ?? EMPTY_SESSION;

    if (onAtlas && atlas.baseUrl !== null) {
      const baseUrl = atlas.baseUrl;
      const result = await runAtlasTurn({
        baseUrl,
        userMessage,
        history: session.history,
        model: atlasModelId(model),
        timezone,
        conversationId: session.conversationId,
        /* Ask-first holds every write with its arguments intact, which is
           exactly a fill. Auto everywhere else: the panel's own contract is
           that a reversible change applies and offers Undo. */
        mode: fill ? 'ask' : 'auto',
        effort: 'some',
        signal: controller.signal,
        onConversation: (id) => patchSession(key, (s) => ({ ...s, conversationId: id })),
        onTextDelta: appendText,
        onThinking: () => patchSession(key, (s) => ({ ...s, working: s.working && { ...s.working, label: 'Thinking' } })),
        onToolCall,
        onAsk: (card) => {
          openText = null;
          askedThisTurn = true;
          pushItem(key, { kind: 'ask', id: nextId('ask'), card });
        },
        onHeld: (_mode, calls) => {
          if (fill) applyHeld(calls);
        },
        onApproval: (approval) => {
          openText = null;
          pushItem(key, {
            kind: 'approve',
            id: nextId('approve'),
            approvalId: approval.id,
            title: approval.preview,
            hard: approval.kind !== 'delete',
            note:
              approval.kind === 'delete'
                ? 'Goes to the Trash with everything in it. Revert on the Log screen brings it back.'
                : 'This cannot be undone.',
            state: 'waiting',
          });
        },
        onNotice: (notice) => pushItem(key, { kind: 'note', id: nextId('note'), tone: 'quiet', text: notice }),
        onMonthlyCeiling: (report) =>
          pushItem(key, {
            kind: 'note',
            id: nextId('note'),
            tone: 'error',
            text: `This month has reached its ₹${report.limit} ceiling, so nothing ran. The chat screen can run it past the ceiling.`,
          }),
      });

      patchSession(key, (s) => ({
        ...s,
        history: result.history,
        conversationId: result.conversationId ?? s.conversationId,
        undos: s.items.some((item) => item.kind === 'did' && item.turn === turn && item.did.ok)
          ? {
              ...s.undos,
              [turn]: result.logTurnId
                ? { status: 'ready', via: 'atlas', logTurnId: result.logTurnId }
                : { status: 'unavailable', reason: 'This Atlas keeps no log, so the Trash is the way back.' },
            }
          : s.undos,
      }));

      /* The chat list on the laptop names a chat after its first message,
         which here starts with the bracketed subject line. Renamed once,
         after the subject, which is his call (2026-09-16). */
      const after = usePanelStore.getState().sessions[key];
      if (after && !after.titled && after.conversationId) {
        patchSession(key, (s) => ({ ...s, titled: true }));
        void patchConversation(baseUrl, after.conversationId, { title: subject.chatTitle }).catch(() => {
          patchSession(key, (s) => ({ ...s, titled: false }));
        });
      }
    } else {
      geminiTransport ??= createGeminiTransport({ getApiKey: getActiveApiKey });
      liveSession ??= createLiveSession({ timezone });
      const result = await runAgentTurn({
        userMessage,
        history: session.history,
        transport: geminiTransport,
        model: model.id,
        session: liveSession,
        tools: fill ? holdingTools(fallbackTools, (call) => applyHeld([call])) : undefined,
        signal: controller.signal,
        onTextDelta: appendText,
        onToolCall,
      });
      patchSession(key, (s) => ({
        ...s,
        history: result.history,
        undos: result.turnId ? { ...s.undos, [turn]: { status: 'ready', via: 'ring', snapshotTurnId: result.turnId } } : s.undos,
      }));
    }
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    if (!(err instanceof AtlasMonthlyCeilingReached)) {
      pushItem(key, {
        kind: 'note',
        id: nextId('note'),
        tone: aborted ? 'quiet' : 'error',
        text: aborted
          ? 'Stopped. Anything already done is still done.'
          : err instanceof Error
            ? err.message
            : String(err),
      });
    }
  } finally {
    inFlight.delete(key);
    patchSession(key, (s) => ({ ...s, working: null }));
  }

  /*
   * THE SCORE SCREEN KEEPS ASKING.
   *
   * A held write ends Atlas's turn — Ask-first tells the model to stop and say
   * what it is waiting on — so a fill would otherwise leave the panel silent
   * with three fields still empty. One hidden nudge per fill carries it on,
   * and never more than four in a row without him saying something: a model
   * that fills and never asks must not talk to itself for ever.
   */
  if (fill && filledThisTurn > 0 && !askedThisTurn && !controller.signal.aborted) {
    const host = fillHosts.get(key);
    const missing = host?.missing() ?? [];
    const nudges = usePanelStore.getState().sessions[key]?.nudges ?? 0;
    if (missing.length > 0 && nudges < 4) {
      patchSession(key, (s) => ({ ...s, nudges: s.nudges + 1 }));
      void runTurn(subject, scoreContinue(subject, missing), { mode: 'fill', shown: false }, true);
    }
  }
}

// ─── Undo and approval ──────────────────────────────────────────────────────

export async function undoTurn(key: string, turn: string): Promise<void> {
  const state = usePanelStore.getState().sessions[key]?.undos[turn];
  if (!state || state.status !== 'ready') return;
  patchSession(key, (s) => ({ ...s, undos: { ...s.undos, [turn]: { status: 'busy' } } }));

  let result: UndoState;
  if (state.via === 'ring') {
    const reverted = useSnapshotStore.getState().revertTurn(state.snapshotTurnId);
    result = reverted.ok ? { status: 'done', summary: reverted.summary } : { status: 'unavailable', reason: reverted.summary };
  } else {
    const baseUrl = useAtlasStore.getState().baseUrl;
    try {
      if (baseUrl === null) throw new Error('Atlas is not configured here.');
      const reverted = await revertLogTurn(baseUrl, state.logTurnId);
      result = reverted.ok ? { status: 'done', summary: reverted.summary } : { status: 'unavailable', reason: reverted.summary };
    } catch (err) {
      // A failure leaves it undoable: a tap that did not work must not read as one that did.
      patchSession(key, (s) => ({ ...s, undos: { ...s.undos, [turn]: state } }));
      pushItem(key, {
        kind: 'note',
        id: nextId('note'),
        tone: 'error',
        text: `Could not undo: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
  }
  patchSession(key, (s) => ({ ...s, undos: { ...s.undos, [turn]: result } }));
}

export async function decide(key: string, itemId: string, decision: 'approve' | 'discard'): Promise<void> {
  const item = usePanelStore.getState().sessions[key]?.items.find((i) => i.id === itemId);
  const baseUrl = useAtlasStore.getState().baseUrl;
  if (!item || item.kind !== 'approve' || item.state !== 'waiting' || baseUrl === null) return;

  const setItem = (next: Partial<Extract<PanelItem, { kind: 'approve' }>>) =>
    patchSession(key, (s) => ({
      ...s,
      items: s.items.map((i) => (i.id === itemId && i.kind === 'approve' ? { ...i, ...next } : i)),
    }));

  setItem({ state: 'deciding' });
  try {
    const answer = await decideApproval(baseUrl, item.approvalId, decision);
    setItem({ state: decision === 'approve' ? 'yes' : 'no', done: answer.summary });
  } catch (err) {
    setItem({ state: 'waiting' });
    pushItem(key, {
      kind: 'note',
      id: nextId('note'),
      tone: 'error',
      text: `Still waiting — that did not go through: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
