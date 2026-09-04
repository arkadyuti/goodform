import { addDays, dateRange, weekdayOf } from './dates.js';
import { attended, runCounts, strengthCounts, type Countable } from './counting.js';
import { inWindow, type WeekWindow } from './plan-engine/weeks.js';

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
  week?: WeekContext,
): ScheduledDay {
  if (week && inWindow(date, week.window)) return askedFor(date, days, week);
  return rota(date, days);
}

function rota(date: string, days: TrainingDays): ScheduledDay {
  const day = weekdayOf(date);
  if (days.run.includes(day)) return 'run';
  if (days.strength.includes(day)) return 'strength';
  return 'rest';
}

/** How many strength sessions a week asks for. */
export const STRENGTH_DAYS_PER_WEEK = 2;

/**
 * The week a date belongs to, and what has happened in it so far.
 *
 * Sessions may cover more than the window; only those inside it are read.
 */
export interface WeekContext {
  window: WeekWindow;
  sessions: (Countable & { date: string; type: string })[];
  runsPerWeek: number;
  strengthPerWeek?: number;
}

/**
 * What a date asks for, given the week it sits in.
 *
 * The rota above is a preference, not a timetable. A week is a quota — three
 * runs and two strength sessions by Sunday — and a preferred day that was
 * missed does not make the session disappear, it makes it still owed. So:
 * a preferred day asks for its session while one is owed; any other day
 * asks for one only when the preferred days left cannot absorb what is owed;
 * and no day asks for a run the day after one, because back-to-back running
 * is where beginners get hurt. Once the quota is met, the rest of the week is
 * rest — including preferred days.
 */
function askedFor(date: string, days: TrainingDays, week: WeekContext): ScheduledDay {
  const inside = week.sessions.filter((s) => inWindow(s.date, week.window) && attended(s));
  const isRun = (s: { type: string }) => s.type === 'run' || s.type === 'baseline';
  // Turned up to run that day — what decides back-to-back load, and what makes
  // a day "a run day" once one has happened on it.
  const ran = (d: string) => inside.some((s) => s.date === d && isRun(s));
  const lifted = (d: string) => inside.some((s) => s.date === d && s.type === 'strength');
  // Ran enough for it to count — the same rule the week's verdict applies, so
  // the schedule aims at a week the verdict will accept. A run cut short is
  // still owed.
  const ranEnough = (d: string) => inside.some((s) => s.date === d && isRun(s) && runCounts(s));
  const liftedEnough = (d: string) =>
    inside.some((s) => s.date === d && s.type === 'strength' && strengthCounts(s));

  // A day that already has a session is that kind of day, whatever was planned.
  if (ran(date)) return 'run';
  if (lifted(date)) return 'strength';

  const daysDone = (test: (d: string) => boolean) =>
    new Set(inside.map((s) => s.date).filter(test)).size;
  const runsLeft = Math.max(0, week.runsPerWeek - daysDone(ranEnough));
  const strengthLeft = Math.max(
    0,
    (week.strengthPerWeek ?? STRENGTH_DAYS_PER_WEEK) - daysDone(liftedEnough),
  );

  const weekday = weekdayOf(date);
  const ahead = date < week.window.to ? dateRange(addDays(date, 1), week.window.to) : [];
  const runDaysAhead = ahead.filter((d) => days.run.includes(weekdayOf(d))).length;
  const strengthDaysAhead = ahead.filter((d) => days.strength.includes(weekdayOf(d))).length;

  const canRun = runsLeft > 0 && !ran(addDays(date, -1));

  if (days.run.includes(weekday) && canRun) return 'run';
  // A run the preferred days left cannot hold outranks a strength day: running
  // is what the week is judged on, and strength does not gate progression.
  if (canRun && runDaysAhead < runsLeft) return 'run';
  if (days.strength.includes(weekday) && strengthLeft > 0) return 'strength';
  // Off-day make-up: only when the preferred days left cannot hold what is owed.
  if (strengthLeft > 0 && strengthDaysAhead < strengthLeft) return 'strength';
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
