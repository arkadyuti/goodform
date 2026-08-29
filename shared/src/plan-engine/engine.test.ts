import { describe, expect, it } from 'vitest';
import type { Baseline, PlanWeek, Profile, WorkoutSession } from '../types.js';
import { MAX_WEEKLY_GROWTH, generatePlan } from './generate.js';
import { evaluateWeek, returnFromBreak } from './gating.js';
import { needsFreshBaseline, nextGoalOptions, summariseBlock } from './reassess.js';
import { buildStrengthSessions, substitute } from './strength.js';
import { daysClear } from '../habits.js';
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
      {
        ...baseProfile,
        age: 52,
        smokingStatus: 'current',
        injuryHistory: ['shin'],
        activityLevel: 'none',
      },
    ];
    for (const profile of profiles) {
      for (const baseline of [breathBaseline, legBaseline]) {
        const plan = generatePlan(profile, baseline, '2026-08-24');
        plan.weeks.forEach((w, i) => {
          if (i === 0) return;
          // Compare against the last week that actually built volume.
          const reference = [...plan.weeks.slice(0, i)].reverse().find((p) => !p.isDeload)!;
          expect(w.totalRunSec).toBeLessThanOrEqual(
            reference.totalRunSec * MAX_WEEKLY_GROWTH + 0.001,
          );
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
    const plan = generatePlan(
      baseProfile,
      { minutesRun: 0, stopReason: 'legs', recordedAt: '2026-08-24' },
      '2026-08-24',
    );
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
    const result = evaluateWeek(week, [
      session(),
      session(),
      session({ discomfort: { location: 'calf', severity: 2 } }),
    ]);
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
    const result = evaluateWeek(week, [
      session({ discomfort: { location: 'knee', severity: 4 } }),
      session(),
      session(),
    ]);
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
    const result = evaluateWeek(week, [
      session(),
      session({ completion: 'skipped' }),
      session({ completion: 'skipped' }),
    ]);
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
    const sessions = buildStrengthSessions({
      equipment: ['dumbbells'],
      injuryHistory: ['knee', 'achilles'],
    });
    for (const s of sessions) {
      for (const e of s.exercises) {
        expect(e.contraindicatedFor).not.toContain('knee');
        expect(e.contraindicatedFor).not.toContain('achilles');
      }
    }
  });
});

describe('daysClear', () => {
  const log = (
    date: string,
    over: Partial<{ cigarettes: number; alcoholUnits: number; beers: number }> = {},
  ) => ({
    date,
    cigarettes: 0,
    alcoholUnits: 0,
    beers: 0,
    ...over,
  });

  it('counts consecutive clear days back from the most recent log', () => {
    expect(
      daysClear(
        [log('2026-08-24'), log('2026-08-23'), log('2026-08-22', { cigarettes: 3 })],
        'cigarettes',
      ),
    ).toBe(2);
  });

  it('treats a beer as breaking an alcohol-free run', () => {
    const logs = [log('2026-08-24'), log('2026-08-23', { beers: 1 }), log('2026-08-22')];
    expect(daysClear(logs, ['alcoholUnits', 'beers'])).toBe(1);
    // Counting units alone would have missed it entirely.
    expect(daysClear(logs, 'alcoholUnits')).toBe(3);
  });
});

describe('block reassessment', () => {
  const weeks: PlanWeek[] = Array.from({ length: 8 }, (_, i) => ({
    index: i + 1,
    runSec: 120 + i * 60,
    walkSec: 60,
    reps: 4,
    sessionsPerWeek: 3,
    isDeload: false,
    totalRunSec: 0,
  }));

  const finished = (over: Partial<WorkoutSession> = {}) =>
    session({
      prescription: { runSec: 540, walkSec: 60, reps: 2 },
      ...over,
    });

  it('reads what was reached from what was logged, not what was prescribed', () => {
    const outcome = summariseBlock({ goal: 'first_continuous_run', currentWeek: 9 }, weeks, [
      finished(),
    ]);
    expect(outcome.achievedRunSec).toBe(540);
    expect(outcome.continueFrom).toEqual({ runSec: 540, walkSec: 60, reps: 2 });
  });

  it('does not credit a week that was only skipped through', () => {
    const outcome = summariseBlock({ goal: 'first_continuous_run', currentWeek: 9 }, weeks, [
      finished({ completion: 'skipped' }),
      session({ prescription: weeks[2], id: 'b' }),
    ]);
    expect(outcome.achievedRunSec).toBe(weeks[2]!.runSec);
  });

  it('falls back to the last completed week when nothing carries a prescription', () => {
    const outcome = summariseBlock({ goal: 'five_k', currentWeek: 4 }, weeks, []);
    expect(outcome.continueFrom).toEqual({ runSec: weeks[2]!.runSec, walkSec: 60, reps: 4 });
  });

  it('always offers holding where you are, and recommends it after real discomfort', () => {
    const calm = nextGoalOptions(
      summariseBlock({ goal: 'first_continuous_run', currentWeek: 9 }, weeks, [finished()]),
    );
    expect(calm.some((o) => o.goal === 'general_fitness')).toBe(true);
    expect(calm.find((o) => o.goal === 'five_k')?.recommended).toBe(true);

    const sore = nextGoalOptions(
      summariseBlock({ goal: 'first_continuous_run', currentWeek: 9 }, weeks, [
        finished({ discomfort: { location: 'knee', severity: 4 } }),
      ]),
    );
    expect(sore.find((o) => o.goal === 'five_k')?.recommended).toBe(false);
    expect(sore.find((o) => o.goal === 'general_fitness')?.recommended).toBe(true);
  });

  it('asks for a fresh baseline after a long enough gap', () => {
    const outcome = summariseBlock({ goal: 'five_k', currentWeek: 9 }, weeks, [finished()]);
    expect(needsFreshBaseline(outcome, 20)).toBe(false);
    expect(needsFreshBaseline(outcome, 60)).toBe(true);
  });
});

