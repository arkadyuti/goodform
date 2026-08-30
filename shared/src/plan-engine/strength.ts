import { STRENGTH_EXERCISES } from '../content/strength.js';
import { MOVEMENTS, type Movement } from '../content/movements.js';
import type { Equipment, Profile, StrengthExercise } from '../types.js';

const byId = new Map(STRENGTH_EXERCISES.map((e) => [e.id, e]));

function owns(exercise: StrengthExercise, equipment: Equipment[]): boolean {
  return !exercise.requires?.length || exercise.requires.some((item) => equipment.includes(item));
}

/** How many full sessions this movement has been completed, at any stage. */
function completedFor(movement: Movement, progress: Record<string, number>): number {
  return movement.stages.reduce((total, stage) => total + (progress[stage.id] ?? 0), 0);
}

/**
 * The stage of a ladder a runner is on: the hardest one they own the kit for,
 * have earned, and are not injured out of.
 */
export function stageFor(
  movement: Movement,
  profile: Pick<Profile, 'equipment' | 'injuryHistory'>,
  completed: number,
): StrengthExercise | null {
  let chosen: StrengthExercise | null = null;
  for (const stage of movement.stages) {
    const exercise = byId.get(stage.id);
    if (!exercise) continue;
    if (stage.unlockAfter > completed) continue;
    if (!owns(exercise, profile.equipment)) continue;
    if (exercise.contraindicatedFor.some((site) => profile.injuryHistory.includes(site))) continue;
    chosen = exercise;
  }
  return chosen;
}

/** How hard the week is asking, not which exercises it asks for. */
export type Intensity = 'easy' | 'normal' | 'emphasis';

export interface RoutineExercise extends StrengthExercise {
  /** The pattern this is a variant of — stable while the variant changes. */
  movementId: string;
  movementName: string;
  /** 1-based position on the ladder, and how long the ladder is. */
  stage: number;
  stages: number;
}

export interface StrengthRoutine {
  exercises: RoutineExercise[];
  intensity: Intensity;
}

/**
 * FR-5.3: the strength work for a session.
 *
 * One routine, the same every strength day. A week that needs to be lighter
 * drops a set rather than dropping exercises — the movement pattern is the
 * habit, and taking it away to make a week easier is what makes a routine
 * impossible to learn. See `MOVEMENTS` for why this replaced two alternating
 * sessions.
 */
export function buildStrengthRoutine(
  profile: Pick<Profile, 'equipment' | 'injuryHistory'>,
  opts: { progress?: Record<string, number>; intensity?: Intensity } = {},
): StrengthRoutine {
  const progress = opts.progress ?? {};
  const intensity = opts.intensity ?? 'normal';

  const exercises: RoutineExercise[] = [];
  for (const movement of MOVEMENTS) {
    const completed = completedFor(movement, progress);
    const exercise = stageFor(movement, profile, completed);
    if (!exercise) continue;

    // Only the stages they could actually reach count towards "stage 2 of 3".
    const reachable = movement.stages.filter((stage) => {
      const candidate = byId.get(stage.id);
      return (
        candidate &&
        owns(candidate, profile.equipment) &&
        !candidate.contraindicatedFor.some((site) => profile.injuryHistory.includes(site))
      );
    });

    exercises.push({
      ...exercise,
      priority: movement.priority,
      sets: setsFor(exercise.sets, movement.priority, intensity),
      movementId: movement.id,
      movementName: movement.name,
      stage: reachable.findIndex((stage) => stage.id === exercise.id) + 1,
      stages: reachable.length,
    });
  }

  // Priority work first, so a runner short on time does the part that matters.
  exercises.sort((a, b) => Number(b.priority) - Number(a.priority));

  return { exercises, intensity };
}

function setsFor(sets: number, priority: boolean, intensity: Intensity): number {
  if (intensity === 'easy') return Math.max(2, sets - 1);
  if (intensity === 'emphasis' && priority) return sets + 1;
  return sets;
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
