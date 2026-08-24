import { weekdayOf } from './dates.js';

export type ScheduledDay = 'run' | 'strength' | 'rest';

/**
 * FR-5.3. Sessions land on a fixed weekly rhythm: runs on Mon/Wed/Sat,
 * strength on Tue/Fri — always a day between a run and the strength work.
 *
 * Shared rather than client-only because the reminder scheduler has to know
 * what today asks for before it can decide whether to say anything about it.
 */
export function scheduleFor(date: string): ScheduledDay {
  const day = weekdayOf(date);
  if (day === 1 || day === 3 || day === 6) return 'run';
  if (day === 2 || day === 5) return 'strength';
  return 'rest';
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
export function daysFor(kind: ScheduledDay): string[] {
  return DAY_NAMES.filter((_, day) => scheduleFor(dateForWeekday(day)) === kind);
}

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
