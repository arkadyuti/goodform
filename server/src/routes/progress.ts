import { Hono } from 'hono';
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm';
import {
  addDays,
  adherenceFor,
  buildWeeklyReview,
  dateRange,
  daysBetween,
  isDueOn,
  proteinTarget,
  DEFAULT_TRAINING_DAYS,
  reachedTheInterval,
  scheduleFor,
  startOfWeek,
  type Adherence,
  type WorkoutSession,
  type Completion,
} from '@goodform/shared';
import { db, schema } from '../db/index.js';
import { dateRangeFrom, requireAuth, todayFrom, type AppEnv } from '../middleware.js';
import { loadAllItems, loadEvents } from '../regimen-store.js';

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

type SessionRow = typeof schema.workoutSessions.$inferSelect;

function toSession(row: SessionRow): WorkoutSession {
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

/** Protein grams per day over a window, summed in the database. */
async function proteinByDate(
  userId: string,
  from: string,
  to: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      date: schema.nutritionEntries.date,
      grams: sql<number>`sum(${schema.foodItems.proteinG} * ${schema.nutritionEntries.servings})`,
    })
    .from(schema.nutritionEntries)
    .innerJoin(schema.foodItems, eq(schema.foodItems.id, schema.nutritionEntries.foodItemId))
    .where(
      and(
        eq(schema.nutritionEntries.userId, userId),
        gte(schema.nutritionEntries.date, from),
        lte(schema.nutritionEntries.date, to),
      ),
    )
    .groupBy(schema.nutritionEntries.date);
  return Object.fromEntries(rows.map((r) => [r.date, Math.round(Number(r.grams))]));
}

