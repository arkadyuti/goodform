import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '../types.js';
import { settleWeeks, windowContaining, windowFrom, type SettleWeek } from './weeks.js';

// 2026-08-24 is a Monday.
const week = (index: number, extra: Partial<SettleWeek> = {}): SettleWeek => ({
  index,
  runSec: 60,
  walkSec: 90,
  reps: 8,
  sessionsPerWeek: 3,
  isDeload: false,
  totalRunSec: 60 * 8 * 3,
  repeats: 0,
  startedOn: null,
  ...extra,
});

const run = (date: string, extra: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id: date,
  date,
  type: 'run',
  planWeek: 1,
  prescription: { runSec: 60, walkSec: 90, reps: 8 },
  completion: 'full',
  effort: 3,
  discomfort: null,
  intervalsCompleted: 8,
  durationSec: 1200,
  notes: null,
  ...extra,
});

const cutShort = (date: string) => run(date, { completion: 'partial', intervalsCompleted: 3 });

describe('windowFrom', () => {
  it('runs Monday to Sunday', () => {
    expect(windowFrom('2026-08-24')).toEqual({ from: '2026-08-24', to: '2026-08-30' });
  });

  it('keeps a Wednesday start in its own week', () => {
    expect(windowFrom('2026-08-26')).toEqual({ from: '2026-08-26', to: '2026-08-30' });
  });

  it('gives a late start the Sunday after next', () => {
    // A three-day first week would be judged to have missed two sessions.
    expect(windowFrom('2026-08-27')).toEqual({ from: '2026-08-27', to: '2026-09-06' });
    expect(windowFrom('2026-08-30')).toEqual({ from: '2026-08-30', to: '2026-09-06' });
  });
});

describe('windowContaining', () => {
  it('reads the plan as contiguous windows from its start', () => {
    expect(windowContaining('2026-08-27', '2026-09-01')).toEqual({
      from: '2026-08-27',
      to: '2026-09-06',
    });
    expect(windowContaining('2026-08-27', '2026-09-07')).toEqual({
      from: '2026-09-07',
      to: '2026-09-13',
    });
  });

  it('has nothing to say before the plan began', () => {
    expect(windowContaining('2026-08-27', '2026-08-26')).toBeNull();
  });
});

describe('settleWeeks', () => {
  const plan = { currentWeek: 1, startDate: '2026-08-24' };
  const weeks = [week(1), week(2), week(3)];

  it('leaves an open week alone', () => {
    const out = settleWeeks(plan, weeks, [], '2026-08-30');
    expect(out.actions).toEqual([]);
    expect(out.currentWeek).toBe(1);
    expect(out.weeks[0]!.startedOn).toBe('2026-08-24');
  });

  it('moves on when the target was met', () => {
    const done = [run('2026-08-24'), run('2026-08-26'), run('2026-08-29')];
    const out = settleWeeks(plan, weeks, done, '2026-08-31');
    expect(out.actions.map((a) => a.kind)).toEqual(['advanced']);
    expect(out.currentWeek).toBe(2);
    expect(out.weeks[1]!.startedOn).toBe('2026-08-31');
  });

  it('comes round again when it was not', () => {
    // Finished one, cut two short: a week of training, not a finished week.
    const done = [run('2026-08-24'), cutShort('2026-08-26'), cutShort('2026-08-29')];
    const out = settleWeeks(plan, weeks, done, '2026-08-31');
    expect(out.actions.map((a) => a.kind)).toEqual(['repeated']);
    expect(out.currentWeek).toBe(1);
    expect(out.weeks[0]!.repeats).toBe(1);
    expect(out.weeks[0]!.startedOn).toBe('2026-08-31');
  });

  it('shifts every later week with it', () => {
    const done = [cutShort('2026-08-24')];
    const first = settleWeeks(plan, weeks, done, '2026-08-31');
    const then = [...done, run('2026-08-31'), run('2026-09-02'), run('2026-09-05')];
    const out = settleWeeks(
      { ...plan, currentWeek: first.currentWeek },
      first.weeks,
      then,
      '2026-09-07',
    );
    expect(out.currentWeek).toBe(2);
    // Week two starts a week later than the calendar alone would have put it.
    expect(out.weeks[1]!.startedOn).toBe('2026-09-07');
  });

  it('waits through a week with no running in it without counting it', () => {
    const out = settleWeeks(plan, weeks, [], '2026-09-15');
    expect(out.actions.map((a) => a.kind)).toEqual(['waited', 'waited', 'waited']);
    expect(out.weeks[0]!.repeats).toBe(0);
    expect(out.weeks[0]!.startedOn).toBe('2026-09-14');
  });

  it('settles several closed weeks in one go', () => {
    const done = [
      run('2026-08-24'),
      run('2026-08-26'),
      run('2026-08-29'),
      run('2026-08-31'),
      run('2026-09-02'),
      run('2026-09-05'),
    ];
    const out = settleWeeks(plan, weeks, done, '2026-09-08');
    expect(out.actions.map((a) => a.kind)).toEqual(['advanced', 'advanced']);
    expect(out.currentWeek).toBe(3);
    expect(out.weeks[2]!.startedOn).toBe('2026-09-07');
  });

  it('finishes the block after its last week', () => {
    const last = { currentWeek: 3, startDate: '2026-08-24' };
    const three = [week(1), week(2), week(3, { startedOn: '2026-09-07' })];
    const done = [run('2026-09-07'), run('2026-09-09'), run('2026-09-12')];
    const out = settleWeeks(last, three, done, '2026-09-14');
    expect(out.completed).toBe(true);
    expect(out.actions.at(-1)?.kind).toBe('completed');
  });

  it('falls back to the plan start for rows recorded before the column existed', () => {
    const out = settleWeeks(plan, [week(1, { startedOn: null })], [], '2026-08-26');
    expect(out.weeks[0]!.startedOn).toBe('2026-08-24');
  });

  it('gives a Wednesday start until Sunday, then repeats on the Monday', () => {
    // The live plan: begun 26 Aug, three runs of which one finished.
    const p = { currentWeek: 1, startDate: '2026-08-26' };
    const done = [cutShort('2026-08-26'), cutShort('2026-08-28'), run('2026-08-29')];
    const out = settleWeeks(p, weeks, done, '2026-09-03');
    expect(out.actions).toHaveLength(1);
    expect(out.actions[0]).toMatchObject({
      kind: 'repeated',
      window: { from: '2026-08-26', to: '2026-08-30' },
    });
    expect(out.weeks[0]!.startedOn).toBe('2026-08-31');
  });
});
