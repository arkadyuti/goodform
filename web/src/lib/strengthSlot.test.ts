import { describe, expect, it } from 'vitest';
import { pickStrengthSlot } from './strengthSlot.ts';

const SESSIONS = [
  { exercises: [{ id: 'calf-raise-double' }, { id: 'hanging-knee-raise' }, { id: 'glute-bridge' }] },
  { exercises: [{ id: 'calf-raise-double' }, { id: 'dead-hang' }, { id: 'single-leg-bridge' }] },
];

const row = (date: string, log: Record<string, number> | null, type = 'strength') => ({
  date,
  type,
  exerciseLog: log,
});

describe('pickStrengthSlot', () => {
  it('starts at the first session', () => {
    expect(pickStrengthSlot(SESSIONS, [], '2026-08-30')).toBe(0);
  });

  it('takes the other session after one is done', () => {
    const history = [row('2026-08-28', { 'calf-raise-double': 3, 'hanging-knee-raise': 3 })];
    expect(pickStrengthSlot(SESSIONS, history, '2026-08-30')).toBe(1);
  });

  it('alternates back again', () => {
    const history = [
      row('2026-08-25', { 'hanging-knee-raise': 3 }),
      row('2026-08-28', { 'dead-hang': 3 }),
    ];
    expect(pickStrengthSlot(SESSIONS, history, '2026-08-30')).toBe(0);
  });

  it('stays on the session already under way today', () => {
    const history = [
      row('2026-08-28', { 'hanging-knee-raise': 3 }),
      // Rotation says slot 1, but slot 0 is what is open on screen.
      row('2026-08-30', { 'calf-raise-double': 1, 'hanging-knee-raise': 1 }),
    ];
    expect(pickStrengthSlot(SESSIONS, history, '2026-08-30')).toBe(0);
  });

  it('reaches both sessions on strength days that share a slot under the old rule', () => {
    // Mon+Wed: getDay() 1 and 3, both < 4, so the calendar rule pinned slot 0.
    const history: ReturnType<typeof row>[] = [];
    const seen = new Set<number>();
    for (const date of ['2026-08-03', '2026-08-05', '2026-08-10', '2026-08-12']) {
      const slot = pickStrengthSlot(SESSIONS, history, date);
      seen.add(slot);
      history.push(row(date, Object.fromEntries(SESSIONS[slot]!.exercises.map((e) => [e.id, 3]))));
    }
    expect([...seen].sort()).toEqual([0, 1]);
  });

  it('ignores runs and empty logs', () => {
    const history = [
      row('2026-08-28', { 'dead-hang': 3 }),
      row('2026-08-29', null),
      row('2026-08-29', { 'hanging-knee-raise': 5 }, 'run'),
    ];
    expect(pickStrengthSlot(SESSIONS, history, '2026-08-30')).toBe(0);
  });

  it('skips a log it cannot place rather than guessing', () => {
    const history = [
      row('2026-08-26', { 'dead-hang': 3 }),
      // Shared exercise only — belongs to both, dates neither.
      row('2026-08-28', { 'calf-raise-double': 3 }),
    ];
    expect(pickStrengthSlot(SESSIONS, history, '2026-08-30')).toBe(0);
  });
});
