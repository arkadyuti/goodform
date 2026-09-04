import { NEARLY_ALL, fractionDone } from '../counting.js';
import type { GateResult, PlanWeek, WorkoutSession } from '../types.js';

/**
 * PRD FR-3.2. Decides what happens after a week of running, from what was
 * actually logged. Repeating is a first-class outcome, never a failure state.
 */
/** Consistently below this, after repeating, means the week is too big. */
const TOO_HARD = 0.7;

export function evaluateWeek(
  week: PlanWeek,
  sessions: WorkoutSession[],
  /** How many times this week has already been repeated. */
  repeats = 0,
  /**
   * Whether the week is actually over.
   *
   * An attendance verdict mid-week is nonsense: on day one of week one, with
   * one run done of three, `missed` is 2 and the runner was told they had
   * "missed two or more sessions" — minutes after signing up, on the same card
   * that said "1 of 3 runs done". Discomfort still speaks immediately, because
   * that is about what already happened rather than what has not happened yet.
   */
  weekOver = true,
): GateResult {
  const runs = sessions.filter((s) => s.type === 'run');
  const planned = week.sessionsPerWeek;

  // A near-miss counts. Finishing six of seven intervals three times is a week
  // of training, not a failed one.
  const completed = runs.filter((s) => fractionDone(s) >= NEARLY_ALL).length;
  const attempted = runs.filter((s) => s.completion !== 'skipped').length;
  const missed = planned - attempted;
  // A session the runner said no to, rather than one that simply never
  // happened. The decision is the same either way — the plan still reshapes —
  // but being told you "missed" something you deliberately chose to skip reads
  // as an accusation, and this app does not make those.
  // Any session the runner explicitly called off. `missed` counts the whole
  // shortfall, including sessions never logged at all, so it is always at least
  // this — which is why the test is "did they say anything" rather than a
  // comparison between the two.
  const declined = runs.filter((s) => s.completion === 'skipped').length;
  const deliberate = declined > 0;

  const severities = runs.map((s) => s.discomfort?.severity ?? 0).filter((n) => n > 0);
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

  // Nothing below this point is fair to say before the week has run its course.
  if (!weekOver) {
    return {
      decision: 'offer_repeat',
      reason: 'The week is still going. Nothing is decided until it is done.',
      overridable: false,
      strengthEmphasis: false,
    };
  }

  if (missed >= 2) {
    return {
      decision: 'step_back',
      reason: deliberate
        ? 'You called off part of this week. That is a decision, not a gap — repeat this week or step back one, whichever fits what is going on.'
        : 'Two or more sessions were missed. You can repeat this week or step back one — both are normal and the plan reshapes around it.',
      overridable: true,
      strengthEmphasis: false,
    };
  }

  /**
   * The week is repeatedly out of reach, so make it smaller.
   *
   * Repeating an unreachable week changes nothing, and the app used to do it
   * indefinitely while saying the same sentence — which reads as the runner
   * failing rather than the plan being wrong. Coming down is not a demotion:
   * the prescription was a guess from one baseline run, and this is the guess
   * being corrected by what actually happened.
   */
  const attemptedRuns = runs.filter((s) => s.completion !== 'skipped');
  const fractions = attemptedRuns.map(fractionDone).filter((f) => f > 0);
  const typical = fractions.length
    ? [...fractions].sort((a, b) => a - b)[Math.floor(fractions.length / 2)]!
    : 0;

  if (repeats >= 2 && fractions.length >= 2 && typical < TOO_HARD) {
    // Meet them a little above what they are actually managing, never below one.
    const reps = Math.max(1, Math.min(week.reps - 1, Math.round(week.reps * typical) + 1));
    if (reps < week.reps) {
      return {
        decision: 'ease',
        reason: `You have run this week ${repeats + 1} times and it has not come together — which means the week is too big, not that you are behind. It comes down to ${reps} repetitions, and builds from there.`,
        overridable: true,
        strengthEmphasis: false,
        easeTo: { runSec: week.runSec, reps },
      };
    }
  }

  if (completed < planned) {
    return {
      decision: 'offer_repeat',
      reason: deliberate
        ? 'You sat one out this week. Repeating is the safe call, but it is your choice.'
        : 'Not every session finished as planned. Repeating this week is the safe call, but it is your choice.',
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
    return {
      stepBackWeeks: 0,
      needsReassessment: false,
      reason: 'Short gap — pick up where you left off.',
    };
  }
  if (gapDays >= 56) {
    return {
      stepBackWeeks: 0,
      needsReassessment: true,
      reason:
        'It has been a while. A fresh baseline gives you a plan that fits where your legs are now.',
    };
  }
  const stepBackWeeks = Math.min(3, Math.floor(gapDays / 14) + 1);
  return {
    stepBackWeeks,
    needsReassessment: false,
    reason: `${gapDays} days off, so the plan steps back ${stepBackWeeks} week${stepBackWeeks > 1 ? 's' : ''}. You will regain it faster than you built it.`,
  };
}
