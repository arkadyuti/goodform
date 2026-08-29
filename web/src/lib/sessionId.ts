/**
 * The id of the session being recorded on this screen, surviving a remount.
 *
 * `useState(() => crypto.randomUUID())` survives re-renders but not a remount —
 * and a refresh, a back-then-forward, or the PWA being evicted from memory is a
 * remount. The screen came back with a fresh id and an empty form, so the six
 * sets already ticked and written were invisible, and ticking them again wrote
 * a *second* session for the same day. Adherence, the week gate and the
 * strength counter all then counted two.
 *
 * Keyed by day and kind, and cleared once the session is finished — so a
 * deliberate second run on the same day ("Run it again") still gets its own
 * record, which is the one case where two really is right.
 */
const key = (date: string, type: string) => `goodform:session:${type}:${date}`;

export function sessionIdFor(date: string, type: string): string {
  try {
    const existing = sessionStorage.getItem(key(date, type));
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(key(date, type), fresh);
    return fresh;
  } catch {
    // Private mode, or storage disabled. A fresh id per mount is the old
    // behaviour, which is worse but still works.
    return crypto.randomUUID();
  }
}

/** Called once the session is fully logged, so the next one starts clean. */
export function clearSessionId(date: string, type: string): void {
  try {
    sessionStorage.removeItem(key(date, type));
  } catch {
    /* nothing to clear */
  }
}
