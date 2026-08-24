import { exercisesForTier, STRENGTH_EXERCISES, tierFor } from '../content/strength.js';
import type { InjurySite, Profile, StrengthExercise } from '../types.js';

const byId = new Map(STRENGTH_EXERCISES.map((e) => [e.id, e]));

/**
 * FR-5.6: an exercise ruled out by injury history is replaced, not dropped.
 * Returns null only if the substitute is itself ruled out.
 */
export function substitute(
  exercise: StrengthExercise,
  injuries: InjurySite[],
): StrengthExercise | null {
  const blocked = exercise.contraindicatedFor.some((site) => injuries.includes(site));
  if (!blocked) return exercise;
  const alt = exercise.substituteId ? byId.get(exercise.substituteId) : undefined;
  if (!alt) return null;
  if (alt.contraindicatedFor.some((site) => injuries.includes(site))) return null;
  return alt;
}

export interface StrengthSession {
  /** 1 or 2 — the two weekly sessions rotate emphasis. */
  slot: 1 | 2;
  exercises: StrengthExercise[];
}

/**
 * FR-5.3: two sessions a week on non-running days, built from the runner's
 * equipment and filtered through their injury history.
 */
export function buildStrengthSessions(
  profile: Pick<Profile, 'equipment' | 'injuryHistory'>,
  opts: { emphasis?: boolean } = {},
): StrengthSession[] {
  const pool = exercisesForTier(tierFor(profile.equipment))
    .map((e) => substitute(e, profile.injuryHistory))
    .filter((e): e is StrengthExercise => e !== null);

  const seen = new Set<string>();
  const unique = pool.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));

  const priority = unique.filter((e) => e.priority);
  const rest = unique.filter((e) => !e.priority);

  // Priority work appears in both sessions; the remainder splits between them.
  const size = opts.emphasis ? 3 : 2;
  const sessionA = [...priority, ...rest.filter((_, i) => i % 2 === 0).slice(0, size)];
  const sessionB = [...priority, ...rest.filter((_, i) => i % 2 === 1).slice(0, size)];

  return [
    { slot: 1, exercises: sessionA },
    { slot: 2, exercises: sessionB },
  ];
}

/** FR-5.7: reps advance once a session is completed in full at the current prescription. */
export function progressReps(reps: string, completedSessions: number): string {
  if (completedSessions < 3) return reps;
  const range = reps.match(/^(\d+)[–-](\d+)$/);
  if (range) {
    const step = Math.floor(completedSessions / 3);
    return `${Number(range[1]) + step * 2}–${Number(range[2]) + step * 2}`;
  }
  const single = reps.match(/^(\d+)$/);
  if (single) return String(Number(single[1]) + Math.floor(completedSessions / 3) * 2);
  return reps;
}