describe('generatePlan continuing from a finished block', () => {
  const continueFrom = { runSec: 540, walkSec: 60, reps: 2 };

  it('starts where the last block finished instead of halving it', () => {
    const plan = generatePlan({ ...baseProfile, goal: 'five_k' }, breathBaseline, '2026-08-24', {
      continueFrom,
    });
    expect(plan.weeks[0]!.runSec).toBe(540);
    expect(plan.weeks[0]!.walkSec).toBe(60);
    expect(plan.conservatismReasons[0]).toContain('where your last one finished');
  });

  it('still never grows weekly running time by more than 10%', () => {
    const plan = generatePlan({ ...baseProfile, goal: 'ten_k' }, breathBaseline, '2026-08-24', {
      continueFrom,
    });
    plan.weeks.forEach((w, i) => {
      if (i === 0) return;
      const reference = [...plan.weeks.slice(0, i)].reverse().find((p) => !p.isDeload)!;
      expect(w.totalRunSec).toBeLessThanOrEqual(reference.totalRunSec * MAX_WEEKLY_GROWTH + 0.001);
    });
  });

  it('holds the distance rather than building when the goal is already reached', () => {
    const plan = generatePlan(
      { ...baseProfile, goal: 'general_fitness' },
      breathBaseline,
      '2026-08-24',
      {
        continueFrom: { runSec: 1800, walkSec: 60, reps: 1 },
      },
    );
    expect(plan.weeks.length).toBeGreaterThanOrEqual(6);
    const building = plan.weeks.filter((w) => !w.isDeload);
    expect(new Set(building.map((w) => w.runSec)).size).toBe(1);
    expect(plan.weeks.some((w) => w.isDeload)).toBe(true);
    expect(plan.weeks[plan.weeks.length - 1]!.isDeload).toBe(false);
    expect(plan.conservatismReasons[0]).toContain('holds you there');
  });
});

describe('a session declined on purpose', () => {
  const week = {
    index: 3,
    runSec: 120,
    walkSec: 90,
    reps: 4,
    sessionsPerWeek: 3,
    isDeload: false,
    totalRunSec: 1440,
  };
  const run = (completion: 'full' | 'partial' | 'skipped'): WorkoutSession => ({
    id: `s-${completion}-${Math.round(week.runSec)}`,
    date: '2026-08-24',
    type: 'run',
    planWeek: 3,
    prescription: { runSec: week.runSec, walkSec: week.walkSec, reps: week.reps },
    completion,
    effort: null,
    discomfort: null,
    intervalsCompleted: null,
    durationSec: null,
    notes: null,
  });

  it('reaches the same decision as silence', () => {
    // The plan still reshapes — saying no does not earn a free pass.
    const declined = evaluateWeek(week, [
      { ...run('skipped'), id: 'a' },
      { ...run('skipped'), id: 'b' },
    ]);
    expect(declined.decision).toBe('step_back');
  });

  it('but is not described as something missed', () => {
    const declined = evaluateWeek(week, [
      { ...run('skipped'), id: 'a' },
      { ...run('skipped'), id: 'b' },
    ]);
    expect(declined.reason).toContain('called off');
    expect(declined.reason).not.toContain('missed');

    const silent = evaluateWeek(week, []);
    expect(silent.reason).toContain('missed');
  });

  it('does not count as attempted', () => {
    const one = evaluateWeek(week, [
      { ...run('full'), id: 'a' },
      { ...run('full'), id: 'b' },
      { ...run('skipped'), id: 'c' },
    ]);
    expect(one.decision).toBe('offer_repeat');
  });
});

