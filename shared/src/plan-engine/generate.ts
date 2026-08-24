import type { Baseline, Goal, Plan, PlanWeek, Profile } from '../types.js';
import { assessConservatism } from './conservatism.js';

const SESSIONS_PER_WEEK = 3;
/** FR-2.2: weekly running time never grows by more than 10%. */
export const MAX_WEEKLY_GROWTH = 1.1;
/** A run interval never more than half again as long as the week before. */
const MAX_INTERVAL_GROWTH = 1.5;

const BLOCK_LENGTH: Record<Goal, number> = {
  first_continuous_run: 8,
  five_k: 10,
  ten_k: 12,
  general_fitness: 8,
  return_after_break: 6,
};

/** Run interval at which the block has delivered its goal. */
const GOAL_RUN_SEC: Record<Goal, number> = {
  first_continuous_run: 1500, // 25 min unbroken
  five_k: 1800,
  ten_k: 2700,
  general_fitness: 1500,
  return_after_break: 1200,
};

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function startingRunSec(baseline: Baseline, conservatism: number): number {
  // Start at roughly half of what the runner managed in one continuous push,
  // then take conservatism off the top.
  const half = (baseline.minutesRun * 60) / 2;
  const base = clamp(roundTo(half, 30), 60, 240);
  return clamp(base - conservatism * 30, 60, 240);
}

function startingWalkSec(conservatism: number): number {
  if (conservatism >= 4) return 120;
  if (conservatism >= 2) return 90;
  return 60;
}

function startingReps(runSec: number, conservatism: number): number {
  // Target first-session running time, reduced by conservatism.
  const targetSessionRunSec = Math.max(360, 720 - conservatism * 60);
  return clamp(Math.round(targetSessionRunSec / runSec), 2, 8);
}

function makeWeek(
  index: number,
  runSec: number,
  walkSec: number,
  reps: number,
  isDeload = false,
): PlanWeek {
  return {
    index,
    runSec,
    walkSec,
    reps,
    sessionsPerWeek: SESSIONS_PER_WEEK,
    isDeload,
    totalRunSec: runSec * reps * SESSIONS_PER_WEEK,
  };
}

/**
 * PRD FR-2.1/2.2/2.4. Generates a 6–12 week run-walk block from the runner's
 * measured baseline. Run intervals lengthen while the walk stays constant;
 * repetitions then fall away as the intervals get long.
 */
export function generatePlan(
  profile: Profile,
  baseline: Baseline,
  startDate: string,
): Plan {
  const { score: conservatism, reasons } = assessConservatism(profile, baseline);

  const walkSec = startingWalkSec(conservatism);
  const runSec = startingRunSec(baseline, conservatism);
  const reps = startingReps(runSec, conservatism);

  const targetWeeks = clamp(BLOCK_LENGTH[profile.goal] + (conservatism >= 3 ? 2 : 0), 6, 12);
  const goalRunSec = GOAL_RUN_SEC[profile.goal];

  const weeks: PlanWeek[] = [makeWeek(1, runSec, walkSec, reps)];
  let sinceDeload = 1;

  while (weeks.length < targetWeeks) {
    const prev = weeks[weeks.length - 1]!;
    // A deload deliberately drops volume; progression resumes from the last
    // week that actually built, not from the lighter one.
    const reference = [...weeks].reverse().find((w) => !w.isDeload) ?? prev;
    const index = weeks.length + 1;

    // FR-3.4: a lighter week after four straight weeks of progression.
    if (sinceDeload >= 4) {
      // Drop volume via repetitions; once the plan is down to a single long
      // interval, shorten the interval itself instead.
      const deload =
        prev.reps > 1
          ? makeWeek(index, prev.runSec, prev.walkSec, Math.max(1, Math.round(prev.reps * 0.6)), true)
          : makeWeek(index, Math.max(60, roundTo(prev.runSec * 0.6, 30)), prev.walkSec, 1, true);
      weeks.push(deload);
      sinceDeload = 0;
      continue;
    }

    if (reference.runSec >= goalRunSec && reference.reps === 1) break;

    const cap = reference.totalRunSec * MAX_WEEKLY_GROWTH;

    // The interval must lengthen, repetitions may fall away, and the week's
    // total running time must stay inside the 10% ceiling. With few, long
    // repetitions those three pull against each other, so search the
    // candidates and take the most volume the ceiling allows.
    const maxRunSec = Math.min(
      goalRunSec,
      Math.max(reference.runSec + 30, roundTo(reference.runSec * MAX_INTERVAL_GROWTH, 30)),
    );

    let best: PlanWeek | null = null;
    for (let candidateRun = reference.runSec + 30; candidateRun <= maxRunSec; candidateRun += 30) {
      for (let candidateReps = reference.reps; candidateReps >= 1; candidateReps--) {
        const total = candidateRun * candidateReps * SESSIONS_PER_WEEK;
        if (total > cap) continue;
        if (!best || total > best.totalRunSec || (total === best.totalRunSec && candidateRun > best.runSec)) {
          best = makeWeek(index, candidateRun, reference.walkSec, candidateReps);
        }
      }
    }

    if (!best) break;
    const week = best;

    weeks.push(week);
    sinceDeload += 1;
  }

  // A block should finish on a week that built something, not on a light one.
  while (weeks.length > 1 && weeks[weeks.length - 1]!.isDeload) weeks.pop();

  return {
    goal: profile.goal,
    conservatism,
    conservatismReasons: reasons,
    startDate,
    weeks,
  };
}
