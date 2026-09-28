/**
 * Server-sent-event framing, shared by both text transports.
 *
 * Gemini and Anthropic stream different payloads over the identical envelope,
 * so the part that is easy to get subtly wrong — where one event ends — is
 * written once here and the two transports differ only in what they do with
 * the JSON.
 */

// Events are separated by a blank line, and Gemini's are CRLF — splitting on
// "\n\n" finds no boundary at all and the whole stream parses as nothing.
const EVENT_BOUNDARY = /\r?\n\r?\n/;

/**
 * Reads to the end of the stream, calling `onData` once per event with its
 * `data:` payload. Comment lines, `event:` names and heartbeats are dropped:
 * both APIs put everything that matters in `data`, including the event's own
 * type.
 */
export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onData: (payload: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const emit = (event: string) => {
    const payload = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('');
    if (payload !== '' && payload !== '[DONE]') onData(payload);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Anything after the last boundary is a partial event; it stays in the
    // buffer until the rest of it arrives.
    for (let match = EVENT_BOUNDARY.exec(buffer); match; match = EVENT_BOUNDARY.exec(buffer)) {
      emit(buffer.slice(0, match.index));
      buffer = buffer.slice(match.index + match[0].length);
    }
  }
  // A final event with no trailing blank line is legal.
  if (buffer.trim() !== '') emit(buffer);
}
