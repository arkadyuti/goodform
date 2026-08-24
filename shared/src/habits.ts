import type { DailyLog } from './types.js';

/** Consecutive days up to and including `today` with zero of the tracked thing. */
export function daysClear(
  logs: Pick<DailyLog, 'date' | 'cigarettes' | 'alcoholUnits'>[],
  key: 'cigarettes' | 'alcoholUnits',
): number {
  const sorted = [...logs].sort((a, b) => (a.date < b.date ? 1 : -1));
  let count = 0;
  for (const log of sorted) {
    if ((log[key] ?? 0) > 0) break;
    count += 1;
  }
  return count;
}

export function sumOver(
  logs: Pick<DailyLog, 'date' | 'cigarettes' | 'alcoholUnits'>[],
  key: 'cigarettes' | 'alcoholUnits',
): number {
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
