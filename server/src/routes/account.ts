import { Hono } from 'hono';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { requireAuth, type AppEnv } from '../middleware.js';
import { csv, type Cell } from '../csv.js';

const DATASETS = [
  'sessions',
  'daily',
  'nutrition',
  'weekly',
  'plan',
  'regimen',
  'doses',
] as const;
type Dataset = (typeof DATASETS)[number];

// ---------------------------------------------------------------------------
// The whole account, in one shape both exports are built from
// ---------------------------------------------------------------------------

async function collect(userId: string) {
  const [
    profile,
    screening,
    settings,
    baselines,
    plans,
    sessions,
    dailyLogs,
    weeklyChecks,
    nutrition,
    strengthProgress,
    regimenItems,
    regimenEvents,
    foods,
  ] = await Promise.all([
    db.select().from(schema.profiles).where(eq(schema.profiles.userId, userId)),
    db.select().from(schema.screenings).where(eq(schema.screenings.userId, userId)),
    db.select().from(schema.settings).where(eq(schema.settings.userId, userId)),
    db.select().from(schema.baselines).where(eq(schema.baselines.userId, userId)).orderBy(asc(schema.baselines.recordedAt)),
    db.select().from(schema.plans).where(eq(schema.plans.userId, userId)).orderBy(asc(schema.plans.createdAt)),
    db.select().from(schema.workoutSessions).where(eq(schema.workoutSessions.userId, userId)).orderBy(asc(schema.workoutSessions.date)),
    db.select().from(schema.dailyLogs).where(eq(schema.dailyLogs.userId, userId)).orderBy(asc(schema.dailyLogs.date)),
    db.select().from(schema.weeklyChecks).where(eq(schema.weeklyChecks.userId, userId)).orderBy(asc(schema.weeklyChecks.date)),
    db
      .select({
        date: schema.nutritionEntries.date,
        servings: schema.nutritionEntries.servings,
        createdAt: schema.nutritionEntries.createdAt,
        name: schema.foodItems.name,
        servingLabel: schema.foodItems.servingLabel,
        proteinG: schema.foodItems.proteinG,
      })
      .from(schema.nutritionEntries)
      .innerJoin(schema.foodItems, eq(schema.foodItems.id, schema.nutritionEntries.foodItemId))
      .where(eq(schema.nutritionEntries.userId, userId))
      .orderBy(asc(schema.nutritionEntries.date)),
    db.select().from(schema.strengthProgress).where(eq(schema.strengthProgress.userId, userId)),
    db.select().from(schema.regimenItems).where(eq(schema.regimenItems.userId, userId)).orderBy(asc(schema.regimenItems.name)),
    db.select().from(schema.regimenEvents).where(eq(schema.regimenEvents.userId, userId)).orderBy(asc(schema.regimenEvents.dueDate)),
    // Foods the user typed in themselves are theirs; the seeded library is not.
    db.select().from(schema.foodItems).where(eq(schema.foodItems.ownerId, userId)),
  ]);

  // Every plan's weeks, not only the active one — an export that quietly
  // drops history is not an export.
  const allWeeks = await Promise.all(
    plans.map(async (plan) => ({
      planId: plan.id,
      weeks: await db
        .select()
        .from(schema.planWeeks)
        .where(eq(schema.planWeeks.planId, plan.id))
        .orderBy(asc(schema.planWeeks.index)),
    })),
  );

  return {
    profile: profile[0] ?? null,
    screening: screening[0] ?? null,
    settings: settings[0] ?? null,
    baselines,
    plans,
    planWeeks: allWeeks,
    sessions,
    dailyLogs,
    weeklyChecks,
    nutrition,
    strengthProgress,
    regimenItems,
    regimenEvents,
    customFoods: foods,
  };
}

type Collected = Awaited<ReturnType<typeof collect>>;

