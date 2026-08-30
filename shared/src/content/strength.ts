import type { Equipment, EquipmentTier, StrengthExercise } from '../types.js';

/**
 * FR-5.1: the work that decides whether a beginner is still running in six
 * months — calves and Achilles, tibialis anterior, glutes, single-leg control.
 */
export const STRENGTH_EXERCISES: StrengthExercise[] = [
  // --- bodyweight tier -----------------------------------------------------
  {
    id: 'calf-raise-double',
    name: 'Double-leg calf raise',
    tier: 'bodyweight',
    target: 'Calf + Achilles',
    sets: 3,
    reps: '15',
    tempo: '2s up, 3s down',
    perSide: false,
    priority: true,
    cues: [
      'Full height at the top, full stretch at the bottom.',
      'The slow lowering is the part that builds tendon.',
    ],
    contraindicatedFor: [],
  },
  {
    id: 'calf-raise-single',
    name: 'Single-leg calf raise',
    tier: 'bodyweight',
    target: 'Calf + Achilles',
    sets: 3,
    reps: '8–12',
    tempo: '2s up, 3s down',
    perSide: true,
    priority: true,
    cues: [
      'Fingertips on a wall for balance only.',
      'Stop the set when the height drops, not when it burns.',
    ],
    contraindicatedFor: ['achilles'],
    substituteId: 'calf-raise-double',
  },
  {
    id: 'tibialis-raise',
    name: 'Tibialis raise (toe raise)',
    tier: 'bodyweight',
    target: 'Shin (tibialis anterior)',
    sets: 3,
    reps: '20',
    tempo: '1s up, 2s down',
    perSide: false,
    priority: true,
    cues: [
      'Heels against a wall, lift the toes as high as they go.',
      'The single best defence against shin splints.',
    ],
    contraindicatedFor: [],
  },
  {
    id: 'glute-bridge',
    name: 'Glute bridge',
    tier: 'bodyweight',
    target: 'Glutes + hamstrings',
    sets: 3,
    reps: '15',
    tempo: '1s up, 1s hold, 2s down',
    perSide: false,
    priority: false,
    cues: [
      'Drive through the heels.',
      'Ribs down — the movement comes from the hips, not the lower back.',
    ],
    contraindicatedFor: [],
  },
  {
    id: 'single-leg-bridge',
    name: 'Single-leg glute bridge',
    tier: 'bodyweight',
    target: 'Glutes, one side at a time',
    sets: 3,
    reps: '10',
    tempo: '1s up, 1s hold, 2s down',
    perSide: true,
    priority: false,
    cues: ['Keep the hips level — do not let the free side drop.'],
    contraindicatedFor: ['back'],
    substituteId: 'glute-bridge',
  },
  {
    id: 'step-down',
    name: 'Step-down',
    tier: 'bodyweight',
    requires: ['step'],
    target: 'Quads + knee control',
    sets: 3,
    reps: '8–10',
    tempo: '3s down, 1s up',
    perSide: true,
    priority: true,
    cues: [
      'Lower until the heel taps, then stand back up.',
      'Watch the knee: it should not fall inwards.',
    ],
    contraindicatedFor: ['knee'],
    substituteId: 'wall-sit',
  },
  {
    id: 'wall-sit',
    name: 'Wall sit',
    tier: 'bodyweight',
    target: 'Quads, no knee travel',
    sets: 3,
    reps: '30–45 seconds',
    tempo: 'hold',
    perSide: false,
    priority: false,
    cues: [
      'Thighs as close to parallel as is comfortable.',
      'Knee-friendly alternative when bending under load hurts.',
    ],
    contraindicatedFor: [],
  },
  {
    id: 'side-lying-abduction',
    name: 'Side-lying leg raise',
    tier: 'bodyweight',
    target: 'Glute medius (hip stability)',
    sets: 3,
    reps: '15',
    tempo: '2s up, 2s down',
    perSide: true,
    priority: false,
    cues: [
      'Lead with the heel, toes pointed slightly down.',
      'Stops the hip dropping on every stride.',
    ],
    contraindicatedFor: [],
  },
  {
    id: 'dead-bug',
    name: 'Dead bug',
    tier: 'bodyweight',
    target: 'Trunk control',
    sets: 3,
    reps: '8',
    tempo: 'slow and controlled',
    perSide: true,
    priority: false,
    cues: ['Lower back stays flat against the floor throughout.'],
    contraindicatedFor: [],
  },
  {
    id: 'balance-hold',
    name: 'Single-leg balance',
    tier: 'bodyweight',
    target: 'Ankle + foot stability',
    sets: 2,
    reps: '30 seconds',
    tempo: 'hold',
    perSide: true,
    priority: false,
    cues: ['Progress by closing your eyes once 30 seconds is easy.'],
    contraindicatedFor: [],
  },

  // --- pull-up bar tier ----------------------------------------------------
  {
    id: 'hanging-knee-raise',
    name: 'Hanging knee raise',
    tier: 'bar',
    requires: ['pull_up_bar'],
    target: 'Trunk + hip flexors',
    sets: 3,
    reps: '8–12',
    tempo: '2s up, 2s down',
    perSide: false,
    priority: false,
    cues: ['No swinging. If you swing, do fewer.'],
    contraindicatedFor: ['back'],
    substituteId: 'dead-bug',
  },
  {
    id: 'dead-hang',
    name: 'Dead hang',
    tier: 'bar',
    requires: ['pull_up_bar'],
    target: 'Grip + shoulders + spine decompression',
    sets: 3,
    reps: '20–40 seconds',
    tempo: 'hold',
    perSide: false,
    priority: false,
    cues: ['Shoulders active, not fully slumped.'],
    contraindicatedFor: [],
  },

  // --- loaded tier (bands / dumbbells) -------------------------------------
  {
    id: 'goblet-squat',
    name: 'Goblet squat',
    tier: 'loaded',
    requires: ['dumbbells'],
    target: 'Quads + glutes',
    sets: 3,
    reps: '10–12',
    tempo: '3s down, 1s up',
    perSide: false,
    priority: false,
    cues: [
      'Weight at the chest, elbows inside the knees.',
      'Depth you can control beats depth you cannot.',
    ],
    contraindicatedFor: ['knee'],
    substituteId: 'wall-sit',
  },
  {
    id: 'romanian-deadlift',
    name: 'Romanian deadlift',
    tier: 'loaded',
    requires: ['dumbbells', 'resistance_bands'],
    target: 'Hamstrings + glutes',
    sets: 3,
    reps: '10',
    tempo: '3s down, 1s up',
    perSide: false,
    priority: true,
    cues: [
      'Hinge at the hips, flat back, soft knees.',
      'Feel it in the hamstrings, never the lower back.',
    ],
    contraindicatedFor: ['back'],
    substituteId: 'single-leg-bridge',
  },
  {
    id: 'loaded-calf-raise',
    name: 'Weighted single-leg calf raise',
    tier: 'loaded',
    requires: ['dumbbells', 'resistance_bands'],
    target: 'Calf + Achilles under load',
    sets: 3,
    reps: '8–10',
    tempo: '2s up, 4s down',
    perSide: true,
    priority: true,
    cues: [
      'Off a step for full range if you have one.',
      'Four seconds down. Count it out loud if you have to.',
    ],
    contraindicatedFor: ['achilles'],
    substituteId: 'calf-raise-double',
  },
  {
    id: 'banded-clamshell',
    name: 'Banded clamshell',
    tier: 'loaded',
    requires: ['resistance_bands'],
    target: 'Glute medius',
    sets: 3,
    reps: '15',
    tempo: '1s open, 2s close',
    perSide: true,
    priority: false,
    cues: ['Hips stacked, do not roll backwards to get more range.'],
    contraindicatedFor: [],
  },
  {
    id: 'split-squat',
    name: 'Dumbbell split squat',
    tier: 'loaded',
    requires: ['dumbbells', 'resistance_bands'],
    target: 'Single-leg strength',
    sets: 3,
    reps: '8–10',
    tempo: '3s down, 1s up',
    perSide: true,
    priority: true,
    cues: ['Torso upright, back knee travels straight down.'],
    contraindicatedFor: ['knee'],
    substituteId: 'step-down',
  },
];

/** FR-5.2: which tier a runner's equipment unlocks. */
export function tierFor(equipment: Equipment[]): EquipmentTier {
  if (equipment.includes('dumbbells') || equipment.includes('resistance_bands')) return 'loaded';
  if (equipment.includes('pull_up_bar')) return 'bar';
  return 'bodyweight';
}

const TIER_INCLUDES: Record<EquipmentTier, EquipmentTier[]> = {
  bodyweight: ['bodyweight'],
  bar: ['bodyweight', 'bar'],
  loaded: ['bodyweight', 'bar', 'loaded'],
};

export function exercisesForTier(tier: EquipmentTier): StrengthExercise[] {
  const allowed = TIER_INCLUDES[tier];
  return STRENGTH_EXERCISES.filter((e) => allowed.includes(e.tier));
}

/** Everything the runner can actually do with what they say they own. */
export function exercisesFor(equipment: Equipment[]): StrengthExercise[] {
  return STRENGTH_EXERCISES.filter(
    (e) => !e.requires?.length || e.requires.some((item) => equipment.includes(item)),
  );
}

/** True when this exercise is only possible because of something they own. */
export function needsEquipment(exercise: StrengthExercise): boolean {
  return Boolean(exercise.requires?.length);
}
