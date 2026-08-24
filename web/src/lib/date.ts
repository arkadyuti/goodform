/** Local calendar date — the user's day, not UTC's. */
export function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function shiftDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayName(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' });
}

export function shortDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function isToday(date: string): boolean {
  return date === today();
}

/**
 * The weekly rhythm now lives in the shared package, because the reminder
 * scheduler needs the same answer the client does. Re-exported here so every
 * existing call site keeps working.
 */
export { scheduleFor, type ScheduledDay } from '@goodform/shared';

/** Local wall-clock time as `HH:MM` — what "overdue" is measured against. */
export function nowTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}
