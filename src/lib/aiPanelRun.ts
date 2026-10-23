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
  decideApproval,
  patchConversation,
  revertLogTurn,
  runAtlasTurn,
  type AtlasHeldCall,
} from './atlas/client';
import { useAtlasStore } from './atlas/atlasStore';
import { atlasModelId, cloudRoutingOf, routesToAtlas } from './atlas/routing';
import { atlasApiKey } from './agent/apiKeys';
import { resolveUserTimeZone } from './agent/dates';
import { selectEffectiveModel, useModelStore } from './agent/modelStore';
import type { AgentMessage, AgentToolCall } from './agent/types';
import { auth } from './firebase';
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
import { rememberedNotes } from './atlas/remembered';
import { cue } from './sound';

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
  /** A note Atlas saved this turn (29-1P15b, idea 94): "Remembered", which opens it. */
  | { kind: 'remembered'; id: string; path: string }
  /** Something the panel itself has to say: a failure, or a fact about the turn. */
  | { kind: 'note'; id: string; text: string; tone: 'error' | 'quiet' };

export type UndoState =
  | { status: 'ready'; via: 'atlas'; logTurnId: string }
  /* BIG-12: a turn Atlas ran in this page. Reverted from the cloud copy of its
     log, by Atlas in this page — the retired basic assistant's ring is gone. */
  | { status: 'ready'; via: 'here'; logTurnId: string; uid: string }
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
  /* 29-1P3: every error note here answers something he pressed — a send, an
     undo, an approval — so each one sounds. */
  if (item.kind === 'note' && item.tone === 'error') cue('error');
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

// ─── Running a turn ─────────────────────────────────────────────────────────

const inFlight = new Map<string, AbortController>();

export function isRunning(key: string): boolean {
  return inFlight.has(key);
}

export function stopTurn(key: string): void {
  inFlight.get(key)?.abort();
}

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
/** BIG-1: the cloud half of the rule, as the chat computes it. */
function panelOnAtlas(model: ReturnType<typeof selectEffectiveModel>, atlas: ReturnType<typeof useAtlasStore.getState>): boolean {
  return routesToAtlas(
    model,
    atlas.status,
    atlas.baseUrl,
    cloudRoutingOf(atlas.health, atlasApiKey('gemini') !== null),
  );
}

