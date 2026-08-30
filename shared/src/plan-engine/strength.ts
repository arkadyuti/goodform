import { needsEquipment, STRENGTH_EXERCISES } from '../content/strength.js';
import type { Equipment, InjurySite, Profile, StrengthExercise } from '../types.js';

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

/**
 * Swaps in an alternative when the runner does not own what an exercise needs.
 *
 * The same courtesy the injury path already gets: a step-down is priority work
 * for the quads, and simply dropping it for anyone without a step left them
 * with no quad work at all. A wall sit needs a wall.
 */
export function forEquipment(
  exercise: StrengthExercise,
  equipment: Equipment[],
): StrengthExercise | null {
  const have = (e: StrengthExercise) =>
    !e.requires?.length || e.requires.some((item) => equipment.includes(item));
  if (have(exercise)) return exercise;
  const alt = exercise.substituteId ? byId.get(exercise.substituteId) : undefined;
  if (!alt || !have(alt)) return null;
  // The substitute inherits the role it is standing in for.
  return { ...alt, priority: exercise.priority };
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
  const pool = STRENGTH_EXERCISES.map((e) => forEquipment(e, profile.equipment))
    .filter((e): e is StrengthExercise => e !== null)
    .map((e) => substitute(e, profile.injuryHistory))
    .filter((e): e is StrengthExercise => e !== null);

  const seen = new Set<string>();
  const unique = pool.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));

  const priority = unique.filter((e) => e.priority);

  /**
   * Equipment-specific work first among the optional exercises.
   *
   * The remainder is sliced down to two per session, and the exercises a piece
   * of equipment unlocks happened to sit at the end of the library — so
   * answering "I have a pull-up bar" unlocked a dead hang and a hanging knee
   * raise and then cut both, giving the identical session to someone who owns
   * nothing. If a runner went and found the thing, it should show up in what
   * they are asked to do.
   */
  const rest = unique
    .filter((e) => !e.priority)
    .sort((a, b) => Number(needsEquipment(b)) - Number(needsEquipment(a)));

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
