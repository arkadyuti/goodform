/**
 * Runtime checks for the few responses where a wrong shape does real damage.
 *
 * Every API response is cast, not parsed — `response.json() as Promise<T>` is
 * the whole contract. That is fine for most of them: a missing field renders a
 * blank and nobody is misled. These three are different.
 *
 * - `/profile` decides whether the app shows onboarding or itself.
 * - `/plan` decides what the runner is told to go and do.
 * - `/progress/trends` feeds the charts, where a missing number becomes `NaN`
 *   in SVG geometry and the line silently disappears.
 *
 * Deliberately hand-written rather than a schema library: three shapes do not
 * justify shipping a validator to a phone. A failure throws, which puts the
 * query into its error state — and the screens now say so out loud.
 */

class ShapeError extends Error {
  constructor(what: string) {
    super(`The server sent something unexpected for ${what}.`);
    this.name = 'ShapeError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Checks the fields the app actually reads, and lets the rest through. */
export function expectPlan<T>(value: unknown): T {
  if (!isRecord(value)) throw new ShapeError('your plan');
  const { plan, weeks } = value;

  if (plan !== null && plan !== undefined) {
    if (!isRecord(plan) || typeof plan.id !== 'string' || !isNumber(plan.currentWeek)) {
      throw new ShapeError('your plan');
    }
  }
  if (!Array.isArray(weeks)) throw new ShapeError('your plan');
  for (const week of weeks) {
    if (
      !isRecord(week) ||
      !isNumber(week.index) ||
      !isNumber(week.runSec) ||
      !isNumber(week.reps)
    ) {
      throw new ShapeError('your plan');
    }
  }
  return value as T;
}

export function expectProfile<T>(value: unknown): T {
  if (!isRecord(value)) throw new ShapeError('your profile');
  const { profile } = value;
  // Null is meaningful — it is how the app knows to show onboarding.
  if (profile !== null && profile !== undefined) {
    if (!isRecord(profile) || !isNumber(profile.weightKg)) throw new ShapeError('your profile');
  }
  return value as T;
}

export function expectTrends<T>(value: unknown): T {
  if (!isRecord(value)) throw new ShapeError('your trends');
  for (const series of Object.values(value)) {
    if (!Array.isArray(series)) continue;
    for (const point of series) {
      // A point missing its value is what turns into NaN geometry.
      if (!isRecord(point) || typeof point.date !== 'string' || !isNumber(point.value)) {
        throw new ShapeError('your trends');
      }
    }
  }
  return value as T;
}
