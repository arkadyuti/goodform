import { weekdayOf } from './dates.js';

export type ScheduledDay = 'run' | 'strength' | 'rest';

/** Which weekdays carry which session. Sunday is 0, matching `weekdayOf`. */
export interface TrainingDays {
  run: number[];
  strength: number[];
}

/**
 * FR-5.3. The default rhythm: runs on Mon/Wed/Sat, strength on Tue/Fri —
 * always a day between a run and the strength work.
 */
export const DEFAULT_TRAINING_DAYS: TrainingDays = { run: [1, 3, 6], strength: [2, 5] };

/** How many runs a week the plan engine builds for. The picker matches it. */
export const RUN_DAYS_PER_WEEK = 3;

/**
 * What a given date asks for.
 *
 * The rhythm used to be hard-coded, which meant anyone who works Saturdays had
 * an app calling their training days rest days with no way to move them. It is
 * a setting now; the default is unchanged, and callers that have no settings to
 * hand still get it.
 *
 * Shared rather than client-only because the reminder scheduler has to know
 * what today asks for before it can decide whether to say anything about it.
 */
export function scheduleFor(
  date: string,
  days: TrainingDays = DEFAULT_TRAINING_DAYS,
): ScheduledDay {
  const day = weekdayOf(date);
  if (days.run.includes(day)) return 'run';
  if (days.strength.includes(day)) return 'strength';
  return 'rest';
}

/**
 * True when two run days fall on consecutive days.
 *
 * This is the arrangement the app warns about everywhere else — "back-to-back
 * running days are where beginners actually get hurt", because the load lands
 * on tissue that has not finished repairing. Not forbidden; the app advises and
 * then gets out of the way. The default rhythm (Mon/Wed/Sat) has no such pair.
 */
export function hasBackToBackRuns(days: TrainingDays): boolean {
  return days.run.some((day) => days.run.includes((day + 1) % 7));
}

/** Day names in the order `weekdayOf` returns, Sunday first. */
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Which days a kind of session lands on, named.
 *
 * The rhythm was hard-coded in `scheduleFor` and stated nowhere a user could
 * read it, so someone who works Saturdays had an app calling their training
 * days rest days with no explanation. Deriving the names from the same rule
 * that schedules them means the two cannot drift apart.
 */
export function daysFor(kind: ScheduledDay, days: TrainingDays = DEFAULT_TRAINING_DAYS): string[] {
  return DAY_NAMES.filter((_, day) => scheduleFor(dateForWeekday(day), days) === kind);
}

/** Sunday-first day names, for a picker. */
export const WEEKDAY_NAMES = DAY_NAMES;

/** Any date falling on the given weekday — 2026-08-23 is a Sunday. */
function dateForWeekday(day: number): string {
  const base = new Date(Date.UTC(2026, 7, 23 + day));
  return base.toISOString().slice(0, 10);
}

/** "Monday, Wednesday and Saturday" */
export function listDays(days: string[]): string {
  if (days.length <= 1) return days[0] ?? '';
  return `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}`;
}