function toCsv(dataset: Dataset, data: Collected): string {
  switch (dataset) {
    case 'sessions':
      return csv(
        ['date', 'type', 'plan_week', 'completion', 'effort', 'discomfort_location', 'discomfort_severity', 'intervals_completed', 'duration_sec', 'run_sec', 'walk_sec', 'reps', 'notes'],
        data.sessions.map((s) => {
          const p = s.prescription as { runSec?: number; walkSec?: number; reps?: number } | null;
          return [s.date, s.type, s.planWeek, s.completion, s.effort, s.discomfortLocation, s.discomfortSeverity, s.intervalsCompleted, s.durationSec, p?.runSec, p?.walkSec, p?.reps, s.notes];
        }),
      );
    case 'daily':
      return csv(
        ['date', 'water_ml', 'sleep_hours', 'alcohol_units', 'beers', 'cigarettes', 'custom_habits', 'notes'],
        data.dailyLogs.map((l) => [l.date, l.waterMl, l.sleepHours, l.alcoholUnits, l.beers, l.cigarettes, JSON.stringify(l.customHabits), l.notes]),
      );
    case 'nutrition':
      return csv(
        ['date', 'food', 'serving', 'servings', 'protein_g', 'logged_at'],
        data.nutrition.map((n) => [n.date, n.name, n.servingLabel, Number(n.servings), Math.round(n.proteinG * Number(n.servings) * 10) / 10, n.createdAt]),
      );
    case 'weekly':
      return csv(
        ['date', 'weight_kg', 'waist_cm', 'resting_hr'],
        data.weeklyChecks.map((w) => [w.date, w.weightKg, w.waistCm, w.restingHr]),
      );
    case 'plan':
      return csv(
        ['plan_id', 'goal', 'start_date', 'status', 'week', 'run_sec', 'walk_sec', 'reps', 'sessions_per_week', 'is_deload', 'repeats', 'completed_at'],
        data.planWeeks.flatMap(({ planId, weeks }) => {
          const plan = data.plans.find((p) => p.id === planId);
          return weeks.map((w) => [planId, plan?.goal, plan?.startDate, plan?.status, w.index, w.runSec, w.walkSec, w.reps, w.sessionsPerWeek, w.isDeload, w.repeats, w.completedAt]);
        }),
      );
    case 'regimen':
      return csv(
        ['name', 'kind', 'dose_amount', 'dose_form', 'schedule', 'weekdays', 'interval_days', 'times', 'food_rule', 'course_start', 'course_end', 'supply_count', 'reminders', 'archived_at', 'notes'],
        data.regimenItems.map((i) => [i.name, i.kind, i.doseAmount, i.doseForm, i.scheduleKind, i.weekdays.join(' '), i.intervalDays, i.times.join(' '), i.foodRule, i.courseStart, i.courseEnd, i.supplyCount, i.remindersEnabled, i.archivedAt, i.notes]),
      );
    case 'doses': {
      const names = new Map(data.regimenItems.map((i) => [i.id, i]));
      return csv(
        ['due_date', 'due_time', 'item', 'kind', 'status', 'recorded_at'],
        data.regimenEvents.map((e) => {
          const item = names.get(e.itemId);
          return [e.dueDate, e.dueTime, item?.name, item?.kind, e.status, e.recordedAt];
        }),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const accountRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  /** GDPR self-serve export: everything held about the account, in one file. */
  .get('/export', async (c) => {
    const data = await collect(c.get('userId'));
    const body = {
      exportedAt: new Date().toISOString(),
      format: 'goodform-export-v1',
      account: { id: c.get('userId'), email: c.get('userEmail') },
      ...data,
    };
    const filename = `goodform-export-${new Date().toISOString().slice(0, 10)}.json`;
    c.header('Content-Type', 'application/json; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    return c.body(JSON.stringify(body, null, 2));
  })

  .get('/export.csv', async (c) => {
    const dataset = c.req.query('dataset') as Dataset | undefined;
    if (!dataset || !DATASETS.includes(dataset)) {
      return c.json({ error: 'Unknown dataset', datasets: DATASETS }, 400);
    }
    const data = await collect(c.get('userId'));
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', `attachment; filename="goodform-${dataset}-${new Date().toISOString().slice(0, 10)}.csv"`);
    return c.body(toCsv(dataset, data));
  })

  .get('/datasets', (c) => c.json({ datasets: DATASETS }));

/**
 * Deletion is separated from the rest so the destructive route is impossible to
 * reach by accident: it is a DELETE, it needs the account's own email typed
 * back, and it removes the user row, which cascades through everything else.
 */
export const accountDeleteRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)
  .delete('/', async (c) => {
    const parsed = z.object({ confirmEmail: z.string() }).safeParse(await c.req.json().catch(() => ({})));
    const email = c.get('userEmail');
    if (!parsed.success || parsed.data.confirmEmail.trim().toLowerCase() !== email.toLowerCase()) {
      return c.json({ error: 'Type your email address exactly to confirm deletion' }, 400);
    }

    const userId = c.get('userId');
    // Foods the user created are theirs and go with them; the seeded library
    // belongs to nobody and stays.
    await db.delete(schema.foodItems).where(eq(schema.foodItems.ownerId, userId));
    // Everything else cascades from the user row, including the auth session,
    // which is what signs the browser out.
    await db.delete(schema.user).where(eq(schema.user.id, userId));

    return c.json({ ok: true, deleted: true });
  });
