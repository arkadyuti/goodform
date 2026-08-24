import type { DailyLog } from './types.js';

type HabitKey = 'cigarettes' | 'alcoholUnits' | 'beers';
type LogSlice = Pick<DailyLog, 'date' | 'cigarettes' | 'alcoholUnits' | 'beers'>;

/**
 * Consecutive days up to and including the latest log with none of the given
 * things recorded. Alcohol takes several keys, since a beer and a measured
 * unit are the same abstinence broken.
 */
export function daysClear(logs: LogSlice[], keys: HabitKey | HabitKey[]): number {
  const wanted = Array.isArray(keys) ? keys : [keys];
  const sorted = [...logs].sort((a, b) => (a.date < b.date ? 1 : -1));
  let count = 0;
  for (const log of sorted) {
    if (wanted.some((key) => (log[key] ?? 0) > 0)) break;
    count += 1;
  }
  return count;
}

export function sumOver(logs: LogSlice[], key: HabitKey): number {
  return logs.reduce((total, log) => total + (log[key] ?? 0), 0);
}

/**
 * Money not spent, from a baseline daily habit the user states themselves.
 * Framed as a gain, never as a scolding about what was spent.
 */
export function moneySaved(params: {
  baselinePerDay: number;
  unitCost: number;
  actualTotal: number;
  days: number;
}): number {
  const expected = params.baselinePerDay * params.days;
  return Math.max(0, (expected - params.actualTotal) * params.unitCost);
}
