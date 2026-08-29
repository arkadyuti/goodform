import { Hono } from 'hono';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { DISCOMFORT_LOCATIONS } from '@goodform/shared';
import { db, schema } from '../db/index.js';
import { dateRangeFrom, limitFrom, requireAuth, type AppEnv } from '../middleware.js';

const sessionSchema = z.object({
  /** Client-generated UUID makes an offline replay idempotent. */
  id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['run', 'strength', 'baseline']),
  planId: z.string().uuid().nullish(),
  planWeek: z.number().int().nullish(),
  // Was `z.unknown()`, so whatever a client sent went into the jsonb column
  // verbatim and came back out typed as something it might not be. The charts
  // read `runSec` off it.
  prescription: z
    .object({
      runSec: z.number().int().min(0).max(36_000),
      walkSec: z.number().int().min(0).max(36_000),
      reps: z.number().int().min(0).max(100),
    })
    .nullish(),
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
    const { from, to } = await dateRangeFrom(c, { defaultDays: 365, maxDays: 1830 });
    const conditions = [
      eq(schema.workoutSessions.userId, userId),
      gte(schema.workoutSessions.date, from),
      lte(schema.workoutSessions.date, to),
    ];

    const rows = await db
      .select()
      .from(schema.workoutSessions)
      .where(and(...conditions))
      .orderBy(desc(schema.workoutSessions.date))
      .limit(limitFrom(c, 200, 1000));
    return c.json({ sessions: rows });
  })

  .post('/', async (c) => {
    const userId = c.get('userId');
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return c.json({ error: 'Invalid session' }, 400);
    const parsed = sessionSchema.safeParse(body);
    if (!parsed.success)
      return c.json({ error: 'Invalid session', issues: parsed.error.issues }, 400);
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

    /**
     * On update, only touch what the caller actually sent.
     *
     * A session is written more than once — once when the run ends, again when
     * the runner says how it went — and the second write knows less than the
     * first. Updating every column meant the second one blanked the interval
     * count and the whole per-exercise set log: twelve sets ticked one at a
     * time, erased by the screen that was supposed to be adding to them.
     *
     * A field the caller omitted means "leave it alone". Clearing one is done
     * by sending an explicit null, which the parsed body still distinguishes.
     */
    const patch = Object.fromEntries(
      Object.entries(values).filter(([key]) => {
        if (key === 'id' || key === 'userId') return false;
        // `discomfort` arrives as one object and lands in two columns.
        if (key === 'discomfortLocation' || key === 'discomfortSeverity') {
          return 'discomfort' in body;
        }
        return key in body;
      }),
    );

    // The id is client-supplied, so the offline queue can retry a write without
    // logging the session twice. That makes the conflict clause an
    // authorisation boundary: on the primary key alone, a request naming
    // someone else's session id would overwrite *their* record — and because
    // `values` carries userId, it would hand the row over as well.
    // What this session was before this write, so the strength counter below
    // can fire on a transition rather than on every POST.
    const [before] = await db
      .select({
        completion: schema.workoutSessions.completion,
        intervalsCompleted: schema.workoutSessions.intervalsCompleted,
        durationSec: schema.workoutSessions.durationSec,
      })
      .from(schema.workoutSessions)
      .where(and(eq(schema.workoutSessions.userId, userId), eq(schema.workoutSessions.id, s.id)));

    /**
     * A session never goes backwards.
     *
     * A run in progress is written about once a minute and again the moment it
     * ends, both under the same id and both fire-and-forget. Two can be in
     * flight at once — a tick at 12:00:00 and "End session" at 12:00:01 — and
     * if the older lands second it overwrites the finished session with its own
     * earlier snapshot: fewer intervals, a shorter duration, `completion` back
     * to `partial`. Rather than trusting arrival order, these may only move
     * forward.
     */
    if (before) {
      if (before.completion === 'full' && patch.completion === 'partial') delete patch.completion;
      if (
        typeof patch.intervalsCompleted === 'number' &&
        typeof before.intervalsCompleted === 'number' &&
        patch.intervalsCompleted < before.intervalsCompleted
      ) {
        delete patch.intervalsCompleted;
      }
      if (
        typeof patch.durationSec === 'number' &&
        typeof before.durationSec === 'number' &&
        patch.durationSec < before.durationSec
      ) {
        delete patch.durationSec;
      }
      // A straggling progress write carries no effort; it must not clear one.
      if (patch.effort === null && before.completion === 'full') delete patch.effort;
    }

    const [written] = await db
      .insert(schema.workoutSessions)
      .values(values)
      .onConflictDoUpdate({
        target: schema.workoutSessions.id,
        set: patch,
        setWhere: eq(schema.workoutSessions.userId, userId),
      })
      .returning({ id: schema.workoutSessions.id });
    if (!written) return c.json({ error: 'Not found' }, 404);

    /**
     * FR-5.7: completed strength work advances the prescription next time.
     *
     * Once per session, not once per write. A strength session is now saved as
     * each set is ticked, and again from the save button, so counting every
     * POST that arrived `full` advanced the prescribed reps at double rate —
     * in an app whose whole argument is that tendons take months. Firing only
     * when the session *becomes* complete also makes a replayed offline write
     * harmless.
     */
    const becameComplete = s.completion === 'full' && before?.completion !== 'full';
    if (s.type === 'strength' && becameComplete && s.exerciseLog) {
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

  /**
   * How many completed sessions each exercise has behind it.
   *
   * Counted from the sessions themselves rather than read from a running
   * total. The counter it replaces was incremented on write and decremented
   * nowhere: deleting a mislogged session left it behind for ever, and because
   * `progressReps` reads it, the app went on prescribing extra reps for work
   * that had been removed. A count of what is actually there cannot drift.
   */
  .get('/strength-progress', async (c) => {
    const rows = await db
      .select({ exerciseLog: schema.workoutSessions.exerciseLog })
      .from(schema.workoutSessions)
      .where(
        and(
          eq(schema.workoutSessions.userId, c.get('userId')),
          eq(schema.workoutSessions.type, 'strength'),
          eq(schema.workoutSessions.completion, 'full'),
        ),
      );

    const progress: Record<string, number> = {};
    for (const row of rows) {
      const log = row.exerciseLog;
      if (!log) continue;
      for (const exerciseId of Object.keys(log)) {
        progress[exerciseId] = (progress[exerciseId] ?? 0) + 1;
      }
    }
    return c.json({ progress });
  });
