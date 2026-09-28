import type { Project, Task, TaskList } from '../../store/useStore';
import type { TurnHandle } from '../../store/useSnapshotStore';
import type { RestoreResult, TrashEntry } from '../trashModel';

/**
 * The agent's action surface and its conversation vocabulary, described once in
 * plain TypeScript and shared by every transport (decision D10). Nothing in
 * this file — or in `tools/` — knows that a model exists, and nothing in it
 * knows *whose* model: a `ToolDef` is a JSON-schema declaration plus an
 * ordinary async function, and an `AgentMessage` is a role plus parts. The
 * shapes a particular vendor puts on the wire live in `providers/`, and only
 * the adapter there ever names them.
 */

// ─── Tool schemas ───────────────────────────────────────────────────────────

/**
 * Ordinary JSON Schema, lowercase as the specification writes it. Gemini wants
 * these uppercased and inside its own `Schema`; that is one line in
 * `providers/gemini.ts` and nothing this side of it has to care.
 */
export type JsonSchemaType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';

export interface JsonSchema {
  type: JsonSchemaType;
  description?: string;
  /** Restricts a `string` to a fixed set. */
  enum?: string[];
  /** Element schema for an `array`. */
  items?: JsonSchema;
  /** Field schemas for an `object`. */
  properties?: Record<string, JsonSchema>;
  required?: string[];
}

/** One tool, as a model is told about it. `tools/index.ts` derives these from the registry. */
export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: JsonSchema;
}

// ─── Conversation shapes ────────────────────────────────────────────────────

/**
 * The neutral message shape `core.ts` speaks. Every provider's wire format is
 * a translation of this, made at the edge — see `providers/gemini.ts` for the
 * only one that exists today.
 */

/** A model asking for a tool. `id` is present when it parallel-calls, and pairs the result back up. */
export interface ToolCall {
  id?: string;
  name: string;
  args: Record<string, unknown>;
}

export interface TextPart {
  type: 'text';
  text: string;
}

/**
 * A local model's reasoning, carried through history (item 12, `../../atlas`
 * DESIGN.md §3.3).
 *
 * **Nothing in this app produces one.** The in-browser fallback runs on
 * Gemini, whose thoughts are an opaque `thoughtSignature` replayed through
 * `providerData` rather than text — so this part only ever *arrives*, in the
 * history Atlas hands back on `done`, from a turn that ran on a local model on
 * the laptop.
 *
 * It is here because that history is typed with these shapes and read by
 * `lib/atlas/transcript.ts`, which is what draws a reopened conversation. A
 * union that did not know about it would either drop the reasoning silently or
 * fail to compile the moment anything looked at a part's `type` — and the
 * second is what actually happened, which is how this comment came to be
 * written.
 */
export interface ThinkingPart {
  type: 'thinking';
  text: string;
}

export interface ToolCallPart extends ToolCall {
  type: 'tool_call';
}

export interface ToolResultPart {
  type: 'tool_result';
  /** Echoes the call's `id`, so a batch of parallel results is unambiguous. */
  id?: string;
  name: string;
  /** What the model reads back. `ToolResult.summary` is written for exactly this moment. */
  result: Record<string, unknown>;
}

export type MessagePart = TextPart | ThinkingPart | ToolCallPart | ToolResultPart;

/**
 * `tool` is its own role here even though Gemini has only two and folds it
 * into `user`. Ollama and the OpenAI-shaped APIs do have it, and collapsing
 * roles is a translation an adapter can make; inventing one back is not.
 */
export type MessageRole = 'user' | 'assistant' | 'tool';

/**
 * A provider's own rendering of a message, carried through history untouched.
 *
 * This exists for one reason: Gemini attaches an opaque `thoughtSignature` to
 * the parts it produced while reasoning, and it has to come back **unaltered**
 * on the next request or the whole conversation is rejected. Rebuilding an
 * assistant turn from `parts` would drop it. So the adapter stows what it
 * actually received here and replays that verbatim, and `parts` stays the
 * readable version the rest of the app works from.
 *
 * `provider` is checked before `raw` is trusted: a history that started on one
 * model and continued on another is a normal thing to want, and the second
 * provider must rebuild from `parts` rather than replay a shape it cannot read.
 */
export interface ProviderData {
  /** The adapter that minted `raw`, e.g. `gemini`. */
  provider: string;
  raw: unknown;
}

export interface AgentMessage {
  role: MessageRole;
  parts: MessagePart[];
  providerData?: ProviderData;
}

/**
 * Token counts, summed across every round trip in a turn. Capturing this was a
 * stated reason for going to the direct API (D7), so it is a first-class return
 * value rather than a log line. A provider that does not report a given number
 * reports zero for it.
 */
