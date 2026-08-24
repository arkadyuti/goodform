import { describe, expect, it } from 'vitest';
import type { Baseline, PlanWeek, Profile, WorkoutSession } from '../types.js';
import { MAX_WEEKLY_GROWTH, generatePlan } from './generate.js';
import { evaluateWeek, returnFromBreak } from './gating.js';
import { buildStrengthSessions, substitute } from './strength.js';
import { STRENGTH_EXERCISES } from '../content/strength.js';

const baseProfile: Profile = {
  age: 30,
  sexAtBirth: 'male',
  heightCm: 175,
  weightKg: 70,
  units: 'metric',
  dietaryPattern: 'omnivore',
  exclusions: [],
  activityLevel: 'occasional_sport',
  smokingStatus: 'never',
  alcoholFrequency: 'occasional',
  injuryHistory: [],
  equipment: ['none'],
  goal: 'first_continuous_run',
};

const breathBaseline: Baseline = { minutesRun: 8, stopReason: 'breath', recordedAt: '2026-08-24' };
const legBaseline: Baseline = { minutesRun: 6, stopReason: 'legs', recordedAt: '2026-08-24' };

function session(over: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 'x',
    date: '2026-08-24',
    type: 'run',
    planWeek: 1,
    prescription: null,
    completion: 'full',
    effort: 3,
    discomfort: null,
    intervalsCompleted: 6,
    durationSec: 1200,
    notes: null,
    ...over,
  };
}

const week: PlanWeek = {
  index: 1,
  runSec: 120,
  walkSec: 60,
  reps: 6,
  sessionsPerWeek: 3,
  isDeload: false,
  totalRunSec: 2160,
};

describe('generatePlan', () => {
  it('produces a 6–12 week block of three sessions a week', () => {
    const plan = generatePlan(baseProfile, breathBaseline, '2026-08-24');
    expect(plan.weeks.length).toBeGreaterThanOrEqual(6);
    expect(plan.weeks.length).toBeLessThanOrEqual(12);
    expect(plan.weeks.every((w) => w.sessionsPerWeek === 3)).toBe(true);
    expect(plan.weeks.map((w) => w.index)).toEqual(plan.weeks.map((_, i) => i + 1));
  });

  it('never increases weekly running time by more than 10% (FR-2.2)', () => {
    const profiles: Profile[] = [
      baseProfile,
      { ...baseProfile, goal: 'five_k' },
      { ...baseProfile, goal: 'ten_k' },
      { ...baseProfile, age: 52, smokingStatus: 'current', injuryHistory: ['shin'], activityLevel: 'none' },
    ];
    for (const profile of profiles) {
      for (const baseline of [breathBaseline, legBaseline]) {
        const plan = generatePlan(profile, baseline, '2026-08-24');
        plan.weeks.forEach((w, i) => {
          if (i === 0) return;
          // Compare against the last week that actually built volume.
          const reference = [...plan.weeks.slice(0, i)].reverse().find((p) => !p.isDeload)!;
          expect(w.totalRunSec).toBeLessThanOrEqual(reference.totalRunSec * MAX_WEEKLY_GROWTH + 0.001);
        });
      }
    }
  });

  it('keeps the walk interval constant while run intervals grow (FR-2.2)', () => {
    const plan = generatePlan(baseProfile, breathBaseline, '2026-08-24');
    const walks = new Set(plan.weeks.map((w) => w.walkSec));
    expect(walks.size).toBe(1);
    expect(plan.weeks[plan.weeks.length - 1]!.runSec).toBeGreaterThan(plan.weeks[0]!.runSec);
  });

  it('starts lower and walks longer for a leg-limited runner (FR-2.3)', () => {
    const easy = generatePlan(baseProfile, breathBaseline, '2026-08-24');
    const careful = generatePlan(baseProfile, legBaseline, '2026-08-24');
    expect(careful.conservatism).toBeGreaterThan(easy.conservatism);
    expect(careful.weeks[0]!.runSec).toBeLessThan(easy.weeks[0]!.runSec);
    expect(careful.weeks[0]!.walkSec).toBeGreaterThan(easy.weeks[0]!.walkSec);
    expect(careful.conservatismReasons.length).toBeGreaterThan(0);
  });

  it('does not tell a runner what their baseline run showed when they never ran', () => {
    const plan = generatePlan(baseProfile, { minutesRun: 0, stopReason: 'legs', recordedAt: '2026-08-24' }, '2026-08-24');
    expect(plan.conservatism).toBeGreaterThanOrEqual(2);
    expect(plan.conservatismReasons.join(' ')).not.toContain('baseline run ended');
    expect(plan.conservatismReasons.join(' ')).toContain('no running at all');
    // The gentlest the plan goes: one minute at a time.
    expect(plan.weeks[0]!.runSec).toBe(60);
  });

  it('stacks every conservatism modifier (FR-2.3)', () => {
    const plan = generatePlan(
      {
        ...baseProfile,
        age: 50,
        weightKg: 105,
        smokingStatus: 'current',
        injuryHistory: ['achilles'],
        activityLevel: 'none',
      },
      legBaseline,
      '2026-08-24',
    );
    expect(plan.conservatism).toBe(5);
    expect(plan.weeks[0]!.runSec).toBe(60);
    expect(plan.weeks[0]!.walkSec).toBe(120);
  });

  it('never ends a block on a lighter week', () => {
    for (const goal of ['first_continuous_run', 'five_k', 'ten_k'] as const) {
      const plan = generatePlan({ ...baseProfile, goal }, breathBaseline, '2026-08-24');
      expect(plan.weeks[plan.weeks.length - 1]!.isDeload).toBe(false);
    }
  });

  it('inserts a lighter week after four weeks of progression (FR-3.4)', () => {
    const plan = generatePlan({ ...baseProfile, goal: 'ten_k' }, breathBaseline, '2026-08-24');
    const deloads = plan.weeks.filter((w) => w.isDeload);
    expect(deloads.length).toBeGreaterThanOrEqual(1);
    for (const d of deloads) {
      const prev = plan.weeks[d.index - 2]!;
      expect(d.totalRunSec).toBeLessThan(prev.totalRunSec);
    }
  });
});

