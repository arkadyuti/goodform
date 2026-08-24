import type { GateResult, PlanWeek, WorkoutSession } from '../types.js';

/**
 * PRD FR-3.2. Decides what happens after a week of running, from what was
 * actually logged. Repeating is a first-class outcome, never a failure state.
 */
export function evaluateWeek(week: PlanWeek, sessions: WorkoutSession[]): GateResult {
  const runs = sessions.filter((s) => s.type === 'run');
  const planned = week.sessionsPerWeek;

  const completed = runs.filter((s) => s.completion === 'full').length;
  const attempted = runs.filter((s) => s.completion !== 'skipped').length;
  const missed = planned - attempted;

  const severities = runs
    .map((s) => s.discomfort?.severity ?? 0)
    .filter((n) => n > 0);
  const worst = severities.length ? Math.max(...severities) : 0;
  const moderateCount = severities.filter((n) => n >= 3).length;

  if (worst >= 4) {
    return {
      decision: 'pause_medical',
      reason:
        'You logged discomfort at 4 or above. Progression is paused — rest and get it looked at before the next block of running.',
      overridable: true,
      strengthEmphasis: false,
    };
  }

  if (moderateCount >= 2) {
    return {
      decision: 'repeat',
      reason:
        'Discomfort at 3 or above showed up twice this week. Repeating the same week with extra strength work lets the tissue catch up.',
      overridable: true,
      strengthEmphasis: true,
    };
  }

  if (missed >= 2) {
    return {
      decision: 'step_back',
      reason:
        'Two or more sessions were missed. You can repeat this week or step back one — both are normal and the plan reshapes around it.',
      overridable: true,
      strengthEmphasis: false,
    };
  }

  if (completed < planned) {
    return {
      decision: 'offer_repeat',
      reason:
        'Not every session finished as planned. Repeating this week is the safe call, but it is your choice.',
      overridable: true,
      strengthEmphasis: false,
    };
  }

  return {
    decision: 'advance',
    reason: 'All three sessions done with nothing above mild discomfort. On to the next week.',
    overridable: false,
    strengthEmphasis: false,
  };
}

/** Shown once when the runner overrides a gate. Advises, never locks out (FR-3.3). */
export const OVERRIDE_WARNING =
  'Tendons and bone take 3–6 months to adapt — far longer than your lungs. Pushing on through discomfort is the single most common way beginners end up stopping altogether.';

export interface BreakResult {
  /** Weeks to drop back from where the plan stopped. */
  stepBackWeeks: number;
  needsReassessment: boolean;
  reason: string;
}

/** PRD FR-3.5. After a gap, the plan steps back in proportion to its length. */
export function returnFromBreak(gapDays: number): BreakResult {
  if (gapDays < 10) {
    return { stepBackWeeks: 0, needsReassessment: false, reason: 'Short gap — pick up where you left off.' };
  }
  if (gapDays >= 56) {
    return {
      stepBackWeeks: 0,
      needsReassessment: true,
      reason: 'It has been a while. A fresh baseline gives you a plan that fits where your legs are now.',
    };
  }
  const stepBackWeeks = Math.min(3, Math.floor(gapDays / 14) + 1);
  return {
    stepBackWeeks,
    needsReassessment: false,
    reason: `${gapDays} days off, so the plan steps back ${stepBackWeeks} week${stepBackWeeks > 1 ? 's' : ''}. You will regain it faster than you built it.`,
  };
}
