import { and, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import {
  addDays,
  assessNutritionRisk,
  daysBetween,
  doseStates,
  dueReminders,
  minutesOfDay,
  proteinTarget,
  scheduleFor,
  type Completion,
  type Prescription,
  windowFrom,
  RUN_DAYS_PER_WEEK,
  timeFromMinutes,
  type DueReminder,
  type ReminderPrefs,
  type ReminderRecord,
  type TrainingDays,
} from '@goodform/shared';
import { db, schema } from './db/index.js';
import { localParts } from './time.js';
import { env, pushEnabled } from './env.js';
import { pushToUser } from './push.js';
import { loadActiveItems, loadEvents, usersAwaitingReminders } from './regimen-store.js';

type SettingsRow = typeof schema.settings.$inferSelect;

const TICK_MS = 60_000;
/** The guardrail sweep looks at four weeks of data; four times a day is plenty. */
const GUARDRAIL_MS = 6 * 60 * 60 * 1000;

/** The weekdays this user trains on, as the schedule helpers want them. */
export function trainingDays(row: SettingsRow): TrainingDays {
  return { run: row.runDays, strength: row.strengthDays };
}

export function prefsFrom(row: SettingsRow): ReminderPrefs {
  return {
    timezone: row.timezone,
    remindersEnabled: row.remindersEnabled,
    regimenReminders: row.regimenReminders,
    sessionReminders: row.sessionReminders,
    // One setting the runner actually understands — when they usually train —
    // with the nudge an hour ahead of it, where it can still change the day.
    sessionReminderTime: timeFromMinutes(minutesOfDay(row.sessionTime) - 60),
    weeklyCheckReminders: row.weeklyCheckReminders,
    weeklyCheckDay: row.weeklyCheckDay,
    weeklyCheckTime: row.weeklyCheckTime,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
    hideNamesInNotifications: row.hideNamesInNotifications,
    medicineEscalation: row.medicineEscalation,
  };
}

// ---------------------------------------------------------------------------
// One user's tick
// ---------------------------------------------------------------------------

async function remindersFor(
  userId: string,
  timezone: string,
): Promise<Map<string, ReminderRecord>> {
  const since = new Date(Date.now() - 3 * 86_400_000);
  const rows = await db
    .select()
    .from(schema.reminders)
    .where(
      and(
        eq(schema.reminders.userId, userId),
        // Only the last few days matter: an occurrence older than that can no
        // longer be nudged about, and rows resolved from a notification carry
        // no send time at all — without this they would accumulate in every
        // tick's result set indefinitely.
        or(isNull(schema.reminders.lastSentAt), gte(schema.reminders.lastSentAt, since)),
        or(isNull(schema.reminders.resolvedAt), gte(schema.reminders.resolvedAt, since)),
      ),
    );

  const map = new Map<string, ReminderRecord>();
  for (const row of rows) {
    const sent = row.lastSentAt ? localParts(row.lastSentAt, timezone) : null;
    const snooze = row.snoozedUntil ? localParts(row.snoozedUntil, timezone) : null;
    map.set(`${row.kind}:${row.key}`, {
      kind: row.kind as ReminderRecord['kind'],
      key: row.key,
      attempts: row.attempts,
      lastSentDate: sent?.date ?? null,
      lastSentMinutes: sent ? minutesOfDay(sent.time) : null,
      snoozedUntilDate: snooze?.date ?? null,
      snoozedUntilMinutes: snooze ? minutesOfDay(snooze.time) : null,
      resolved: row.resolvedAt !== null,
    });
  }
  return map;
}

async function tickUser(settingsRow: SettingsRow, now: Date): Promise<void> {
  const userId = settingsRow.userId;
  const prefs = prefsFrom(settingsRow);
  const { date: localDate, time: localTime } = localParts(now, prefs.timezone);

  // Yesterday is loaded alongside today because a snooze taken late at night
  // lands after midnight, and the dose it belongs to is yesterday's.
  const yesterday = addDays(localDate, -1);
  const [items, events, records] = await Promise.all([
    loadActiveItems(userId),
    loadEvents(userId, yesterday, localDate),
    remindersFor(userId, prefs.timezone),
  ]);

  /**
   * Today's doses, plus yesterday's only when a snooze is waiting on one.
   *
   * Snoozing at 23:50 for half an hour sets the reminder to resume at 00:20 —
   * by which time the dose is on the previous day, and that day is not in this
   * list, so the nudge the runner explicitly asked to see again never came
   * back. Nothing else can fire for a past date: a first nudge needs the dose
   * time to have passed *within* the catch-up window, and escalation needs the
   * earlier nudge to have been sent today.
   */
  const snoozeFromYesterday = [...records.values()].some(
    (record) =>
      !record.resolved &&
      record.snoozedUntilDate === localDate &&
      record.key.includes(`:${yesterday}:`),
  );
  const doses = snoozeFromYesterday
    ? [
        ...doseStates(items, events, yesterday, '23:59'),
        ...doseStates(items, events, localDate, localTime),
      ]
    : doseStates(items, events, localDate, localTime);

  /**
   * Is a session outstanding today?
   *
   * Asked of the week, not the weekday: a run missed on Monday is still owed,
   * and the nudge should follow it to the day the plan has moved it to. The
   * plan is not settled here — that happens when the app is opened — so a
   * window nobody has looked at since it closed falls back to the rota.
   */
  const days = trainingDays(settingsRow);
  let scheduled = scheduleFor(localDate, days);
  let sessionDue = false;
  const [plan] = await db
    .select()
    .from(schema.plans)
    .where(and(eq(schema.plans.userId, userId), eq(schema.plans.status, 'active')))
    .limit(1);
  if (plan) {
    const [week] = await db
      .select()
      .from(schema.planWeeks)
      .where(
        and(eq(schema.planWeeks.planId, plan.id), eq(schema.planWeeks.index, plan.currentWeek)),
      );
    const window = windowFrom(week?.startedOn ?? plan.startDate);
    const sessions = await db
      .select({
        date: schema.workoutSessions.date,
        type: schema.workoutSessions.type,
        completion: schema.workoutSessions.completion,
        intervalsCompleted: schema.workoutSessions.intervalsCompleted,
        prescription: schema.workoutSessions.prescription,
      })
      .from(schema.workoutSessions)
      .where(
        and(
          eq(schema.workoutSessions.userId, userId),
          gte(schema.workoutSessions.date, window.from),
          lte(schema.workoutSessions.date, window.to),
        ),
      );
    scheduled = scheduleFor(localDate, days, {
      window,
      sessions: sessions.map((s) => ({
        ...s,
        completion: s.completion as Completion,
        prescription: s.prescription as Prescription | null,
      })),
      runsPerWeek: week?.sessionsPerWeek ?? RUN_DAYS_PER_WEEK,
    });
    sessionDue = scheduled !== 'rest' && !sessions.some((s) => s.date === localDate);
  }

  const [lastCheck] = await db
    .select({ date: schema.weeklyChecks.date })
    .from(schema.weeklyChecks)
    .where(eq(schema.weeklyChecks.userId, userId))
    .orderBy(desc(schema.weeklyChecks.date))
    .limit(1);
  const weeklyCheckDue = !lastCheck || daysBetween(lastCheck.date, localDate) >= 7;

  const due = dueReminders({
    prefs,
    localDate,
    localTime,
    doses,
    sessionDue,
    sessionKind: scheduled === 'rest' ? null : scheduled,
    weeklyCheckDue,
    records,
  });

  for (const reminder of due) await deliver(userId, reminder, now);
}

async function deliver(userId: string, reminder: DueReminder, now: Date): Promise<void> {
  await pushToUser(userId, {
    title: reminder.title,
    body: reminder.body,
    tag: `${reminder.kind}:${reminder.key}`,
    url: reminder.url,
    urgent: reminder.urgent,
    regimen: reminder.itemId
      ? {
          itemId: reminder.itemId,
          dueDate: reminder.dueDate,
          dueTime: reminder.dueTime,
          reminderKey: reminder.key,
        }
      : undefined,
  });
  // Recorded even when nothing was delivered: the alternative is retrying the
  // same nudge every minute at a phone that is switched off.
  await db
    .insert(schema.reminders)
    .values({
      userId,
      kind: reminder.kind,
      key: reminder.key,
      attempts: reminder.attempt,
      lastSentAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.reminders.userId, schema.reminders.kind, schema.reminders.key],
      set: { attempts: reminder.attempt, lastSentAt: now, snoozedUntil: null },
    });
}

