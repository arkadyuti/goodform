import { describe, expect, it } from 'vitest';
import { buildStrengthRoutine, stageFor } from './strength.js';
import { MOVEMENTS } from '../content/movements.js';
import { STRENGTH_EXERCISES } from '../content/strength.js';
import type { Equipment, InjurySite } from '../types.js';

const routine = (
  equipment: Equipment[],
  progress: Record<string, number> = {},
  injuryHistory: InjurySite[] = [],
) => buildStrengthRoutine({ equipment, injuryHistory }, { progress }).exercises;

const ids = (...args: Parameters<typeof routine>) => routine(...args).map((e) => e.id);

/**
 * `n` completed sessions, credited to the entry stage of every movement — the
 * shape the real progress map has, which counts completions per exercise id.
 */
const done = (n: number) =>
  Object.fromEntries(MOVEMENTS.map((m) => [m.stages[0]!.id, n]));

describe('the routine is a habit, not a rota', () => {
  it('is the same every session — nothing depends on the day', () => {
    const kit: Equipment[] = ['pull_up_bar', 'step'];
    expect(ids(kit)).toEqual(ids(kit));
  });

  it('takes exactly one exercise per movement', () => {
    for (const equipment of [
      ['none'],
      ['step'],
      ['pull_up_bar', 'step'],
      ['dumbbells', 'resistance_bands', 'pull_up_bar', 'step'],
    ] as Equipment[][]) {
      const movements = routine(equipment).map((e) => e.movementId);
      expect(new Set(movements).size, equipment.join('+')).toBe(movements.length);
    }
  });

  it('never pairs a movement with its own easier version', () => {
    // The calf pair used to appear together in every session: you did the
    // double-leg raise and the single-leg raise, the regression and the
    // progression, in the same 20 minutes.
    const all = ids(['dumbbells', 'resistance_bands', 'pull_up_bar', 'step'], done(20));
    for (const movement of MOVEMENTS) {
      const present = movement.stages.filter((s) => all.includes(s.id));
      expect(present.length, movement.id).toBeLessThanOrEqual(1);
    }
  });

  it('leaves no exercise permanently unreachable', () => {
    // The old split sliced the pool to two per session, so 9 of 17 exercises
    // could never appear: with a bar and a step you were never once shown the
    // glute-medius work that keeps a beginner's knees quiet.
    const kits: Equipment[][] = [
      ['none'],
      ['step'],
      ['pull_up_bar'],
      ['dumbbells'],
      ['resistance_bands'],
      ['dumbbells', 'resistance_bands', 'pull_up_bar', 'step'],
    ];
    const reachable = new Set<string>();
    for (const kit of kits) {
      for (const completed of [0, 6, 10, 14, 30]) {
        for (const id of ids(kit, done(completed))) reachable.add(id);
      }
    }
    const missing = STRENGTH_EXERCISES.map((e) => e.id).filter((id) => !reachable.has(id));
    expect(missing).toEqual([]);
  });

  it('always includes the glute-medius work it used to drop', () => {
    expect(ids(['pull_up_bar', 'step'])).toContain('side-lying-abduction');
  });
});

describe('stages are earned', () => {
  const calf = MOVEMENTS.find((m) => m.id === 'calf')!;
  const bodyweight = { equipment: ['none'] as Equipment[], injuryHistory: [] };

  it('starts at the bottom of the ladder', () => {
    expect(stageFor(calf, bodyweight, 0)?.id).toBe('calf-raise-double');
  });

  it('moves up once the work is done', () => {
    expect(stageFor(calf, bodyweight, 5)?.id).toBe('calf-raise-double');
    expect(stageFor(calf, bodyweight, 6)?.id).toBe('calf-raise-single');
  });

  it('counts completions across the whole ladder, not one variant', () => {
    // Three sessions at each of two stages is six sessions of calf work.
    const progress = { 'calf-raise-double': 3, 'calf-raise-single': 3 };
    expect(ids(['none'], progress)).toContain('calf-raise-single');
  });

  it('does not need the ladder earned when equipment is what unlocks a stage', () => {
    // A step-down is not a harder wall sit; it is what you do when you own a step.
    expect(ids(['step'])).toContain('step-down');
    expect(ids(['none'])).toContain('wall-sit');
  });

  it('reports the stage out of the ones this runner can reach', () => {
    const calfRaise = routine(['none']).find((e) => e.movementId === 'calf')!;
    // Loaded calf raise needs dumbbells, so for them the ladder is two long.
    expect([calfRaise.stage, calfRaise.stages]).toEqual([1, 2]);
  });
});

describe('injuries change the stage, not the routine', () => {
  it('keeps the movement and drops to the safe variant', () => {
    const knees = routine(['dumbbells', 'step'], done(30), ['knee']);
    const knee = knees.find((e) => e.movementId === 'knee');
    expect(knee?.id).toBe('wall-sit');
  });

  it('still covers the quads when everything loaded is ruled out', () => {
    const targets = routine(['none'], {}, ['knee'])
      .map((e) => e.target)
      .join(' ');
    expect(targets).toMatch(/Quad/i);
  });

  it('never prescribes a contraindicated exercise at any stage', () => {
    const injuries: InjurySite[] = ['knee', 'achilles', 'back'];
    for (const completed of [0, 6, 14, 30]) {
      for (const e of routine(['dumbbells', 'pull_up_bar', 'step'], done(completed), injuries)) {
        expect(e.contraindicatedFor.some((site) => injuries.includes(site)), e.id).toBe(false);
      }
    }
  });
});

describe('an easier week drops sets, not exercises', () => {
  const kit: Equipment[] = ['pull_up_bar', 'step'];
  const build = (intensity: 'easy' | 'normal' | 'emphasis') =>
    buildStrengthRoutine({ equipment: kit, injuryHistory: [] }, { intensity });

  it('asks for the same movements however hard the week is', () => {
    const normal = build('normal').exercises.map((e) => e.id);
    expect(build('easy').exercises.map((e) => e.id)).toEqual(normal);
    expect(build('emphasis').exercises.map((e) => e.id)).toEqual(normal);
  });

  it('takes a set off an easy week', () => {
    const normal = build('normal').exercises;
    for (const e of build('easy').exercises) {
      const before = normal.find((n) => n.id === e.id)!;
      expect(e.sets, e.id).toBe(Math.max(2, before.sets - 1));
    }
  });

  it('adds a set to the priority work when a week is repeated', () => {
    const normal = build('normal').exercises;
    for (const e of build('emphasis').exercises) {
      const before = normal.find((n) => n.id === e.id)!;
      expect(e.sets, e.id).toBe(e.priority ? before.sets + 1 : before.sets);
    }
  });

  it('never drops below two sets', () => {
    for (const e of build('easy').exercises) expect(e.sets).toBeGreaterThanOrEqual(2);
  });
});
