import { and, desc, eq, inArray } from 'drizzle-orm';
import type { WorkoutSession } from '@goodform/shared';
import { db, schema } from '../db/index.js';

export function toSession(row: typeof schema.workoutSessions.$inferSelect): WorkoutSession {
  return {
    id: row.id,
    date: row.date,
    type: row.type as WorkoutSession['type'],
    planWeek: row.planWeek,
    prescription: row.prescription as WorkoutSession['prescription'],
    completion: row.completion as WorkoutSession['completion'],
    effort: row.effort,
    discomfort: row.discomfortLocation
      ? {
          location: row.discomfortLocation as NonNullable<WorkoutSession['discomfort']>['location'],
          severity: row.discomfortSeverity as NonNullable<WorkoutSession['discomfort']>['severity'],
        }
      : null,
    intervalsCompleted: row.intervalsCompleted,
    durationSec: row.durationSec,
    notes: row.notes,
  };
}

/**
 * The plan a runner is currently on.
 *
 * `paused` counts. Pausing is what the app asks for after real discomfort, and
 * looking only for `active` meant every plan endpoint 404'd the moment someone
 * took that advice — including `resume`, whose entire purpose is to leave the
 * paused state. Following the safety advice bricked the plan, permanently, with
 * no error shown.
 */
export async function activePlan(userId: string, includePaused = true) {
  const statuses = includePaused ? ['active', 'paused'] : ['active'];
  const [plan] = await db
    .select()
    .from(schema.plans)
    .where(and(eq(schema.plans.userId, userId), inArray(schema.plans.status, statuses)))
    .orderBy(desc(schema.plans.createdAt))
    .limit(1);
  if (!plan) return null;
  const weeks = await db
    .select()
    .from(schema.planWeeks)
    .where(eq(schema.planWeeks.planId, plan.id))
    .orderBy(schema.planWeeks.index);
  return { plan, weeks };
}
