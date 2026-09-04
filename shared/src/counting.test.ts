import { describe, expect, it } from 'vitest';
import { attended, fractionDone, runCounts, strengthCounts } from './counting.js';

const eight = { reps: 8 };

describe('one rule for whether a session counts', () => {
  it('counts a finished run', () => {
    expect(runCounts({ completion: 'full', intervalsCompleted: 8, prescription: eight })).toBe(true);
  });

  it('counts a run that nearly finished, and not one cut well short', () => {
    expect(runCounts({ completion: 'partial', intervalsCompleted: 7, prescription: eight })).toBe(true);
    expect(runCounts({ completion: 'partial', intervalsCompleted: 6, prescription: eight })).toBe(false);
    expect(runCounts({ completion: 'partial', intervalsCompleted: 3, prescription: eight })).toBe(false);
  });

  it('treats a partial with no interval count as attendance only', () => {
    const backfilled = { completion: 'partial' as const, intervalsCompleted: null, prescription: eight };
    expect(attended(backfilled)).toBe(true);
    expect(fractionDone(backfilled)).toBe(0);
    expect(runCounts(backfilled)).toBe(false);
  });

  it('never counts a session that was called off', () => {
    expect(attended({ completion: 'skipped' })).toBe(false);
    expect(runCounts({ completion: 'skipped', intervalsCompleted: 8, prescription: eight })).toBe(false);
    expect(strengthCounts({ completion: 'skipped' })).toBe(false);
  });

  it('counts a strength session you turned up to', () => {
    expect(strengthCounts({ completion: 'partial' })).toBe(true);
  });
});
