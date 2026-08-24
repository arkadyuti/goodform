import { Hono } from 'hono';
import { and, desc, eq, gte, isNull, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../db/index.js';
import { requireAuth, type AppEnv } from '../middleware.js';

const dailyLogSchema = z.object({
  waterMl: z.number().int().min(0).max(10_000).optional(),
  sleepHours: z.number().min(0).max(24).nullish(),
  alcoholUnits: z.number().min(0).max(50).optional(),
  beers: z.number().int().min(0).max(50).optional(),
  cigarettes: z.number().int().min(0).max(100).optional(),
  customHabits: z.record(z.number()).optional(),
  notes: z.string().max(1000).nullish(),
});

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const logRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  .get('/daily/:date', async (c) => {
    const date = c.req.param('date');
    if (!DATE.test(date)) return c.json({ error: 'Invalid date' }, 400);
    const [log] = await db
      .select()
      .from(schema.dailyLogs)
      .where(and(eq(schema.dailyLogs.userId, c.get('userId')), eq(schema.dailyLogs.date, date)));
    return c.json({ log: log ?? null });
  })

  /** Range fetch powers the quit-support cards and habit trends. */
  .get('/daily', async (c) => {
    const from = c.req.query('from');
    const to = c.req.query('to');
    const conditions = [eq(schema.dailyLogs.userId, c.get('userId'))];
    if (from) conditions.push(gte(schema.dailyLogs.date, from));
    if (to) conditions.push(lte(schema.dailyLogs.date, to));
    const logs = await db
      .select()
      .from(schema.dailyLogs)
      .where(and(...conditions))
      .orderBy(desc(schema.dailyLogs.date))
      .limit(400);
    return c.json({ logs });
  })

  .put('/daily/:date', async (c) => {
    const userId = c.get('userId');
    const date = c.req.param('date');
    if (!DATE.test(date)) return c.json({ error: 'Invalid date' }, 400);
    const parsed = dailyLogSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: 'Invalid log', issues: parsed.error.issues }, 400);

    const values = { ...parsed.data, userId, date, updatedAt: new Date() };
    const [log] = await db
      .insert(schema.dailyLogs)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.dailyLogs.userId, schema.dailyLogs.date],
        set: values,
      })
      .returning();
    return c.json({ log });
  })

  .get('/weekly', async (c) => {
    const checks = await db
      .select()
      .from(schema.weeklyChecks)
      .where(eq(schema.weeklyChecks.userId, c.get('userId')))
      .orderBy(desc(schema.weeklyChecks.date))
      .limit(104);
    return c.json({ checks });
  })

  .put('/weekly/:date', async (c) => {
    const userId = c.get('userId');
    const date = c.req.param('date');
    if (!DATE.test(date)) return c.json({ error: 'Invalid date' }, 400);
    const parsed = z
      .object({
        weightKg: z.number().min(25).max(300).nullish(),
        waistCm: z.number().min(40).max(200).nullish(),
        restingHr: z.number().int().min(30).max(140).nullish(),
        capability: z.record(z.number()).optional(),
      })
      .safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: 'Invalid check-in' }, 400);

    const values = { ...parsed.data, userId, date };
    const [check] = await db
      .insert(schema.weeklyChecks)
      .values(values)
      .onConflictDoUpdate({ target: [schema.weeklyChecks.userId, schema.weeklyChecks.date], set: values })
      .returning();

    // FR-1.5: a new weight recalculates the protein target, so keep the profile in step.
    if (parsed.data.weightKg) {
      await db
        .update(schema.profiles)
        .set({ weightKg: parsed.data.weightKg, updatedAt: new Date() })
        .where(eq(schema.profiles.userId, userId));
    }
    return c.json({ check });
  });

// ---------------------------------------------------------------------------
// Nutrition
// ---------------------------------------------------------------------------

export const nutritionRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  .get('/foods', async (c) => {
    const userId = c.get('userId');
    const search = (c.req.query('q') ?? '').trim().toLowerCase();
    const pattern = c.req.query('diet');

    const rows = await db
      .select()
      .from(schema.foodItems)
      .where(or(isNull(schema.foodItems.ownerId), eq(schema.foodItems.ownerId, userId)));

    const filtered = rows
      .filter((f) => (pattern ? f.dietaryTags.includes(pattern) : true))
      .filter((f) => (search ? f.name.toLowerCase().includes(search) : true))
      .sort((a, b) => a.name.localeCompare(b.name));

    return c.json({ foods: filtered.slice(0, 100) });
  })

  .post('/foods', async (c) => {
    const userId = c.get('userId');
    const parsed = z
      .object({
        name: z.string().min(1).max(80),
        servingLabel: z.string().min(1).max(40),
        proteinG: z.number().min(0).max(200),
      })
      .safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: 'Invalid food' }, 400);

    const [food] = await db
      .insert(schema.foodItems)
      .values({
        id: `u-${userId.slice(0, 8)}-${Date.now().toString(36)}`,
        name: parsed.data.name,
        servingLabel: parsed.data.servingLabel,
        proteinG: parsed.data.proteinG,
        dietaryTags: ['omnivore', 'no_red_meat', 'pescatarian', 'vegetarian', 'eggetarian', 'vegan'],
        locale: 'CUSTOM',
        ownerId: userId,
      })
      .returning();
    return c.json({ food });
  })

  .get('/entries/:date', async (c) => {
    const date = c.req.param('date');
    if (!DATE.test(date)) return c.json({ error: 'Invalid date' }, 400);

    const rows = await db
      .select({
        id: schema.nutritionEntries.id,
        date: schema.nutritionEntries.date,
        servings: schema.nutritionEntries.servings,
        foodItemId: schema.nutritionEntries.foodItemId,
        name: schema.foodItems.name,
        servingLabel: schema.foodItems.servingLabel,
        proteinG: schema.foodItems.proteinG,
      })
      .from(schema.nutritionEntries)
      .innerJoin(schema.foodItems, eq(schema.foodItems.id, schema.nutritionEntries.foodItemId))
      .where(and(eq(schema.nutritionEntries.userId, c.get('userId')), eq(schema.nutritionEntries.date, date)))
      .orderBy(desc(schema.nutritionEntries.createdAt));

    const entries = rows.map((r) => ({ ...r, servings: Number(r.servings) }));
    const proteinTotal = entries.reduce((sum, e) => sum + e.proteinG * e.servings, 0);
    return c.json({ entries, proteinTotal: Math.round(proteinTotal) });
  })

  .post('/entries', async (c) => {
    const userId = c.get('userId');
    const parsed = z
      .object({
        id: z.string().uuid(),
        date: z.string().regex(DATE),
        foodItemId: z.string(),
        servings: z.number().min(0.25).max(20).default(1),
      })
      .safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: 'Invalid entry' }, 400);

    const values = {
      id: parsed.data.id,
      userId,
      date: parsed.data.date,
      foodItemId: parsed.data.foodItemId,
      servings: String(parsed.data.servings),
    };
    await db
      .insert(schema.nutritionEntries)
      .values(values)
      .onConflictDoUpdate({ target: schema.nutritionEntries.id, set: { servings: values.servings } });
    return c.json({ ok: true, id: parsed.data.id });
  })

  .delete('/entries/:id', async (c) => {
    await db
      .delete(schema.nutritionEntries)
      .where(
        and(
          eq(schema.nutritionEntries.userId, c.get('userId')),
          eq(schema.nutritionEntries.id, c.req.param('id')),
        ),
      );
    return c.json({ ok: true });
  });