export interface TokenUsage {
  promptTokens: number;
  responseTokens: number;
  /** Reasoning tokens, where the provider bills them as output and counts them separately. */
  thoughtsTokens: number;
  totalTokens: number;
  /** Model round trips this turn took. */
  requests: number;
}

// ─── Transports ─────────────────────────────────────────────────────────────

export interface TransportRequest {
  model: string;
  systemPrompt: string;
  messages: AgentMessage[];
  /** Empty means "answer in words" — the transport must then declare no tools at all. */
  tools: ToolDeclaration[];
}

export interface TransportEvents {
  /** Fired as answer text arrives, so a UI can render before the turn ends. */
  onTextDelta?: (delta: string) => void;
  signal?: AbortSignal;
}

export interface TransportResponse {
  /** The model's visible answer this round trip, thinking parts excluded. */
  text: string;
  toolCalls: ToolCall[];
  /** The model's turn exactly as it must be appended to history. */
  message: AgentMessage;
  usage: TokenUsage;
  /** `STOP`, `MAX_TOKENS`, `SAFETY`… Reported, not interpreted. */
  finishReason?: string;
}

/**
 * One agent core, many transports (decision D10). `transports/geminiTransport.ts`
 * posts to `api/chat.ts` or straight to Google; Step 8's Live path will drive a
 * WSS session, and item 6's Ollama transport talks to `localhost`. All of them
 * are handed the same system prompt and the same tool declarations, and all of
 * them hand back the same shape, so `core.ts` never learns which one it is
 * talking to — or whose model is on the other end.
 */
export interface AgentTransport {
  /** For logs and error messages, e.g. `gemini`. */
  readonly name: string;
  send(request: TransportRequest, events?: TransportEvents): Promise<TransportResponse>;
}

// ─── Turns ──────────────────────────────────────────────────────────────────

/** One executed tool call, as the UI and the console transcript report it. */
export interface AgentToolCall {
  name: string;
  args: ToolArgs;
  ok: boolean;
  summary: string;
  data?: unknown;
  durationMs: number;
}

export interface AgentTurn {
  /** The final answer to show the user. */
  text: string;
  toolCalls: AgentToolCall[];
  /**
   * The snapshot turn this wrote into (`useSnapshotStore`), or `null` when the
   * turn only answered a question and touched nothing revertible.
   */
  turnId: string | null;
  usage: TokenUsage;
  /** History including this turn's user message, model turns and tool results. Feed it back in next time. */
  history: AgentMessage[];
  /** True when the loop hit `MAX_TOOL_ITERATIONS` and was forced to answer. */
  stoppedAtIterationLimit: boolean;
}

// ─── Tools ──────────────────────────────────────────────────────────────────

/** Whatever the model sent. Never trusted; validated in `toolKit.ts`. */
export type ToolArgs = Record<string, unknown>;

export interface ToolResult {
  /** False means the call did not do what was asked. `summary` says why. */
  ok: boolean;
  /**
   * One or two sentences, written to be read *by the model* on the next turn:
   * it is what the agent will paraphrase back to the user, so it must state
   * what actually happened including any defaulting or truncation.
   */
  summary: string;
  /** Structured payload. Kept deliberately small — this is context budget. */
  data?: unknown;
}

/**
 * The slice of the app store the tools read and write. An interface rather
 * than a direct `useStore` import so the whole layer can be driven against an
 * in-memory fake (see `tools/scratch.ts`) with no Zustand, React or browser in
 * the picture. `liveContext.ts` wires the real store to this.
 */
export interface AgentStoreState {
  projects: Project[];
  taskLists: TaskList[];
  /** Canonical task storage (decision D15). */
  backlogTasks: Task[];
  /** The "Selected for Today" focus queue — membership only, see `tools/queueTools.ts`. */
  tasks: Task[];
}

export interface AgentStore {
  getState(): AgentStoreState;
  /**
   * Inserts an already-formed task, newest first, exactly where
   * `useStore.addBacklogTask` puts one. Takes the whole object rather than
   * `(title, listId)` because the caller has to mint the id *before* the write
   * in order to snapshot it (see the capture rule in `tools/index.ts`).
   */
  addBacklogTask(task: Task): void;
  updateBacklogTask(id: string, updates: Partial<Task>): void;
  /** For a row that lives only in the focus queue (`useStore.updateTask`). */
  updateFocusTask(id: string, updates: Partial<Task>): void;
  setFocusQueue(tasks: Task[]): void;
  /**
   * The two container updates, added at item 13 for `tools/shareTools.ts`.
   *
   * A share link can point at a task, a list or a project, and publishing one
   * is a single field on whichever it is. They are the plain store actions.
   */
  updateTaskList(id: string, updates: Partial<TaskList>): void;
  updateProject(id: string, updates: Partial<Project>): void;

