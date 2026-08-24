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
