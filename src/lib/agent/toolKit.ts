import type { JsonSchema, ToolArgs, ToolContext, ToolDef, ToolResult } from './types';

/**
 * Shared plumbing every `ToolDef` is built with.
 *
 * Arguments arrive as whatever JSON a model decided to emit, so nothing here
 * trusts its input: `defineTool` validates the call against the tool's own
 * declared schema before `execute` ever runs, and a thrown error becomes an
 * ordinary `{ ok: false }` result. The message a validation failure produces is
 * itself context — the model reads it and retries — so each one says exactly
 * what was wrong and what the accepted values are.
 */

/** Thrown by the readers below. Caught by `defineTool` and returned as `ok: false`. */
export class ToolArgError extends Error {}

function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * ITEM 13D — THE SINGULAR A MODEL REACHES FOR ANYWAY
 *
 * Every tool takes a list now, so the parameter is `taskIds` and not `taskId`.
 * A model that sends the singular is not making a typo — it is describing one
 * task, which is what most calls are about — and rejecting it would cost the
 * exact thing this item exists to remove: a whole round trip, the entire tool
 * menu re-sent, and a fresh think, to learn that an `s` was missing.
 *
 * So a key the schema does not declare is checked once against the plural of
 * itself before it is refused. One rule rather than a table: it catches
 * `taskId`, `subtaskId`, `entryId`, `parentId`, `id`, `task` and `step`
 * without any tool naming its own aliases, and it stays right when a tool is
 * added.
 *
 * **Only the plural is ever declared**, which is the half that matters — the
 * model is told one spelling, and a schema that offered both is how it ends up
 * sending both (the note on `clear` in `taskTools.ts` makes the same argument).
 * This is a landing pad, not a second name.
 */
function pluralOf(key: string, declared: Record<string, JsonSchema>): string | null {
  const plural = `${key}s`;
  return declared[plural]?.type === 'array' ? plural : null;
}

/**
 * Drops nulls (models routinely send `null` for an optional they chose not to
 * fill), rejects keys the schema does not declare, and checks required keys are
 * present. Rejecting unknown keys rather than ignoring them turns a typo like
 * `dead_line` into a correction the model can act on instead of a field that
 * silently never gets written.
 */
export function validateArgs(toolName: string, schema: JsonSchema, args: ToolArgs): ToolArgs {
  const declared = schema.properties ?? {};
  const clean: ToolArgs = {};

  for (const [key, value] of Object.entries(args ?? {})) {
    if (!(key in declared)) {
      const plural = pluralOf(key, declared);
      if (plural !== null) {
        if (value === null || value === undefined) continue;
        const already = Array.isArray(clean[plural]) ? (clean[plural] as unknown[]) : [];
        clean[plural] = [...already, ...(Array.isArray(value) ? value : [value])];
        continue;
      }
      const accepted = Object.keys(declared).join(', ') || 'none';
      throw new ToolArgError(`${toolName} has no parameter "${key}". Accepted parameters: ${accepted}.`);
    }
    if (value === null || value === undefined) continue;
    clean[key] = Array.isArray(clean[key])
      ? [...(clean[key] as unknown[]), ...(Array.isArray(value) ? value : [value])]
      : value;
  }

  for (const key of schema.required ?? []) {
    if (!(key in clean)) throw new ToolArgError(`${toolName} requires "${key}".`);
  }

  return clean;
}

export function requiredString(args: ToolArgs, key: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ToolArgError(`"${key}" must be a non-empty string (got ${typeName(value)}).`);
  }
  return value.trim();
}

export function optionalString(args: ToolArgs, key: string): string | undefined {
  if (!(key in args)) return undefined;
  const value = args[key];
  if (typeof value !== 'string') throw new ToolArgError(`"${key}" must be a string (got ${typeName(value)}).`);
  return value;
}

export function optionalEnum<T extends string>(args: ToolArgs, key: string, allowed: readonly T[]): T | undefined {
  const value = optionalString(args, key);
  if (value === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(value)) {
    throw new ToolArgError(`"${key}" must be one of: ${allowed.join(', ')} (got "${value}").`);
  }
  return value as T;
}

export function optionalBoolean(args: ToolArgs, key: string): boolean | undefined {
  if (!(key in args)) return undefined;
  const value = args[key];
  if (typeof value === 'boolean') return value;
  // Models sometimes stringify booleans; a rejection here costs a whole round trip.
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new ToolArgError(`"${key}" must be true or false (got ${typeName(value)}).`);
}

export function optionalNumber(args: ToolArgs, key: string, opts?: { min?: number; max?: number; integer?: boolean }): number | undefined {
  if (!(key in args)) return undefined;
  const raw = args[key];
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ToolArgError(`"${key}" must be a number (got ${typeName(raw)}).`);
  }
  if (opts?.integer && !Number.isInteger(value)) throw new ToolArgError(`"${key}" must be a whole number.`);
  if (opts?.min !== undefined && value < opts.min) throw new ToolArgError(`"${key}" must be at least ${opts.min}.`);
  if (opts?.max !== undefined && value > opts.max) throw new ToolArgError(`"${key}" must be at most ${opts.max}.`);
  return value;
}

