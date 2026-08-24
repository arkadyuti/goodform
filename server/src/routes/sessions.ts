import { Hono } from 'hono';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DISCOMFORT_LOCATIONS } from '@goodform/shared';
import { db, schema } from '../db/index.js';
import { requireAuth, type AppEnv } from '../middleware.js';

const sessionSchema = z.object({
  /** Client-generated UUID makes an offline replay idempotent. */
  id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['run', 'strength', 'baseline']),
  planId: z.string().uuid().nullish(),
  planWeek: z.number().int().nullish(),
  prescription: z.unknown().nullish(),
  completion: z.enum(['full', 'partial', 'skipped']),
  effort: z.number().int().min(1).max(5).nullish(),
  discomfort: z
    .object({ location: z.enum(DISCOMFORT_LOCATIONS), severity: z.number().int().min(1).max(5) })
    .nullish(),
  intervalsCompleted: z.number().int().min(0).nullish(),
  durationSec: z.number().int().min(0).nullish(),
  exerciseLog: z.record(z.number()).nullish(),
  notes: z.string().max(1000).nullish(),
});

export const sessionRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  .get('/', async (c) => {
    const userId = c.get('userId');
    const from = c.req.query('from');
    const to = c.req.query('to');
    const conditions = [eq(schema.workoutSessions.userId, userId)];
    if (from) conditions.push(gte(schema.workoutSessions.date, from));
    if (to) conditions.push(lte(schema.workoutSessions.date, to));

    const rows = await db
      .select()
      .from(schema.workoutSessions)
      .where(and(...conditions))
      .orderBy(desc(schema.workoutSessions.date))
      .limit(Number(c.req.query('limit') ?? 200));
    return c.json({ sessions: rows });
  })

  .post('/', async (c) => {
    const userId = c.get('userId');
    const parsed = sessionSchema.safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: 'Invalid session', issues: parsed.error.issues }, 400);
    const s = parsed.data;

    const values = {
      id: s.id,
      userId,
      planId: s.planId ?? null,
      date: s.date,
      type: s.type,
      planWeek: s.planWeek ?? null,
      prescription: s.prescription ?? null,
      completion: s.completion,
      effort: s.effort ?? null,
      discomfortLocation: s.discomfort?.location ?? null,
      discomfortSeverity: s.discomfort?.severity ?? null,
      intervalsCompleted: s.intervalsCompleted ?? null,
      durationSec: s.durationSec ?? null,
      exerciseLog: s.exerciseLog ?? null,
      notes: s.notes ?? null,
    };

    await db
      .insert(schema.workoutSessions)
      .values(values)
      .onConflictDoUpdate({ target: schema.workoutSessions.id, set: values });

    // FR-5.7: completed strength work advances the prescription next time.
    if (s.type === 'strength' && s.completion === 'full' && s.exerciseLog) {
      for (const exerciseId of Object.keys(s.exerciseLog)) {
        await db
          .insert(schema.strengthProgress)
          .values({ userId, exerciseId, sessionsCompleted: 1 })
          .onConflictDoUpdate({
            target: [schema.strengthProgress.userId, schema.strengthProgress.exerciseId],
            set: {
              sessionsCompleted: sql`${schema.strengthProgress.sessionsCompleted} + 1`,
              updatedAt: new Date(),
            },
          });
      }
    }

    return c.json({ ok: true, id: s.id });
  })

  /** Removes a mislogged session. Backfilling is only safe if it is reversible. */
  .delete('/:id', async (c) => {
    await db
      .delete(schema.workoutSessions)
      .where(
        and(
          eq(schema.workoutSessions.userId, c.get('userId')),
          eq(schema.workoutSessions.id, c.req.param('id')),
        ),
      );
    return c.json({ ok: true });
  })

  .get('/strength-progress', async (c) => {
    const rows = await db
      .select()
      .from(schema.strengthProgress)
      .where(eq(schema.strengthProgress.userId, c.get('userId')));
    return c.json({
      progress: Object.fromEntries(rows.map((r) => [r.exerciseId, r.sessionsCompleted])),
    });
  });
