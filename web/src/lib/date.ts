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
 * Sessions land on a fixed weekly rhythm: runs on Mon/Wed/Sat, strength on
 * Tue/Fri — always a day between a run and the strength work (FR-5.3).
 */
export function scheduleFor(date: string): 'run' | 'strength' | 'rest' {
  const day = new Date(`${date}T12:00:00`).getDay();
  if (day === 1 || day === 3 || day === 6) return 'run';
  if (day === 2 || day === 5) return 'strength';
  return 'rest';
}
