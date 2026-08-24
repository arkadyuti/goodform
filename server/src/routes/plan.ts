import { Hono } from 'hono';
import { and, desc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import {
  STOP_REASONS,
  evaluateWeek,
  generatePlan,
  returnFromBreak,
  type Profile,
  type WorkoutSession,
} from '@goodform/shared';
import { db, schema } from '../db/index.js';
import { requireAuth, type AppEnv } from '../middleware.js';

function toProfile(row: typeof schema.profiles.$inferSelect): Profile {
  return {
    age: row.age,
    sexAtBirth: row.sexAtBirth as Profile['sexAtBirth'],
    heightCm: row.heightCm,
    weightKg: row.weightKg,
    units: row.units as Profile['units'],
    dietaryPattern: row.dietaryPattern as Profile['dietaryPattern'],
    exclusions: row.exclusions,
    activityLevel: row.activityLevel as Profile['activityLevel'],
    smokingStatus: row.smokingStatus as Profile['smokingStatus'],
    alcoholFrequency: row.alcoholFrequency as Profile['alcoholFrequency'],
    injuryHistory: row.injuryHistory as Profile['injuryHistory'],
    injuryNotes: row.injuryNotes ?? undefined,
    equipment: row.equipment as Profile['equipment'],
    goal: row.goal as Profile['goal'],
  };
}

function toSession(row: typeof schema.workoutSessions.$inferSelect): WorkoutSession {
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

async function activePlan(userId: string) {
  const [plan] = await db
    .select()
    .from(schema.plans)
    .where(and(eq(schema.plans.userId, userId), eq(schema.plans.status, 'active')))
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

/** Calendar dates covered by a plan week, so sessions can be grouped by week. */
function weekRange(startDate: string, weekIndex: number, repeatsBefore: number) {
  const start = new Date(`${startDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + (weekIndex - 1 + repeatsBefore) * 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export const planRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  .get('/', async (c) => {
    const current = await activePlan(c.get('userId'));
    if (!current) return c.json({ plan: null, weeks: [] });
    return c.json({ plan: current.plan, weeks: current.weeks });
  })

  .post('/baseline', async (c) => {
    const userId = c.get('userId');
    const parsed = z
      .object({
        minutesRun: z.number().min(0).max(120),
        stopReason: z.enum(STOP_REASONS),
        date: z.string().optional(),
      })
      .safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: 'Invalid baseline' }, 400);

    const [baseline] = await db
      .insert(schema.baselines)
      .values({ userId, minutesRun: parsed.data.minutesRun, stopReason: parsed.data.stopReason })
      .returning();
    return c.json({ baseline });
  })

  .post('/generate', async (c) => {
    const userId = c.get('userId');
    const body = z.object({ startDate: z.string().optional() }).parse(await c.req.json().catch(() => ({})));

    const [profileRow] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId));
    if (!profileRow) return c.json({ error: 'Complete your profile first' }, 400);

    const [screening] = await db.select().from(schema.screenings).where(eq(schema.screenings.userId, userId));
    // SR-1: a flagged screening must be acknowledged before a plan is generated.
    if (screening && screening.flags.length > 0 && !screening.acknowledgedAt) {
      return c.json({ error: 'Screening needs acknowledgement before a plan can be generated' }, 409);
    }

    const [baseline] = await db
      .select()
      .from(schema.baselines)
      .where(eq(schema.baselines.userId, userId))
      .orderBy(desc(schema.baselines.recordedAt))
      .limit(1);
    if (!baseline) return c.json({ error: 'Record a baseline assessment first' }, 400);

    const startDate = body.startDate ?? new Date().toISOString().slice(0, 10);
    const generated = generatePlan(
      toProfile(profileRow),
      {
        minutesRun: baseline.minutesRun,
        stopReason: baseline.stopReason as 'breath' | 'legs' | 'choice',
        recordedAt: baseline.recordedAt.toISOString(),
      },
      startDate,
    );

    // Replace any earlier active plan — one plan at a time.
    await db
      .update(schema.plans)
      .set({ status: 'abandoned' })
      .where(and(eq(schema.plans.userId, userId), eq(schema.plans.status, 'active')));

    const [plan] = await db
      .insert(schema.plans)
      .values({
        userId,
        goal: generated.goal,
        conservatism: generated.conservatism,
        conservatismReasons: generated.conservatismReasons,
        startDate,
      })
      .returning();

    await db.insert(schema.planWeeks).values(
      generated.weeks.map((w) => ({
        planId: plan!.id,
        index: w.index,
        runSec: w.runSec,
        walkSec: w.walkSec,
        reps: w.reps,
        sessionsPerWeek: w.sessionsPerWeek,
        isDeload: w.isDeload,
        totalRunSec: w.totalRunSec,
      })),
    );

    return c.json({ plan, weeks: generated.weeks });
  })

  /** Evaluates the current week against what was logged and returns the gate. */
  .get('/week-review', async (c) => {
    const userId = c.get('userId');
    const current = await activePlan(userId);
    if (!current) return c.json({ error: 'No active plan' }, 404);

    const week = current.weeks.find((w) => w.index === current.plan.currentWeek);
    if (!week) return c.json({ error: 'Week not found' }, 404);

    const repeatsBefore = current.weeks
      .filter((w) => w.index < week.index)
      .reduce((sum, w) => sum + w.repeats, 0) + week.repeats;
    const { from, to } = weekRange(current.plan.startDate, week.index, repeatsBefore);

    const rows = await db
      .select()
      .from(schema.workoutSessions)
      .where(
        and(
          eq(schema.workoutSessions.userId, userId),
          eq(schema.workoutSessions.type, 'run'),
          gte(schema.workoutSessions.date, from),
          lte(schema.workoutSessions.date, to),
        ),
      );

    const gate = evaluateWeek(
      { ...week, isDeload: week.isDeload, sessionsPerWeek: week.sessionsPerWeek },
      rows.map(toSession),
    );
    return c.json({ gate, week, range: { from, to }, sessions: rows.map(toSession) });
  })

  /** FR-3.3: the runner decides. Overrides are recorded, never blocked. */
  .post('/week-decision', async (c) => {
    const userId = c.get('userId');
    const parsed = z
      .object({
        action: z.enum(['advance', 'repeat', 'step_back', 'pause', 'resume']),
        override: z.boolean().default(false),
      })
      .safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: 'Invalid decision' }, 400);

    const current = await activePlan(userId);
    if (!current) return c.json({ error: 'No active plan' }, 404);
    const { plan, weeks } = current;
    const last = weeks[weeks.length - 1]!.index;

    switch (parsed.data.action) {
      case 'advance': {
        await db
          .update(schema.planWeeks)
          .set({ completedAt: new Date() })
          .where(and(eq(schema.planWeeks.planId, plan.id), eq(schema.planWeeks.index, plan.currentWeek)));
        const next = plan.currentWeek + 1;
        await db
          .update(schema.plans)
          .set(next > last ? { status: 'completed' } : { currentWeek: next, pausedReason: null })
          .where(eq(schema.plans.id, plan.id));
        return c.json({ currentWeek: Math.min(next, last), completed: next > last });
      }
      case 'repeat': {
        await db
          .update(schema.planWeeks)
          .set({ repeats: (weeks.find((w) => w.index === plan.currentWeek)?.repeats ?? 0) + 1 })
          .where(and(eq(schema.planWeeks.planId, plan.id), eq(schema.planWeeks.index, plan.currentWeek)));
        await db.update(schema.plans).set({ pausedReason: null }).where(eq(schema.plans.id, plan.id));
        return c.json({ currentWeek: plan.currentWeek, repeated: true });
      }
      case 'step_back': {
        const back = Math.max(1, plan.currentWeek - 1);
        await db.update(schema.plans).set({ currentWeek: back, pausedReason: null }).where(eq(schema.plans.id, plan.id));
        return c.json({ currentWeek: back });
      }
      case 'pause': {
        await db
          .update(schema.plans)
          .set({ status: 'paused', pausedReason: 'Discomfort at 4 or above — resting until this settles.' })
          .where(eq(schema.plans.id, plan.id));
        return c.json({ status: 'paused' });
      }
      case 'resume': {
        await db
          .update(schema.plans)
          .set({ status: 'active', pausedReason: null })
          .where(eq(schema.plans.id, plan.id));
        return c.json({ status: 'active' });
      }
    }
  })

  /** FR-3.5: applies a proportional step-back after a gap in training. */
  .post('/return-from-break', async (c) => {
    const userId = c.get('userId');
    const current = await activePlan(userId);
    if (!current) return c.json({ error: 'No active plan' }, 404);

    const [latest] = await db
      .select()
      .from(schema.workoutSessions)
      .where(eq(schema.workoutSessions.userId, userId))
      .orderBy(desc(schema.workoutSessions.date))
      .limit(1);
    if (!latest) return c.json({ applied: false, result: returnFromBreak(0) });

    const gapDays = Math.floor((Date.now() - new Date(`${latest.date}T00:00:00Z`).getTime()) / 86_400_000);
    const result = returnFromBreak(gapDays);
    if (result.stepBackWeeks > 0) {
      const back = Math.max(1, current.plan.currentWeek - result.stepBackWeeks);
      await db.update(schema.plans).set({ currentWeek: back }).where(eq(schema.plans.id, current.plan.id));
    }
    return c.json({ applied: result.stepBackWeeks > 0, gapDays, result });
  });
