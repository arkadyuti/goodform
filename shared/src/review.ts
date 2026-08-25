import { dateRange } from './dates.js';
import type { Adherence } from './regimen.js';
import type { DiscomfortLocation, WeeklyCheck, WorkoutSession } from './types.js';

export interface ReviewLogSlice {
  date: string;
  waterMl: number;
  sleepHours: number | null;
  alcoholUnits: number;
  beers: number;
  cigarettes: number;
}

export interface WeeklyReviewInput {
  from: string;
  to: string;
  sessions: WorkoutSession[];
  plannedRuns: number;
  plannedStrength: number;
  logs: ReviewLogSlice[];
  /** The seven days before `from`, for the deltas. */
  previousLogs: ReviewLogSlice[];
  /** Protein grams by date, from the nutrition log. */
  proteinByDate: Record<string, number>;
  proteinTargetG: number | null;
  check: WeeklyCheck | null;
  previousCheck: WeeklyCheck | null;
  previousLongestRunSec: number;
  regimen: Adherence | null;
}

export interface WeeklyReview {
  from: string;
  to: string;
  runs: { completed: number; attempted: number; planned: number };
  strength: { completed: number; planned: number };
  longestRunSec: number;
  longestRunDeltaSec: number;
  totalRunSec: number;
  discomfort: { date: string; location: DiscomfortLocation; severity: number }[];
  habits: {
    loggedDays: number;
    waterAvgMl: number | null;
    sleepAvgHours: number | null;
    cigarettes: number;
    beers: number;
    alcoholUnits: number;
    clearDays: number;
    cigarettesDelta: number;
    drinksDelta: number;
  };
  protein: { avgG: number; daysOnTarget: number; loggedDays: number } | null;
  measurements: {
    weightKg: number | null;
    waistCm: number | null;
    restingHr: number | null;
    weightDelta: number | null;
    waistDelta: number | null;
    restingHrDelta: number | null;
  } | null;
  regimen: Adherence | null;
  /** One sentence, stating what happened. Never a grade. */
  headline: string;
  /** Observations worth a line each. Empty is a perfectly good week. */
  notes: string[];
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function delta(now: number | null | undefined, before: number | null | undefined): number | null {
  if (now === null || now === undefined || before === null || before === undefined) return null;
  return Number((now - before).toFixed(1));
}

/**
 * The week, stated plainly. Pure by design: the same summary is computed for
 * the Progress screen, the weekly export and anything later that wants it.
 */
export function buildWeeklyReview(input: WeeklyReviewInput): WeeklyReview {
  const inRange = input.sessions.filter((s) => s.date >= input.from && s.date <= input.to);
  const runs = inRange.filter((s) => s.type === 'run' || s.type === 'baseline');
  const strength = inRange.filter((s) => s.type === 'strength');

  const completedRuns = runs.filter((s) => s.completion === 'full');
  const attemptedRuns = runs.filter((s) => s.completion !== 'skipped');

  const longestRunSec = runs.reduce((max, s) => Math.max(max, s.prescription?.runSec ?? 0), 0);
  const totalRunSec = runs
    .filter((s) => s.completion !== 'skipped')
    .reduce((sum, s) => {
      const p = s.prescription;
      if (!p) return sum + (s.durationSec ?? 0);
      const done = s.intervalsCompleted ?? p.reps;
      return sum + p.runSec * done;
    }, 0);

  const discomfort = runs
    .filter((s) => s.discomfort)
    .map((s) => ({
      date: s.date,
      location: s.discomfort!.location,
      severity: s.discomfort!.severity,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const sum = (logs: ReviewLogSlice[], key: 'cigarettes' | 'beers' | 'alcoholUnits') =>
    logs.reduce((total, l) => total + (l[key] ?? 0), 0);

  const cigarettes = sum(input.logs, 'cigarettes');
  const beers = sum(input.logs, 'beers');
  const alcoholUnits = sum(input.logs, 'alcoholUnits');
  const clearDays = input.logs.filter((l) => !l.cigarettes && !l.beers && !l.alcoholUnits).length;

  const habits = {
    loggedDays: input.logs.length,
    waterAvgMl: mean(input.logs.map((l) => l.waterMl).filter((n) => n > 0)),
    sleepAvgHours: mean(
      input.logs.map((l) => l.sleepHours).filter((n): n is number => n !== null && n > 0),
    ),
    cigarettes,
    beers,
    alcoholUnits,
    clearDays,
    cigarettesDelta: cigarettes - sum(input.previousLogs, 'cigarettes'),
    drinksDelta:
      beers +
      alcoholUnits -
      (sum(input.previousLogs, 'beers') + sum(input.previousLogs, 'alcoholUnits')),
  };

  const proteinDays = dateRange(input.from, input.to)
    .map((date) => input.proteinByDate[date] ?? 0)
    .filter((g) => g > 0);
  const protein =
    proteinDays.length && input.proteinTargetG
      ? {
          avgG: Math.round(mean(proteinDays) ?? 0),
          daysOnTarget: proteinDays.filter((g) => g >= input.proteinTargetG! * 0.9).length,
          loggedDays: proteinDays.length,
        }
      : null;

  const measurements = input.check
    ? {
        weightKg: input.check.weightKg,
        waistCm: input.check.waistCm,
        restingHr: input.check.restingHr,
        weightDelta: delta(input.check.weightKg, input.previousCheck?.weightKg),
        waistDelta: delta(input.check.waistCm, input.previousCheck?.waistCm),
        restingHrDelta: delta(input.check.restingHr, input.previousCheck?.restingHr),
      }
    : null;

  const notes: string[] = [];

  if (longestRunSec > input.previousLongestRunSec && input.previousLongestRunSec > 0) {
    notes.push(
      `Your longest unbroken interval went from ${Math.round(input.previousLongestRunSec / 60)} to ${Math.round(longestRunSec / 60)} minutes.`,
    );
  }
  if (
    measurements?.waistDelta !== null &&
    measurements?.waistDelta !== undefined &&
    measurements.waistDelta < 0
  ) {
    const steadyWeight =
      measurements.weightDelta !== null && Math.abs(measurements.weightDelta) < 0.5;
    notes.push(
      steadyWeight
        ? `Waist down ${Math.abs(measurements.waistDelta)} cm with weight holding steady — that is muscle arriving while fat leaves, and it is the result to want.`
        : `Waist down ${Math.abs(measurements.waistDelta)} cm.`,
    );
  }
  if (
    measurements?.restingHrDelta !== null &&
    measurements?.restingHrDelta !== undefined &&
    measurements.restingHrDelta <= -2
  ) {
    notes.push(
      `Resting heart rate down ${Math.abs(measurements.restingHrDelta)} bpm. That is the aerobic base building.`,
    );
  }

  const repeated = repeatedSite(discomfort);
  if (repeated) {
    notes.push(
      `Discomfort showed up in the same place (${repeated}) more than once. The same site recurring is the earliest warning of an overuse injury — earlier than pain that stops you.`,
    );
  }

  if (habits.cigarettesDelta < 0)
    notes.push(`${Math.abs(habits.cigarettesDelta)} fewer cigarettes than last week.`);
  if (habits.clearDays >= 5 && habits.loggedDays >= 5)
    notes.push(`${habits.clearDays} clear days.`);
  if (habits.sleepAvgHours !== null && habits.sleepAvgHours < 6.5) {
    notes.push(
      'Sleep averaged under six and a half hours. Tendon repair happens there, not on the run.',
    );
  }
  if (
    input.regimen &&
    input.regimen.due > 0 &&
    input.regimen.rate !== null &&
    input.regimen.rate >= 0.9
  ) {
    notes.push(`${Math.round(input.regimen.rate * 100)}% of your doses ticked off.`);
  }

  return {
    from: input.from,
    to: input.to,
    runs: {
      completed: completedRuns.length,
      attempted: attemptedRuns.length,
      planned: input.plannedRuns,
    },
    strength: {
      completed: strength.filter((s) => s.completion === 'full').length,
      planned: input.plannedStrength,
    },
    longestRunSec,
    longestRunDeltaSec: longestRunSec - input.previousLongestRunSec,
    totalRunSec,
    discomfort,
    habits,
    protein,
    measurements,
    regimen: input.regimen,
    headline: headlineFor(
      completedRuns.length,
      attemptedRuns.length,
      input.plannedRuns,
      discomfort,
    ),
    notes,
  };
}

function repeatedSite(discomfort: { location: DiscomfortLocation }[]): DiscomfortLocation | null {
  const counts = new Map<DiscomfortLocation, number>();
  for (const entry of discomfort) counts.set(entry.location, (counts.get(entry.location) ?? 0) + 1);
  for (const [site, count] of counts) if (count >= 2) return site;
  return null;
}

/**
 * The one line at the top. A week with nothing in it is described, not judged —
 * the no-guilt rule that governs reminders governs this too.
 */
function headlineFor(
  completed: number,
  attempted: number,
  planned: number,
  discomfort: { severity: number }[],
): string {
  const worst = discomfort.reduce((max, d) => Math.max(max, d.severity), 0);

  if (attempted === 0) {
    return 'No sessions this week. The plan is exactly where you left it.';
  }
  if (completed >= planned && planned > 0 && worst < 3) {
    return 'Every session done, nothing above mild discomfort. This is what a week is meant to look like.';
  }
  if (worst >= 4) {
    return 'You logged discomfort at 4 or above this week — that is the week worth paying attention to.';
  }
  if (completed >= planned && planned > 0) {
    return 'Every session done, with some discomfort logged along the way.';
  }
  return `${completed} of ${planned || attempted} sessions finished. Repeating a week is a normal outcome, not a setback.`;
}
