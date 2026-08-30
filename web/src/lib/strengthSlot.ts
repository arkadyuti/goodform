/**
 * Which of the two strength sessions to show.
 *
 * This used to be `new Date().getDay() >= 4 ? 1 : 0` — the calendar picked it.
 * Strength days of Mon+Wed are both under 4, so that pinned every session to
 * slot 0 for good and half the library became unreachable: with a Mon/Wed
 * habit you would never once be shown a dead hang. Letting strength be chosen
 * on any day made it worse still, since the slot then followed whichever
 * weekday you happened to tap it on.
 *
 * So rotate on what was actually done: stay on today's session if one is
 * already under way, otherwise take the one that is not the last one finished.
 */

interface SlotSession {
  exercises: { id: string }[];
}

interface HistoryRow {
  date: string;
  type: string;
  exerciseLog: Record<string, number> | null;
}

/** Which slot a logged session belongs to, by overlap of exercise ids. */
function slotOf(sessions: SlotSession[], log: Record<string, number>): number | null {
  const done = Object.keys(log).filter((id) => (log[id] ?? 0) > 0);
  if (done.length === 0) return null;

  const overlap = sessions.map((s) => {
    const ids = new Set(s.exercises.map((e) => e.id));
    return done.filter((id) => ids.has(id)).length;
  });

  const best = Math.max(...overlap);
  if (best === 0) return null;
  // An ambiguous log — the shared warm-up alone, say — dates no slot.
  if (overlap.filter((n) => n === best).length > 1) return null;
  return overlap.indexOf(best);
}

export function pickStrengthSlot(
  sessions: SlotSession[],
  history: HistoryRow[],
  date: string,
): number {
  if (sessions.length < 2) return 0;

  const strength = history
    .filter((r) => r.type === 'strength' && r.exerciseLog)
    .sort((a, b) => b.date.localeCompare(a.date));

  // Already working today: keep the screen on the session being done.
  const started = strength.find((r) => r.date === date);
  if (started) {
    const slot = slotOf(sessions, started.exerciseLog ?? {});
    if (slot !== null) return slot;
  }

  for (const row of strength) {
    if (row.date >= date) continue;
    const slot = slotOf(sessions, row.exerciseLog ?? {});
    if (slot !== null) return (slot + 1) % sessions.length;
  }

  return 0;
}
