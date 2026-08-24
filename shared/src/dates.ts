/**
 * Calendar arithmetic on plain `YYYY-MM-DD` strings.
 *
 * Everything here treats a date as a label on a wall calendar, never as an
 * instant. Parsing at UTC noon keeps a day from sliding into its neighbour when
 * the host is west of Greenwich, and keeps DST out of day counting entirely —
 * which matters once schedules have to survive travel (P3.1).
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function isDateString(value: string): boolean {
  return DATE_PATTERN.test(value);
}

function noon(date: string): number {
  return Date.parse(`${date}T12:00:00Z`);
}

function toDateString(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return toDateString(noon(date) + days * DAY_MS);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((noon(to) - noon(from)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday, matching `Date.prototype.getDay`. */
export function weekdayOf(date: string): number {
  return new Date(noon(date)).getUTCDay();
}

/** Monday of the week containing `date` — the week GoodForm reviews. */
export function startOfWeek(date: string): string {
  const day = weekdayOf(date);
  return addDays(date, day === 0 ? -6 : 1 - day);
}

/** Every date from `from` to `to` inclusive. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// ---------------------------------------------------------------------------
// Times of day
// ---------------------------------------------------------------------------

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isTimeString(value: string): boolean {
  return TIME_PATTERN.test(value);
}

/** Minutes since local midnight for an `HH:MM` string. */
export function minutesOfDay(time: string): number {
  const match = TIME_PATTERN.exec(time);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function timeFromMinutes(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  return `${String(h).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

/**
 * True when `time` falls inside a window that may wrap past midnight — which
 * quiet hours nearly always do.
 */
export function withinWindow(time: string, from: string, to: string): boolean {
  const t = minutesOfDay(time);
  const start = minutesOfDay(from);
  const end = minutesOfDay(to);
  if (start === end) return false;
  return start < end ? t >= start && t < end : t >= start || t < end;
}
