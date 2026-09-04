import type { Completion, Prescription } from './types.js';

/**
 * The one rule for whether a session counts.
 *
 * Seven places decided this for themselves. The week's verdict counted a run
 * done at 80% of its intervals; the schedule counted anyone who turned up; the
 * cards counted only `full`. So the schedule let a runner coast to Sunday on
 * one real run and a three-interval outing, and the verdict then sent them
 * round again — the two halves of the app measuring with different rulers.
 * Everything that counts a session reads it from here.
 */
export interface Countable {
  completion: Completion;
  intervalsCompleted?: number | null;
  prescription?: Pick<Prescription, 'reps'> | null;
}

/** Close enough to the prescription to count as having done it. */
export const NEARLY_ALL = 0.8;

/** Turned up: anything but a session the runner called off. */
export function attended(session: Pick<Countable, 'completion'>): boolean {
  return session.completion !== 'skipped';
}

/**
 * How much of a run was actually done, 0–1.
 *
 * A session cut short at six of seven intervals is not the same as one cut
 * short at one. A partial with no interval count — a backfilled one, say —
 * is an attendance and nothing more.
 */
export function fractionDone(session: Countable): number {
  if (session.completion === 'full') return 1;
  if (session.completion === 'skipped') return 0;
  const reps = session.prescription?.reps ?? 0;
  if (!reps || session.intervalsCompleted === null || session.intervalsCompleted === undefined) {
    return 0;
  }
  return Math.min(1, session.intervalsCompleted / reps);
}

/** A run that counts towards the week: nearly all of it done. */
export function runCounts(session: Countable): boolean {
  return fractionDone(session) >= NEARLY_ALL;
}

/**
 * A strength session that counts: one you turned up to.
 *
 * A run has a shape the app can measure against; a strength session's sets
 * are ticked as they happen and the session is saved whatever the count, so
 * the only honest signal on the row is whether it was called off.
 */
export function strengthCounts(session: Pick<Countable, 'completion'>): boolean {
  return attended(session);
}
