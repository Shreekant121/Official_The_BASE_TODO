/**
 * Dev-only fixture for `/catalog`, used by the screenshot harness
 * (`scripts/screenshots.ts`).
 *
 * WHY THIS EXISTS
 * ---------------
 * Every file on that screen is a Markdown file on Shreekant's laptop, fetched
 * from Atlas over Tailscale, and the harness aborts everything off its own
 * origin. Without this there is exactly one photographable state — "the laptop
 * is asleep" — and the screen has no baseline showing a note at all.
 *
 * It is a *rendering* fixture: it contacts no laptop, writes nothing, and the
 * screen is read-only while it is in force, because a Save with no Atlas
 * behind it would be a button that lies. **The sixth of its kind**, after
 * `devAuth`, `devShareFixture`, `devChatFixture`, `devModelFixture` and
 * `devHostFixture`, and it is kept out of the shipped bundle the same way:
 * every branch behind a bare `import.meta.env.DEV`, which Vite folds to
 * `false` in a production build, and `scripts/check-shots-bypass.mjs` greps
 * `dist/` for the marker. **Do not read that flag into a variable first**, and
 * **do not lift anything below to module scope** — a module-level `const` is
 * initialised whether or not the guarded function is reachable, which is how
 * `devShareFixture`'s marker survived into `dist/` the first time.
 *
 * WHAT THE NOTES SAY, AND WHY THEY ARE THE MOCKUP'S AND NOT INVENTED
 * -------------------------------------------------------------------
 * They are `design-system/screens/catalog.html`'s own seeded notes, trimmed to
 * five and re-shaped into what Atlas actually returns. That is deliberate: a
 * fixture is a *drawing* of the screen, and drawing it with the design's own
 * content is how the baseline can be diffed against the mockup by eye. None of
 * it reaches Shreekant's real catalog — that folder starts empty and Atlas
 * fills it from things he actually says.
 *
 * The five cover what the screen has to be able to draw: three folders, a
 * stale note, a never-opened one, a note Atlas wrote and one edited by hand
 * (`author: 'outside'`, which the mockup has no idea about — it is what §4.4's
 * "editable in Notepad" looks like once it is real).
 */
import type { CatalogIndex, CatalogNote, CatalogNoteHeader } from './atlas/client';

export interface CatalogFixture {
  index: CatalogIndex;
  bodies: Record<string, CatalogNote>;
}