export function whoAnswers(): string | null {
  const models = useModelStore.getState();
  const atlas = useAtlasStore.getState();
  if (atlas.status === 'unknown' || models.loading) return null;
  const model = selectEffectiveModel(models);
  if (model.provider === 'ollama') {
    return atlas.status === 'awake' ? `${model.label}, on the laptop` : `${model.label} — the laptop is not answering`;
  }
  /* BIG-1: a cloud pick with everything Atlas has, run from the laptop. */
  if (panelOnAtlas(model, atlas)) return `${model.label}, through the laptop`;
  /* BIG-12 (27A-5): anything else is Atlas in this page — the basic
     assistant it used to be is retired. */
  return auth.currentUser !== null ? `${model.label}, Atlas on this device` : 'Sign in to talk to Atlas';
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

  /* 29-1P15b, idea 94: the notes this turn saved, shown as "Remembered"
     under the reply once the turn is over. */
  const savedNotes: string[] = [];

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
    for (const path of rememberedNotes([call])) if (!savedNotes.includes(path)) savedNotes.push(path);
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
    const onAtlas = panelOnAtlas(model, atlas);

    if (model.provider === 'ollama' && !onAtlas) {
      pushItem(key, {
        kind: 'note',
        id: nextId('note'),
        tone: 'error',
        text: `${model.label} runs on your laptop, and Atlas is not answering. Wake the laptop, or pick Gemini, Claude or ChatGPT on the chat screen.`,
      });
      return;
    }
    /* BIG-12 (27A-5): a pick the laptop does not take runs on Atlas in this
       page, which needs an account to read and write his memory with. */
    const uid = onAtlas ? null : (auth.currentUser?.uid ?? null);
    if (!onAtlas && uid === null) {
      pushItem(key, { kind: 'note', id: nextId('note'), tone: 'error', text: 'Sign in to talk to Atlas.' });
      return;
    }

    const userMessage = prefaced ? message : withPreface(subject, message);
    const session = usePanelStore.getState().sessions[key] ?? EMPTY_SESSION;

    {
      const baseUrl = onAtlas ? atlas.baseUrl : null;
      /* The same options for either machine (BIG-12): the laptop's Atlas over
         the wire, or Atlas in this page, loaded only when it is needed. */
      const options: Omit<Parameters<typeof runAtlasTurn>[0], 'baseUrl'> = {
        userMessage,
        history: session.history,
        model: atlasModelId(model),
        /* BIG-1: the key for a cloud pick; Atlas keeps it nowhere. */
        apiKey: model.provider === 'ollama' ? null : atlasApiKey(model.provider),
        timezone,
        conversationId: session.conversationId,
        /* Ask-first holds every write with its arguments intact, which is
           exactly a fill. Auto everywhere else: the panel's own contract is
           that a reversible change applies and offers Undo. */
        mode: fill ? 'ask' : 'auto',
        /* OPT-8 — Max, as in the chat: thinking has no dial any more. */
        effort: 'hard',
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
      };
      const result =
        baseUrl !== null
          ? await runAtlasTurn({ baseUrl, ...options })
          : await (await import('./atlas/engine/runTabletAtlasTurn')).runTabletAtlasTurn({ ...options, uid: uid as string });

      patchSession(key, (s) => ({
        ...s,
        history: result.history,
        conversationId: result.conversationId ?? s.conversationId,
        undos: s.items.some((item) => item.kind === 'did' && item.turn === turn && item.did.ok)
          ? {
              ...s.undos,
              [turn]: !result.logTurnId
                ? { status: 'unavailable', reason: 'This Atlas keeps no log, so the Trash is the way back.' }
                : baseUrl !== null
                  ? { status: 'ready', via: 'atlas', logTurnId: result.logTurnId }
                  : { status: 'ready', via: 'here', logTurnId: result.logTurnId, uid: uid as string },
            }
          : s.undos,
      }));

      /* The chat list on the laptop names a chat after its first message,
         which here starts with the bracketed subject line. Renamed once,
         after the subject, which is his call (2026-09-16). */
      const after = usePanelStore.getState().sessions[key];
      if (baseUrl !== null && after && !after.titled && after.conversationId) {
        patchSession(key, (s) => ({ ...s, titled: true }));
        void patchConversation(baseUrl, after.conversationId, { title: subject.chatTitle }).catch(() => {
          patchSession(key, (s) => ({ ...s, titled: false }));
        });
      }
    }
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
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
  } finally {
    inFlight.delete(key);
    /* After the reply, and even after a Stop: a note saved before it is saved. */
    for (const path of savedNotes) pushItem(key, { kind: 'remembered', id: nextId('remembered'), path });
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
  {
    const baseUrl = useAtlasStore.getState().baseUrl;
    try {
      let reverted: { ok: boolean; summary: string };
      if (state.via === 'here') {
        // Today in his zone: the log files a turn under the day it ran, and a panel turn is minutes old.
        const day = new Intl.DateTimeFormat('en-CA', { timeZone: resolveUserTimeZone() }).format(new Date());
        reverted = await (await (await import('./atlas/engine/tabletAtlas')).tabletAtlas(state.uid)).revert(state.logTurnId, day);
      } else {
        if (baseUrl === null) throw new Error('Atlas is not configured here.');
        reverted = await revertLogTurn(baseUrl, state.logTurnId);
      }
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
  const atlas = useAtlasStore.getState();
  const baseUrl = atlas.status === 'awake' ? atlas.baseUrl : null;
  const uid = auth.currentUser?.uid ?? null;
  if (!item || item.kind !== 'approve' || item.state !== 'waiting' || (baseUrl === null && uid === null)) return;

  const setItem = (next: Partial<Extract<PanelItem, { kind: 'approve' }>>) =>
    patchSession(key, (s) => ({
      ...s,
      items: s.items.map((i) => (i.id === itemId && i.kind === 'approve' ? { ...i, ...next } : i)),
    }));

  setItem({ state: 'deciding' });
  try {
    /* BIG-12 (27A-3): with the laptop away, Atlas in this page decides. */
    const answer =
      baseUrl !== null
        ? await decideApproval(baseUrl, item.approvalId, decision)
        : await (async () => {
            const here = await (await import('./atlas/engine/tabletAtlas')).tabletAtlas(uid as string);
            const done = decision === 'approve' ? await here.approve(item.approvalId) : await here.discard(item.approvalId);
            if (done.approval?.state === 'waiting' || (!done.ok && done.approval === null)) throw new Error(done.summary);
            return done;
          })();
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