describe('a week that is consistently out of reach', () => {
  const week = {
    index: 1,
    runSec: 60,
    walkSec: 90,
    reps: 8,
    sessionsPerWeek: 3,
    isDeload: false,
    totalRunSec: 1440,
  };
  const run = (intervals: number, id: string): WorkoutSession => ({
    id,
    date: '2026-08-24',
    type: 'run',
    planWeek: 1,
    prescription: { runSec: 60, walkSec: 90, reps: 8 },
    completion: intervals >= 8 ? 'full' : 'partial',
    effort: null,
    discomfort: null,
    intervalsCompleted: intervals,
    durationSec: null,
    notes: null,
  });

  it('counts a near-miss as having done the session', () => {
    // Seven of eight, three times, is a week of training. It used to score
    // exactly the same as one interval three times: zero.
    const nearly = evaluateWeek(week, [run(7, 'a'), run(7, 'b'), run(7, 'c')]);
    expect(nearly.decision).toBe('advance');
  });

  it('still offers a repeat when the sessions really were cut short', () => {
    const short = evaluateWeek(week, [run(3, 'a'), run(3, 'b'), run(3, 'c')]);
    expect(short.decision).toBe('offer_repeat');
  });

  it('makes the week smaller once repeating it has stopped working', () => {
    // The owner's own pattern: three or four of eight, week after week. The
    // plan could previously only repeat, for ever, with the same sentence.
    const stuck = evaluateWeek(week, [run(3, 'a'), run(4, 'b'), run(3, 'c')], 2);
    expect(stuck.decision).toBe('ease');
    expect(stuck.easeTo!.reps).toBeLessThan(week.reps);
    expect(stuck.easeTo!.reps).toBeGreaterThanOrEqual(1);
    expect(stuck.reason).toContain('too big');
    expect(stuck.reason).not.toContain('missed');
  });

  it('does not ease on the first bad week', () => {
    const first = evaluateWeek(week, [run(3, 'a'), run(3, 'b'), run(3, 'c')], 0);
    expect(first.decision).toBe('offer_repeat');
  });

  it('does not ease a week that is nearly being met', () => {
    // 6 of 8 is 0.75 — short of the "done" bar but not evidence the week is
    // wrong, so repeating is still the right offer.
    const close = evaluateWeek(week, [run(6, 'a'), run(6, 'b'), run(6, 'c')], 3);
    expect(close.decision).toBe('offer_repeat');
  });

  it('never eases below a single repetition', () => {
    const tiny = { ...week, reps: 2 };
    const barely = evaluateWeek(tiny, [run(0, 'a'), run(1, 'b'), run(1, 'c')], 3);
    if (barely.decision === 'ease') expect(barely.easeTo!.reps).toBeGreaterThanOrEqual(1);
  });
});

describe('a week that is still going', () => {
  const week = {
    index: 1,
    runSec: 60,
    walkSec: 90,
    reps: 8,
    sessionsPerWeek: 3,
    isDeload: false,
    totalRunSec: 1440,
  };
  const done: WorkoutSession = {
    id: 'a',
    date: '2026-08-30',
    type: 'run',
    planWeek: 1,
    prescription: { runSec: 60, walkSec: 90, reps: 8 },
    completion: 'full',
    effort: null,
    discomfort: null,
    intervalsCompleted: 8,
    durationSec: null,
    notes: null,
  };

  it('does not accuse a new runner of missing sessions on day one', () => {
    // One of three done, six days left. The verdict used to be "two or more
    // sessions were missed" on the same card that said "1 of 3 runs done".
    const midWeek = evaluateWeek(week, [done], 0, false);
    expect(midWeek.reason).not.toContain('missed');
    expect(midWeek.overridable).toBe(false);
  });

  it('still speaks immediately about discomfort, which has already happened', () => {
    const hurt = {
      ...done,
      id: 'b',
      discomfort: { location: 'shin' as const, severity: 4 as const },
    };
    const midWeek = evaluateWeek(week, [hurt], 0, false);
    expect(midWeek.decision).toBe('pause_medical');
  });

  it('gives the attendance verdict once the week is over', () => {
    // One of three, so two are genuinely unaccounted for by the end.
    const over = evaluateWeek(week, [done], 0, true);
    expect(over.decision).toBe('step_back');
    expect(over.reason).toContain('missed');
  });
});
