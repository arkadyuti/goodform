import { describe, expect, it } from 'vitest';
import { DEFAULT_TRAINING_DAYS, scheduleFor, type WeekContext } from './schedule.js';

// 2026-08-31 is a Monday. Default days: runs Mon/Wed/Sat, strength Tue/Fri.
const window = { from: '2026-08-31', to: '2026-09-06' };
const ctx = (sessions: WeekContext['sessions']): WeekContext => ({
  window,
  sessions,
  runsPerWeek: 3,
});
const run = (date: string, completion: 'full' | 'partial' | 'skipped' = 'full') => ({
  date,
  type: 'run',
  completion,
  // A partial here is a real cut-short: three of eight.
  intervalsCompleted: completion === 'full' ? 8 : completion === 'partial' ? 3 : null,
  prescription: { reps: 8 },
});
const lift = (date: string) => ({ date, type: 'strength', completion: 'full' as const });

describe('scheduleFor without a week', () => {
  it('follows the rota', () => {
    expect(scheduleFor('2026-08-31')).toBe('run');
    expect(scheduleFor('2026-09-01')).toBe('strength');
    expect(scheduleFor('2026-09-03')).toBe('rest');
  });
});

describe('scheduleFor within a week', () => {
  it('asks for the preferred session on a preferred day', () => {
    expect(scheduleFor('2026-08-31', DEFAULT_TRAINING_DAYS, ctx([]))).toBe('run');
    // Monday's run done, so Wednesday and Saturday can hold the other two and
    // Tuesday is free to be what it is.
    expect(scheduleFor('2026-09-01', DEFAULT_TRAINING_DAYS, ctx([run('2026-08-31')]))).toBe(
      'strength',
    );
  });

  it('a run that will not otherwise fit outranks a strength day', () => {
    // Monday missed. Wednesday and Saturday can hold two runs, not three, so
    // Tuesday runs — the alternative is a week that fails on Sunday.
    expect(scheduleFor('2026-09-01', DEFAULT_TRAINING_DAYS, ctx([]))).toBe('run');
  });

  it('is what it was once a session is logged', () => {
    // A Thursday run stays a run day, so the card can say "run it again".
    expect(scheduleFor('2026-09-03', DEFAULT_TRAINING_DAYS, ctx([run('2026-09-03')]))).toBe('run');
  });

  it('rests on a preferred day once the quota is met', () => {
    const runs = [run('2026-08-31'), run('2026-09-02'), run('2026-09-03')];
    const all = ctx([...runs, lift('2026-09-01'), lift('2026-09-04')]);
    expect(scheduleFor('2026-09-05', DEFAULT_TRAINING_DAYS, all)).toBe('rest');
    // Runs done but no strength yet, and no preferred strength day left:
    // Saturday takes it rather than letting it go.
    expect(scheduleFor('2026-09-05', DEFAULT_TRAINING_DAYS, ctx(runs))).toBe('strength');
  });

  it('never asks for a run the day after one', () => {
    // Ran Tuesday off-plan; Wednesday is a preferred run day but is not asked for.
    const runs = [run('2026-08-31'), run('2026-09-01')];
    expect(scheduleFor('2026-09-02', DEFAULT_TRAINING_DAYS, ctx(runs))).not.toBe('run');
    const lifted = ctx([...runs, lift('2026-09-01'), lift('2026-09-04')]);
    expect(scheduleFor('2026-09-02', DEFAULT_TRAINING_DAYS, lifted)).toBe('rest');
  });

  it('moves a missed session to another day only when the preferred days cannot hold it', () => {
    // Nothing done by Thursday. Saturday is the one preferred run day left and
    // two runs are owed, so Thursday becomes a run day.
    expect(scheduleFor('2026-09-03', DEFAULT_TRAINING_DAYS, ctx([]))).toBe('run');
    // One run done, two owed, one preferred day left: Thursday still runs.
    expect(scheduleFor('2026-09-03', DEFAULT_TRAINING_DAYS, ctx([run('2026-08-31')]))).toBe(
      'run',
    );
    // Two done, one owed: Saturday can hold it, and Thursday takes the
    // strength session that Friday alone cannot.
    const two = ctx([run('2026-08-31'), run('2026-09-02')]);
    expect(scheduleFor('2026-09-03', DEFAULT_TRAINING_DAYS, two)).toBe('strength');
  });

  it('a run cut short is still owed', () => {
    // Monday finished, Tuesday three of eight. One run counts, two are owed,
    // and Saturday alone cannot hold two — so Friday runs, Saturday lifts
    // (no run the day after one), Sunday runs.
    const c = ctx([run('2026-08-31'), run('2026-09-01', 'partial')]);
    expect(scheduleFor('2026-09-04', DEFAULT_TRAINING_DAYS, c)).toBe('run');
    const friday = ctx([...c.sessions, run('2026-09-04')]);
    expect(scheduleFor('2026-09-05', DEFAULT_TRAINING_DAYS, friday)).toBe('strength');
    const saturday = ctx([...friday.sessions, lift('2026-09-05')]);
    expect(scheduleFor('2026-09-06', DEFAULT_TRAINING_DAYS, saturday)).toBe('run');
  });

  it('a run that nearly finished counts, as it does for the verdict', () => {
    const nearly = { ...run('2026-09-01'), completion: 'partial' as const, intervalsCompleted: 7 };
    const c = ctx([run('2026-08-31'), nearly]);
    // Two count; Saturday holds the third, so Thursday is free for strength.
    expect(scheduleFor('2026-09-03', DEFAULT_TRAINING_DAYS, c)).toBe('strength');
  });

  it('a skipped session is still owed', () => {
    const c = ctx([run('2026-08-31', 'skipped')]);
    expect(scheduleFor('2026-09-02', DEFAULT_TRAINING_DAYS, c)).toBe('run');
  });

  it('counts a day, not a session, so two logs on one day are one', () => {
    const c = ctx([run('2026-08-31'), run('2026-08-31', 'partial'), lift('2026-09-01')]);
    // Two run rows on Monday are one run; two are still owed.
    expect(scheduleFor('2026-09-02', DEFAULT_TRAINING_DAYS, c)).toBe('run');
  });

  it('falls back to the rota outside the window', () => {
    expect(scheduleFor('2026-09-07', DEFAULT_TRAINING_DAYS, ctx([]))).toBe('run');
  });
});
