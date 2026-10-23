/**
 * Types for the generated `lookup.js` — `../atlas/src/lookup/remote.ts` is the
 * source and the place to change anything; `npm run build:atlas` bundles it.
 * Written by hand for the reason given at the top of `pushRun.d.ts`.
 */
export interface FetchedPage {
  finalUrl: string;
  status: number;
  contentType: string;
  body: string;
  truncated: boolean;
}

export interface SearchPage {
  hits: { title: string; url: string; snippet: string }[];
  page: number;
  more: boolean;
}

export type RemoteRead = { ok: true; page: FetchedPage } | { ok: false; refused: string };
export type RemoteSearch = { ok: true; results: SearchPage } | { ok: false; unavailable: string };

export function readForRemote(url: string): Promise<RemoteRead>;

export function searchForRemote(query: string, page: number, apiKey: string | undefined): Promise<RemoteSearch>;