  /**
   * The project and list surface, BUILD-3 (`tools/boardTools.ts`).
   *
   * The two creators take a whole record for the reason `addBacklogTask` does:
   * the tool mints the id so it can snapshot "this did not exist" before the
   * write. `renameTaskList` is not `updateTaskList({ title })` — the store's
   * rename also refreshes the `listName` fallback every task in the list
   * carries, which is what the Rename field on the board does.
   */
  addProject(project: Project): void;
  addTaskList(list: TaskList): void;
  renameTaskList(id: string, title: string): void;
  /**
   * `useStore.deleteProject` / `deleteTaskList`, which are `applyDeletion` —
   * the same path and the same rule as `deleteBacklogTask` below. A project
   * takes its lists and every task in them into ONE Trash entry, and a caller
   * must not clean up after it.
   */
  deleteProject(id: string): void;
  deleteTaskList(id: string): void;

  /**
   * Soft delete, item 9 — and the whole reason decision D3 could be reversed.
   *
   * This is `useStore.deleteBacklogTask`, which is `applyDeletion`, which
   * cascades through the subtree, records a Trash entry good for thirty days
   * and announces the deletion to `deletionEffects`. **A caller must not clean
   * up after it** (CLAUDE.md): the focus-queue row, the subtask-proxy row,
   * other tasks' `dependsOn`, the `sharedListIds` cross-links, the
   * `publicShares/{id}` document and the Calendar reminder are all handled
   * there, and hand-rolling any of it re-creates the bug that path exists to
   * fix.
   */
  deleteBacklogTask(id: string): void;
  /** The Trash, as the panel shows it. Read-only — deleting is what fills it. */
  trashEntries(): TrashEntry[];
  /** Puts an entry back and clears it from the Trash. `null` when it is gone. */
  restoreFromTrash(entryId: string): RestoreResult | null;
}

/** The capture half of `useSnapshotStore`, injectable for the same reason. */
export interface SnapshotCapture {
  captureTask(handle: TurnHandle, taskId: string): void;
  captureList(handle: TurnHandle, listId: string): void;
  captureProject(handle: TurnHandle, projectId: string): void;
}

export interface ToolContext {
  /** The turn currently being snapshotted. Every mutating tool captures into it before writing (D6). */
  snapshotHandle: TurnHandle;
  /**
   * True when this call should look up what it *would* do and write nothing
   * (item 13, DESIGN.md §5.2).
   *
   * Only a front-door tool reads it, and only the MCP host ever sets it: it is
   * what fills an approval card with a sentence the tool wrote rather than one
   * Atlas guessed. **A tool that ignores it is still safe** — the host runs a
   * preview through the read-only path that never flushes, so an unflushed
   * mutation is discarded by the next call's re-hydrate. The flag is what
   * makes the *summary* honest, not what makes the preview safe.
   */
  preview?: boolean;
  /**
   * The turn's wall clock. Every date decision resolves against this and
   * `timezone`, never `Date.now()` or the host's zone (decision D14).
   */
  now: Date;
  /** IANA zone, e.g. `Asia/Kolkata`. */
  timezone: string;
  store: AgentStore;
  snapshots: SnapshotCapture;
}

export interface ToolDef {
  name: string;
  /** Written for a model: when to call it, and when not to. This is context — keep it tight. */
  description: string;
  parametersSchema: JsonSchema;
  /** True when the tool writes. Mutating tools must capture a snapshot first. */
  mutates: boolean;
  /**
   * True when the act cannot be undone and needs one tap from the user
   * (item 13, DESIGN.md §5.2).
   *
   * Two acts qualify because they cannot be undone: sending mail to a person,
   * and publishing a public share link. **BUILD-3 added a second reason**:
   * deleting a project or a list, which CAN be undone — it is soft, into the
   * Trash, and Revert on `/log` puts it back — but takes a whole project's
   * tasks with it in one call. Shreekant chose a tap for those
   * (2026-09-16). `tools/index.ts` holds both name lists, and its
   * `frontDoorKindOf` is what tells Atlas which of the two a tool is.
   *
   * It rides to Atlas in the tool's MCP `_meta`, where `frontDoorToolset.ts`
   * turns the call into an approval instead of an act. **Setting this is the
   * whole of what makes a tool irreversible-safe** — `tools/index.ts` throws
   * at import if a listed name is registered without it.
   */
  frontDoor?: boolean;
  execute(args: ToolArgs, ctx: ToolContext): Promise<ToolResult>;
}