describe('evaluateWeek', () => {
  it('advances on three full sessions with no real discomfort', () => {
    const result = evaluateWeek(week, [session(), session(), session({ discomfort: { location: 'calf', severity: 2 } })]);
    expect(result.decision).toBe('advance');
  });

  it('offers a repeat when a session was not finished', () => {
    const result = evaluateWeek(week, [session(), session(), session({ completion: 'partial' })]);
    expect(result.decision).toBe('offer_repeat');
    expect(result.overridable).toBe(true);
  });

  it('repeats with strength emphasis on two moderate discomfort logs', () => {
    const result = evaluateWeek(week, [
      session({ discomfort: { location: 'shin', severity: 3 } }),
      session({ discomfort: { location: 'shin', severity: 3 } }),
      session(),
    ]);
    expect(result.decision).toBe('repeat');
    expect(result.strengthEmphasis).toBe(true);
  });

  it('pauses for a medical check at severity 4 (SR-3)', () => {
    const result = evaluateWeek(week, [session({ discomfort: { location: 'knee', severity: 4 } }), session(), session()]);
    expect(result.decision).toBe('pause_medical');
  });

  it('severity 4 outranks everything else logged that week', () => {
    const result = evaluateWeek(week, [
      session({ discomfort: { location: 'shin', severity: 3 } }),
      session({ discomfort: { location: 'knee', severity: 5 } }),
      session({ completion: 'skipped' }),
    ]);
    expect(result.decision).toBe('pause_medical');
  });

  it('steps back when two or more sessions are missed', () => {
    const result = evaluateWeek(week, [session()]);
    expect(result.decision).toBe('step_back');
  });

  it('treats skipped sessions as missed', () => {
    const result = evaluateWeek(week, [session(), session({ completion: 'skipped' }), session({ completion: 'skipped' })]);
    expect(result.decision).toBe('step_back');
  });
});

describe('returnFromBreak', () => {
  it('resumes as normal under 10 days', () => {
    expect(returnFromBreak(9).stepBackWeeks).toBe(0);
    expect(returnFromBreak(9).needsReassessment).toBe(false);
  });

  it('steps back in proportion to the gap (FR-3.5)', () => {
    expect(returnFromBreak(12).stepBackWeeks).toBe(1);
    expect(returnFromBreak(30).stepBackWeeks).toBe(3);
    expect(returnFromBreak(50).stepBackWeeks).toBe(3);
  });

  it('asks for a fresh baseline after eight weeks off', () => {
    expect(returnFromBreak(60).needsReassessment).toBe(true);
  });
});

describe('strength', () => {
  it('substitutes an exercise ruled out by injury history (FR-5.6)', () => {
    const singleCalf = STRENGTH_EXERCISES.find((e) => e.id === 'calf-raise-single')!;
    const swapped = substitute(singleCalf, ['achilles']);
    expect(swapped?.id).toBe('calf-raise-double');
    expect(substitute(singleCalf, ['knee'])?.id).toBe('calf-raise-single');
  });

  it('builds two sessions that always include the priority work (FR-5.5)', () => {
    const [a, b] = buildStrengthSessions({ equipment: ['none'], injuryHistory: [] });
    expect(a!.exercises.some((e) => e.priority)).toBe(true);
    expect(b!.exercises.some((e) => e.priority)).toBe(true);
    expect(a!.exercises.length).toBeGreaterThanOrEqual(4);
  });

  it('never prescribes a contraindicated exercise', () => {
    const sessions = buildStrengthSessions({ equipment: ['dumbbells'], injuryHistory: ['knee', 'achilles'] });
    for (const s of sessions) {
      for (const e of s.exercises) {
        expect(e.contraindicatedFor).not.toContain('knee');
        expect(e.contraindicatedFor).not.toContain('achilles');
      }
    }
  });
});