export function devCatalogFixture(): CatalogFixture | null {
  if (!import.meta.env.DEV) return null;
  if (!/__dev-catalog-fixture__/.test(window.location.search)) return null;

  /*
   * Dates as literals rather than offsets from `Date.now()`, so a capture does
   * not depend on the day it was taken.
   *
   * **Placed around `FROZEN_NOW`** — `scripts/fixture.ts` pins the harness's
   * clock to 12 March 2026 — even though this screen prints absolute dates
   * that would be stable anywhere. A catalog last opened six months *after*
   * the day the app thinks it is reads as broken to anyone looking at the
   * baseline, and `stale` below is a claim about the same clock.
   */
  const seed: (Omit<CatalogNote, 'folder' | 'name'> & { path: string })[] = [
    {
      path: 'people/rahul-mehta.md',
      trigger: 'Opened when you mention Rahul, invoices, or Mehta Textiles.',
      body:
        '# Rahul Mehta\n\nClient since March 2026. Mehta Textiles, Surat.\n\n' +
        '- Almost always writing about invoices. Rarely anything else.\n' +
        '- Pays late but pays. Terms are 15 days; he treats them as 30.\n' +
        '- Prefers a short reply with a date in it. Long explanations get ignored.\n' +
        '- Open: #114 (9 days late), #117 (sent 30 Aug).\n',
      bytes: 412,
      memories: 4,
      updatedAt: '2026-02-24T10:14:00.000Z',
      author: 'you',
      opens: 31,
      lastOpenedAt: '2026-03-12T03:28:00.000Z',
      stale: false,
    },
    {
      path: 'people/anita-cs.md',
      trigger: 'Opened for CA work, GST, filings, or compliance dates.',
      body:
        '# Anita Sharma (CA)\n\nSharma & Co. Handles the Empire incorporation and GST.\n\n' +
        '- Answers within a day on email, never on WhatsApp.\n' +
        '- Wants scanned documents as one PDF, not several images.\n' +
        '- Told me on 1 Sep the GST line on #114 was wrong.\n',
      bytes: 286,
      memories: 3,
      updatedAt: '2026-03-09T12:03:00.000Z',
      author: 'atlas',
      opens: 12,
      lastOpenedAt: '2026-03-11T17:41:00.000Z',
      stale: false,
    },
    {
      path: 'projects/shreekant-empire.md',
      trigger: 'Opened for anything about the Empire project.',
      body:
        '# Shreekant Empire\n\nThe main thing. Incorporation, then the first product line.\n\n' +
        '- Incorporation filing drafted; paperwork not yet filed.\n' +
        '- Current account not opened. Blocked on the incorporation certificate.\n' +
        '- CA is Anita (see people/anita-cs.md).\n' +
        '- He wants filing work done before 11am. Do not queue it late.\n',
      bytes: 356,
      memories: 4,
      updatedAt: '2026-03-12T03:02:00.000Z',
      author: 'atlas',
      opens: 58,
      lastOpenedAt: '2026-03-12T03:22:00.000Z',
      stale: false,
    },
    {
      path: 'preferences/how-shreekant-works.md',
      trigger: 'Opened on almost every turn — it is how to behave, not what to know.',
      body:
        '# How Shreekant works\n\n' +
        '- Filing and paperwork before 11am. Calls in the afternoon.\n' +
        '- Never queue more than 2 tasks in one session.\n' +
        '- Terse answers. No preamble.\n' +
        '- Wants to be told, not managed. Say the slow thing is slow, then do it.\n' +
        '- Concrete numbers always. Never "a few minutes".\n',
      bytes: 302,
      memories: 5,
      /* Edited by hand: the one thing the mockup could not draw, and the whole
         point of §4.4. Atlas notices because the file's modified time is later
         than the last time Atlas itself wrote it. */
      updatedAt: '2026-03-11T21:40:00.000Z',
      author: 'outside',
      opens: 74,
      lastOpenedAt: '2026-03-12T03:22:00.000Z',
      stale: false,
    },
    {
      path: 'how-to/file-gst-return.md',
      trigger: 'Opened only if you ask about filing a GST return.',
      body:
        '# Filing the GST return\n\n' +
        '1. Export the month from the tasks with the GST tag.\n' +
        '2. Send to Anita as one PDF.\n' +
        '3. She files; confirmation comes back by email.\n',
      bytes: 194,
      memories: 0,
      updatedAt: '2026-02-08T07:30:00.000Z',
      author: 'you',
      opens: 2,
      lastOpenedAt: '2026-02-10T11:05:00.000Z',
      stale: true,
    },
  ];

  const bodies: Record<string, CatalogNote> = {};
  const notes: CatalogNoteHeader[] = seed.map((entry) => {
    const [folder, name] = entry.path.split('/');
    const note: CatalogNote = { ...entry, folder, name };
    bodies[note.path] = note;
    // Written out rather than spread-minus-`body`, for the reason Atlas's own
    // `headerOf` gives: the body is the one field that must never reach a
    // header, and a field list is a thing the compiler checks.
    return {
      path: note.path, folder, name, trigger: note.trigger, bytes: note.bytes,
      memories: note.memories, updatedAt: note.updatedAt, author: note.author,
      opens: note.opens, lastOpenedAt: note.lastOpenedAt, stale: note.stale,
    };
  });

  return {
    index: {
      root: 'C:\\Users\\Shree\\Documents\\Atlas\\catalog',
      folders: ['how-to', 'people', 'preferences', 'projects'],
      notes,
      memories: notes.reduce((total, note) => total + note.memories, 0),
      budget: 40,
    },
    bodies,
  };
}
