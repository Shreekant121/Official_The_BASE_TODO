/** Splits pasted/typed multi-line text into individual non-empty, trimmed item titles. Shared by every bulk-creation entry point (tasks, lists, projects). */
export function parseBulkLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
