import { AgentTransportError } from '../../agent/transports/errors';
import { chatBodyOf, readAtlasEvents, type AtlasEvent, type AtlasTurn, type AtlasTurnOptions } from '../client';
import { tabletAtlas } from './tabletAtlas';

/**
 * One turn on Atlas running in this page, with the laptop shut (BIG-12).
 *
 * `runAtlasTurn`'s twin, and deliberately shaped like it: the same options
 * less the laptop's address, the same body, the same events read by the same
 * `readAtlasEvents` — so the chat screen draws a lid-shut turn exactly as it
 * draws one from the laptop, chips, ask cards, held writes, approvals and all.
 *
 * Each event goes through a JSON round trip on its way to the reader. That is
 * the wire's own treatment, and it matters here for one reason the wire hides:
 * the engine hands over live objects, and `done.history` is an array the next
 * turn in the same page would otherwise be able to reach into.
 */
export async function runTabletAtlasTurn(options: Omit<AtlasTurnOptions, 'baseUrl'> & { uid: string }): Promise<AtlasTurn> {
  let engine;
  try {
    engine = await tabletAtlas(options.uid);
  } catch (err) {
    // The engine is a separate download; a tablet that just lost its signal
    // fails here, before anything was asked.
    throw new AgentTransportError('Could not load Atlas on this device. Check the connection and try again.', {
      detail: err instanceof Error ? err.message : String(err),
    });
  }
  const signal = options.signal ?? new AbortController().signal;
  return readAtlasEvents(options, (onEvent) =>
    engine.chat(chatBodyOf(options), (event) => onEvent(JSON.parse(JSON.stringify(event)) as AtlasEvent), signal),
  );
}