// ---------------------------------------------------------------------------
// Nutrition guardrails (P3)
// ---------------------------------------------------------------------------

/**
 * Looks over the last few weeks and, when the pattern is one where a target on
 * a screen makes things worse, puts the numbers away. Runs on its own slow
 * timer rather than on a request, so nobody's screen changes mid-tap.
 */
export async function sweepGuardrails(): Promise<void> {
  const rows = await db
    .select({ profile: schema.profiles, settings: schema.settings })
    .from(schema.profiles)
    .innerJoin(schema.settings, eq(schema.settings.userId, schema.profiles.userId));

  const now = new Date();

  for (const { profile, settings } of rows) {
    // Already withdrawn, or deliberately restored by the user — leave it be.
    if (settings.targetsWithdrawnAt || settings.targetsRestoredAt) continue;

    // Each user's own day. The server runs on UTC, so a shared date here put
    // everyone east of Greenwich a day out for part of every evening, and the
    // window this reads back over is what decides whether the numbers are
    // withdrawn — a judgement that should not shift with the server's clock.
    const today = localParts(now, settings.timezone).date;
    const since = addDays(today, -40);

    const [checks, sessions, nutrition] = await Promise.all([
      db
        .select({ date: schema.weeklyChecks.date, weightKg: schema.weeklyChecks.weightKg })
        .from(schema.weeklyChecks)
        .where(
          and(eq(schema.weeklyChecks.userId, profile.userId), gte(schema.weeklyChecks.date, since)),
        ),
      db
        .select({ date: schema.workoutSessions.date })
        .from(schema.workoutSessions)
        .where(
          and(
            eq(schema.workoutSessions.userId, profile.userId),
            gte(schema.workoutSessions.date, since),
            sql`${schema.workoutSessions.completion} <> 'skipped'`,
          ),
        ),
      db
        .select({
          date: schema.nutritionEntries.date,
          grams: sql<number>`sum(${schema.foodItems.proteinG} * ${schema.nutritionEntries.servings})`,
        })
        .from(schema.nutritionEntries)
        .innerJoin(schema.foodItems, eq(schema.foodItems.id, schema.nutritionEntries.foodItemId))
        .where(
          and(
            eq(schema.nutritionEntries.userId, profile.userId),
            gte(schema.nutritionEntries.date, since),
          ),
        )
        .groupBy(schema.nutritionEntries.date),
    ]);

    const assessment = assessNutritionRisk({
      heightCm: profile.heightCm,
      checks,
      proteinByDate: Object.fromEntries(nutrition.map((n) => [n.date, Number(n.grams)])),
      proteinTargetG: proteinTarget(profile.weightKg).targetG,
      sessionDates: sessions.map((s) => s.date),
      today,
    });

    if (!assessment.triggered) continue;

    await db
      .update(schema.settings)
      .set({
        targetsWithdrawnAt: new Date(),
        guardrailSignals: assessment.signals,
        updatedAt: new Date(),
      })
      .where(eq(schema.settings.userId, profile.userId));
  }
}

