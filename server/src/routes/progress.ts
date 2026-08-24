import { Hono } from 'hono';
import { and, desc, eq, gte } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { requireAuth, type AppEnv } from '../middleware.js';

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export const progressRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  /** FR-8.1/8.3: adherence, the longest run so far, and discomfort over time. */
  .get('/summary', async (c) => {
    const userId = c.get('userId');
    const since = daysAgo(120);

    const sessions = await db
      .select()
      .from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.userId, userId), gte(schema.workoutSessions.date, since)))
      .orderBy(desc(schema.workoutSessions.date));

    const runs = sessions.filter((s) => s.type === 'run' || s.type === 'baseline');
    const strength = sessions.filter((s) => s.type === 'strength');

    const longestRunSec = runs.reduce((max, s) => {
      const prescription = s.prescription as { runSec?: number } | null;
      return Math.max(max, prescription?.runSec ?? 0);
    }, 0);

    const discomfort = runs
      .filter((s) => s.discomfortSeverity)
      .map((s) => ({ date: s.date, location: s.discomfortLocation, severity: s.discomfortSeverity }));

    const [plan] = await db
      .select()
      .from(schema.plans)
      .where(and(eq(schema.plans.userId, userId), eq(schema.plans.status, 'active')))
      .limit(1);

    const weeks = plan
      ? await db.select().from(schema.planWeeks).where(eq(schema.planWeeks.planId, plan.id)).orderBy(schema.planWeeks.index)
      : [];

    const plannedRuns = weeks
      .filter((w) => w.index <= (plan?.currentWeek ?? 0))
      .reduce((sum, w) => sum + w.sessionsPerWeek * (1 + w.repeats), 0);

    const checks = await db
      .select()
      .from(schema.weeklyChecks)
      .where(eq(schema.weeklyChecks.userId, userId))
      .orderBy(desc(schema.weeklyChecks.date))
      .limit(26);

    return c.json({
      adherence: {
        runsCompleted: runs.filter((s) => s.completion === 'full').length,
        runsPlanned: plannedRuns,
        strengthCompleted: strength.filter((s) => s.completion === 'full').length,
      },
      longestRunSec,
      discomfort,
      checks,
      recentSessions: sessions.slice(0, 30),
    });
  });
