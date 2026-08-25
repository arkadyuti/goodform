import { describe, expect, it } from 'vitest';
import { expectPlan, expectProfile, expectTrends } from './shapes.ts';

describe('response shape guards', () => {
  it('accepts a real plan, and the legitimate no-plan case', () => {
    expect(() =>
      expectPlan({
        plan: { id: 'p1', currentWeek: 3, status: 'active' },
        weeks: [{ index: 1, runSec: 60, walkSec: 90, reps: 8 }],
      }),
    ).not.toThrow();
    // Null is how the app knows to offer setup — it must not look like damage.
    expect(() => expectPlan({ plan: null, weeks: [] })).not.toThrow();
  });

  it('rejects a plan whose weeks are missing the numbers the screen reads', () => {
    expect(() => expectPlan({ plan: { id: 'p1', currentWeek: 1 }, weeks: [{ index: 1 }] })).toThrow();
    expect(() => expectPlan({ plan: { id: 'p1' }, weeks: [] })).toThrow();
    expect(() => expectPlan('not json at all')).toThrow();
  });

  it('accepts a profile, and a null one', () => {
    expect(() => expectProfile({ profile: { weightKg: 82 }, settings: null })).not.toThrow();
    expect(() => expectProfile({ profile: null, settings: null })).not.toThrow();
  });

  it('rejects a profile with no weight, which every protein target divides by', () => {
    expect(() => expectProfile({ profile: {} })).toThrow();
  });

  it('rejects a trend point with no value, the one that becomes NaN geometry', () => {
    expect(() => expectTrends({ weight: [{ date: '2026-08-24', value: 82 }] })).not.toThrow();
    expect(() => expectTrends({ weight: [{ date: '2026-08-24' }] })).toThrow();
    expect(() => expectTrends({ weight: [{ date: '2026-08-24', value: null }] })).toThrow();
  });

  it('leaves series it does not recognise alone', () => {
    // Additive server changes must not break an older client.
    expect(() => expectTrends({ somethingNew: 'a string', weight: [] })).not.toThrow();
  });
});
