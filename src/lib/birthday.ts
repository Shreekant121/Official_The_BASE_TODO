/**
 * His birthday (29-1P14b, idea 109): a date in Settings → App, so the
 * Dashboard's greeting can dress up for it. Kept as `MM-DD` — the year is
 * nobody's business and nothing here counts his age.
 *
 * The same on both devices, so it lives in the cloud (`birthdaySync.ts`,
 * `users/{uid}/settings/moments`, never `data/main`) with a copy here in
 * localStorage that the first frame reads, as the dark tint does. Every
 * storage read is wrapped, because a greeting is not worth a crash.
 */
import { cleanBirthday } from './dayMoments';

const KEY = 'base.birthday';

export function readBirthday(): string | null {
  try {
    return cleanBirthday(localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

type Listener = (birthday: string | null, fromHere: boolean) => void;
const listeners = new Set<Listener>();

/** Called for every change; `fromHere` is false when the cloud brought it. */
export function subscribeBirthday(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function store(birthday: string | null, fromHere: boolean): void {
  try {
    if (birthday) localStorage.setItem(KEY, birthday);
    else localStorage.removeItem(KEY);
  } catch {
    /* Not remembered on this device past this page load. */
  }
  for (const fn of listeners) fn(birthday, fromHere);
}

/** His pick in Settings (`MM-DD`, or null to clear it). The sync hook sends it on. */
export function setBirthday(raw: string | null): void {
  const birthday = raw === null ? null : cleanBirthday(raw);
  if (birthday === readBirthday()) return;
  store(birthday, true);
}

/** The other device's pick, arriving from the cloud. Not sent back. */
export function adoptBirthday(raw: unknown): void {
  const birthday = cleanBirthday(raw);
  if (birthday === readBirthday()) return;
  store(birthday, false);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "4 July", for Settings. */
export function birthdayWords(birthday: string): string {
  const [month, date] = birthday.split('-').map(Number);
  return `${date} ${MONTHS[month - 1] ?? ''}`;
}

export { MONTHS as BIRTHDAY_MONTHS };
