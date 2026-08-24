import type { Goal, PlanWeek, WorkoutSession } from '../types.js';

/** A stored plan week, which carries the two fields the engine does not. */
export type TrackedWeek = PlanWeek & {
  repeats?: number;
  completedAt?: string | Date | null;
};

export interface BlockOutcome {
  goal: Goal;
  weeksPlanned: number;
  weeksCompleted: number;
  /** How many times a week was repeated across the whole block. */
  totalRepeats: number;
  runsCompleted: number;
  /** Longest run interval actually completed, in seconds. */
  achievedRunSec: number;
  achievedMinutes: number;
  worstDiscomfort: number;
  /** The prescription the next block should pick up from. */
  continueFrom: { runSec: number; walkSec: number; reps: number } | null;
}

/**
 * What a finished block actually delivered — read from what was logged, not
 * from what was prescribed. A block whose last three weeks were skipped did not
 * reach its last week's interval, and the next block must not assume it did.
 */
export function summariseBlock(
  plan: { goal: Goal; currentWeek: number },
  weeks: TrackedWeek[],
  sessions: WorkoutSession[],
): BlockOutcome {
  const runs = sessions.filter((s) => (s.type === 'run' || s.type === 'baseline') && s.completion === 'full');

  let best: { runSec: number; walkSec: number; reps: number } | null = null;
  for (const session of runs) {
    const p = session.prescription;
    if (!p) continue;
    if (!best || p.runSec > best.runSec) best = { runSec: p.runSec, walkSec: p.walkSec, reps: p.reps };
  }

  // Nothing logged with a prescription: fall back to the last week the plan
  // marked complete, and to week one if even that is missing.
  if (!best) {
    const completed = weeks.filter((w) => w.index < plan.currentWeek);
    const week = completed[completed.length - 1] ?? weeks[0];
    if (week) best = { runSec: week.runSec, walkSec: week.walkSec, reps: week.reps };
  }

  const worstDiscomfort = sessions.reduce((max, s) => Math.max(max, s.discomfort?.severity ?? 0), 0);

  return {
    goal: plan.goal,
    weeksPlanned: weeks.length,
    weeksCompleted: weeks.filter((w) => w.completedAt || w.index < plan.currentWeek).length,
    totalRepeats: weeks.reduce((sum, w) => sum + (w.repeats ?? 0), 0),
    runsCompleted: runs.length,
    achievedRunSec: best?.runSec ?? 0,
    achievedMinutes: Math.round(((best?.runSec ?? 0) / 60) * 10) / 10,
    worstDiscomfort,
    continueFrom: best,
  };
}

export interface NextGoalOption {
  goal: Goal;
  label: string;
  hint: string;
  recommended: boolean;
}

const GENERAL: NextGoalOption = {
  goal: 'general_fitness',
  label: 'Hold here',
  hint: 'Keep this distance and let three more months of it settle into your tendons. A perfectly good answer.',
  recommended: false,
};

/**
 * What comes after a finished block. Never a single forced next step: holding
 * where you are is offered every time, with the same weight as moving up.
 */
export function nextGoalOptions(outcome: BlockOutcome): NextGoalOption[] {
  // Discomfort at 4 or above during the block outranks any ambition in it.
  const cautious = outcome.worstDiscomfort >= 4;

  const step = (goal: Goal, label: string, hint: string): NextGoalOption => ({
    goal,
    label,
    hint,
    recommended: !cautious,
  });

  switch (outcome.goal) {
    case 'first_continuous_run':
    case 'return_after_break':
      return [
        step('five_k', 'Build to 5K', 'The next block turns the interval you just reached into a continuous five kilometres.'),
        { ...GENERAL, recommended: cautious },
        step('ten_k', 'Straight to 10K', 'A longer block. Only sensible if the last one felt easy throughout.'),
      ];
    case 'five_k':
      return [
        step('ten_k', 'Build to 10K', 'Twelve weeks, and the biggest jump in weekly volume you will have made.'),
        { ...GENERAL, recommended: cautious, hint: 'Run 5K comfortably for a few months before doubling it. Nothing is lost by waiting.' },
        step('five_k', 'Another 5K block', 'Same distance, more of it — consolidating rather than climbing.'),
      ];
    case 'ten_k':
      return [
        { ...GENERAL, recommended: true, label: 'Hold at 10K', hint: 'Keep the distance and let it become ordinary. That is what makes it stick.' },
        step('ten_k', 'Another 10K block', 'More volume at the same distance.'),
      ];
    case 'general_fitness':
      return [
        step('five_k', 'Build to 5K', 'A distance goal, now that the habit is there.'),
        { ...GENERAL, recommended: cautious, label: 'Carry on as you are', hint: 'Same rhythm, same distances.' },
      ];
  }
}

/**
 * Whether the runner should be asked for a fresh timed baseline instead of
 * continuing from the block. After a long enough gap the block's last interval
 * is a claim about someone who no longer exists.
 */
export function needsFreshBaseline(outcome: BlockOutcome, daysSinceLastRun: number): boolean {
  if (daysSinceLastRun >= 56) return true;
  return outcome.runsCompleted === 0;
}
