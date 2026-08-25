import { describe, expect, it } from 'vitest';
import { buildWeeklyReview, type WeeklyReviewInput } from './review.js';
import { assessNutritionRisk } from './guardrails.js';
import type { WorkoutSession } from './types.js';

function session(over: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 'x',
    date: '2026-08-24',
    type: 'run',
    planWeek: 3,
    prescription: { runSec: 300, walkSec: 60, reps: 4 },
    completion: 'full',
    effort: 3,
    discomfort: null,
    intervalsCompleted: 4,
    durationSec: 1440,
    notes: null,
    ...over,
  };
}

function input(over: Partial<WeeklyReviewInput> = {}): WeeklyReviewInput {
  return {
    from: '2026-08-24',
    to: '2026-08-30',
    sessions: [],
    plannedRuns: 3,
    plannedStrength: 2,
    logs: [],
    previousLogs: [],
    proteinByDate: {},
    proteinTargetG: 105,
    check: null,
    previousCheck: null,
    previousLongestRunSec: 0,
    regimen: null,
    ...over,
  };
}

const log = (date: string, over: Partial<{ cigarettes: number; beers: number; alcoholUnits: number; sleepHours: number | null; waterMl: number }> = {}) => ({
  date,
  waterMl: 2000,
  sleepHours: 7,
  alcoholUnits: 0,
  beers: 0,
  cigarettes: 0,
  ...over,
});

describe('buildWeeklyReview', () => {
  it('counts finished, attempted and planned runs separately', () => {
    const review = buildWeeklyReview(
      input({
        sessions: [
          session(),
          session({ id: 'b', date: '2026-08-26', completion: 'partial' }),
          session({ id: 'c', date: '2026-08-29', completion: 'skipped' }),
        ],
      }),
    );
    expect(review.runs).toEqual({ completed: 1, attempted: 2, planned: 3 });
  });

  it('ignores sessions outside the week', () => {
    const review = buildWeeklyReview(input({ sessions: [session({ date: '2026-08-23' })] }));
    expect(review.runs.completed).toBe(0);
  });

  it('counts running time from what was actually completed, not prescribed', () => {
    const review = buildWeeklyReview(
      input({ sessions: [session({ completion: 'partial', intervalsCompleted: 2 })] }),
    );
    expect(review.totalRunSec).toBe(600);
  });

  it('describes a blank week without judging it', () => {
    const review = buildWeeklyReview(input());
    expect(review.headline).toContain('exactly where you left it');
    expect(review.headline.toLowerCase()).not.toMatch(/failed|should have|missed/);
  });

  it('reads a steady weight with a shrinking waist as the win it is', () => {
    const review = buildWeeklyReview(
      input({
        check: { date: '2026-08-30', weightKg: 82, waistCm: 92, restingHr: 58, capability: {} },
        previousCheck: { date: '2026-08-23', weightKg: 82.2, waistCm: 93.5, restingHr: 61, capability: {} },
      }),
    );
    expect(review.measurements?.waistDelta).toBe(-1.5);
    expect(review.notes.join(' ')).toContain('muscle arriving while fat leaves');
    expect(review.notes.join(' ')).toContain('Resting heart rate down 3');
  });

  it('flags the same discomfort site appearing twice', () => {
    const review = buildWeeklyReview(
      input({
        sessions: [
          session({ discomfort: { location: 'shin', severity: 3 } }),
          session({ id: 'b', date: '2026-08-27', discomfort: { location: 'shin', severity: 2 } }),
        ],
      }),
    );
    expect(review.notes.join(' ')).toContain('shin');
    expect(review.notes.join(' ')).toContain('earliest warning');
  });

  it('reports habit movement against the week before', () => {
    const review = buildWeeklyReview(
      input({
        logs: [log('2026-08-24', { cigarettes: 2 }), log('2026-08-25')],
        previousLogs: [log('2026-08-17', { cigarettes: 6 })],
      }),
    );
    expect(review.habits.cigarettesDelta).toBe(-4);
    expect(review.notes.join(' ')).toContain('4 fewer cigarettes');
  });

  it('averages protein over logged days only', () => {
    const review = buildWeeklyReview(
      input({ proteinByDate: { '2026-08-24': 100, '2026-08-25': 120 } }),
    );
    expect(review.protein).toEqual({ avgG: 110, daysOnTarget: 2, loggedDays: 2 });
  });

  it('has no protein section when nothing was logged', () => {
    expect(buildWeeklyReview(input()).protein).toBeNull();
  });
});

describe('assessNutritionRisk', () => {
  const base = {
    heightCm: 175,
    proteinByDate: {},
    proteinTargetG: 105,
    sessionDates: [],
    today: '2026-08-24',
  };

  it('stays quiet on an ordinary month', () => {
    const result = assessNutritionRisk({
      ...base,
      checks: [
        { date: '2026-08-24', weightKg: 81.5 },
        { date: '2026-08-10', weightKg: 82 },
      ],
    });
    expect(result.triggered).toBe(false);
  });

  it('fires when weight is coming off faster than about 1% a week', () => {
    const result = assessNutritionRisk({
      ...base,
      checks: [
        { date: '2026-08-24', weightKg: 76 },
        { date: '2026-07-27', weightKg: 84 },
      ],
    });
    expect(result.signals.map((s) => s.id)).toContain('rapid_loss');
  });

  it('fires on a body mass low enough that a deficit is the wrong direction', () => {
    const result = assessNutritionRisk({ ...base, checks: [{ date: '2026-08-24', weightKg: 54 }] });
    expect(result.signals.map((s) => s.id)).toContain('low_bmi');
  });

  it('fires on sustained heavy under-eating while weight falls', () => {
    const proteinByDate = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`2026-08-${String(15 + i).padStart(2, '0')}`, 30]),
    );
    const result = assessNutritionRisk({
      ...base,
      proteinByDate,
      checks: [
        { date: '2026-08-24', weightKg: 80 },
        { date: '2026-08-10', weightKg: 81 },
      ],
    });
    expect(result.signals.map((s) => s.id)).toContain('sustained_undereating');
  });

  it('does not read a low protein log alone as under-eating', () => {
    const proteinByDate = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [`2026-08-${String(15 + i).padStart(2, '0')}`, 30]),
    );
    const result = assessNutritionRisk({ ...base, proteinByDate, checks: [] });
    expect(result.signals.map((s) => s.id)).not.toContain('sustained_undereating');
  });

  it('fires on training nearly every day', () => {
    const sessionDates = Array.from({ length: 13 }, (_, i) => `2026-08-${String(12 + i).padStart(2, '0')}`);
    const result = assessNutritionRisk({ ...base, sessionDates, checks: [] });
    expect(result.signals.map((s) => s.id)).toContain('compulsive_training');
  });

  it('never diagnoses anybody', () => {
    const message = assessNutritionRisk({ ...base, checks: [{ date: '2026-08-24', weightKg: 50 }] }).message;
    expect(message.toLowerCase()).not.toMatch(/disorder|anorexi|bulimi|diagnos/);
    expect(message).toContain('Settings');
  });
});