async function dailyLogsBetween(userId: string, from: string, to: string) {
  return db
    .select()
    .from(schema.dailyLogs)
    .where(
      and(
        eq(schema.dailyLogs.userId, userId),
        gte(schema.dailyLogs.date, from),
        lte(schema.dailyLogs.date, to),
      ),
    )
    .orderBy(asc(schema.dailyLogs.date));
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
      .where(
        and(eq(schema.workoutSessions.userId, userId), gte(schema.workoutSessions.date, since)),
      )
      .orderBy(desc(schema.workoutSessions.date));

    const runs = sessions.filter((s) => s.type === 'run' || s.type === 'baseline');
    const strength = sessions.filter((s) => s.type === 'strength');

    const longestRunSec = runs.reduce((max, s) => {
      if (
        !reachedTheInterval({
          completion: s.completion as Completion,
          intervalsCompleted: s.intervalsCompleted,
        })
      )
        return max;
      const prescription = s.prescription as { runSec?: number } | null;
      return Math.max(max, prescription?.runSec ?? 0);
    }, 0);

    const discomfort = runs
      .filter((s) => s.discomfortSeverity)
      .map((s) => ({
        date: s.date,
        location: s.discomfortLocation,
        severity: s.discomfortSeverity,
      }));

    const [plan] = await db
      .select()
      .from(schema.plans)
      .where(and(eq(schema.plans.userId, userId), eq(schema.plans.status, 'active')))
      .limit(1);

    const weeks = plan
      ? await db
          .select()
          .from(schema.planWeeks)
          .where(eq(schema.planWeeks.planId, plan.id))
          .orderBy(schema.planWeeks.index)
      : [];

    /**
     * Runs asked for so far, over weeks that have actually elapsed.
     *
     * Two things made this read "7 of 6". The denominator counted the current
     * week in full the moment it began — so Monday morning of week three
     * already showed six missed sessions — and it only grew when the runner
     * tapped a weekly gate, so someone who never taps one has a denominator
     * frozen at three while the numerator climbs. The numerator, meanwhile,
     * counted baseline assessments as planned runs.
     */
    const weeksElapsed = plan
      ? Math.min(
          weeks.filter((w) => w.index <= plan.currentWeek).length,
          Math.floor(daysBetween(plan.startDate, await todayFrom(c)) / 7) + 1,
        )
      : 0;
    const plannedRuns = weeks
      .filter((w) => w.index <= weeksElapsed)
      .reduce((sum, w) => sum + w.sessionsPerWeek * (1 + w.repeats), 0);

    const checks = await db
      .select()
      .from(schema.weeklyChecks)
      .where(eq(schema.weeklyChecks.userId, userId))
      .orderBy(desc(schema.weeklyChecks.date))
      .limit(26);

    return c.json({
      adherence: {
        // A baseline is a one-off assessment, not one of the planned runs.
        runsCompleted: runs.filter((s) => s.type === 'run' && s.completion === 'full').length,
        runsPlanned: plannedRuns,
        strengthCompleted: strength.filter((s) => s.completion === 'full').length,
      },
      longestRunSec,
      discomfort,
      checks,
      recentSessions: sessions.slice(0, 30),
    });
  })

  /**
   * P2: the trend series behind the charts. One measure per series and one
   * series per chart — weight, waist and resting heart rate share no axis,
   * because two scales on one plot invent a relationship that is not there.
   */
  .get('/trends', async (c) => {
    const userId = c.get('userId');
    const { from, to } = await dateRangeFrom(c, { defaultDays: 180, maxDays: 1830 });

    const [sessions, checks] = await Promise.all([
      db
        .select()
        .from(schema.workoutSessions)
        .where(
          and(
            eq(schema.workoutSessions.userId, userId),
            gte(schema.workoutSessions.date, from),
            lte(schema.workoutSessions.date, to),
          ),
        )
        .orderBy(asc(schema.workoutSessions.date)),
      db
        .select()
        .from(schema.weeklyChecks)
        .where(
          and(
            eq(schema.weeklyChecks.userId, userId),
            gte(schema.weeklyChecks.date, from),
            lte(schema.weeklyChecks.date, to),
          ),
        )
        .orderBy(asc(schema.weeklyChecks.date)),
    ]);

    // Longest unbroken interval, by week: the number the whole plan is about.
    const runsByWeek = new Map<string, number>();
    const strengthByWeek = new Map<string, number>();
    let cumulativeStrength = 0;
    const strengthLevel: { date: string; value: number }[] = [];

    for (const session of sessions) {
      if (session.completion === 'skipped') continue;
      const week = startOfWeek(session.date);
      if (session.type === 'run' || session.type === 'baseline') {
        const runSec = (session.prescription as { runSec?: number } | null)?.runSec ?? 0;
        // A partial session still reached the interval if it finished any of
        // them; one that got through none of them reached nothing.
        const reached = session.completion === 'full' || (session.intervalsCompleted ?? 0) > 0;
        if (reached) runsByWeek.set(week, Math.max(runsByWeek.get(week) ?? 0, runSec));
      } else if (session.type === 'strength' && session.completion === 'full') {
        strengthByWeek.set(week, (strengthByWeek.get(week) ?? 0) + 1);
      }
    }

    // FR-5.7 advances the prescription every third completed session, so the
    // level the programme has reached is a real capability trend rather than
    // an attendance count.
    for (const week of [...strengthByWeek.keys()].sort()) {
      cumulativeStrength += strengthByWeek.get(week)!;
      strengthLevel.push({ date: week, value: Math.floor(cumulativeStrength / 3) });
    }

    const longestRun = [...runsByWeek.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, value]) => ({ date, value: Math.round((value / 60) * 10) / 10 }));

    const series = (key: 'weightKg' | 'waistCm' | 'restingHr') =>
      checks
        .filter((check) => check[key] !== null)
        .map((check) => ({ date: check.date, value: check[key] as number }));

    const discomfort = sessions
      .filter((s) => s.discomfortSeverity)
      .map((s) => ({
        date: s.date,
        location: s.discomfortLocation as string,
        severity: s.discomfortSeverity as number,
      }));

    return c.json({
      from,
      to,
      longestRun,
      weight: series('weightKg'),
      waist: series('waistCm'),
      restingHr: series('restingHr'),
      strengthLevel,
      strengthSessions: [...strengthByWeek.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([date, value]) => ({ date, value })),
      discomfort,
    });
  })

  /**
   * P2: the weekly review. Defaults to the week just gone, because that is the
   * one there is anything to say about.
   */
  .get('/weekly-review', async (c) => {
    const userId = c.get('userId');
    const requested = c.req.query('week');
    const today = await todayFrom(c);
    const from =
      requested && /^\d{4}-\d{2}-\d{2}$/.test(requested)
        ? startOfWeek(requested)
        : startOfWeek(today);
    const to = addDays(from, 6);
    const previousFrom = addDays(from, -7);

    const [profileRow] = await db
      .select()
      .from(schema.profiles)
      .where(eq(schema.profiles.userId, userId));
    const [settingsRow] = await db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.userId, userId));

    const [sessions, earlier, logs, previousLogs, checks, protein] = await Promise.all([
      db
        .select()
        .from(schema.workoutSessions)
        .where(
          and(
            eq(schema.workoutSessions.userId, userId),
            gte(schema.workoutSessions.date, from),
            lte(schema.workoutSessions.date, to),
          ),
        ),
      // Everything before this week, for the "longest so far" comparison.
      db
        .select()
        .from(schema.workoutSessions)
        .where(
          and(
            eq(schema.workoutSessions.userId, userId),
            lte(schema.workoutSessions.date, addDays(from, -1)),
          ),
        ),
      dailyLogsBetween(userId, from, to),
      dailyLogsBetween(userId, previousFrom, addDays(from, -1)),
      db
        .select()
        .from(schema.weeklyChecks)
        .where(and(eq(schema.weeklyChecks.userId, userId), lte(schema.weeklyChecks.date, to)))
        .orderBy(desc(schema.weeklyChecks.date))
        .limit(6),
      proteinByDate(userId, from, to),
    ]);

    const [plan] = await db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.userId, userId))
      .orderBy(desc(schema.plans.createdAt))
      .limit(1);
    const [week] = plan
      ? await db
          .select()
          .from(schema.planWeeks)
          .where(
            and(eq(schema.planWeeks.planId, plan.id), eq(schema.planWeeks.index, plan.currentWeek)),
          )
      : [];

    // Doses over the same week, so the review covers the whole routine.
    const items = await loadAllItems(userId);
    const doseEvents = await loadEvents(userId, from, to);
    const regimen: Adherence | null = items.length
      ? items
          .map((item) => adherenceFor(item, doseEvents, from, to))
          .reduce<Adherence>(
            (total, one) => ({
              due: total.due + one.due,
              taken: total.taken + one.taken,
              skipped: total.skipped + one.skipped,
              missed: total.missed + one.missed,
              rate: null,
            }),
            { due: 0, taken: 0, skipped: 0, missed: 0, rate: null },
          )
      : null;
    if (regimen && regimen.due > 0) regimen.rate = regimen.taken / regimen.due;

    const previousLongestRunSec = earlier
      .filter((s) => (s.type === 'run' || s.type === 'baseline') && s.completion !== 'skipped')
      .reduce(
        (max, s) => Math.max(max, (s.prescription as { runSec?: number } | null)?.runSec ?? 0),
        0,
      );

    const withinWeek = checks.find((check) => check.date >= from && check.date <= to) ?? null;
    const before = checks.find((check) => check.date < (withinWeek?.date ?? from)) ?? null;

    const review = buildWeeklyReview({
      from,
      to,
      sessions: sessions.map(toSession),
      plannedRuns: week?.sessionsPerWeek ?? 3,
      plannedStrength: 2,
      logs,
      previousLogs,
      proteinByDate: protein,
      /**
       * The target as it was that week, not as it is today.
       *
       * This read the *current* profile weight, and every weekly check-in
       * writes its weight back to the profile — so stepping on the scales
       * today rewrote how many days you hit your protein target last month.
       * A finished week is a finished week.
       */
      proteinTargetG: settingsRow?.targetsWithdrawnAt
        ? null
        : (() => {
            const weightThen = withinWeek?.weightKg ?? before?.weightKg ?? profileRow?.weightKg;
            return weightThen ? proteinTarget(Number(weightThen)).targetG : null;
          })(),
      check: withinWeek,
      previousCheck: before,
      previousLongestRunSec,
      regimen,
    });

    // `earlier` is the whole history before this week, so it bounds how far
    // back the week picker may go.
    const earliest = oldestDate([...earlier, ...sessions], [...previousLogs, ...logs], from);
    return c.json({ review, weeksAvailable: { earliest: startOfWeek(earliest) } });
  })

  /**
   * A month at a glance, for the calendar. One request rather than thirty-one,
   * and it returns the gaps as plainly as the entries — a day with nothing on
   * it is the thing a backfill screen exists to show.
   */
  .get('/calendar', async (c) => {
    const userId = c.get('userId');
    const { from, to } = await dateRangeFrom(c, { defaultDays: 30, maxDays: 92 });

    // Nothing was asked of anyone before their plan existed. Without this the
    // calendar projects the weekly rhythm backwards for ever, so an account
    // created today opens on a month of days marked "session not logged" —
    // telling a brand new runner they have already missed fifteen sessions.
    const [firstPlan] = await db
      .select({ startDate: schema.plans.startDate })
      .from(schema.plans)
      .where(eq(schema.plans.userId, userId))
      .orderBy(asc(schema.plans.startDate))
      .limit(1);
    const planStart = firstPlan?.startDate ?? null;

    const [settingsRow] = await db
      .select({ runDays: schema.settings.runDays, strengthDays: schema.settings.strengthDays })
      .from(schema.settings)
      .where(eq(schema.settings.userId, userId));
    const trainingDays = settingsRow
      ? { run: settingsRow.runDays, strength: settingsRow.strengthDays }
      : DEFAULT_TRAINING_DAYS;

    const [sessions, logs, checks, protein, doseEvents, items] = await Promise.all([
      db
        .select()
        .from(schema.workoutSessions)
        .where(
          and(
            eq(schema.workoutSessions.userId, userId),
            gte(schema.workoutSessions.date, from),
            lte(schema.workoutSessions.date, to),
          ),
        )
        .orderBy(asc(schema.workoutSessions.date)),
      dailyLogsBetween(userId, from, to),
      db
        .select()
        .from(schema.weeklyChecks)
        .where(
          and(
            eq(schema.weeklyChecks.userId, userId),
            gte(schema.weeklyChecks.date, from),
            lte(schema.weeklyChecks.date, to),
          ),
        ),
      proteinByDate(userId, from, to),
      loadEvents(userId, from, to),
      loadAllItems(userId),
    ]);

    const sessionsByDate = new Map<string, typeof sessions>();
    for (const row of sessions)
      sessionsByDate.set(row.date, [...(sessionsByDate.get(row.date) ?? []), row]);
    const logByDate = new Map(logs.map((l) => [l.date, l]));
    const checkByDate = new Map(checks.map((ch) => [ch.date, ch]));

    const days = dateRange(from, to).map((date) => {
      const due = items.reduce(
        (total, item) => total + (isDueOn(item, date) ? item.times.length : 0),
        0,
      );
      const onDay = doseEvents.filter((e) => e.dueDate === date);
      return {
        date,
        scheduled: planStart && date >= planStart ? scheduleFor(date, trainingDays) : null,
        sessions: (sessionsByDate.get(date) ?? []).map((session) => ({
          id: session.id,
          type: session.type,
          completion: session.completion,
          effort: session.effort,
          discomfortLocation: session.discomfortLocation,
          discomfortSeverity: session.discomfortSeverity,
          durationSec: session.durationSec,
          intervalsCompleted: session.intervalsCompleted,
          prescription: session.prescription,
        })),
        log: logByDate.get(date) ?? null,
        check: checkByDate.get(date) ?? null,
        proteinG: protein[date] ?? 0,
        doses: {
          due,
          taken: onDay.filter((e) => e.status === 'taken').length,
          skipped: onDay.filter((e) => e.status === 'skipped').length,
        },
      };
    });

    return c.json({ from, to, days });
  })

  /** P2: one session in full, for the history detail view. */
  .get('/session/:id', async (c) => {
    const userId = c.get('userId');
    const [row] = await db
      .select()
      .from(schema.workoutSessions)
      .where(
        and(
          eq(schema.workoutSessions.userId, userId),
          eq(schema.workoutSessions.id, c.req.param('id')),
        ),
      );
    if (!row) return c.json({ error: 'Not found' }, 404);

    // The day around the session: what was eaten, drunk and slept near it.
    const [log] = await db
      .select()
      .from(schema.dailyLogs)
      .where(and(eq(schema.dailyLogs.userId, userId), eq(schema.dailyLogs.date, row.date)));

    const protein = await proteinByDate(userId, row.date, row.date);

    const [previous] = await db
      .select()
      .from(schema.workoutSessions)
      .where(
        and(
          eq(schema.workoutSessions.userId, userId),
          eq(schema.workoutSessions.type, row.type),
          lte(schema.workoutSessions.date, row.date),
          sql`${schema.workoutSessions.id} <> ${row.id}`,
        ),
      )
      .orderBy(desc(schema.workoutSessions.date))
      .limit(1);

    return c.json({
      session: row,
      dailyLog: log ?? null,
      proteinG: protein[row.date] ?? 0,
      previous: previous ?? null,
      daysSincePrevious: previous ? daysBetween(previous.date, row.date) : null,
    });
  });

function oldestDate(
  sessions: { date: string }[],
  logs: { date: string }[],
  fallback: string,
): string {
  const dates = [...sessions, ...logs].map((r) => r.date);
  return dates.length ? dates.reduce((min, d) => (d < min ? d : min)) : fallback;
}
