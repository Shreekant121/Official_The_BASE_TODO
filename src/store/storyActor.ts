/**
 * Who is writing right now, for the task's story (29-1P9c) — the same question
 * `undoGate.ts` answers for his undo, asked the other way round.
 *
 * The undo gate is closed both while Atlas's tools run AND while his own undo
 * puts something back, so it cannot say "Atlas did this": an undo is his. The
 * tool server opens this one around a tool call only (not around a Revert from
 * /log, which he pressed), on both hosts — the laptop's `mcp/` and this page.
 *
 * And the story's recorder has a second question: was this write an edit at
 * all? A snapshot adopted from the cloud, or a cover swapped into its own
 * document, changes the backlog without anybody doing anything, and recording
 * it would write the other device's moments a second time. Those few writers
 * say so with `withoutStory`.
 */
let atlas = 0;
let quiet = 0;

export async function asAtlas<T>(run: () => Promise<T>): Promise<T> {
  atlas += 1;
  try {
    return await run();
  } finally {
    atlas -= 1;
  }
}

export function atlasIsWriting(): boolean {
  return atlas > 0;
}

export function withoutStory<T>(run: () => T): T {
  quiet += 1;
  try {
    return run();
  } finally {
    quiet -= 1;
  }
}

export function storyIsQuiet(): boolean {
  return quiet > 0;
}