export function optionalStringArray(args: ToolArgs, key: string): string[] | undefined {
  if (!(key in args)) return undefined;
  const value = args[key];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new ToolArgError(`"${key}" must be an array of strings (got ${typeName(value)}).`);
  }
  return (value as string[]).map((item) => item.trim()).filter((item) => item !== '');
}

/**
 * ITEM 13D — THE LIST EVERY TOOL NOW TAKES.
 *
 * Three tolerances, each of them a round trip that does not happen:
 * - **A bare string is one id.** Models stringify a one-element array
 *   constantly, and `"t-ca"` is unambiguous.
 * - **Duplicates collapse**, first occurrence winning. Asking to complete the
 *   same task twice in one call is not an error worth a correction; it is the
 *   model listing something twice.
 * - **The cap is an error, not a truncation.** Silently acting on the first
 *   twenty of thirty ids and reporting success is the failure mode this whole
 *   layer is written against; a refusal that names the cap can be split.
 */
export function requiredStringArray(args: ToolArgs, key: string, opts?: { max?: number; what?: string }): string[] {
  if (!(key in args)) throw new ToolArgError(`"${key}" is required — it takes a list, even for one thing.`);
  const raw = args[key];
  const items = Array.isArray(raw) ? raw : [raw];
  if (items.some((item) => typeof item !== 'string')) {
    throw new ToolArgError(`"${key}" must be a list of strings (got ${typeName(raw)}).`);
  }

  const seen = new Set<string>();
  const values: string[] = [];
  for (const item of items as string[]) {
    const trimmed = item.trim();
    if (trimmed === '' || seen.has(trimmed)) continue;
    seen.add(trimmed);
    values.push(trimmed);
  }

  if (values.length === 0) throw new ToolArgError(`"${key}" was empty. Pass at least one.`);
  const max = opts?.max;
  if (max !== undefined && values.length > max) {
    throw new ToolArgError(
      `"${key}" had ${values.length} ${opts?.what ?? 'entries'} and at most ${max} can be done in one call. Send them in batches of ${max}.`,
    );
  }
  return values;
}

/**
 * The creators' half of the same idea: a list of things to make rather than a
 * list of ids to act on.
 *
 * A plain string in the list is read as `{ [titleKey]: string }`, for the same
 * reason a bare string is read as one id — *"add milk, bread and eggs"* is the
 * shape of most calls, and making the model wrap three words in three objects
 * is three chances to get a nested schema wrong on a 4B model.
 */
export function requiredRecordArray<T>(
  args: ToolArgs,
  key: string,
  titleKey: string,
  readItem: (item: Record<string, unknown>, index: number) => T,
  opts?: { max?: number; what?: string },
): T[] {
  if (!(key in args)) throw new ToolArgError(`"${key}" is required — it takes a list, even for one thing.`);
  const raw = args[key];
  const items = Array.isArray(raw) ? raw : [raw];
  if (items.length === 0) throw new ToolArgError(`"${key}" was empty. Pass at least one.`);

  const max = opts?.max;
  if (max !== undefined && items.length > max) {
    throw new ToolArgError(
      `"${key}" had ${items.length} ${opts?.what ?? 'entries'} and at most ${max} can be done in one call. Send them in batches of ${max}.`,
    );
  }

  return items.map((item, index) => {
    if (typeof item === 'string') return readItem({ [titleKey]: item }, index);
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new ToolArgError(`"${key}"[${index}] must be an object (got ${typeName(item)}).`);
    }
    return readItem(item as Record<string, unknown>, index);
  });
}

/**
 * An array of small records — today only `links` on a task, which is
 * `{ title, url }`.
 *
 * The per-item check is handed in rather than expressed in the schema because
 * a model that gets one item wrong needs to be told *which* item and *which*
 * field; `validateArgs` only reaches the top level, and "links must be an
 * array of objects" is not something a 4B model recovers from reliably.
 */
export function optionalObjectArray<T>(
  args: ToolArgs,
  key: string,
  readItem: (item: Record<string, unknown>, index: number) => T,
): T[] | undefined {
  if (!(key in args)) return undefined;
  const value = args[key];
  if (!Array.isArray(value)) throw new ToolArgError(`"${key}" must be an array (got ${typeName(value)}).`);
  return value.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new ToolArgError(`"${key}"[${index}] must be an object (got ${typeName(item)}).`);
    }
    return readItem(item as Record<string, unknown>, index);
  });
}

/**
 * Wraps a tool so that every call is schema-validated and can never throw at
 * the caller. A tool that throws mid-write still returns a readable failure,
 * which matters because the agent loop feeds `summary` straight back to the
 * model as the function response.
 */
export function defineTool(def: ToolDef): ToolDef {
  return {
    ...def,
    execute: async (args: ToolArgs, ctx: ToolContext): Promise<ToolResult> => {
      try {
        return await def.execute(validateArgs(def.name, def.parametersSchema, args), ctx);
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return { ok: false, summary: `${def.name} failed: ${detail}` };
      }
    },
  };
}