// ---------------------------------------------------------------------------
// The loop
// ---------------------------------------------------------------------------

let running = false;

/**
 * How many users are evaluated at once.
 *
 * Serially, one user waiting on a slow query held up everyone behind them, and
 * a tick that overran a minute simply skipped the next one. Small because the
 * box has 512MB and a ten-connection pool — this is about not being blocked by
 * one straggler, not about throughput.
 */
const TICK_CONCURRENCY = 5;

async function tick(): Promise<void> {
  if (running) return; // A slow tick must not stack on the next one.
  running = true;
  try {
    // One instant for the whole sweep, so two users in the same timezone are
    // never evaluated against clocks a few hundred milliseconds apart.
    const now = new Date();
    const users = await usersAwaitingReminders();

    for (let i = 0; i < users.length; i += TICK_CONCURRENCY) {
      await Promise.all(
        users.slice(i, i + TICK_CONCURRENCY).map(async (settingsRow) => {
          try {
            await tickUser(settingsRow, now);
          } catch (error) {
            // One user's failure is theirs alone; everybody else still gets
            // their reminders this minute.
            console.warn(`Reminder tick failed for ${settingsRow.userId}:`, error);
          }
        }),
      );
    }
  } finally {
    running = false;
  }
}

export function startScheduler(): () => void {
  if (!env.schedulerEnabled) {
    console.log('  Reminders:    scheduler disabled (REMINDER_SCHEDULER=false)');
    return () => {};
  }

  const guardrails = setInterval(() => void sweepGuardrails().catch(() => {}), GUARDRAIL_MS);
  void sweepGuardrails().catch(() => {});

  if (!pushEnabled) {
    // Without VAPID keys there is nothing to push to, but the guardrail sweep
    // is independent of notifications and still worth running.
    console.log('  Reminders:    no VAPID keys — push off, due-now card only');
    return () => clearInterval(guardrails);
  }

  const ticker = setInterval(() => void tick(), TICK_MS);
  console.log('  Reminders:    scheduler running');
  return () => {
    clearInterval(ticker);
    clearInterval(guardrails);
  };
}
