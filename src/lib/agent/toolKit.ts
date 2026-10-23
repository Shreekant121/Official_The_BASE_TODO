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
  return readArgs(toolName, schema, args).args;
}

function readArgs(toolName: string, schema: JsonSchema, args: ToolArgs, entryList?: string): { args: ToolArgs; lifted: string[] } {
  const declared = schema.properties ?? {};
  const entryFields = entryList !== undefined ? (declared[entryList]?.items?.properties ?? {}) : {};
  const clean: ToolArgs = {};
  const stray: ToolArgs = {};

  for (const [key, value] of Object.entries(args ?? {})) {
    if (!(key in declared)) {
      const plural = pluralOf(key, declared);
      if (plural !== null) {
        if (value === null || value === undefined) continue;
        const already = Array.isArray(clean[plural]) ? (clean[plural] as unknown[]) : [];
        clean[plural] = [...already, ...(Array.isArray(value) ? value : [value])];
        continue;
      }
      if (key in entryFields) {
        if (value !== null && value !== undefined) stray[key] = value;
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

  const lifted = entryList !== undefined ? liftEntryFields(clean, stray, entryList, declared[entryList]) : [];

  for (const key of schema.required ?? []) {
    if (!(key in clean)) throw new ToolArgError(`${toolName} requires "${key}".`);
  }

  return { args: clean, lifted };
}

/**
 * FIX-13 — FIELDS SENT BESIDE THE LIST INSTEAD OF INSIDE IT.
 *
 * A creator takes `{ tasks: [{ title, deadline, … }] }`, and gemma4:e4b sent
 * `{ deadline, emergencyBoost, …, tasks: [{ title }] }` in 3 of 6 turns of
 * FIX-12's check. The old answer was the unknown-key refusal above, which ends
 * *"Accepted parameters: tasks"* — and a 4B model read that as "drop them",
 * retried with the bare title, and the task was made with no deadline while the
 * turn reported success.
 *
 * **One entry in the list: the fields are its**, there is nothing else they
 * could belong to, so they are moved in and the reply says so (`defineTool`
 * appends it). A field also inside the entry with a different value is a
 * contradiction, refused rather than settled by guessing which one he meant.
 * No list at all but a title beside it is the same one entry, written flat.
 *
 * **Several entries: refused, nothing made.** A deadline beside three tasks may
 * be one task's or all three's, and copying it onto every one invents two
 * deadlines — the very thing the tool description forbids. A refusal costs one
 * round trip and names where the fields go; a wrong guess costs his data
 * quietly. It refuses the whole call, not each entry, because the fault is one
 * fact about the arguments (the `update_task` patch rule in `taskTools.ts`).
 */
function liftEntryFields(clean: ToolArgs, stray: ToolArgs, listKey: string, listSchema: JsonSchema | undefined): string[] {
  const fields = Object.keys(stray);
  if (fields.length === 0) return [];

  const titleKey = listSchema?.items?.required?.[0] ?? 'title';
  const named = joinFields(fields);
  const raw = clean[listKey];
  const entries: unknown[] = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];

  if (entries.length === 0) {
    if (!(titleKey in stray)) {
      throw new ToolArgError(`${named} belong inside "${listKey}", one entry each: {"${listKey}": [{"${titleKey}": "…", "${fields[0]}": …}]}.`);
    }
    clean[listKey] = [stray];
    return fields;
  }

  if (entries.length > 1) {
    throw new ToolArgError(
      `${named} ${fields.length === 1 ? 'was' : 'were'} sent beside "${listKey}" rather than inside an entry, and with ` +
        `${entries.length} entries there is no telling which ${fields.length === 1 ? 'it belongs' : 'they belong'} to, so nothing was made. ` +
        `Put each field inside the entry it belongs to: {"${listKey}": [{"${titleKey}": "…", "${fields[0]}": …}, …]}.`,
    );
  }

  const only = entries[0];
  // Anything that is neither a string nor an object is left for the tool's own
  // reader, which names the entry and what it got.
  if (typeof only !== 'string' && (only === null || typeof only !== 'object' || Array.isArray(only))) return [];
  const entry: Record<string, unknown> = typeof only === 'string' ? { [titleKey]: only } : { ...(only as Record<string, unknown>) };

  for (const field of fields) {
    const inside = entry[field];
    if (inside !== undefined && inside !== null && JSON.stringify(inside) !== JSON.stringify(stray[field])) {
      throw new ToolArgError(`"${field}" was sent twice, beside "${listKey}" and inside its entry, with different values. Send it once, inside the entry.`);
    }
    entry[field] = stray[field];
  }
  clean[listKey] = [entry];
  return fields;
}

function joinFields(fields: string[]): string {
  const quoted = fields.map((field) => `"${field}"`);
  return quoted.length === 1 ? quoted[0] : `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`;
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
    // FIX-13: a null inside an entry is an optional left unfilled, as it is at
    // the top level (`validateArgs`). gemma4:e4b sent `"estimatedTime": null`
    // on one task of two, which failed that task with "must be a number".
    return readItem(Object.fromEntries(Object.entries(item).filter(([, value]) => value !== null)), index);
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
 *
 * `entryList` names a creator's list (`tasks`, `steps`): entry fields sent
 * beside it are read as described at `liftEntryFields`, and when they were
 * moved in, the reply says so — to the model, so it nests them next time, and
 * on the chip, so a deadline he did not see typed is not a surprise.
 */
export function defineTool(def: ToolDef, opts?: { entryList?: string }): ToolDef {
  return {
    ...def,
    execute: async (args: ToolArgs, ctx: ToolContext): Promise<ToolResult> => {
      try {
        const read = readArgs(def.name, def.parametersSchema, args, opts?.entryList);
        const result = await def.execute(read.args, ctx);
        if (read.lifted.length === 0 || !result.ok) return result;
        const fields = joinFields(read.lifted);
        return {
          ...result,
          summary:
            `${result.summary} (${fields} ${read.lifted.length === 1 ? 'was' : 'were'} sent beside "${opts?.entryList}" ` +
            `rather than inside it, and ${read.lifted.length === 1 ? 'was' : 'were'} read as that entry's.)`,
          data: { ...((result.data as Record<string, unknown> | undefined) ?? {}), movedIntoEntry: read.lifted },
        };
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        return { ok: false, summary: `${def.name} failed: ${detail}` };
      }
    },
  };
}
