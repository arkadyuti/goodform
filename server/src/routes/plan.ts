import { Hono } from 'hono';
import { and, desc, eq, gte, ne } from 'drizzle-orm';
import { z } from 'zod';
import {
  LIMITS,
  addDays,
  startOfWeek,
  GOALS,
  STOP_REASONS,
  daysBetween,
  attended,
  evaluateWeek,
  generatePlan,
  inWindow,
  runCounts,
  strengthCounts,
  windowFrom,
  STRENGTH_DAYS_PER_WEEK,
  needsFreshBaseline,
  nextGoalOptions,
  returnFromBreak,
  summariseBlock,
  type Goal,
  type Profile,
  type WorkoutSession,
} from '@goodform/shared';
import { db, schema } from '../db/index.js';
import { requireAuth, todayFrom, type AppEnv } from '../middleware.js';
import { activePlan, toSession } from '../plan/store.js';
import { settlePlan } from '../plan/settle.js';

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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const planRoutes = new Hono<AppEnv>()
  .use('*', requireAuth)

  /**
   * The plan the client should be looking at. Not `activePlan`: a block that
   * has been finished still has to reach the screen, or the runner is told
   * nothing at all rather than that they completed it. Abandoned plans are
   * replaced ones and stay hidden.
   */
  .get('/', async (c) => {
    const userId = c.get('userId');
    await settlePlan(userId, await todayFrom(c));
    const [plan] = await db
      .select()
      .from(schema.plans)
      .where(and(eq(schema.plans.userId, userId), ne(schema.plans.status, 'abandoned')))
      .orderBy(desc(schema.plans.createdAt))
      .limit(1);
    if (!plan) return c.json({ plan: null, weeks: [] });

    const weeks = await db
      .select()
      .from(schema.planWeeks)
      .where(eq(schema.planWeeks.planId, plan.id))
      .orderBy(schema.planWeeks.index);
    return c.json({ plan, weeks });
  })

  .post('/baseline', async (c) => {
    const userId = c.get('userId');
    const parsed = z
      .object({
        minutesRun: z.number().min(LIMITS.minutesRun.min).max(LIMITS.minutesRun.max),
        stopReason: z.enum(STOP_REASONS),
        date: z.string().regex(ISO_DATE).optional(),
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
    // safeParse, not parse: a malformed body is a 400, not an exception.
    const body = z
      .object({ startDate: z.string().regex(ISO_DATE).optional() })
      .safeParse(await c.req.json().catch(() => ({})));
    if (!body.success) return c.json({ error: 'Invalid start date' }, 400);

    const [profileRow] = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, userId));
    if (!profileRow) return c.json({ error: 'Complete your profile first' }, 400);

    const [screening] = await db
      .select()
      .from(schema.screenings)
      .where(eq(schema.screenings.userId, userId));
    // SR-1: a flagged screening must be acknowledged before a plan is generated.
    if (screening && screening.flags.length > 0 && !screening.acknowledgedAt) {
      return c.json(
        { error: 'Screening needs acknowledgement before a plan can be generated' },
        409,
      );
    }

    const [baseline] = await db
      .select()
      .from(schema.baselines)
      .where(eq(schema.baselines.userId, userId))
      .orderBy(desc(schema.baselines.recordedAt))
      .limit(1);
    if (!baseline) return c.json({ error: 'Record a baseline assessment first' }, 400);

    // The user's day, not the server's — a plan generated at 2am in India must
    // not be dated to the previous day because the box runs on UTC.
    const startDate = body.data.startDate ?? (await todayFrom(c));
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

    // One transaction: a plan without its weeks is not a lesser plan, it is a
    // broken one — every screen that reads `weeks[weeks.length - 1]` throws on
    // it, and nothing in the app can repair it.
    const plan = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(schema.plans)
        .values({
          userId,
          goal: generated.goal,
          conservatism: generated.conservatism,
          conservatismReasons: generated.conservatismReasons,
          startDate,
        })
        .returning();
      if (!created) throw new Error('Plan insert returned no row');

      await tx.insert(schema.planWeeks).values(
        generated.weeks.map((w) => ({
          planId: created.id,
          index: w.index,
          runSec: w.runSec,
          walkSec: w.walkSec,
          reps: w.reps,
          sessionsPerWeek: w.sessionsPerWeek,
          isDeload: w.isDeload,
          totalRunSec: w.totalRunSec,
          startedOn: w.index === 1 ? startDate : null,
        })),
      );
      return created;
    });

    return c.json({ plan, weeks: generated.weeks });
  })

  /** Evaluates the current week against what was logged and returns the gate. */
  /**
   * The week the runner is in, and how it stands.
   *
   * The plan is settled first, so the window here is always the live one: a
   * week that closed since the last visit has already moved on or come round
   * again by the time this reads it. `last` is what that closing decided, so
   * a Monday can say why this is week two — or week one again — without the
   * runner having to remember.
   */
  .get('/week-review', async (c) => {
    const userId = c.get('userId');
    const today = await todayFrom(c);
    await settlePlan(userId, today);

    const current = await activePlan(userId);
    if (!current) return c.json({ error: 'No active plan' }, 404);
    const { plan, weeks } = current;
    const week = weeks.find((w) => w.index === plan.currentWeek);
    if (!week) return c.json({ error: 'Week not found' }, 404);

    const range = windowFrom(week.startedOn ?? plan.startDate);

    const rows = await db
      .select()
      .from(schema.workoutSessions)
      .where(
        and(
          eq(schema.workoutSessions.userId, userId),
          gte(schema.workoutSessions.date, plan.startDate),
        ),
      );
    const all = rows.map(toSession);
    const isRun = (s: WorkoutSession) => s.type === 'run' || s.type === 'baseline';
    const sessions = all.filter((s) => inWindow(s.date, range));
    const weekOver = today > range.to;
    const gate = evaluateWeek(week, sessions.filter(isRun), week.repeats, weekOver);

    /**
     * What the last closed window decided.
     *
     * For a repeat, walk back a window at a time to the attempt that actually
     * had running in it — a week the plan merely waited through says nothing
     * worth repeating to the runner.
     */
    let last: {
      kind: 'repeated' | 'advanced';
      week: number;
      window: { from: string; to: string };
      gate: ReturnType<typeof evaluateWeek>;
      attempted: number;
      finished: number;
    } | null = null;
    const summarise = (runs: WorkoutSession[]) => ({
      attempted: runs.filter(attended).length,
      finished: runs.filter(runCounts).length,
    });
    if (week.repeats > 0) {
      let to = addDays(range.from, -1);
      for (let back = 0; back < 8 && to >= plan.startDate; back++) {
        const from = addDays(to, -6) <= plan.startDate ? plan.startDate : addDays(to, -6);
        const window = { from, to };
        const runs = all.filter((s) => isRun(s) && inWindow(s.date, window));
        if (runs.length > 0) {
          last = {
            kind: 'repeated',
            week: week.index,
            window,
            gate: evaluateWeek(week, runs, Math.max(0, week.repeats - 1), true),
            ...summarise(runs),
          };
          break;
        }
        to = addDays(from, -1);
      }
    } else if (week.index > 1) {
      const previous = weeks.find((w) => w.index === week.index - 1);
      if (previous) {
        const window = previous.startedOn
          ? windowFrom(previous.startedOn)
          : { from: addDays(range.from, -7), to: addDays(range.from, -1) };
        const runs = all.filter((s) => isRun(s) && inWindow(s.date, window));
        last = {
          kind: 'advanced',
          week: previous.index,
          window,
          gate: evaluateWeek(previous, runs, previous.repeats, true),
          ...summarise(runs),
        };
      }
    }

    const daysWith = (test: (s: WorkoutSession) => boolean) =>
      new Set(sessions.filter(test).map((s) => s.date)).size;

    return c.json({
      gate,
      week,
      range,
      weekOver,
      daysLeft: Math.max(0, daysBetween(today, range.to)),
      sessions,
      last,
      /** Nothing logged in this window yet — the moment to explain `last`. */
      fresh: sessions.length === 0,
      /**
       * Extra strength work carries into the repeated attempt. It used to be
       * read off the current window only, so accepting a repeat — which opened
       * an empty window — cancelled the very emphasis it had just recommended.
       */
      strengthEmphasis:
        gate.strengthEmphasis || (last?.kind === 'repeated' && last.gate.strengthEmphasis),
      quota: {
        runs: week.sessionsPerWeek,
        strength: STRENGTH_DAYS_PER_WEEK,
        runsDone: daysWith((s) => isRun(s) && runCounts(s)),
        strengthDone: daysWith((s) => s.type === 'strength' && strengthCounts(s)),
      },
    });
  })

  /** FR-3.3: the runner decides. Overrides are recorded, never blocked. */
  .post('/week-decision', async (c) => {
    const userId = c.get('userId');
    const parsed = z
      .object({
        action: z.enum(['advance', 'repeat', 'step_back', 'pause', 'resume', 'ease']),
        override: z.boolean().default(false),
        /**
         * The week the caller was looking at when they decided.
         *
         * `advance` reads the current week and writes the next one, so two
         * taps — a slow network and an impatient thumb — moved the plan
         * forward twice and skipped a week outright. In an app whose whole
         * purpose is building gradually, that is the worst possible failure.
         * Naming the week makes the decision about a specific one, so a repeat
         * of the same request does nothing.
         */
        fromWeek: z.number().int().min(1).optional(),
        /** What the gate had decided, when the runner pushes past it. */
        overriddenGate: z.string().max(40).optional(),
        /** For `ease`: the smaller week the gate offered. */
        easeTo: z
          .object({
            runSec: z.number().int().min(30).max(3600),
            reps: z.number().int().min(1).max(50),
          })
          .optional(),
      })
      .safeParse(await c.req.json());
    if (!parsed.success) return c.json({ error: 'Invalid decision' }, 400);

    const today = await todayFrom(c);
    await settlePlan(userId, today);
    const current = await activePlan(userId);
    if (!current) return c.json({ error: 'No active plan' }, 404);
    const { plan, weeks } = current;

    // Already acted on. Answer with where the plan actually is rather than
    // moving it again — the caller's screen is simply behind.
    if (parsed.data.fromWeek !== undefined && parsed.data.fromWeek !== plan.currentWeek) {
      return c.json({ currentWeek: plan.currentWeek, completed: false, alreadyApplied: true });
    }
    const last = weeks[weeks.length - 1]?.index;
    if (last === undefined) return c.json({ error: 'This plan has no weeks' }, 409);

    switch (parsed.data.action) {
      case 'advance': {
        await db
          .update(schema.planWeeks)
          .set({
            completedAt: new Date(),
            // FR-3.3: the runner decides, and the decision is on the record.
            ...(parsed.data.override
              ? {
                  overriddenAt: new Date(),
                  overriddenGate: parsed.data.overriddenGate ?? 'unknown',
                }
              : {}),
          })
          .where(
            and(eq(schema.planWeeks.planId, plan.id), eq(schema.planWeeks.index, plan.currentWeek)),
          );
        const next = plan.currentWeek + 1;
        // Pushed on part-way through: the next week starts today, not on a
        // Monday that has already passed.
        if (next <= last) {
          await db
            .update(schema.planWeeks)
            .set({ startedOn: today })
            .where(and(eq(schema.planWeeks.planId, plan.id), eq(schema.planWeeks.index, next)));
        }
        await db
          .update(schema.plans)
          .set(next > last ? { status: 'completed' } : { currentWeek: next, pausedReason: null })
          .where(eq(schema.plans.id, plan.id));
        return c.json({ currentWeek: Math.min(next, last), completed: next > last });
      }
      /**
       * Bring the current week within reach and start it again.
       *
       * The only branch that makes a week smaller. The repeat counter is reset
       * because this is a different week now — carrying it over would have the
       * plan offering to ease an already-eased week straight away.
       */
      case 'ease': {
        const target = parsed.data.easeTo;
        if (!target) return c.json({ error: 'Nothing to ease to' }, 400);
        await db
          .update(schema.planWeeks)
          .set({
            reps: target.reps,
            runSec: target.runSec,
            totalRunSec: target.runSec * target.reps * 3,
            repeats: 0,
          })
          .where(
            and(eq(schema.planWeeks.planId, plan.id), eq(schema.planWeeks.index, plan.currentWeek)),
          );
        return c.json({ currentWeek: plan.currentWeek, eased: true });
      }

      case 'repeat': {
        await db
          .update(schema.planWeeks)
          .set({ repeats: (weeks.find((w) => w.index === plan.currentWeek)?.repeats ?? 0) + 1 })
          .where(
            and(eq(schema.planWeeks.planId, plan.id), eq(schema.planWeeks.index, plan.currentWeek)),
          );
        await db
          .update(schema.plans)
          .set({ pausedReason: null })
          .where(eq(schema.plans.id, plan.id));
        return c.json({ currentWeek: plan.currentWeek, repeated: true });
      }
      case 'step_back': {
        const back = Math.max(1, plan.currentWeek - 1);
        await db
          .update(schema.planWeeks)
          .set({ startedOn: today })
          .where(and(eq(schema.planWeeks.planId, plan.id), eq(schema.planWeeks.index, back)));
        await db
          .update(schema.plans)
          .set({ currentWeek: back, pausedReason: null })
          .where(eq(schema.plans.id, plan.id));
        return c.json({ currentWeek: back });
      }
      case 'pause': {
        await db
          .update(schema.plans)
          .set({
            status: 'paused',
            pausedReason: 'Discomfort at 4 or above — resting until this settles.',
          })
          .where(eq(schema.plans.id, plan.id));
        return c.json({ status: 'paused' });
      }
      case 'resume': {
        // A pause is not a failed week. The week picks up from this Monday,
        // rather than being rolled through every window the pause covered.
        await db
          .update(schema.planWeeks)
          .set({ startedOn: startOfWeek(today) })
          .where(
            and(eq(schema.planWeeks.planId, plan.id), eq(schema.planWeeks.index, plan.currentWeek)),
          );
        await db
          .update(schema.plans)
          .set({ status: 'active', pausedReason: null })
          .where(eq(schema.plans.id, plan.id));
        return c.json({ status: 'active' });
      }
    }
  })

  /**
   * P3: what the block just finished actually delivered, and what could come
   * next. Read-only — nothing changes until the runner picks something.
   */
  .get('/block-outcome', async (c) => {
    const userId = c.get('userId');
    const [plan] = await db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.userId, userId))
      .orderBy(desc(schema.plans.createdAt))
      .limit(1);
    if (!plan) return c.json({ error: 'No plan yet' }, 404);

    const weeks = await db
      .select()
      .from(schema.planWeeks)
      .where(eq(schema.planWeeks.planId, plan.id))
      .orderBy(schema.planWeeks.index);

    // Filtered by date rather than plan id: only one plan is active at a time,
    // and a session logged offline before the column existed still counts.
    const sessions = await db
      .select()
      .from(schema.workoutSessions)
      .where(
        and(
          eq(schema.workoutSessions.userId, userId),
          gte(schema.workoutSessions.date, plan.startDate),
        ),
      );

    const outcome = summariseBlock(
      { goal: plan.goal as Goal, currentWeek: plan.currentWeek },
      weeks,
      sessions.map(toSession),
    );

    const [latestRun] = await db
      .select({ date: schema.workoutSessions.date })
      .from(schema.workoutSessions)
      .where(eq(schema.workoutSessions.userId, userId))
      .orderBy(desc(schema.workoutSessions.date))
      .limit(1);
    const daysSinceLastRun = latestRun
      ? daysBetween(latestRun.date, new Date().toISOString().slice(0, 10))
      : Infinity;

    return c.json({
      plan,
      outcome,
      options: nextGoalOptions(outcome),
      needsBaseline: needsFreshBaseline(outcome, daysSinceLastRun),
      daysSinceLastRun: Number.isFinite(daysSinceLastRun) ? daysSinceLastRun : null,
    });
  })

  /**
   * P3: starts the next block. Continues from what the finished block reached
   * unless a fresh baseline was recorded, in which case that wins — someone
   * coming back after months is not the runner the old block described.
   */
  .post('/reassess', async (c) => {
    const userId = c.get('userId');
    const parsed = z
      .object({
        goal: z.enum(GOALS),
        startDate: z.string().regex(ISO_DATE).optional(),
        /** A fresh timed run, when the block is too old to continue from. */
        baseline: z
          .object({ minutesRun: z.number().min(0).max(120), stopReason: z.enum(STOP_REASONS) })
          .nullish(),
      })
      .safeParse(await c.req.json());
    if (!parsed.success)
      return c.json({ error: 'Invalid reassessment', issues: parsed.error.issues }, 400);

    const [profileRow] = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, userId));
    if (!profileRow) return c.json({ error: 'Complete your profile first' }, 400);

    const [previous] = await db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.userId, userId))
      .orderBy(desc(schema.plans.createdAt))
      .limit(1);

    let continueFrom: { runSec: number; walkSec: number; reps: number } | undefined;
    if (previous && !parsed.data.baseline) {
      const weeks = await db
        .select()
        .from(schema.planWeeks)
        .where(eq(schema.planWeeks.planId, previous.id))
        .orderBy(schema.planWeeks.index);
      const sessions = await db
        .select()
        .from(schema.workoutSessions)
        .where(
          and(
            eq(schema.workoutSessions.userId, userId),
            gte(schema.workoutSessions.date, previous.startDate),
          ),
        );
      continueFrom =
        summariseBlock(
          { goal: previous.goal as Goal, currentWeek: previous.currentWeek },
          weeks,
          sessions.map(toSession),
        ).continueFrom ?? undefined;
    }

    // A new goal is a change to the profile, not just to this block.
    if (parsed.data.goal !== profileRow.goal) {
      await db
        .update(schema.profiles)
        .set({ goal: parsed.data.goal, updatedAt: new Date() })
        .where(eq(schema.profiles.userId, userId));
    }

    const baselineRow = parsed.data.baseline
      ? (
          await db
            .insert(schema.baselines)
            .values({
              userId,
              minutesRun: parsed.data.baseline.minutesRun,
              stopReason: parsed.data.baseline.stopReason,
            })
            .returning()
        )[0]
      : (
          await db
            .select()
            .from(schema.baselines)
            .where(eq(schema.baselines.userId, userId))
            .orderBy(desc(schema.baselines.recordedAt))
            .limit(1)
        )[0];

    if (!baselineRow) return c.json({ error: 'Record a baseline assessment first' }, 400);

    const startDate = parsed.data.startDate ?? new Date().toISOString().slice(0, 10);
    const generated = generatePlan(
      { ...toProfile(profileRow), goal: parsed.data.goal },
      {
        minutesRun: baselineRow.minutesRun,
        stopReason: baselineRow.stopReason as 'breath' | 'legs' | 'choice',
        recordedAt: baselineRow.recordedAt.toISOString(),
      },
      startDate,
      continueFrom ? { continueFrom } : {},
    );

    // Closing the old block and opening the new one are one change. Half of it
    // leaves either two active plans or a plan with no weeks.
    const plan = await db.transaction(async (tx) => {
      // The block that just ended is finished, not abandoned — it is the record
      // of what was actually done.
      if (previous && previous.status === 'active') {
        await tx
          .update(schema.plans)
          .set({ status: 'completed' })
          .where(eq(schema.plans.id, previous.id));
      }

      const [created] = await tx
        .insert(schema.plans)
        .values({
          userId,
          goal: generated.goal,
          conservatism: generated.conservatism,
          conservatismReasons: generated.conservatismReasons,
          startDate,
        })
        .returning();
      if (!created) throw new Error('Plan insert returned no row');

      await tx.insert(schema.planWeeks).values(
        generated.weeks.map((w) => ({
          planId: created.id,
          index: w.index,
          runSec: w.runSec,
          walkSec: w.walkSec,
          reps: w.reps,
          sessionsPerWeek: w.sessionsPerWeek,
          isDeload: w.isDeload,
          totalRunSec: w.totalRunSec,
          startedOn: w.index === 1 ? startDate : null,
        })),
      );
      return created;
    });

    return c.json({ plan, weeks: generated.weeks });
  })

  /**
   * What a gap in training would do, without doing it.
   *
   * The step-back is a real change to someone's plan, so it is offered rather
   * than applied behind their back. This is the read half; the POST below is
   * what happens when they accept.
   */
  .get('/break-check', async (c) => {
    const userId = c.get('userId');
    const current = await activePlan(userId);
    if (!current) return c.json({ onBreak: false });

    const [latest] = await db
      .select({ date: schema.workoutSessions.date })
      .from(schema.workoutSessions)
      .where(eq(schema.workoutSessions.userId, userId))
      .orderBy(desc(schema.workoutSessions.date))
      .limit(1);
    if (!latest) return c.json({ onBreak: false });

    const gapDays = daysBetween(latest.date, await todayFrom(c));
    if (gapDays < 10) return c.json({ onBreak: false, gapDays });
    return c.json({
      onBreak: true,
      gapDays,
      lastSession: latest.date,
      result: returnFromBreak(gapDays),
    });
  })

  /** FR-3.5: applies a proportional step-back after a gap in training. */
  .post('/return-from-break', async (c) => {
    const userId = c.get('userId');
    const parsed = z
      .object({ fromWeek: z.number().int().min(1).optional() })
      .parse(await c.req.json().catch(() => ({})));
    const current = await activePlan(userId);
    if (!current) return c.json({ error: 'No active plan' }, 404);

    const [latest] = await db
      .select()
      .from(schema.workoutSessions)
      .where(eq(schema.workoutSessions.userId, userId))
      .orderBy(desc(schema.workoutSessions.date))
      .limit(1);
    if (!latest) return c.json({ applied: false, result: returnFromBreak(0) });

    const gapDays = daysBetween(latest.date, await todayFrom(c));
    const result = returnFromBreak(gapDays);

    // Applying twice steps back twice: the gap has not changed, because
    // stepping back logs nothing. The caller names the week it was looking at,
    // so a second attempt on a plan that has already moved does nothing.
    if (parsed.fromWeek !== undefined && parsed.fromWeek !== current.plan.currentWeek) {
      return c.json({ applied: false, alreadyApplied: true, gapDays, result });
    }

    if (result.stepBackWeeks > 0) {
      const back = Math.max(1, current.plan.currentWeek - result.stepBackWeeks);
      await db
        .update(schema.planWeeks)
        .set({ startedOn: await todayFrom(c) })
        .where(and(eq(schema.planWeeks.planId, current.plan.id), eq(schema.planWeeks.index, back)));
      await db
        .update(schema.plans)
        .set({ currentWeek: back })
        .where(eq(schema.plans.id, current.plan.id));
    }
    return c.json({ applied: result.stepBackWeeks > 0, gapDays, result });
  });
