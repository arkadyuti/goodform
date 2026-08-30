/**
 * A movement pattern, and the ladder of variants that train it.
 *
 * The routine used to be two alternating sessions built by index parity over a
 * sorted list — `rest.filter((_, i) => i % 2 === 0).slice(0, 2)`. It knew
 * nothing about what any exercise was, with two consequences:
 *
 *   - It alternated difficulty levels of the *same* movement. A glute bridge
 *     landed in session 1 and a single-leg glute bridge in session 2, so the
 *     easy and the hard version of one movement took turns by calendar. The
 *     library already declared them a pair (`single-leg-bridge.substituteId`),
 *     and the calf pair, in exactly the same relationship, was handled the
 *     opposite way — both versions in every session.
 *   - The `.slice(0, 2)` left 9 of 17 exercises unreachable for good. Nobody
 *     with a pull-up bar and a step was ever shown side-lying abduction, which
 *     is the glute-medius work that keeps a beginner's knees quiet.
 *
 * So the unit is the movement, not the exercise. Every movement appears in
 * every session — people are creatures of habit, and a routine you can learn
 * beats one that reshuffles. What changes over time is which *stage* of the
 * ladder you are on, and how many sets you are asked for.
 */
export interface Movement {
  id: string;
  /** The pattern, not the variant: "Calf raise", not "Single-leg calf raise". */
  name: string;
  /** Core running-tissue work. Ordered first, and never dropped. */
  priority: boolean;
  stages: MovementStage[];
}

export interface MovementStage {
  /** An id in STRENGTH_EXERCISES. */
  id: string;
  /**
   * Completed sessions of this movement before the stage is offered.
   *
   * Zero for stages that are unlocked by owning something rather than by
   * getting stronger — a step-down is not a harder step-down than a wall sit,
   * it is what you do when there is a step. Above zero only where the variant
   * is genuinely a step up in difficulty, so it has to be earned.
   */
  unlockAfter: number;
}

/**
 * Easiest first within each ladder; the hardest unlocked-and-possible stage
 * wins, so a later entry that needs equipment supersedes an earlier one.
 */
export const MOVEMENTS: Movement[] = [
  {
    id: 'calf',
    name: 'Calf raise',
    priority: true,
    stages: [
      { id: 'calf-raise-double', unlockAfter: 0 },
      { id: 'calf-raise-single', unlockAfter: 6 },
      { id: 'loaded-calf-raise', unlockAfter: 14 },
    ],
  },
  {
    id: 'shin',
    name: 'Tibialis raise',
    priority: true,
    stages: [{ id: 'tibialis-raise', unlockAfter: 0 }],
  },
  {
    id: 'knee',
    name: 'Knee control',
    priority: true,
    stages: [
      { id: 'wall-sit', unlockAfter: 0 },
      { id: 'goblet-squat', unlockAfter: 0 },
      { id: 'step-down', unlockAfter: 0 },
      { id: 'split-squat', unlockAfter: 10 },
    ],
  },
  {
    id: 'hinge',
    name: 'Hip hinge',
    priority: true,
    stages: [
      { id: 'glute-bridge', unlockAfter: 0 },
      { id: 'single-leg-bridge', unlockAfter: 6 },
      { id: 'romanian-deadlift', unlockAfter: 0 },
    ],
  },
  {
    id: 'abduction',
    name: 'Hip abduction',
    priority: true,
    stages: [
      { id: 'side-lying-abduction', unlockAfter: 0 },
      { id: 'banded-clamshell', unlockAfter: 0 },
    ],
  },
  {
    id: 'trunk',
    name: 'Trunk',
    priority: false,
    stages: [
      { id: 'dead-bug', unlockAfter: 0 },
      { id: 'hanging-knee-raise', unlockAfter: 0 },
    ],
  },
  {
    id: 'balance',
    name: 'Balance',
    priority: false,
    stages: [{ id: 'balance-hold', unlockAfter: 0 }],
  },
  {
    id: 'hang',
    name: 'Hang',
    priority: false,
    stages: [{ id: 'dead-hang', unlockAfter: 0 }],
  },
];
